import Alpine from 'alpinejs';
import persist from '@alpinejs/persist';
import './style.css';

// Register Alpine plugins
Alpine.plugin(persist);

// Constants
const CC = {
    VOLUME: 7, AUX: 14, CUE: 15, FX: 82, EQ_HIGH: 85, EQ_MID: 86, EQ_LOW: 87,
    FILTER: 74, START_STOP: 46, BPM: 47, FX_ENGINE: 15, FX_PARAM1: 12,
    FX_PARAM2: 13, FX_RETURN: 7, FX_TRACK_SELECT: 9
};

const CHANNELS = { MASTER: 6, FX1: 7, FX2: 8 };

const seqs = [
    '0000000000000000', '1000000000000000', '1000000010000000', '0010001000000000',
    '0000100000001000', '0000000000001100', '1000001010000000', '1000010010000000',
    '0000100000101000', '0000100000001010', '0000100001001010', '0000000000001110',
    '1000100010001000', '1000001010000010', '1010010010000000', '1010001010000000',
    '1001000010100000', '0010001101001000', '0000100100110010', '1010000010101100',
    '1010101010110100', '1010101010101010', '1111111111111111', 'RND',
    'U1', 'U2', 'U3', 'U4', 'U5', 'U6'
];

// Utility functions
const midiToAngle = (value) => -150 + (value / 127) * 300;
const lfoRateToAngle = (value) => -150 + (value / 3000) * 300;
const lfoAmountToAngle = (value) => -150 + (value / 100) * 300;
const synthFreqToAngle = (value) => -150 + (value / 100) * 300;
const midiToEqDisplay = (value) => {
    const dbValue = Math.round((value - 64) * (18 / 64));
    return dbValue === 0 ? "0dB" : (dbValue > 0 ? "+" + dbValue : dbValue) + "dB";
};

// Make utility functions available globally
window.midiToAngle = midiToAngle;
window.lfoRateToAngle = lfoRateToAngle;
window.lfoAmountToAngle = lfoAmountToAngle;
window.synthFreqToAngle = synthFreqToAngle;

// Alpine.js knob component
Alpine.data('knob', (config) => ({
    knobData: { value: 0 },
    dragState: { isDragging: false, startValue: 0, initialY: 0 },
    lastTapTime: 0,

    startDrag(event) {
        event.preventDefault();

        if (config.doubleClickReset) {
            const now = Date.now();
            if (this.lastTapTime && (now - this.lastTapTime) < 300) {
                this.setValue(config.doubleClickReset);
                this.lastTapTime = 0;
                return;
            }
            this.lastTapTime = now;
        }

        this.dragState.isDragging = true;
        this.dragState.startValue = this.knobData.value;
        this.dragState.initialY = event.type === 'touchstart' ?
            event.touches[0].clientY : event.clientY;

        const handleMove = (e) => this.handleMove(e);
        const handleEnd = () => {
            ['mousemove', 'touchmove', 'mouseup', 'touchend'].forEach((evt, i) => {
                document.removeEventListener(evt, i < 2 ? handleMove : handleEnd);
            });
            this.dragState.isDragging = false;
        };

        ['mousemove', 'touchmove'].forEach(evt => document.addEventListener(evt, handleMove));
        ['mouseup', 'touchend'].forEach(evt => document.addEventListener(evt, handleEnd));
    },

    handleMove(event) {
        if (!this.dragState.isDragging) return;

        const currentY = event.type === 'touchmove' ? event.touches[0].clientY : event.clientY;
        const deltaY = currentY - this.dragState.initialY;
        const sensitivity = config.sensitivity || 1.5;
        const valueDelta = Math.round(-deltaY / sensitivity);

        const minValue = config.minValue || 0;
        const maxValue = config.maxValue || 127;
        const newValue = Math.max(minValue, Math.min(maxValue, this.dragState.startValue + valueDelta));

        if (this.knobData.value !== newValue) this.setValue(newValue);
    },

    setValue(value) {
        this.knobData.value = value;
        if (config.onChange) config.onChange(value);
    }
}));

// MIDI Controller module
const createMidiController = () => {
    let connectionType = null;
    let bluetoothDevice = null;
    let midiCharacteristic = null;
    let midiAccess = null;
    let midiOutput = null;
    let midiInput = null;
    let isSending = false;
    let sendQueue = [];
    let clockListeners = [];
    let lastClockTime = 0;
    let clockCount = 0;
    let isReceivingClock = false;
    let bpmHistory = [];
    const BPM_HISTORY_SIZE = 4;

    const timestampGenerator = () => {
        let localTime = performance.now() & 8191;
        return [((localTime >> 7) | 0x80) & 0xBF, (localTime & 0x7F) | 0x80];
    };

    const midiEncoder = (midiData) => {
        let midiBLEmessage = [timestampGenerator()[0]];
        for (let pos = 0; pos < midiData.length; pos++) {
            if ((midiData[pos] >>> 7) === 1) midiBLEmessage.push(timestampGenerator()[1]);
            midiBLEmessage.push(midiData[pos]);
        }
        return midiBLEmessage;
    };

    const processQueue = () => {
        if (isSending || sendQueue.length === 0) return;

        const msg = sendQueue.shift();
        isSending = true;

        const sendNext = () => {
            isSending = false;
            if (sendQueue.length > 0) setTimeout(processQueue, 0);
        };

        try {
            if (connectionType === 'ble' && midiCharacteristic) {
                const bleMidiData = new Uint8Array(midiEncoder(msg.data));
                midiCharacteristic.writeValue(bleMidiData)
                    .then(() => { msg.resolve(); sendNext(); })
                    .catch(error => { console.error('BLE send error:', error); msg.reject(error); sendNext(); });
            } else if (connectionType === 'usb' && midiOutput) {
                midiOutput.send(msg.data);
                msg.resolve();
                sendNext();
            } else {
                msg.resolve();
                sendNext();
            }
        } catch (error) {
            console.error('Error in MIDI send:', error);
            msg.reject(error);
            sendNext();
        }
    };

    const sendMidiData = (data) => {
        const isRealtime = data.length === 1 && data[0] >= 0xF8;
        return new Promise((resolve, reject) => {
            const msg = { data, resolve, reject };
            isRealtime && sendQueue.length > 0 ? sendQueue.unshift(msg) : sendQueue.push(msg);
            if (!isSending) setTimeout(processQueue, 0);
        });
    };

    const sendCC = (channel, controller, value) => sendMidiData([0xB0 + channel, controller, value]);
    const sendSystemRealTime = (message) => sendMidiData([message]);

    const processMidiMessage = (data) => {
        const message = data[0];
        const now = performance.now();

        if (message === 0xF8) { // Clock
            clockCount++;
            if (!isReceivingClock) isReceivingClock = true;

            // Only notify listeners every 24 clocks (one quarter note)
            if (clockCount % 24 === 0) {
                if (lastClockTime > 0) {
                    const instantBpm = 60000 / (now - lastClockTime);
                    
                    // Add to history for averaging
                    bpmHistory.push(instantBpm);
                    if (bpmHistory.length > BPM_HISTORY_SIZE) {
                        bpmHistory.shift();
                    }
                    
                    // Only send BPM after we have at least 2 readings (skip first unstable reading)
                    if (bpmHistory.length >= 2) {
                        // Calculate average BPM from history
                        const avgBpm = bpmHistory.reduce((sum, val) => sum + val, 0) / bpmHistory.length;
                        clockListeners.forEach(cb => {
                            try { cb({ type: 'clock', bpm: avgBpm, clockCount, timestamp: now }); }
                            catch (e) { console.error('Error in clock listener:', e); }
                        });
                    }
                }
                lastClockTime = now;
            }
        } else if ([0xFA, 0xFB, 0xFC].includes(message)) {
            const types = { 0xFA: 'start', 0xFB: 'continue', 0xFC: 'stop' };
            if (message === 0xFA) {
                clockCount = 0;
                bpmHistory = []; // Reset BPM history on start
                lastClockTime = 0;
            }
            isReceivingClock = message !== 0xFC;
            if (message === 0xFC) {
                bpmHistory = []; // Reset on stop
            }
            clockListeners.forEach(cb => {
                try { cb({ type: types[message], timestamp: now }); }
                catch (e) { console.error('Error in clock listener:', e); }
            });
        }
    };

    const connectBle = async () => {
        if (!navigator.bluetooth) throw new Error('Web Bluetooth API not supported');

        const MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
        const MIDI_IO_CHARACTERISTIC_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

        // Try to connect to TX-6 first, but allow other MIDI BLE devices
        let requestOptions = {
            filters: [
                { services: [MIDI_SERVICE_UUID], namePrefix: 'TX-6' },
                { services: [MIDI_SERVICE_UUID], name: 'TX-6' }
            ],
            optionalServices: [MIDI_SERVICE_UUID]
        };

        try {
            bluetoothDevice = await navigator.bluetooth.requestDevice(requestOptions);
        } catch (error) {
            // If TX-6 not found, allow selection of any MIDI BLE device
            try {
                requestOptions = {
                    filters: [{ services: [MIDI_SERVICE_UUID] }],
                    optionalServices: [MIDI_SERVICE_UUID]
                };
                bluetoothDevice = await navigator.bluetooth.requestDevice(requestOptions);
            } catch (secondError) {
                throw new Error('No MIDI BLE devices found or user cancelled selection');
            }
        }

        const server = await bluetoothDevice.gatt.connect();
        const service = await server.getPrimaryService(MIDI_SERVICE_UUID);
        midiCharacteristic = await service.getCharacteristic(MIDI_IO_CHARACTERISTIC_UUID);
        connectionType = 'ble';

        await midiCharacteristic.startNotifications();
        midiCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const data = new Uint8Array(value.buffer);
            let midiData = [];
            for (let i = 1; i < data.length; i++) {
                if ((data[i] & 0x80) === 0) midiData.push(data[i]);
            }
            if (midiData.length > 0) processMidiMessage(midiData);
        });

        return bluetoothDevice;
    };

    const connectUsb = async () => {
        if (!navigator.requestMIDIAccess) throw new Error('Web MIDI API not supported');

        midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        const outputs = Array.from(midiAccess.outputs.values());
        const inputs = Array.from(midiAccess.inputs.values());

        if (outputs.length === 0) throw new Error('No MIDI output devices found');

        // Prefer TX-6 but allow selection from available devices
        let preferredOutput = outputs.find(output =>
            output.name && output.name.toLowerCase().includes('tx-6')
        );

        if (preferredOutput) {
            midiOutput = preferredOutput;
        } else if (outputs.length === 1) {
            // If only one device, use it
            midiOutput = outputs[0];
        } else {
            // Multiple devices available, let user choose
            const deviceNames = outputs.map((output, index) => `${index + 1}. ${output.name || 'Unknown Device'}`);
            const choice = prompt(`Multiple MIDI devices found. Choose one:\n${deviceNames.join('\n')}\n\nEnter number (1-${outputs.length}):`);
            
            const choiceIndex = parseInt(choice) - 1;
            if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= outputs.length) {
                throw new Error('Invalid device selection');
            }
            
            midiOutput = outputs[choiceIndex];
        }

        midiInput = inputs.find(input => input.name?.toLowerCase().includes('tx-6'));
        if (midiInput) {
            midiInput.onmidimessage = (event) => processMidiMessage(event.data);
        }

        connectionType = 'usb';
        return midiOutput;
    };

    return {
        sendCC, sendSystemRealTime, connectBle, connectUsb,
        addClockListener: (cb) => clockListeners.push(cb),
        removeClockListener: (cb) => clockListeners.splice(clockListeners.indexOf(cb), 1),
        getClockStatus: () => ({ isReceivingClock, clockCount })
    };
};

// Main Alpine.js component
Alpine.data('tx6Controller', () => ({
    // State
    status: '',
    isConnected: false,
    connecting: false,
    clockStatus: { isReceiving: false, bpm: 0, clockCount: 0, lastUpdate: 0 },
    currentTrack: Alpine.$persist(0).as('tx6-currentTrack'),

    lfoOutputValues: {},
    currentSliderMode: Alpine.$persist(7).as('tx6-currentSliderMode'),
    currentEqMode: Alpine.$persist(74).as('tx6-currentEqMode'),
    currentFxMode: Alpine.$persist(91).as('tx6-currentFxMode'),
    bpm: Alpine.$persist(100).as('tx6-bpm'),
    startStopActive: false,
    isFullscreen: false,
    settingsView: null,
    currentView: Alpine.$persist('main').as('tx6-currentView'), // 'main', 'fx', 'lfo', 'synth', 'help', 'about'
    showOptionsMenu: false,
    masterChannel: Alpine.$persist('volume').as('tx6-masterChannel'), // 'aux', 'cue', 'volume'
    currentLfoIndex: Alpine.$persist(0).as('tx6-currentLfoIndex'),
    lfoPhases: Array(10).fill(0),
    lfoStartTime: null,
    lastTapTime: 0,
    trackValues: {},
    midi: null,

    // Consolidated knob configurations - must be a getter to maintain context
    get knobConfigs() {
        return {
            eq: {
                knobType: 'eq', minValue: 0, maxValue: 127, sensitivity: 1.5, doubleClickReset: 64,
                onChange: (v) => { this.handleEqChange(v); this.setKnobValue('eq', v); }
            },
            fx1: {
                knobType: 'fx1', minValue: 0, maxValue: 127, sensitivity: 1.5,
                onChange: (v) => { this.handleFx1Change(v); this.setKnobValue('fx1', v); }
            },
            masterVolume: { knobType: 'masterVolume', onChange: (v) => { this.handleMasterChannelChange(v); this.setKnobValue('masterVolume', v); } },
            fxReturn: { knobType: 'fxReturn', onChange: (v) => { this.handleKnobChange('fxReturn', v); this.setKnobValue('fxReturn', v); } },
            fxParam1: { knobType: 'fxParam1', onChange: (v) => { this.handleKnobChange('fxParam1', v); this.setKnobValue('fxParam1', v); } },
            fxParam2: { knobType: 'fxParam2', onChange: (v) => { this.handleKnobChange('fxParam2', v); this.setKnobValue('fxParam2', v); } },
            lfoRate: {
                knobType: 'lfoRate', minValue: 0, maxValue: 3000, sensitivity: 0.4,
                onChange: (v) => { this.handleKnobChange('lfoRate', v); this.setKnobValue('lfoRate', v); }
            },
            lfoAmount: {
                knobType: 'lfoAmount', minValue: 0, maxValue: 100, sensitivity: 1.5, doubleClickReset: 50,
                onChange: (v) => { this.handleKnobChange('lfoAmount', v); this.setKnobValue('lfoAmount', v); }
            },
            lfoPhase: { knobType: 'lfoPhase', onChange: (v) => { this.handleKnobChange('lfoPhase', v); this.setKnobValue('lfoPhase', v); } },
            synthFreq: { knobType: 'synthFreq', minValue: 0, maxValue: 100, sensitivity: 1.5, onChange: (v) => { this.handleKnobChange('synthFreq', v); this.setKnobValue('synthFreq', v); } },
            synthLen: { knobType: 'synthLen', onChange: (v) => { this.handleKnobChange('synthLen', v); this.setKnobValue('synthLen', v); } }
        };
    },

    // Knobs state
    knobs: Alpine.$persist({
        eq: { value: 64 }, masterVolume: { value: 0 },
        fx1: { value: 0 },
        fxParam1: { value: 0 }, fxParam2: { value: 0 },
        fxReturn: { value: 0 }, lfoRate: { value: 64 }, lfoAmount: { value: 0 },
        lfoPhase: { value: 0 }, synthFreq: { value: 60 }, synthLen: { value: 0 }
    }).as('tx6-knobs'),

    // Master channel values storage
    masterChannelValues: Alpine.$persist({
        aux: 0,
        cue: 0,
        volume: 0
    }).as('tx6-masterChannelValues'),

    // Global LFOs - simplified initialization
    globalLfos: Alpine.$persist(Array(10).fill(null).map((_, i) => ({
        name: `LFO ${i + 1}`,
        target: ['vol', 'aux', 'flt'][i % 3],
        shape: ['sine', 'triangle', 'square', 'saw', 'sine'][i % 5],
        enabled: true,
        rate: 1.0,
        amount: 50,
        phase: 0,
        assignedTrack: 0
    }))).as('tx6-globalLfos'),

    // FX state
    fx: Alpine.$persist({
        fx1Active: false, fx2Active: false, currentChannel: 7,
        channels: {
            7: { types: ['REV', 'CHO', 'DLY'], engine: 0, values: { param1: 0, param2: 0, return: 0 } },
            8: { types: ['FLT', 'CRU', 'DST', 'TRM', 'FRZ', 'TPE'], engine: 0, values: { param1: 0, param2: 0, track: 0 } }
        }
    }).as('tx6-fx'),

    // FX parameter configuration
    paramConfig: {
        'REV': { param1: { values: ['LIGHT', 'SMALL', 'MEDIUM', 'LARGE', 'DRONE'] } },
        'CHO': { param1: { values: ['SUBTLE', 'MEDIUM', 'STRONG'] } },
        'DLY': { param1: { values: ['1/8', '1/4', '1/2', '2/3', '3/4', '1', '3/2', 'WARP', 'MASH'] } },
        'CRU': { param1: { values: ['SHAPE', 'BEND', 'CHIP', 'BIT'] } },
        'DST': { param1: { values: ['PUSH', 'DRIVE', 'BLOW', 'DSTROY'] } },
        'TPE': { param1: { values: ['STOP 1', 'STOP 2', 'PONG'] } }
    },

    // Synth settings
    synthSettings: Alpine.$persist({ seq: '0', waveform: '0', octave: 4 }).as('tx6-synthSettings'),
    waveformLabels: ['SIN', 'TRI', 'SQR', 'SAW', 'KICK', 'SNARE', 'CLAP', 'HIHAT', 'SAMPLE', 'MIDI'],
    noteNames: Array(128).fill(null).map((_, i) => {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return notes[i % 12] + Math.floor(i / 12);
    }),

    // Helper methods
    toggleView(view) {
        this.settingsView = this.settingsView === view ? null : view;
    },

    switchView(view) {
        this.currentView = view;
    },

    getKnobAngle(type, value) {
        if (type === 'lfoRate') return lfoRateToAngle(value);
        if (type === 'lfoAmount') return lfoAmountToAngle(value);
        return midiToAngle(value);
    },

    getKnobDisplayValue(knobId) {
        if (knobId === 'fxReturn') return this.fxTrackDisplayValue;
        if (knobId === 'fxParam1') return this.fxParam1DisplayValue;
        if (knobId === 'fxParam2') return Math.floor(this.knobs.fxParam2.value * 100 / 127);
        return Math.floor(this.knobs[knobId].value * 100 / 127);
    },

    getKnobLabel(knobId) {
        if (knobId === 'fxReturn') return this.fx.currentChannel === 7 ? 'Return' : 'Track';
        if (knobId === 'fxParam2') return 'res';
        return '';
    },

    getLfoKnobDisplay(knobType) {
        const lfo = this.globalLfos[this.currentLfoIndex];
        if (knobType === 'lfoRate') return (lfo.rate / 100).toFixed(2);
        if (knobType === 'lfoAmount') return (this.knobs.lfoAmount.value - 50);
        if (knobType === 'lfoPhase') return Math.floor(this.knobs.lfoPhase.value * 360 / 127);
    },

    getLfoKnobUnit(knobType) {
        if (knobType === 'lfoRate') return 'Hz';
        if (knobType === 'lfoPhase') return '°';
        return '';
    },

    getRateButtonLabel(mult) {
        const labels = { 0.25: '1', 0.5: '½', [1 / 3]: '⅓', 1: '¼', 2: '⅛', 4: '1/16' };
        return labels[mult];
    },

    init() {
        this.midi = createMidiController();
        this.initializeTrackValues();
        this.setupFullscreenListener();
        
        // Set default LFO rates to 1/2 note of current BPM
        this.initializeLfoRates();
        
        this.updateLfoKnobs();
        this.lfoStartTime = performance.now() / 1000;
        this.$nextTick(() => {
            this.drawLfoWaveform();
            this.setupLfoCanvasDrag();
        });

        // Watch for view changes to setup canvas drag when switching to LFO view
        this.$watch('currentView', (newView) => {
            if (newView === 'lfo') {
                this.$nextTick(() => {
                    this.drawLfoWaveform();
                    this.setupLfoCanvasDrag();
                });
            }
        });

        // Watch for master channel changes
        this.$watch('masterChannel', (newChannel, oldChannel) => {
            if (oldChannel) {
                // Save current knob value to old channel
                this.masterChannelValues[oldChannel] = this.knobs.masterVolume.value;
            }
            // Load new channel's value
            this.knobs.masterVolume.value = this.masterChannelValues[newChannel];
            
            // Sync slider mode with master channel
            const sliderModeMap = {
                aux: 92,      // AUX slider CC
                volume: 7     // VOL slider CC
                // cue doesn't have a slider mode
            };
            
            if (sliderModeMap[newChannel]) {
                this.currentSliderMode = sliderModeMap[newChannel];
            }
        });

        this.midi.addClockListener(async (clockData) => {
            this.clockStatus.isReceiving = true;
            this.clockStatus.lastUpdate = clockData.timestamp;

            if (clockData.type === 'clock') {
                const detectedBpm = Math.round(clockData.bpm * 10) / 10;
                this.bpm = Math.round(detectedBpm);
                this.clockStatus.bpm = detectedBpm;
                this.clockStatus.clockCount = clockData.clockCount;
                
                // Start timing system if not already active
                if (!this.startStopActive) {
                    await this.startTimingSystem(false); // false = don't send MIDI clock
                }
                this.startStopActive = true;
            } else if (clockData.type === 'start') {
                await this.startTimingSystem(false); // false = don't send MIDI clock
                this.startStopActive = true;
                this.clockStatus.clockCount = 0;
            } else if (clockData.type === 'stop') {
                this.stopTimingSystem();
                this.startStopActive = false;
                this.clockStatus.isReceiving = false;
            } else if (clockData.type === 'continue') {
                if (!this.startStopActive) {
                    await this.startTimingSystem(false); // false = don't send MIDI clock
                }
                this.startStopActive = true;
            }
        });
    },

    initializeTrackValues() {
        const modes = [7, 14, 15, 74, 82, 85, 86, 87, 91, 93];
        for (let track = 0; track < 7; track++) {
            for (let mode of modes) {
                const key = `${track}-${mode}`;
                this.trackValues[key] = (mode >= 74 && mode <= 87) ? 64 : 0;
            }
        }
    },

    initializeLfoRates() {
        // Only set default rates if LFOs haven't been persisted yet
        // Check if first LFO still has default rate of 1.0
        if (this.globalLfos[0].rate === 1.0) {
            // Set all LFOs to 1/2 note (multiplier 0.5) of current BPM
            const multiplier = 0.5;
            const quarterNoteDuration = 60 / this.bpm;
            const noteDuration = quarterNoteDuration / multiplier;
            const targetHz = 1 / noteDuration;
            const rateValue = Math.max(0, Math.min(3000, Math.round(targetHz * 100)));
            
            this.globalLfos.forEach(lfo => {
                lfo.rate = rateValue;
            });
        }
    },

    async connect(type) {
        this.connecting = true;
        const connectionName = type === 'ble' ? 'Bluetooth' : 'USB MIDI';
        this.status = `Connecting to ${connectionName}...`;

        try {
            await (type === 'ble' ? this.midi.connectBle() : this.midi.connectUsb());
            this.isConnected = true;
            this.status = `Connected to TX-6 via ${connectionName}`;
            setTimeout(() => this.status = '', 2000);
        } catch (error) {
            this.status = `Connection failed: ${error.message}`;
            setTimeout(() => this.status = '', 5000);
        } finally {
            this.connecting = false;
        }
    },

    selectTrack(trackIndex) {
        const currentLfo = this.globalLfos[this.currentLfoIndex];
        currentLfo.rate = this.knobs.lfoRate.value;
        currentLfo.amount = this.knobs.lfoAmount.value;
        currentLfo.phase = this.knobs.lfoPhase.value;

        this.currentTrack = trackIndex;

    },

    selectEqMode(ccNumber) {
        const newMode = Number(ccNumber);
        this.currentEqMode = newMode;

        const newKey = `${this.currentTrack}-${newMode}`;
        const value = this.trackValues[newKey] !== undefined ? this.trackValues[newKey] : 64;
        this.$nextTick(() => {
            this.knobs.eq.value = value;
        });
        this.midi.sendCC(this.currentTrack, this.currentEqMode, value);
    },

    selectFxMode(ccNumber) {
        const newMode = Number(ccNumber);
        this.currentFxMode = newMode;

        const newKey = `${this.currentTrack}-${newMode}`;
        const value = this.trackValues[newKey] !== undefined ? this.trackValues[newKey] : 0;
        this.$nextTick(() => {
            this.knobs.fx1.value = value;
        });
        this.midi.sendCC(this.currentTrack, this.currentFxMode, value);
    },

    handleFx1Change(value) {
        this.midi.sendCC(this.currentTrack, this.currentFxMode, value);
        const key = `${this.currentTrack}-${this.currentFxMode}`;
        this.trackValues[key] = value;
    },

    handleSliderChange(event) {
        const key = `${this.currentTrack}-${this.currentSliderMode}`;
        const value = Number(event.target.value);
        this.trackValues[key] = value;
        this.midi.sendCC(this.currentTrack, this.currentSliderMode, value);

    },

    setKnobValue(knobType, value) {
        if (knobType === 'lfoAmount') {
            value = Math.max(0, Math.min(100, value));
        }
        this.knobs[knobType].value = value;

        if (['lfoRate', 'lfoAmount', 'lfoPhase'].includes(knobType)) {
            const prop = knobType.replace('lfo', '').toLowerCase();
            this.globalLfos[this.currentLfoIndex][prop] = value;
            this.$nextTick(() => this.drawLfoWaveform());
        }
    },

    handleMasterChannelChange(value) {
        const ccMap = {
            aux: CC.AUX,
            cue: CC.CUE,
            volume: CC.VOLUME
        };
        const cc = ccMap[this.masterChannel];
        this.midi.sendCC(CHANNELS.MASTER, cc, value);
    },

    handleKnobChange(knobType, value) {
        const ccMap = {
            synthFreq: [this.currentTrack, 89],
            synthLen: [this.currentTrack, 90]
        };

        if (ccMap[knobType]) {
            // Scale synthFreq from 0-100 to 0-127 for MIDI CC
            const midiValue = knobType === 'synthFreq' ? Math.round((value / 100) * 127) : value;
            this.midi.sendCC(...ccMap[knobType], midiValue);
        } else if (knobType === 'fxParam1') {
            this.midi.sendCC(this.fx.currentChannel, CC.FX_PARAM1, value);
            this.fx.channels[this.fx.currentChannel].values.param1 = value;
        } else if (knobType === 'fxParam2') {
            this.midi.sendCC(this.fx.currentChannel, CC.FX_PARAM2, value);
            this.fx.channels[this.fx.currentChannel].values.param2 = value;
        } else if (knobType === 'fxReturn') {
            const ccType = this.fx.currentChannel === 7 ? CC.FX_RETURN : CC.FX_TRACK_SELECT;
            this.midi.sendCC(this.fx.currentChannel, ccType, value);
            const prop = this.fx.currentChannel === 7 ? 'return' : 'track';
            this.fx.channels[this.fx.currentChannel].values[prop] = value;
        } else if (['lfoRate', 'lfoAmount', 'lfoPhase'].includes(knobType)) {
            const prop = knobType.replace('lfo', '').toLowerCase();
            this.globalLfos[this.currentLfoIndex][prop] = value;
            this.$nextTick(() => this.drawLfoWaveform());
        }
    },

    async startTimingSystem(sendMidiClock = true) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            if (!this.timingWorklet) {
                await this.audioContext.audioWorklet.addModule('/timing-processor.js');
                this.timingWorklet = new AudioWorkletNode(this.audioContext, 'timing-processor');

                this.timingWorklet.port.onmessage = (event) => {
                    const { type, deltaTime, time } = event.data;

                    const actions = {
                        midiStart: () => sendMidiClock && this.midi.sendSystemRealTime(0xFA),
                        midiStop: () => sendMidiClock && this.midi.sendSystemRealTime(0xFC),
                        midiClock: () => sendMidiClock && this.midi.sendSystemRealTime(0xF8),
                        lfoUpdate: () => {
                            // Use AudioContext time instead of performance.now()
                            const currentTime = this.audioContext.currentTime;
                            for (let i = 0; i < 6; i++) this.runLfo(i, deltaTime, currentTime);
                        }
                    };

                    if (actions[type]) actions[type]();
                };
            }

            // Sync LFO start time to AudioContext
            this.lfoStartTime = this.audioContext.currentTime;

            this.timingWorklet.port.postMessage({
                type: 'start',
                data: { bpm: this.bpm, currentTime: this.audioContext.currentTime }
            });

        } catch (error) {
            console.error('AudioWorklet not supported', error);
        }
    },

    stopTimingSystem() {
        if (this.timingWorklet) {
            this.timingWorklet.port.postMessage({ type: 'stop' });
        }
    },

    async togglePlay() {
        this.startStopActive = !this.startStopActive;
        if (this.startStopActive) {
            await this.startTimingSystem(true); // true = send MIDI clock
        } else {
            this.stopTimingSystem();
        }
    },

    updateBpm() {
        this.bpm = Math.max(40, Math.min(400, this.bpm));
        localStorage.setItem('tx6-bpm', this.bpm.toString());
    },

    handleEqChange(value) {
        this.midi.sendCC(this.currentTrack, this.currentEqMode, value);
        const key = `${this.currentTrack}-${this.currentEqMode}`;
        this.trackValues[key] = value;
    },

    toggleFx(fxNumber) {
        const prop = `fx${fxNumber}Active`;
        this.fx[prop] = !this.fx[prop];
        this.midi.sendCC(fxNumber === 1 ? CHANNELS.FX1 : CHANNELS.FX2, CC.FX, this.fx[prop] ? 127 : 0);
    },

    handleFxEngineChange() {
        const value = parseInt(this.fx.channels[this.fx.currentChannel].engine);
        this.midi.sendCC(this.fx.currentChannel, CC.FX_ENGINE, value);
    },

    handleSeqChange() {
        const value = Math.floor(127 * this.synthSettings.seq / 29);
        this.midi.sendCC(this.currentTrack, 14, value);
    },

    handleWaveformChange() {
        const value = parseInt(this.synthSettings.waveform);
        this.midi.sendCC(this.currentTrack, 3, value);
    },

    getSeqPreviewCell(rowIndex, colIndex) {
        const seqIndex = parseInt(this.synthSettings.seq);
        if (seqIndex < 0 || seqIndex >= seqs.length) return false;

        const pattern = seqs[seqIndex];
        if (typeof pattern === 'string' && pattern.length < 16) return false;

        const stepIndex = rowIndex * 8 + colIndex;
        return pattern[stepIndex] === '1';
    },

    runLfo(trackIdx, dt, audioTime) {
        const assignedLfos = this.globalLfos.filter(lfo => Number(lfo.assignedTrack) === trackIdx);
        // Use AudioContext time for precise timing
        const currentTime = audioTime || (this.audioContext ? this.audioContext.currentTime : performance.now() / 1000);
        const elapsedTime = currentTime - this.lfoStartTime;

        assignedLfos.forEach((lfo) => {
            const globalLfoIndex = this.globalLfos.indexOf(lfo);
            if (lfo.amount === 50) return;

            const hz = lfo.rate / 100;

            const absolutePhase = (2 * Math.PI * hz * elapsedTime) % (2 * Math.PI);
            this.lfoPhases[globalLfoIndex] = absolutePhase;

            const phaseOffset = (lfo.phase / 127) * 2 * Math.PI;
            const effectivePhase = (absolutePhase + phaseOffset) % (2 * Math.PI);

            let shapeVal = 0;
            const shapes = {
                sine: () => Math.sin(effectivePhase),
                triangle: () => 2 * Math.abs((effectivePhase / Math.PI) % 2 - 1) - 1,
                square: () => Math.sign(Math.sin(effectivePhase)),
                saw: () => 2 * ((effectivePhase / (2 * Math.PI)) % 1) - 1,
                revsaw: () => 1 - 2 * ((effectivePhase / (2 * Math.PI)) % 1),
                noise: () => Math.random() * 2 - 1
            };

            shapeVal = shapes[lfo.shape]();
            const amt = lfo.amount - 50;

        const targets = {
            vol: 7,
            aux: 92,
            flt: 74
        };

            const [cc, defaultBase] = targets[lfo.target];
            const base = Number(this.trackValues[`${trackIdx}-${cc}`]) || defaultBase;
            const lfoValue = Math.max(0, Math.min(127, base + amt * shapeVal));

            const outputKey = `${trackIdx}-${cc}`;
            this.lfoOutputValues[outputKey] = lfoValue;

            this.midi.sendCC(trackIdx, cc, Math.round(lfoValue));
        });
    },

    updateLfoKnobs() {
        const currentLfo = this.globalLfos[this.currentLfoIndex];
        this.knobs.lfoRate.value = currentLfo.rate;
        this.knobs.lfoAmount.value = currentLfo.amount;
        this.knobs.lfoPhase.value = currentLfo.phase;

        this.$nextTick(() => this.drawLfoWaveform());
    },

    drawLfoWaveform() {
        const canvas = document.getElementById('lfo-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        const currentLfo = this.globalLfos[this.currentLfoIndex];
        const shape = currentLfo.shape;
        const amount = currentLfo.amount - 50;
        const maxAmplitude = centerY - 20;
        const amplitude = Math.abs(amount) / 50 * maxAmplitude;

        const hz = currentLfo.rate / 100;
        const timeSpan = 60 / this.bpm * 4;
        const cycles = hz * timeSpan;

        ctx.strokeStyle = 'rgba(80, 81, 79, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Display values in corners
        ctx.fillStyle = 'rgba(80, 81, 79, 0.6)';
        ctx.font = '12px Arial';
        
        // Top right - Rate (Hz)
        ctx.textAlign = 'right';
        ctx.fillText(`${hz.toFixed(2)} Hz`, width - 5, 15);
        
        // Top left - Amount
        ctx.textAlign = 'left';
        ctx.fillText(`Amt: ${amount}`, 5, 15);
        
        // Bottom left - Phase
        const phaseDegrees = Math.floor((currentLfo.phase / 127) * 360);
        ctx.fillText(`Phase: ${phaseDegrees}°`, 5, height - 5);

        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--button-color');
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let x = 0; x < width; x++) {
            const basePhase = (x / width) * cycles * 2 * Math.PI;
            const phaseOffset = (currentLfo.phase / 127) * 2 * Math.PI;
            const phase = basePhase + phaseOffset;

            let y = 0;
            const shapes = {
                sine: () => Math.sin(phase),
                triangle: () => 2 * Math.abs((phase / Math.PI) % 2 - 1) - 1,
                square: () => Math.sign(Math.sin(phase)),
                saw: () => 2 * ((phase / (2 * Math.PI)) % 1) - 1,
                revsaw: () => 1 - 2 * ((phase / (2 * Math.PI)) % 1),
                noise: () => Math.random() * 2 - 1
            };

            y = shapes[shape]();
            y = amount >= 0 ? y * amplitude : -y * amplitude;
            y = centerY - y;

            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }

        ctx.stroke();
    },

    setupLfoCanvasDrag() {
        const canvas = document.getElementById('lfo-canvas');
        if (!canvas || canvas.dataset.dragSetup) return;
        
        canvas.dataset.dragSetup = 'true';
        let isDragging = false;
        let startY = 0;
        let startX = 0;
        let startAmount = 0;
        let startPhase = 0;

        const startDrag = (e) => {
            e.preventDefault();
            isDragging = true;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            startY = clientY;
            startX = clientX;
            startAmount = this.globalLfos[this.currentLfoIndex].amount;
            startPhase = this.globalLfos[this.currentLfoIndex].phase;
        };

        const handleDrag = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            
            // Vertical drag changes amount (inverted: up = increase)
            const deltaY = startY - clientY;
            const amountChange = Math.round(deltaY / 2);
            const newAmount = Math.max(0, Math.min(100, startAmount + amountChange));
            
            // Horizontal drag changes phase (flipped direction: dragging right decreases phase)
            const deltaX = startX - clientX;
            const phaseChange = Math.round(deltaX / 2);
            const newPhase = ((startPhase + phaseChange) % 128 + 128) % 128;
            
            this.globalLfos[this.currentLfoIndex].amount = newAmount;
            this.globalLfos[this.currentLfoIndex].phase = newPhase;
            this.knobs.lfoAmount.value = newAmount;
            this.knobs.lfoPhase.value = newPhase;
            
            this.$nextTick(() => this.drawLfoWaveform());
        };

        const endDrag = () => {
            isDragging = false;
        };

        canvas.addEventListener('mousedown', startDrag);
        canvas.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('touchmove', handleDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    },

    setLfoRateFromBpm(multiplier) {
        const quarterNoteDuration = 60 / this.bpm;
        const noteDuration = quarterNoteDuration / multiplier;
        const targetHz = 1 / noteDuration;

        let rateValue = Math.max(0, Math.min(3000, Math.round(targetHz * 100)));

        this.globalLfos[this.currentLfoIndex].rate = rateValue;
        this.knobs.lfoRate.value = rateValue;

        this.$nextTick(() => this.drawLfoWaveform());
    },

    isRateButtonActive(multiplier) {
        const quarterNoteDuration = 60 / this.bpm;
        const noteDuration = quarterNoteDuration / multiplier;
        const targetHz = 1 / noteDuration;
        const expectedRateValue = Math.round(targetHz * 100);

        return this.globalLfos[this.currentLfoIndex].rate === expectedRateValue;
    },

    updateFxDisplay() {
        const channelData = this.fx.channels[this.fx.currentChannel];
        this.setKnobValue('fxParam1', channelData.values.param1);
        this.setKnobValue('fxParam2', channelData.values.param2);

        const returnValue = this.fx.currentChannel === 7 ?
            channelData.values.return : channelData.values.track;
        this.setKnobValue('fxReturn', returnValue);
    },

    calculateMidiValue(index, totalOptions) {
        return Math.round((index / (totalOptions - 1)) * 127);
    },

    toggleFullscreen() {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    },

    setupFullscreenListener() {
        document.addEventListener('fullscreenchange', () => {
            this.isFullscreen = !!document.fullscreenElement;
        });
    },

    midiNoteToFrequency(midiNote) {
        const frequency = 880 * Math.pow(2, (midiNote - 69) / 12);
        return frequency < 100 ? frequency.toFixed(1) : Math.round(frequency);
    },

    // Computed properties
    get eqDropdownOptions() {
        return [
            { value: 74, label: 'FLT', displayValue: this.getStoredEqDisplayValue(74) },
            { value: 85, label: 'HIGH', displayValue: this.getStoredEqDisplayValue(85) },
            { value: 86, label: 'MID', displayValue: this.getStoredEqDisplayValue(86) },
            { value: 87, label: 'LOW', displayValue: this.getStoredEqDisplayValue(87) }
        ];
    },

    get fx1DropdownOptions() {
        return [
            { value: 91, label: 'FX1', displayValue: this.getStoredFx1DisplayValue(91) },
            { value: 93, label: 'CMP', displayValue: this.getStoredFx1DisplayValue(93) }
        ];
    },

    getStoredEqDisplayValue(ccNumber) {
        const key = `${this.currentTrack}-${ccNumber}`;
        const value = this.trackValues[key] !== undefined ? this.trackValues[key] : 64;

        if (ccNumber === CC.FILTER) {
            const filterValues = [10, 11, 13, 15, 18, 22, 24, 29, 33, 39, 47, 53, 63, 71, 85, 101, 114, 136, 163, 184, 219, 247, 295, 353, 397, 475, 534, 639, 763, 859, '1.0k', '1.2k', '1.4k', '1.7k', '1.9k', '2.2k', '2.7k', '3.0k', '3.6k', '4.0k', '4.8k', '5.7k', '6.5k', '7.7k', '8.7k', '10.4k', '12.4k', '14.0k', '16.7k', '20.0k'];
            const allValues = [...filterValues, '-', ...filterValues];
            const index = Math.round(value / 127 * 100);
            return allValues[index];
        } else {
            return midiToEqDisplay(value);
        }
    },

    getStoredFx1DisplayValue(ccNumber) {
        const key = `${this.currentTrack}-${ccNumber}`;
        const value = this.trackValues[key] !== undefined ? this.trackValues[key] : 0;
        return Math.floor(value * 100 / 127);
    },

    get eqIndicatorColor() {
        const colors = {
            [CC.EQ_MID]: 'var(--accent-color-orange)',
            [CC.EQ_LOW]: 'var(--accent-color-white)',
            [CC.FILTER]: 'var(--accent-color)'
        };
        return colors[this.currentEqMode] || 'var(--accent-color-blue)';
    },

    get fxParam1DisplayValue() {
        const channelData = this.fx.channels[this.fx.currentChannel];
        const currentType = channelData.types[Math.floor(this.fx.channels[this.fx.currentChannel].engine / (128 / channelData.types.length))];

        const config = this.paramConfig[currentType];
        if (config?.param1?.values) {
            const values = config.param1.values;
            const index = Math.floor(this.knobs.fxParam1.value * values.length / 128);
            return values[Math.min(index, values.length - 1)];
        }

        return Math.floor(this.knobs.fxParam1.value * 100 / 127);
    },

    get fxTrackDisplayValue() {
        const value = this.knobs.fxReturn.value;

        if (this.fx.currentChannel === 7) {
            return Math.floor(value * 100 / 127);
        } else {
            const trackLabels = ['t1', 't2', 't3', 't4', 't5', 't6', 'all'];
            const segmentSize = 128 / trackLabels.length;
            const index = Math.min(Math.floor(value / segmentSize), trackLabels.length - 1);
            return trackLabels[index];
        }
    },

    get fxParam2Visibility() {
        const channelData = this.fx.channels[this.fx.currentChannel];
        const currentType = channelData.types[Math.floor(this.fx.channels[this.fx.currentChannel].engine / (128 / channelData.types.length))];
        return ['FLT'].includes(currentType);
    },

    get sliderValue() {
        const key = `${this.currentTrack}-${this.currentSliderMode}`;
        return this.trackValues[key] || 0;
    },

    get sliderOutputValue() {
        const key = `${this.currentTrack}-${this.currentSliderMode}`;
        
        // Check if there's an LFO assigned to current track that targets current slider mode
        const targets = {
            vol: 7,
            fx1: 91, 
            cmp: 93,
            flt: 74
        };
        
        const assignedLfos = this.globalLfos.filter(lfo => 
            Number(lfo.assignedTrack) === Number(this.currentTrack) && 
            targets[lfo.target] === this.currentSliderMode
        );
        const hasTargetedLfo = assignedLfos.length > 0;
        
        return (this.startStopActive && hasTargetedLfo && this.lfoOutputValues[key] !== undefined) ?
            this.lfoOutputValues[key] : this.sliderValue;
    },

    get synthFreqDisplayValue() {
        const currentWaveform = this.waveformLabels[Math.floor(this.synthSettings.waveform / 14)];
        const freqValue = this.knobs.synthFreq.value;

        if (['SIN', 'TRI', 'SQR', 'SAW'].includes(currentWaveform)) {
            const noteIndex = Math.min(100, Math.max(0, Math.floor(freqValue)));
            const noteName = this.noteNames[noteIndex] || 'C0';
            const frequency = this.midiNoteToFrequency(noteIndex);
            return `${noteName}\n${frequency}Hz`;
        }

        return Math.floor(freqValue * 100 / 127);
    },

    get masterChannelLabel() {
        const labels = {
            aux: 'Aux',
            cue: 'Cue',
            volume: 'Volume'
        };
        return labels[this.masterChannel];
    },

    get keyboardNotes() {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const blackPositions = { 'C#': 10, 'D#': 24, 'F#': 52.5, 'G#': 66.5, 'A#': 80.5 };
        
        return notes.map((note, index) => {
            const midiNote = this.synthSettings.octave * 12 + index;
            const isBlack = note.includes('#');
            const isDisabled = midiNote > 100; // Disable notes above E8 (MIDI 100)
            
            return {
                note: note,
                midiNote: midiNote,
                label: isBlack ? '' : note,
                isBlack: isBlack,
                position: isBlack ? blackPositions[note] : null,
                isDisabled: isDisabled
            };
        });
    },

    playNote(noteData) {
        // Don't play disabled notes
        if (noteData.isDisabled) return;
        
        const currentWaveform = this.waveformLabels[Math.floor(this.synthSettings.waveform / 14)];
        
        // Only play notes for tonal waveforms
        if (['SIN', 'TRI', 'SQR', 'SAW'].includes(currentWaveform)) {
            const noteValue = Math.min(100, Math.max(0, noteData.midiNote));
            this.$nextTick(() => {
                this.knobs.synthFreq.value = noteValue;
            });
            // Scale from 0-100 to 0-127 for MIDI CC
            const midiValue = Math.round((noteValue / 100) * 127);
            this.midi.sendCC(this.currentTrack, 89, midiValue);
        }
    },

    increaseOctave() {
        if (this.synthSettings.octave < 8) {
            this.synthSettings.octave++;
        }
    },

    decreaseOctave() {
        if (this.synthSettings.octave > 0) {
            this.synthSettings.octave--;
        }
    }
}));

// Start Alpine
Alpine.start();

// Service Worker registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
}
