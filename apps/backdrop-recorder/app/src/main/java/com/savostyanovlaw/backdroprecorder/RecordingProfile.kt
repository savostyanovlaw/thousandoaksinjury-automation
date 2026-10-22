package com.savostyanovlaw.backdroprecorder

data class RecordingProfile(
    val width: Int,
    val height: Int,
    val frameRate: Int,
    val videoBitRate: Int,
    val audioBitRate: Int,
    val audioSampleRate: Int,
) {
    companion object {
        fun a23Prototype() = RecordingProfile(
            width = 720,
            height = 1280,
            frameRate = 30,
            videoBitRate = 4_000_000,
            audioBitRate = 128_000,
            audioSampleRate = 44_100,
        )
    }
}
