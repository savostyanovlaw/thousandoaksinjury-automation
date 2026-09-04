package com.savostyanovlaw.backdroprecorder

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
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
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var backgroundPreview: ImageView

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                statusText.text = "Front camera ready"
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
                statusText.text = "Background selected"
            } else {
                statusText.text = "No background selected"
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
            text = "Preparing camera…"
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
            text = "Record — coming next"
            isEnabled = false
        }
        root.addView(recordPlaceholder, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = 8
        })

        return root
    }

    private fun ensureCameraPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            statusText.text = "Front camera ready"
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
                val selector = CameraSelector.DEFAULT_FRONT_CAMERA
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, selector, preview)
                statusText.text = "Front camera ready — choose a background"
            } catch (error: Exception) {
                statusText.text = "Camera could not start: ${error.message ?: "unknown error"}"
            }
        }, ContextCompat.getMainExecutor(this))
    }
}
