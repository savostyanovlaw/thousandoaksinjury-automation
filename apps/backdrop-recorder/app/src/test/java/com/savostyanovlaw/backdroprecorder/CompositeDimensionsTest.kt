package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Test

class CompositeDimensionsTest {
    @Test
    fun `composite output follows camera frame not AI mask`() {
        val size = CompositeDimensions.output(frameWidth = 360, frameHeight = 640, maskWidth = 256, maskHeight = 256)
        assertEquals(360, size.first)
        assertEquals(640, size.second)
    }
}
