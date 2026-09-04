package com.savostyanovlaw.backdroprecorder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.ByteBufferExtractor
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter
import java.nio.ByteBuffer

class PersonSegmenter(
    context: Context,
    private val onMask: (MaskResult) -> Unit,
    private val onError: (String) -> Unit,
) : AutoCloseable {

    data class MaskResult(
        val mask: ByteBuffer,
        val width: Int,
        val height: Int,
        val inferenceTimeMs: Long,
    )

    private val segmenter: ImageSegmenter

    init {
        val baseOptions = BaseOptions.builder()
            .setDelegate(Delegate.CPU)
            .setModelAssetPath(MODEL_PATH)
            .build()

        val options = ImageSegmenter.ImageSegmenterOptions.builder()
            .setBaseOptions(baseOptions)
            .setRunningMode(RunningMode.LIVE_STREAM)
            .setOutputCategoryMask(true)
            .setOutputConfidenceMasks(false)
            .setResultListener { result, _ ->
                val mask = result.categoryMask().orElse(null) ?: return@setResultListener
                val buffer = ByteBufferExtractor.extract(mask)
                onMask(
                    MaskResult(
                        mask = buffer,
                        width = mask.width,
                        height = mask.height,
                        inferenceTimeMs = (SystemClock.uptimeMillis() - result.timestampMs()).coerceAtLeast(0L),
                    )
                )
            }
            .setErrorListener { error -> onError(error.message ?: "AI segmentation error") }
            .build()

        segmenter = ImageSegmenter.createFromOptions(context, options)
    }

    fun analyze(imageProxy: ImageProxy, mirrorFrontCamera: Boolean = true) {
        try {
            val bitmap = Bitmap.createBitmap(imageProxy.width, imageProxy.height, Bitmap.Config.ARGB_8888)
            val source = imageProxy.planes[0].buffer.duplicate().apply { rewind() }
            bitmap.copyPixelsFromBuffer(source)

            val matrix = Matrix().apply {
                postRotate(imageProxy.imageInfo.rotationDegrees.toFloat())
                if (mirrorFrontCamera) {
                    postScale(-1f, 1f, bitmap.width / 2f, bitmap.height / 2f)
                }
            }
            val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            val analysisBitmap = Bitmap.createScaledBitmap(oriented, ANALYSIS_SIZE, ANALYSIS_SIZE, true)
            val mpImage = BitmapImageBuilder(analysisBitmap).build()
            segmenter.segmentAsync(mpImage, SystemClock.uptimeMillis())
        } catch (error: Exception) {
            onError(error.message ?: "Could not analyze camera frame")
        } finally {
            imageProxy.close()
        }
    }

    override fun close() {
        segmenter.close()
    }

    companion object {
        const val MODEL_PATH = "selfie_segmenter.tflite"
        const val ANALYSIS_SIZE = 256
    }
}
