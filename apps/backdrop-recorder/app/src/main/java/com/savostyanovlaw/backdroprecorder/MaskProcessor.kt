package com.savostyanovlaw.backdroprecorder

class MaskProcessor(private val alpha: Float = 0.65f) {
    init {
        require(alpha in 0f..1f)
    }

    private var previous: FloatArray? = null

    @Synchronized
    fun smooth(current: FloatArray): FloatArray {
        val prior = previous
        if (prior == null || prior.size != current.size) {
            return current.copyOf().also { previous = it }
        }

        val blended = FloatArray(current.size)
        for (index in current.indices) {
            blended[index] = prior[index] * (1f - alpha) + current[index] * alpha
        }
        previous = blended
        return blended.copyOf()
    }

    @Synchronized
    fun reset() {
        previous = null
    }
}
