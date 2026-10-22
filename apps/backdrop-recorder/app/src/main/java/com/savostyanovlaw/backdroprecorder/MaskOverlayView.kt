package com.savostyanovlaw.backdroprecorder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import kotlin.math.max

class MaskOverlayView(context: Context) : View(context) {
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val processor = MaskProcessor(alpha = 0.65f)
    private var maskBitmap: Bitmap? = null

    fun setMask(mask: FloatArray, outputWidth: Int, outputHeight: Int) {
        if (mask.size != outputWidth * outputHeight) return

        val smoothed = processor.smooth(mask)
        val pixels = IntArray(smoothed.size)
        for (index in pixels.indices) {
            val confidence = smoothed[index].coerceIn(0f, 1f)
            val alpha = when {
                confidence < 0.25f -> 0
                confidence < 0.45f -> ((confidence - 0.25f) / 0.20f * 100f).toInt()
                else -> (100f + ((confidence - 0.45f) / 0.55f * 110f)).toInt()
            }.coerceIn(0, 210)
            pixels[index] = Color.argb(alpha, 0, 255, 80)
        }
        maskBitmap = Bitmap.createBitmap(pixels, outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
        invalidate()
    }

    fun clearMask() {
        processor.reset()
        maskBitmap = null
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val bitmap = maskBitmap ?: return
        val scale = max(width.toFloat() / bitmap.width, height.toFloat() / bitmap.height)
        val drawWidth = bitmap.width * scale
        val drawHeight = bitmap.height * scale
        val left = (width - drawWidth) / 2f
        val top = (height - drawHeight) / 2f
        canvas.save()
        canvas.translate(left, top)
        canvas.scale(scale, scale)
        canvas.drawBitmap(bitmap, 0f, 0f, paint)
        canvas.restore()
    }
}
