package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PresentationTimestampTest {
    @Test
    fun `presentation timestamps advance monotonically at target frame rate`() {
        val clock = PresentationTimestampClock(frameRate = 30)
        val first = clock.nextTimestampNs()
        val second = clock.nextTimestampNs()
        val third = clock.nextTimestampNs()

        assertEquals(0L, first)
        assertTrue(second > first)
        assertTrue(third > second)
        assertEquals(33_333_333L, second)
    }
}
