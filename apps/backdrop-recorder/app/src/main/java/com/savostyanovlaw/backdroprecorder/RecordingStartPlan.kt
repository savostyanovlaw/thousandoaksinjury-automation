package com.savostyanovlaw.backdroprecorder

enum class RecordingStartStep {
    PREPARE_RECORDER,
    START_RECORDER,
    ATTACH_RENDERER,
    START_FRAMES,
}

object RecordingStartPlan {
    val steps = listOf(
        RecordingStartStep.PREPARE_RECORDER,
        RecordingStartStep.START_RECORDER,
        RecordingStartStep.ATTACH_RENDERER,
        RecordingStartStep.START_FRAMES,
    )
}
