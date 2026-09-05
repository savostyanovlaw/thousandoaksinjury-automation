package com.savostyanovlaw.backdroprecorder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import kotlin.math.max

class CompositePreviewView(context: Context) : View(context) {
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val maskProcessor = MaskProcessor(alpha = 0.65f)
    private var background: Bitmap? = null
    @Volatile private var composite: Bitmap? = null

    fun setBackgroundBitmap(bitmap: Bitmap?) {
        background = bitmap
        composite = null
        invalidate()
    }

    fun latestCompositeFrame(): Bitmap? = composite

    fun clear() {
        background = null
        composite = null
        maskProcessor.reset()
        invalidate()
    }

    fun setFrame(frame: Bitmap, confidenceMask: FloatArray, maskWidth: Int, maskHeight: Int) {
        val bg = background ?: return
        if (confidenceMask.size != maskWidth * maskHeight) return

        val (outputWidth, outputHeight) = CompositeDimensions.output(
            frameWidth = frame.width,
            frameHeight = frame.height,
            maskWidth = maskWidth,
            maskHeight = maskHeight
        )
        val normalizedFrame = if (frame.width == outputWidth && frame.height == outputHeight) {
            frame
        } else {
            Bitmap.createScaledBitmap(frame, outputWidth, outputHeight, true)
        }
        val normalizedBackground = centerCropAndScale(bg, outputWidth, outputHeight)
        val smoothedLowResMask = maskProcessor.smooth(confidenceMask)
        val fullResMask = scaleMask(
            smoothedLowResMask,
            maskWidth,
            maskHeight,
            outputWidth,
            outputHeight
        )

        val foregroundPixels = IntArray(outputWidth * outputHeight)
        val backgroundPixels = IntArray(outputWidth * outputHeight)
        normalizedFrame.getPixels(foregroundPixels, 0, outputWidth, 0, 0, outputWidth, outputHeight)
        normalizedBackground.getPixels(backgroundPixels, 0, outputWidth, 0, 0, outputWidth, outputHeight)
        val outputPixels = CompositePixelMixer.mix(foregroundPixels, backgroundPixels, fullResMask)
        composite = Bitmap.createBitmap(outputPixels, outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val bitmap = composite ?: return
        val destination = RectF(0f, 0f, width.toFloat(), height.toFloat())
        canvas.drawBitmap(bitmap, null, destination, paint)
    }

    private fun scaleMask(
        source: FloatArray,
        sourceWidth: Int,
        sourceHeight: Int,
        targetWidth: Int,
        targetHeight: Int
    ): FloatArray {
        if (sourceWidth == targetWidth && sourceHeight == targetHeight) return source
        val result = FloatArray(targetWidth * targetHeight)
        for (y in 0 until targetHeight) {
            val sourceY = ((y.toLong() * sourceHeight) / targetHeight).toInt().coerceIn(0, sourceHeight - 1)
            for (x in 0 until targetWidth) {
                val sourceX = ((x.toLong() * sourceWidth) / targetWidth).toInt().coerceIn(0, sourceWidth - 1)
                result[y * targetWidth + x] = source[sourceY * sourceWidth + sourceX]
            }
        }
        return result
    }

    private fun centerCropAndScale(source: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
        val targetAspect = targetWidth.toFloat() / targetHeight.toFloat()
        val sourceAspect = source.width.toFloat() / source.height.toFloat()
        val cropWidth: Int
        val cropHeight: Int
        val left: Int
        val top: Int
        if (sourceAspect > targetAspect) {
            cropHeight = source.height
            cropWidth = max(1, (cropHeight * targetAspect).toInt())
            left = (source.width - cropWidth) / 2
            top = 0
        } else {
            cropWidth = source.width
            cropHeight = max(1, (cropWidth / targetAspect).toInt())
            left = 0
            top = (source.height - cropHeight) / 2
        }
        val cropped = Bitmap.createBitmap(source, left, top, cropWidth, cropHeight)
        return Bitmap.createScaledBitmap(cropped, targetWidth, targetHeight, true)
    }
}
