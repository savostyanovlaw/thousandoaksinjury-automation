package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Test

class AppConfigTest {
    @Test
    fun applicationId_isExpected() {
        assertEquals("com.savostyanovlaw.backdroprecorder", BuildConfig.APPLICATION_ID)
    }
}
