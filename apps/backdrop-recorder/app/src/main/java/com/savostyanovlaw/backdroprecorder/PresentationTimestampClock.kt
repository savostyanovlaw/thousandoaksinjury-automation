package com.savostyanovlaw.backdroprecorder

class PresentationTimestampClock(frameRate: Int) {
    private val frameDurationNs = 1_000_000_000L / frameRate.coerceAtLeast(1)
    private var frameIndex = 0L

    fun nextTimestampNs(): Long {
        val timestamp = frameIndex * frameDurationNs
        frameIndex += 1L
        return timestamp
    }
}
