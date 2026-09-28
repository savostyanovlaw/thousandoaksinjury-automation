package com.savostyanovlaw.backdroprecorder

enum class CameraFacing {
    FRONT,
    REAR;

    companion object {
        fun toggle(current: CameraFacing): CameraFacing =
            if (current == FRONT) REAR else FRONT

        fun shouldMirror(current: CameraFacing): Boolean = current == FRONT
    }
}
