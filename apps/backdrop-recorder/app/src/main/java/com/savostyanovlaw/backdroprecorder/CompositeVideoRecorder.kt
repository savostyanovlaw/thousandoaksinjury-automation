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
import android.widget.Toast
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
    private val onStage: (RecordingStage, String?) -> Unit = { _, _ -> },
    private val onSaved: (Uri) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val active = AtomicBoolean(false)
    private val firstFrameReported = AtomicBoolean(false)
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
        emitStage(RecordingStage.OUTPUT_CREATED, outputUri?.toString())
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
            emitStage(RecordingStage.RECORDER_PREPARED, "${profile.width}x${profile.height}@${profile.frameRate}")

            recorder = mediaRecorder
            val executor = Executors.newSingleThreadScheduledExecutor()
            frameExecutor = executor
            val startupScheduler = RecordingStartupScheduler { task -> executor.execute(task) }

            startupScheduler.start(
                startRecorder = {
                    active.set(true)
                    mediaRecorder.start()
                    emitStage(RecordingStage.RECORDER_STARTED, null)
                },
                startRenderer = {
                    try {
                        if (!active.get()) return@start
                        val eglRenderer = EglBitmapRenderer(
                            targetSurface = mediaRecorder.surface,
                            width = profile.width,
                            height = profile.height,
                        )
                        if (!active.get()) {
                            eglRenderer.release()
                            return@start
                        }
                        renderer = eglRenderer

                        val periodMs = (1000L / profile.frameRate).coerceAtLeast(1L)
                        executor.scheduleAtFixedRate({
                            if (!active.get()) return@scheduleAtFixedRate
                            try {
                                frameProvider()?.let { frame ->
                                    eglRenderer.render(frame)
                                    if (firstFrameReported.compareAndSet(false, true)) {
                                        emitStage(RecordingStage.FRAMES_ACTIVE, "${frame.width}x${frame.height}")
                                    }
                                }
                            } catch (error: Throwable) {
                                failAfterStart("Recording frame failed", error)
                            }
                        }, 0L, periodMs, TimeUnit.MILLISECONDS)
                    } catch (error: Throwable) {
                        failAfterStart("Renderer setup failed", error)
                    }
                },
            )
        } catch (error: Throwable) {
            active.set(false)
            stopFrameDelivery()
            cleanupFailedDestination()
            releaseRecorderQuietly()
            throw error
        }
    }

    @Synchronized
    fun stop() {
        if (!active.compareAndSet(true, false)) return
        try {
            RecordingStopPlan.steps.forEach { step ->
                when (step) {
                    RecordingStopStep.STOP_FRAMES -> stopFrameDelivery()
                    RecordingStopStep.STOP_RECORDER -> {
                        val mediaRecorder = recorder
                        recorder = null
                        mediaRecorder?.stop()
                        mediaRecorder?.release()
                        emitStage(RecordingStage.RECORDER_STOPPED, null)
                    }
                    RecordingStopStep.RELEASE_RENDERER -> {
                        renderer?.release()
                        renderer = null
                    }
                    RecordingStopStep.FINALIZE_OUTPUT -> {
                        outputDescriptor?.close()
                        outputDescriptor = null
                        val sizeBytes = outputSizeBytes()
                        finalizeDestination()
                        emitStage(RecordingStage.OUTPUT_FINALIZED, "$sizeBytes bytes")
                    }
                }
            }
        } catch (error: Throwable) {
            stopFrameDelivery()
            try { recorder?.release() } catch (_: Throwable) {}
            recorder = null
            try { renderer?.release() } catch (_: Throwable) {}
            renderer = null
            cleanupFailedDestination()
            mainHandler.post { onError("Could not finish recording (${error.javaClass.simpleName}): ${error.message ?: "unknown error"}") }
        }
    }

    @Synchronized
    fun cancel() {
        active.set(false)
        stopFrameDelivery()
        try { renderer?.release() } catch (_: Throwable) {}
        renderer = null
        releaseRecorderQuietly()
        cleanupFailedDestination()
    }

    private fun failAfterStart(prefix: String, error: Throwable) {
        if (!active.compareAndSet(true, false)) return
        try { renderer?.release() } catch (_: Throwable) {}
        renderer = null
        try { recorder?.reset() } catch (_: Throwable) {}
        try { recorder?.release() } catch (_: Throwable) {}
        recorder = null
        cleanupFailedDestination()
        mainHandler.post {
            onError("$prefix (${error.javaClass.simpleName}): ${error.message ?: "unknown error"}")
        }
    }

    private fun stopFrameDelivery() {
        val executor = frameExecutor
        frameExecutor = null
        executor?.shutdownNow()
        try { executor?.awaitTermination(500, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
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
            val uri = context.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values) ?: error("Unable to create video in Gallery")
            val descriptor = context.contentResolver.openFileDescriptor(uri, "w") ?: run {
                context.contentResolver.delete(uri, null, null)
                error("Unable to open video output")
            }
            outputUri = uri
            outputDescriptor = descriptor
            OutputDestination(descriptor.fileDescriptor)
        } else {
            val moviesDir = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: error("Movies directory unavailable")
            val file = File(moviesDir, fileName)
            outputFile = file
            OutputDestination(java.io.FileOutputStream(file).fd)
        }
    }

    private fun outputSizeBytes(): Long {
        val uri = outputUri
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && uri != null) {
            return try { context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: -1L } catch (_: Throwable) { -1L }
        }
        return outputFile?.length() ?: -1L
    }

    private fun finalizeDestination() {
        val uri = outputUri
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && uri != null) {
            val values = ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }
            val updated = context.contentResolver.update(uri, values, null, null)
            check(updated > 0) { "Gallery did not finalize the video entry" }
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
            if (savedUri != null) mainHandler.post { onSaved(savedUri) }
            else mainHandler.post { onError("Video recorded but could not be added to Gallery") }
        }
    }

    private fun emitStage(stage: RecordingStage, detail: String?) {
        mainHandler.post {
            onStage(stage, detail)
            val suffix = detail?.let { " — $it" } ?: ""
            Toast.makeText(context, "REC: ${stage.name}$suffix", Toast.LENGTH_SHORT).show()
        }
    }

    private fun cleanupFailedDestination() {
        try { outputDescriptor?.close() } catch (_: Throwable) {}
        outputDescriptor = null
        outputUri?.let { uri -> try { context.contentResolver.delete(uri, null, null) } catch (_: Throwable) {} }
        outputUri = null
        outputFile?.let { file -> try { file.delete() } catch (_: Throwable) {} }
        outputFile = null
    }

    private fun releaseRecorderQuietly() {
        try { recorder?.reset() } catch (_: Throwable) {}
        try { recorder?.release() } catch (_: Throwable) {}
        recorder = null
    }

    private data class OutputDestination(val fileDescriptor: FileDescriptor)
}
