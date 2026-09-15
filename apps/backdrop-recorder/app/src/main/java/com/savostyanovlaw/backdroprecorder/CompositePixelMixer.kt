package com.savostyanovlaw.backdroprecorder

import kotlin.math.roundToInt

object CompositePixelMixer {
    fun mix(foreground: IntArray, background: IntArray, confidence: FloatArray): IntArray {
        require(foreground.size == background.size && foreground.size == confidence.size)
        val output = IntArray(foreground.size)
        for (index in foreground.indices) {
            val a = confidence[index].coerceIn(0f, 1f)
            val inv = 1f - a
            val fg = foreground[index]
            val bg = background[index]
            val r = (((fg shr 16) and 0xFF) * a + ((bg shr 16) and 0xFF) * inv).roundToInt().coerceIn(0, 255)
            val g = (((fg shr 8) and 0xFF) * a + ((bg shr 8) and 0xFF) * inv).roundToInt().coerceIn(0, 255)
            val b = ((fg and 0xFF) * a + (bg and 0xFF) * inv).roundToInt().coerceIn(0, 255)
            output[index] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        return output
    }
}
