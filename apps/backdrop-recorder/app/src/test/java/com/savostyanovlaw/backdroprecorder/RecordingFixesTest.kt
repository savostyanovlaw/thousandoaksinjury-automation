package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Test

class RecordingFixesTest {
    @Test
    fun `recorder stops before renderer surface is released`() {
        assertEquals(
            listOf(
                RecordingStopStep.STOP_FRAMES,
                RecordingStopStep.STOP_RECORDER,
                RecordingStopStep.RELEASE_RENDERER,
                RecordingStopStep.FINALIZE_OUTPUT,
            ),
            RecordingStopPlan.steps,
        )
    }

    @Test
    fun `record button is lifted about one centimeter`() {
        assertEquals(38, RecordingUiSpacing.recordBottomLiftDp)
    }
}
