// AudioWorklet processor for ultra-precise MIDI clock and LFO timing
class TimingProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Timing state
        this.isRunning = false;
        this.startTime = 0;
        this.bpm = 120;
        this.currentTime = 0;

        // MIDI clock timing (24 pulses per quarter note)
        this.midiInterval = 0;
        this.nextMidiTime = 0;

        // LFO timing (100Hz)
        this.lfoInterval = 0.01; // 10ms
        this.nextLfoTime = 0;

        // Phase drift correction
        this.driftAccumulator = 0;
        this.lastSyncTime = 0;

        // Message handling
        this.port.onmessage = (event) => {
            const { type, data } = event.data;

            switch (type) {
                case 'start':
                    this.start(data.bpm, data.currentTime);
                    break;
                case 'stop':
                    this.stop();
                    break;
                case 'setBpm':
                    this.setBpm(data.bpm);
                    break;
                case 'syncPhase':
                    // Align our timing with external clock
                    this.syncPhase(data.externalTime, data.quarterNoteDuration);
                    break;
            }
        };
    }

    start(bpm, currentTime) {
        this.isRunning = true;
        this.bpm = bpm;
        this.startTime = currentTime;

        // Calculate MIDI clock interval in seconds
        this.midiInterval = 60.0 / (this.bpm * 24);

        // Set initial timing
        this.nextMidiTime = this.startTime + this.midiInterval;
        this.nextLfoTime = this.startTime + this.lfoInterval;
        this.currentTime = this.startTime;

        // Send start message
        this.port.postMessage({ type: 'midiStart' });
    }

    stop() {
        this.isRunning = false;
        this.port.postMessage({ type: 'midiStop' });
    }

    setBpm(bpm) {
        this.bpm = bpm;
        this.midiInterval = 60.0 / (this.bpm * 24);
    }

    syncPhase(externalTimeMs, quarterNoteDurationMs) {
        if (!this.isRunning) return;

        // Convert ms to seconds
        const quarterNoteDuration = quarterNoteDurationMs / 1000;

        // Calculate where we think the next quarter note should be
        // vs where the external clock says it is
        const expectedInterval = 60.0 / this.bpm;
        const actualInterval = quarterNoteDuration;

        // Calculate drift as a ratio (1.0 = perfect sync)
        const driftRatio = actualInterval / expectedInterval;

        // Only correct significant drift (>0.5%)
        if (Math.abs(driftRatio - 1.0) > 0.005) {
            // Accumulate small corrections over time rather than jumping
            this.driftAccumulator += (driftRatio - 1.0) * 0.1;

            // Apply correction by adjusting next event times
            const correction = this.driftAccumulator * this.lfoInterval;
            this.nextLfoTime += correction;
            this.nextMidiTime += correction;

            // Slowly decay the accumulator
            this.driftAccumulator *= 0.9;
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.isRunning) {
            return true;
        }

        const blockSize = outputs[0][0].length;
        const sampleRate = globalThis.sampleRate || 44100;
        const blockDuration = blockSize / sampleRate;

        // Update current time
        this.currentTime += blockDuration;

        // Check for MIDI clock events
        while (this.currentTime >= this.nextMidiTime) {
            this.port.postMessage({
                type: 'midiClock',
                time: this.currentTime,
                scheduledTime: this.nextMidiTime
            });
            this.nextMidiTime += this.midiInterval;
        }

        // Check for LFO events
        while (this.currentTime >= this.nextLfoTime) {
            this.port.postMessage({
                type: 'lfoUpdate',
                time: this.currentTime,
                scheduledTime: this.nextLfoTime,
                deltaTime: this.lfoInterval
            });
            this.nextLfoTime += this.lfoInterval;
        }

        return true;
    }
}

registerProcessor('timing-processor', TimingProcessor);
