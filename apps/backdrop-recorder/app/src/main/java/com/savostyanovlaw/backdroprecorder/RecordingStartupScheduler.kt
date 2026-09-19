package com.savostyanovlaw.backdroprecorder

class RecordingStartupScheduler(
    private val dispatch: ((() -> Unit) -> Unit),
) {
    fun start(
        startRecorder: () -> Unit,
        startRenderer: () -> Unit,
    ) {
        startRecorder()
        dispatch(startRenderer)
    }
}
