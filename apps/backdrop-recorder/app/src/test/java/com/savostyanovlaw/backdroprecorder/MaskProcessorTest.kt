package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertArrayEquals
import org.junit.Test

class MaskProcessorTest {
    @Test
    fun `smooth blends new confidence mask with previous mask`() {
        val processor = MaskProcessor(alpha = 0.5f)
        val first = processor.smooth(floatArrayOf(0f, 1f))
        assertArrayEquals(floatArrayOf(0f, 1f), first, 0.0001f)

        val second = processor.smooth(floatArrayOf(1f, 0f))
        assertArrayEquals(floatArrayOf(0.5f, 0.5f), second, 0.0001f)
    }

    @Test
    fun `dimension change resets smoothing state`() {
        val processor = MaskProcessor(alpha = 0.5f)
        processor.smooth(floatArrayOf(0f, 1f))
        val resized = processor.smooth(floatArrayOf(1f, 0f, 1f))
        assertArrayEquals(floatArrayOf(1f, 0f, 1f), resized, 0.0001f)
    }
}
