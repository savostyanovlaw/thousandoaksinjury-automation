package com.savostyanovlaw.backdroprecorder

object CompositeReadiness {
    fun isReady(cameraReady: Boolean, backgroundSelected: Boolean): Boolean =
        cameraReady && backgroundSelected
}
