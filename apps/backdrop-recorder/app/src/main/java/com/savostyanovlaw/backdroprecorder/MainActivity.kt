package com.savostyanovlaw.backdroprecorder

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Size
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var previewView: PreviewView
    private lateinit var compositePreview: CompositePreviewView
    private lateinit var statusText: TextView
    private lateinit var backgroundPreview: ImageView
    private lateinit var maskOverlay: MaskOverlayView
    private lateinit var cameraSwitchButton: Button
    private lateinit var chooseBackgroundButton: Button
    private lateinit var recordButton: Button
    private lateinit var recordingIndicator: TextView
    private lateinit var analysisExecutor: ExecutorService

    private val mainHandler = Handler(Looper.getMainLooper())
    private val recordingStateMachine = RecordingStateMachine()
    private var compositeVideoRecorder: CompositeVideoRecorder? = null
    private var recordingStartedAtMs = 0L
    private var personSegmenter: PersonSegmenter? = null
    private var cameraReady = false
    private var backgroundSelected = false
    private var cameraFacing = CameraFacing.FRONT
    private var cameraBinding = false

    private val timerRunnable = object : Runnable {
        override fun run() {
            if (recordingStateMachine.state != RecordingState.RECORDING) return
            val elapsed = (SystemClock.elapsedRealtime() - recordingStartedAtMs).coerceAtLeast(0L)
            recordingIndicator.text = "● REC ${formatElapsed(elapsed)}"
            recordButton.text = "■ STOP  ${formatElapsed(elapsed)}"
            mainHandler.postDelayed(this, 500L)
        }
    }

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startCamera()
            } else {
                statusText.text = "Camera permission is needed to record video."
            }
        }

    private val audioPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                beginRecordingCountdown()
            } else {
                statusText.text = "Microphone permission is needed to record video with sound."
            }
        }

    private val photoPicker =
        registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
            if (uri != null) {
                try {
                    val bitmap = contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
                    if (bitmap == null) {
                        statusText.text = "Could not open the selected background"
                        return@registerForActivityResult
                    }
                    backgroundPreview.setImageBitmap(bitmap)
                    backgroundPreview.visibility = ImageView.VISIBLE
                    compositePreview.setBackgroundBitmap(bitmap)
                    backgroundSelected = true
                    maskOverlay.visibility = View.GONE
                    updateReadyStatus()
                    updateRecordButtonState()
                } catch (error: Exception) {
                    statusText.text = "Could not open background: ${error.message ?: "unknown error"}"
                }
            } else if (!backgroundSelected) {
                statusText.text = "No background selected"
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        analysisExecutor = Executors.newSingleThreadExecutor()
        setContentView(buildUi())
        ensureCameraPermission()
    }

    private fun buildUi(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            setBackgroundColor(Color.BLACK)
        }

        val title = TextView(this).apply {
            text = "Backdrop Recorder"
            textSize = 24f
            setTextColor(Color.WHITE)
        }
        root.addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        statusText = TextView(this).apply {
            text = "Preparing camera and AI…"
            textSize = 16f
            setTextColor(Color.LTGRAY)
            setPadding(0, 12, 0, 16)
        }
        root.addView(statusText)

        val cameraFrame = FrameLayout(this)
        previewView = PreviewView(this).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        cameraFrame.addView(previewView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        compositePreview = CompositePreviewView(this).apply {
            visibility = View.GONE
            isClickable = false
            isFocusable = false
        }
        cameraFrame.addView(compositePreview, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        maskOverlay = MaskOverlayView(this).apply {
            isClickable = false
            isFocusable = false
        }
        cameraFrame.addView(maskOverlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        backgroundPreview = ImageView(this).apply {
            visibility = ImageView.GONE
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(Color.DKGRAY)
        }
        val thumbSize = (112 * resources.displayMetrics.density).toInt()
        cameraFrame.addView(
            backgroundPreview,
            FrameLayout.LayoutParams(thumbSize, thumbSize, Gravity.TOP or Gravity.END).apply {
                setMargins(16, 16, 16, 16)
            }
        )

        cameraSwitchButton = Button(this).apply {
            text = "↻ CAMERA"
            textSize = 12f
            isAllCaps = false
            setOnClickListener { switchCamera() }
        }
        cameraFrame.addView(
            cameraSwitchButton,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply {
                setMargins(16, 16, 16, 16)
            }
        )

        recordingIndicator = TextView(this).apply {
            visibility = View.GONE
            textSize = 18f
            setTextColor(Color.WHITE)
            setBackgroundColor(0x88000000.toInt())
            setPadding(16, 8, 16, 8)
        }
        cameraFrame.addView(
            recordingIndicator,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
                topMargin = 20
            }
        )

        val aiLabel = TextView(this).apply {
            text = "LIVE AI BACKGROUND"
            textSize = 11f
            setTextColor(Color.WHITE)
            setBackgroundColor(0x66000000)
            setPadding(12, 6, 12, 6)
        }
        cameraFrame.addView(
            aiLabel,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply {
                setMargins(16, 16, 16, 16)
            }
        )

        root.addView(cameraFrame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        chooseBackgroundButton = Button(this).apply {
            text = "Choose Background"
            setOnClickListener {
                if (!recordingStateMachine.cameraLocked) {
                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
            }
        }
        root.addView(chooseBackgroundButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = 16
        })

        recordButton = Button(this).apply {
            text = "● RECORD"
            isEnabled = false
            setOnClickListener { onRecordButtonPressed() }
        }
        root.addView(recordButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = 8
        })

        return root
    }

    private fun ensureCameraPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun onRecordButtonPressed() {
        when (recordingStateMachine.state) {
            RecordingState.RECORDING -> stopRecording()
            RecordingState.COUNTDOWN -> Unit
            RecordingState.IDLE -> {
                if (!recordingStateMachine.canStart(cameraReady, backgroundSelected)) return
                if (compositePreview.latestCompositeFrame() == null) {
                    statusText.text = "Wait a moment for the live background to become ready."
                    return
                }
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    beginRecordingCountdown()
                } else {
                    audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }
    }

    private fun beginRecordingCountdown() {
        if (!recordingStateMachine.canStart(cameraReady, backgroundSelected)) return
        if (compositePreview.latestCompositeFrame() == null) {
            statusText.text = "Wait a moment for the live background to become ready."
            return
        }
        recordingStateMachine.beginCountdown()
        cameraSwitchButton.isEnabled = false
        chooseBackgroundButton.isEnabled = false
        recordButton.isEnabled = false
        recordingIndicator.visibility = View.VISIBLE
        showCountdown(3)
    }

    private fun showCountdown(value: Int) {
        if (recordingStateMachine.state != RecordingState.COUNTDOWN) return
        if (value > 0) {
            recordingIndicator.text = value.toString()
            statusText.text = "Recording starts in $value…"
            mainHandler.postDelayed({ showCountdown(value - 1) }, 1000L)
        } else {
            startActualRecording()
        }
    }

    private fun startActualRecording() {
        if (recordingStateMachine.state != RecordingState.COUNTDOWN) return
        val recorder = CompositeVideoRecorder(
            context = this,
            frameProvider = { compositePreview.latestCompositeFrame() },
            onSaved = { uri ->
                compositeVideoRecorder = null
                recordingStateMachine.stop()
                resetRecordingUi()
                statusText.text = "Saved to Gallery — ${uri.lastPathSegment ?: "video"}"
            },
            onError = { message ->
                compositeVideoRecorder = null
                recordingStateMachine.stop()
                resetRecordingUi()
                statusText.text = message
            },
        )

        try {
            recorder.start()
            compositeVideoRecorder = recorder
            recordingStateMachine.beginRecording()
            recordingStartedAtMs = SystemClock.elapsedRealtime()
            recordingIndicator.text = "● REC 00:00"
            recordButton.text = "■ STOP  00:00"
            recordButton.isEnabled = true
            statusText.text = "Recording video + microphone…"
            mainHandler.removeCallbacks(timerRunnable)
            mainHandler.post(timerRunnable)
        } catch (error: Throwable) {
            recorder.cancel()
            recordingStateMachine.stop()
            resetRecordingUi()
            statusText.text = "Could not start recording: ${error.message ?: "unknown error"}"
        }
    }

    private fun stopRecording() {
        if (recordingStateMachine.state != RecordingState.RECORDING) return
        mainHandler.removeCallbacks(timerRunnable)
        recordButton.isEnabled = false
        recordButton.text = "Saving…"
        recordingIndicator.text = "Saving…"
        statusText.text = "Finishing video and saving to Gallery…"
        compositeVideoRecorder?.stop()
    }

    private fun resetRecordingUi() {
        mainHandler.removeCallbacks(timerRunnable)
        recordingIndicator.visibility = View.GONE
        chooseBackgroundButton.isEnabled = true
        cameraSwitchButton.isEnabled = !cameraBinding
        recordButton.text = "● RECORD"
        updateRecordButtonState()
    }

    private fun switchCamera() {
        if (cameraBinding || recordingStateMachine.cameraLocked) return
        cameraFacing = CameraFacing.toggle(cameraFacing)
        cameraReady = false
        updateRecordButtonState()
        statusText.text = if (cameraFacing == CameraFacing.FRONT) {
            "Switching to front camera…"
        } else {
            "Switching to rear camera…"
        }
        startCamera()
    }

    private fun startCamera() {
        if (cameraBinding || recordingStateMachine.cameraLocked) return
        cameraBinding = true
        cameraSwitchButton.isEnabled = false
        updateRecordButtonState()
        val requestedFacing = cameraFacing
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                personSegmenter?.close()
                personSegmenter = PersonSegmenter(
                    context = this,
                    onMask = { result ->
                        runOnUiThread {
                            val percent = (result.foregroundFraction * 100f).toInt().coerceIn(0, 100)
                            if (backgroundSelected) {
                                compositePreview.setFrame(result.frame, result.mask, result.width, result.height)
                                compositePreview.visibility = View.VISIBLE
                                maskOverlay.visibility = View.GONE
                                if (recordingStateMachine.state == RecordingState.IDLE) {
                                    statusText.text = "LIVE BACKGROUND ACTIVE — person $percent%"
                                }
                            } else {
                                compositePreview.visibility = View.GONE
                                maskOverlay.visibility = View.VISIBLE
                                maskOverlay.setMask(result.mask, result.width, result.height)
                                if (recordingStateMachine.state == RecordingState.IDLE) {
                                    statusText.text = "AI MASK ACTIVE — person $percent% — choose a background"
                                }
                            }
                            updateRecordButtonState()
                        }
                    },
                    onError = { message -> runOnUiThread { statusText.text = "AI ERROR: $message" } },
                )

                val analysis = ImageAnalysis.Builder()
                    .setTargetResolution(Size(360, 640))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                    .build()
                    .also { useCase ->
                        useCase.setAnalyzer(analysisExecutor) { imageProxy ->
                            val segmenter = personSegmenter
                            if (segmenter == null) {
                                imageProxy.close()
                            } else {
                                segmenter.analyze(
                                    imageProxy,
                                    mirrorFrontCamera = CameraFacing.shouldMirror(requestedFacing)
                                )
                            }
                        }
                    }

                val selector = if (requestedFacing == CameraFacing.FRONT) {
                    CameraSelector.DEFAULT_FRONT_CAMERA
                } else {
                    CameraSelector.DEFAULT_BACK_CAMERA
                }

                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, selector, preview, analysis)
                cameraReady = true
                updateReadyStatus()
            } catch (error: Exception) {
                cameraReady = false
                statusText.text = "Camera/AI could not start: ${error.message ?: "unknown error"}"
            } finally {
                cameraBinding = false
                cameraSwitchButton.isEnabled = !recordingStateMachine.cameraLocked
                updateRecordButtonState()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun updateReadyStatus() {
        if (recordingStateMachine.state != RecordingState.IDLE) return
        statusText.text = when {
            CompositeReadiness.isReady(cameraReady, backgroundSelected) ->
                "Camera + AI + background ready — tap RECORD"
            cameraReady -> "Camera + AI ready — choose a background"
            backgroundSelected -> "Background selected — preparing camera"
            else -> "Preparing camera and AI…"
        }
        updateRecordButtonState()
    }

    private fun updateRecordButtonState() {
        if (!::recordButton.isInitialized) return
        recordButton.isEnabled = when (recordingStateMachine.state) {
            RecordingState.RECORDING -> true
            RecordingState.COUNTDOWN -> false
            RecordingState.IDLE -> recordingStateMachine.canStart(cameraReady, backgroundSelected) &&
                compositePreview.latestCompositeFrame() != null
        }
    }

    private fun formatElapsed(milliseconds: Long): String {
        val totalSeconds = milliseconds / 1000L
        val minutes = totalSeconds / 60L
        val seconds = totalSeconds % 60L
        return String.format(Locale.US, "%02d:%02d", minutes, seconds)
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        compositeVideoRecorder?.cancel()
        compositeVideoRecorder = null
        recordingStateMachine.stop()
        personSegmenter?.close()
        personSegmenter = null
        maskOverlay.clearMask()
        compositePreview.clear()
        analysisExecutor.shutdown()
        super.onDestroy()
    }
}
