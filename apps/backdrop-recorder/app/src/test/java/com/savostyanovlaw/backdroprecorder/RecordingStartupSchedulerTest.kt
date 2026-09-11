package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Test

class RecordingStartupSchedulerTest {
    @Test
    fun `recorder starts synchronously while renderer setup is deferred`() {
        val events = mutableListOf<String>()
        var deferred: (() -> Unit)? = null
        val scheduler = RecordingStartupScheduler { task -> deferred = task }

        scheduler.start(
            startRecorder = { events += "recorder" },
            startRenderer = { events += "renderer" },
        )

        assertEquals(listOf("recorder"), events)
        deferred?.invoke()
        assertEquals(listOf("recorder", "renderer"), events)
    }
}
