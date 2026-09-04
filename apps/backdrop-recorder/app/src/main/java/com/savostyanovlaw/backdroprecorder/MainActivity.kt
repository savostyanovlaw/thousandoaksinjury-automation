package com.savostyanovlaw.backdroprecorder

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Size
import android.view.Gravity
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
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var backgroundPreview: ImageView
    private lateinit var maskOverlay: MaskOverlayView
    private lateinit var analysisExecutor: ExecutorService
    private var personSegmenter: PersonSegmenter? = null
    private var cameraReady = false
    private var backgroundSelected = false

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startCamera()
            } else {
                statusText.text = "Camera permission is needed to record video."
            }
        }

    private val photoPicker =
        registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
            if (uri != null) {
                backgroundPreview.setImageURI(uri)
                backgroundPreview.visibility = ImageView.VISIBLE
                backgroundSelected = true
                updateReadyStatus()
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

        val aiLabel = TextView(this).apply {
            text = "AI PERSON MASK"
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

        val chooseBackground = Button(this).apply {
            text = "Choose Background"
            setOnClickListener {
                photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
        }
        root.addView(chooseBackground, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = 16
        })

        val recordPlaceholder = Button(this).apply {
            text = "Record — composite preview next"
            isEnabled = false
        }
        root.addView(recordPlaceholder, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
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

    private fun startCamera() {
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
                            maskOverlay.setMask(result.mask, result.width, result.height)
                            if (cameraReady && !backgroundSelected) {
                                statusText.text = "AI person detection active — choose a background"
                            }
                        }
                    },
                    onError = { message -> runOnUiThread { statusText.text = "AI: $message" } },
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
                                segmenter.analyze(imageProxy, mirrorFrontCamera = true)
                            }
                        }
                    }

                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
                cameraReady = true
                updateReadyStatus()
            } catch (error: Exception) {
                cameraReady = false
                statusText.text = "Camera/AI could not start: ${error.message ?: "unknown error"}"
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun updateReadyStatus() {
        statusText.text = when {
            CompositeReadiness.isReady(cameraReady, backgroundSelected) ->
                "Camera + AI + background ready — green overlay shows detected person"
            cameraReady -> "Camera + AI ready — choose a background"
            backgroundSelected -> "Background selected — preparing camera"
            else -> "Preparing camera and AI…"
        }
    }

    override fun onDestroy() {
        personSegmenter?.close()
        personSegmenter = null
        maskOverlay.clearMask()
        analysisExecutor.shutdown()
        super.onDestroy()
    }
}
