package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Test

class RecordingStartPlanTest {
    @Test
    fun `recorder starts before EGL attaches to encoder surface`() {
        assertEquals(
            listOf(
                RecordingStartStep.PREPARE_RECORDER,
                RecordingStartStep.START_RECORDER,
                RecordingStartStep.ATTACH_RENDERER,
                RecordingStartStep.START_FRAMES,
            ),
            RecordingStartPlan.steps,
        )
    }
}
