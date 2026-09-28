package com.savostyanovlaw.backdroprecorder

enum class RecordingState {
    IDLE,
    COUNTDOWN,
    RECORDING,
}

class RecordingStateMachine {
    var state: RecordingState = RecordingState.IDLE
        private set

    val cameraLocked: Boolean
        get() = state != RecordingState.IDLE

    fun canStart(cameraReady: Boolean, backgroundSelected: Boolean): Boolean =
        state == RecordingState.IDLE && cameraReady && backgroundSelected

    fun beginCountdown() {
        check(state == RecordingState.IDLE)
        state = RecordingState.COUNTDOWN
    }

    fun beginRecording() {
        check(state == RecordingState.COUNTDOWN)
        state = RecordingState.RECORDING
    }

    fun stop() {
        state = RecordingState.IDLE
    }
}
