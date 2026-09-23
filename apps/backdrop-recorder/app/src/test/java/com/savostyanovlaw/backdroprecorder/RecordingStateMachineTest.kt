package com.savostyanovlaw.backdroprecorder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecordingStateMachineTest {
    @Test
    fun `recording requires ready composite and locks camera while active`() {
        val machine = RecordingStateMachine()

        assertFalse(machine.canStart(cameraReady = true, backgroundSelected = false))
        assertTrue(machine.canStart(cameraReady = true, backgroundSelected = true))

        machine.beginCountdown()
        assertEquals(RecordingState.COUNTDOWN, machine.state)
        assertTrue(machine.cameraLocked)

        machine.beginRecording()
        assertEquals(RecordingState.RECORDING, machine.state)
        assertTrue(machine.cameraLocked)

        machine.stop()
        assertEquals(RecordingState.IDLE, machine.state)
        assertFalse(machine.cameraLocked)
    }
}
