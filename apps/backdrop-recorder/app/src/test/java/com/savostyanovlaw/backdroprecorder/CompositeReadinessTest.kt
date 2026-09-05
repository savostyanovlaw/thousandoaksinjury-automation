package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CompositeReadinessTest {
    @Test
    fun `composite preview requires both camera and background`() {
        assertFalse(CompositeReadiness.isReady(cameraReady = false, backgroundSelected = false))
        assertFalse(CompositeReadiness.isReady(cameraReady = true, backgroundSelected = false))
        assertFalse(CompositeReadiness.isReady(cameraReady = false, backgroundSelected = true))
        assertTrue(CompositeReadiness.isReady(cameraReady = true, backgroundSelected = true))
    }
}
