package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertArrayEquals
import org.junit.Test

class CompositePixelMixerTest {
    @Test
    fun `mix keeps foreground where person confidence is one and background where zero`() {
        val foreground = intArrayOf(0xFFFF0000.toInt(), 0xFF00FF00.toInt())
        val background = intArrayOf(0xFF0000FF.toInt(), 0xFFFFFFFF.toInt())
        val confidence = floatArrayOf(1f, 0f)

        val result = CompositePixelMixer.mix(foreground, background, confidence)

        assertArrayEquals(intArrayOf(0xFFFF0000.toInt(), 0xFFFFFFFF.toInt()), result)
    }

    @Test
    fun `mix blends foreground and background for soft edges`() {
        val foreground = intArrayOf(0xFFFF0000.toInt())
        val background = intArrayOf(0xFF0000FF.toInt())
        val confidence = floatArrayOf(0.5f)

        val result = CompositePixelMixer.mix(foreground, background, confidence)

        assertArrayEquals(intArrayOf(0xFF800080.toInt()), result)
    }
}
