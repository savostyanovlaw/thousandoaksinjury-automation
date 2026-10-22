package com.savostyanovlaw.backdroprecorder

object CompositeDimensions {
    fun output(frameWidth: Int, frameHeight: Int, maskWidth: Int, maskHeight: Int): Pair<Int, Int> {
        require(frameWidth > 0 && frameHeight > 0)
        require(maskWidth > 0 && maskHeight > 0)
        return frameWidth to frameHeight
    }
}
