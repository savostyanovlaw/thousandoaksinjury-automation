package com.savostyanovlaw.backdroprecorder

enum class RecordingStopStep {
    STOP_FRAMES,
    STOP_RECORDER,
    RELEASE_RENDERER,
    FINALIZE_OUTPUT,
}

object RecordingStopPlan {
    val steps = listOf(
        RecordingStopStep.STOP_FRAMES,
        RecordingStopStep.STOP_RECORDER,
        RecordingStopStep.RELEASE_RENDERER,
        RecordingStopStep.FINALIZE_OUTPUT,
    )
}

object RecordingUiSpacing {
    const val recordBottomLiftDp = 38
}
