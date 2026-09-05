package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class RecordingDiagnosticsTest {
    @Test
    fun `recording diagnostics expose lifecycle stages in order`() {
        assertEquals(
            listOf(
                RecordingStage.OUTPUT_CREATED,
                RecordingStage.RECORDER_PREPARED,
                RecordingStage.RECORDER_STARTED,
                RecordingStage.FRAMES_ACTIVE,
                RecordingStage.RECORDER_STOPPED,
                RecordingStage.OUTPUT_FINALIZED,
            ),
            RecordingDiagnostics.expectedStages,
        )
    }

    @Test
    fun `manual egl presentation timestamps stay disabled on A23 diagnostic build`() {
        assertFalse(RecordingRuntimePolicy.manualPresentationTimestamps)
    }
}
