package com.savostyanovlaw.backdroprecorder

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import java.io.File
import java.io.FileDescriptor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class CompositeVideoRecorder(
    private val context: Context,
    private val frameProvider: () -> Bitmap?,
    private val profile: RecordingProfile = RecordingProfile.a23Prototype(),
    private val onSaved: (Uri) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val active = AtomicBoolean(false)
    private var recorder: MediaRecorder? = null
    private var renderer: EglBitmapRenderer? = null
    private var frameExecutor: ScheduledExecutorService? = null
    private var outputUri: Uri? = null
    private var outputFile: File? = null
    private var outputDescriptor: android.os.ParcelFileDescriptor? = null

    fun isRecording(): Boolean = active.get()

    @Synchronized
    fun start() {
        check(!active.get()) { "Recorder already active" }
        val destination = createOutputDestination()
        try {
            val mediaRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setVideoSize(profile.width, profile.height)
                setVideoFrameRate(profile.frameRate)
                setVideoEncodingBitRate(profile.videoBitRate)
                setAudioEncodingBitRate(profile.audioBitRate)
                setAudioSamplingRate(profile.audioSampleRate)
                setOutputFile(destination.fileDescriptor)
                prepare()
            }

            val eglRenderer = EglBitmapRenderer(
                targetSurface = mediaRecorder.surface,
                width = profile.width,
                height = profile.height,
            )

            recorder = mediaRecorder
            renderer = eglRenderer
            active.set(true)
            mediaRecorder.start()

            val periodMs = (1000L / profile.frameRate).coerceAtLeast(1L)
            frameExecutor = Executors.newSingleThreadScheduledExecutor().also { executor ->
                executor.scheduleAtFixedRate({
                    if (!active.get()) return@scheduleAtFixedRate
                    try {
                        frameProvider()?.let { frame -> eglRenderer.render(frame) }
                    } catch (error: Throwable) {
                        if (active.compareAndSet(true, false)) {
                            mainHandler.post { onError("Recording frame failed: ${error.message ?: "unknown error"}") }
                        }
                    }
                }, 0L, periodMs, TimeUnit.MILLISECONDS)
            }
        } catch (error: Throwable) {
            active.set(false)
            cleanupFailedDestination()
            releaseRecorderQuietly()
            throw error
        }
    }

    @Synchronized
    fun stop() {
        if (!active.compareAndSet(true, false)) return

        val executor = frameExecutor
        frameExecutor = null
        executor?.shutdownNow()
        try {
            executor?.awaitTermination(500, TimeUnit.MILLISECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }

        try {
            renderer?.release()
        } catch (_: Throwable) {
        }
        renderer = null

        val mediaRecorder = recorder
        recorder = null
        try {
            mediaRecorder?.stop()
            mediaRecorder?.release()
            outputDescriptor?.close()
            outputDescriptor = null
            finalizeDestination()
        } catch (error: Throwable) {
            try {
                mediaRecorder?.release()
            } catch (_: Throwable) {
            }
            cleanupFailedDestination()
            mainHandler.post { onError("Could not finish recording: ${error.message ?: "unknown error"}") }
        }
    }

    @Synchronized
    fun cancel() {
        active.set(false)
        frameExecutor?.shutdownNow()
        frameExecutor = null
        try {
            renderer?.release()
        } catch (_: Throwable) {
        }
        renderer = null
        releaseRecorderQuietly()
        cleanupFailedDestination()
    }

    private fun createOutputDestination(): OutputDestination {
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val fileName = "Backdrop_$timestamp.mp4"

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/Backdrop Recorder")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            val uri = context.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                ?: error("Unable to create video in Gallery")
            val descriptor = context.contentResolver.openFileDescriptor(uri, "w")
                ?: run {
                    context.contentResolver.delete(uri, null, null)
                    error("Unable to open video output")
                }
            outputUri = uri
            outputDescriptor = descriptor
            OutputDestination(descriptor.fileDescriptor)
        } else {
            val moviesDir = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
                ?: error("Movies directory unavailable")
            val file = File(moviesDir, fileName)
            outputFile = file
            OutputDestination(java.io.FileOutputStream(file).fd)
        }
    }

    private fun finalizeDestination() {
        val uri = outputUri
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && uri != null) {
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.IS_PENDING, 0)
            }
            context.contentResolver.update(uri, values, null, null)
            outputUri = null
            mainHandler.post { onSaved(uri) }
            return
        }

        val file = outputFile
        outputFile = null
        if (file != null) {
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, file.name)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.DATA, file.absolutePath)
            }
            val savedUri = context.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            if (savedUri != null) {
                mainHandler.post { onSaved(savedUri) }
            } else {
                mainHandler.post { onError("Video recorded but could not be added to Gallery") }
            }
        }
    }

    private fun cleanupFailedDestination() {
        try {
            outputDescriptor?.close()
        } catch (_: Throwable) {
        }
        outputDescriptor = null

        outputUri?.let { uri ->
            try {
                context.contentResolver.delete(uri, null, null)
            } catch (_: Throwable) {
            }
        }
        outputUri = null

        outputFile?.let { file ->
            try {
                file.delete()
            } catch (_: Throwable) {
            }
        }
        outputFile = null
    }

    private fun releaseRecorderQuietly() {
        try {
            recorder?.reset()
        } catch (_: Throwable) {
        }
        try {
            recorder?.release()
        } catch (_: Throwable) {
        }
        recorder = null
    }

    private data class OutputDestination(val fileDescriptor: FileDescriptor)
}
