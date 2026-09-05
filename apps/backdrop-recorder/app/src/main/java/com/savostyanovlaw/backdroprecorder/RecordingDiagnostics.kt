package com.savostyanovlaw.backdroprecorder

enum class RecordingStage {
    OUTPUT_CREATED,
    RECORDER_PREPARED,
    RECORDER_STARTED,
    FRAMES_ACTIVE,
    RECORDER_STOPPED,
    OUTPUT_FINALIZED,
}

object RecordingDiagnostics {
    val expectedStages = listOf(
        RecordingStage.OUTPUT_CREATED,
        RecordingStage.RECORDER_PREPARED,
        RecordingStage.RECORDER_STARTED,
        RecordingStage.FRAMES_ACTIVE,
        RecordingStage.RECORDER_STOPPED,
        RecordingStage.OUTPUT_FINALIZED,
    )
}

object RecordingRuntimePolicy {
    // v0.4.2 introduced manual EGL presentation timestamps and regressed startup on the A23.
    // Keep them disabled while the device path is diagnosed.
    const val manualPresentationTimestamps = false
}
