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
    private var composite: Bitmap? = null

    fun setBackgroundBitmap(bitmap: Bitmap?) {
        background = bitmap
        composite = null
        invalidate()
    }

    fun clear() {
        background = null
        composite = null
        maskProcessor.reset()
        invalidate()
    }

    fun setFrame(frame: Bitmap, confidenceMask: FloatArray, maskWidth: Int, maskHeight: Int) {
        val bg = background ?: return
        if (confidenceMask.size != maskWidth * maskHeight) return

        val normalizedFrame = if (frame.width == maskWidth && frame.height == maskHeight) {
            frame
        } else {
            Bitmap.createScaledBitmap(frame, maskWidth, maskHeight, true)
        }
        val normalizedBackground = centerCropAndScale(bg, maskWidth, maskHeight)
        val foregroundPixels = IntArray(maskWidth * maskHeight)
        val backgroundPixels = IntArray(maskWidth * maskHeight)
        normalizedFrame.getPixels(foregroundPixels, 0, maskWidth, 0, 0, maskWidth, maskHeight)
        normalizedBackground.getPixels(backgroundPixels, 0, maskWidth, 0, 0, maskWidth, maskHeight)
        val smoothed = maskProcessor.smooth(confidenceMask)
        val outputPixels = CompositePixelMixer.mix(foregroundPixels, backgroundPixels, smoothed)
        composite = Bitmap.createBitmap(outputPixels, maskWidth, maskHeight, Bitmap.Config.ARGB_8888)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val bitmap = composite ?: return
        val destination = RectF(0f, 0f, width.toFloat(), height.toFloat())
        canvas.drawBitmap(bitmap, null, destination, paint)
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
