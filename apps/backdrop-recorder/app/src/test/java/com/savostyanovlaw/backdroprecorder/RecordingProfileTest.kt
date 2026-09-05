package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Test

class RecordingProfileTest {
    @Test
    fun `first device profile records portrait 720p at 30 fps`() {
        val profile = RecordingProfile.a23Prototype()
        assertEquals(720, profile.width)
        assertEquals(1280, profile.height)
        assertEquals(30, profile.frameRate)
    }
}
