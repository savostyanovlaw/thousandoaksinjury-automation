package com.savostyanovlaw.backdroprecorder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import java.nio.ByteBuffer
import kotlin.math.max

class MaskOverlayView(context: Context) : View(context) {
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val processor = MaskProcessor(alpha = 0.55f)
    private var maskBitmap: Bitmap? = null

    fun setMask(mask: ByteBuffer, outputWidth: Int, outputHeight: Int) {
        val raw = FloatArray(outputWidth * outputHeight)
        val source = mask.duplicate().apply { rewind() }
        for (index in raw.indices) {
            val category = source.get(index).toInt() and 0xFF
            raw[index] = if (category == PERSON_CATEGORY) 1f else 0f
        }

        val smoothed = processor.smooth(raw)
        val pixels = IntArray(smoothed.size)
        for (index in pixels.indices) {
            val alpha = (smoothed[index] * 120f).toInt().coerceIn(0, 120)
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

    companion object {
        private const val PERSON_CATEGORY = 1
    }
}
