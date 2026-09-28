package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CameraFacingTest {
    @Test
    fun `switching camera toggles front and rear and mirror follows facing`() {
        val rear = CameraFacing.toggle(CameraFacing.FRONT)
        assertTrue(rear == CameraFacing.REAR)
        assertFalse(CameraFacing.shouldMirror(rear))

        val front = CameraFacing.toggle(rear)
        assertTrue(front == CameraFacing.FRONT)
        assertTrue(CameraFacing.shouldMirror(front))
    }
}
