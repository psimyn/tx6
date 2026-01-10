import { describe, it, expect } from 'vitest';
import {
    CC,
    CHANNELS,
    MIDI,
    KNOB_ANGLE,
    BPM,
    TRACKS,
    LFO,
    EQ,
    SYNTH,
    TIME,
    UI,
    FX_ENGINES,
    LFO_TARGETS,
    seqs,
    LFO_TRACK_OPTIONS,
    SCHEMA_VERSION,
    clampMidiValue,
    createTrackValueKey,
    midiToEqDisplay,
    calculateBpmSyncRate,
    createAngleConverter,
    midiToAngle,
    lfoRateToAngle,
    lfoAmountToAngle,
    synthFreqToAngle,
    calculateLfoModulation,
} from './main.js';

describe('clampMidiValue', () => {
    it('clamps values below 0 to 0', () => {
        expect(clampMidiValue(-10)).toBe(0);
        expect(clampMidiValue(-1)).toBe(0);
    });

    it('clamps values above 127 to 127', () => {
        expect(clampMidiValue(128)).toBe(127);
        expect(clampMidiValue(200)).toBe(127);
    });

    it('rounds decimal values to integers', () => {
        expect(clampMidiValue(64.4)).toBe(64);
        expect(clampMidiValue(64.5)).toBe(65);
        expect(clampMidiValue(64.6)).toBe(65);
    });

    it('passes through valid values unchanged', () => {
        expect(clampMidiValue(0)).toBe(0);
        expect(clampMidiValue(64)).toBe(64);
        expect(clampMidiValue(127)).toBe(127);
    });
});

describe('createTrackValueKey', () => {
    it('creates correct key format', () => {
        expect(createTrackValueKey(0, 7)).toBe('0-7');
        expect(createTrackValueKey(5, 92)).toBe('5-92');
    });

    it('handles FX channels', () => {
        expect(createTrackValueKey(CHANNELS.FX1, CC.FX_PARAM1)).toBe('7-12');
        expect(createTrackValueKey(CHANNELS.FX2, CC.FX_PARAM2)).toBe('8-13');
    });
});

describe('midiToEqDisplay', () => {
    it('shows 0dB at neutral value (64)', () => {
        expect(midiToEqDisplay(64)).toBe('0dB');
    });

    it('shows positive dB for values above 64', () => {
        expect(midiToEqDisplay(127)).toMatch(/^\+\d+dB$/);
        expect(midiToEqDisplay(80)).toMatch(/^\+\d+dB$/);
    });

    it('shows negative dB for values below 64', () => {
        expect(midiToEqDisplay(0)).toMatch(/^-\d+dB$/);
        expect(midiToEqDisplay(32)).toMatch(/^-\d+dB$/);
    });
});

describe('calculateBpmSyncRate', () => {
    it('returns valid LFO rate within bounds', () => {
        const rate = calculateBpmSyncRate(120, 1);
        expect(rate).toBeGreaterThanOrEqual(LFO.RATE_MIN);
        expect(rate).toBeLessThanOrEqual(LFO.RATE_MAX);
    });

    it('faster multiplier = higher rate', () => {
        const slowRate = calculateBpmSyncRate(120, 0.5);
        const fastRate = calculateBpmSyncRate(120, 2);
        expect(fastRate).toBeGreaterThan(slowRate);
    });

    it('higher BPM = higher rate at same multiplier', () => {
        const slow = calculateBpmSyncRate(60, 1);
        const fast = calculateBpmSyncRate(120, 1);
        expect(fast).toBeGreaterThan(slow);
    });
});

describe('createAngleConverter', () => {
    it('creates converter that maps 0 to MIN_ANGLE', () => {
        const converter = createAngleConverter(100);
        expect(converter(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
    });

    it('creates converter that maps max to MAX_ANGLE', () => {
        const converter = createAngleConverter(100);
        expect(converter(100)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('maps mid value to 0 degrees', () => {
        const converter = createAngleConverter(100);
        expect(converter(50)).toBe(0);
    });
});

describe('midiToAngle', () => {
    it('maps 0 to minimum angle', () => {
        expect(midiToAngle(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
    });

    it('maps 127 to maximum angle', () => {
        expect(midiToAngle(127)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('maps 64 to approximately center', () => {
        const angle = midiToAngle(64);
        expect(angle).toBeGreaterThan(-10);
        expect(angle).toBeLessThan(10);
    });
});

describe('lfoRateToAngle', () => {
    it('maps 0 to minimum angle', () => {
        expect(lfoRateToAngle(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
    });

    it('maps max rate to maximum angle', () => {
        expect(lfoRateToAngle(LFO.RATE_MAX)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });
});

describe('Constants', () => {
    it('MIDI constants are valid', () => {
        expect(MIDI.MIN).toBe(0);
        expect(MIDI.MAX).toBe(127);
        expect(MIDI.MID).toBe(64);
    });

    it('BPM range is reasonable', () => {
        expect(BPM.MIN).toBeLessThan(BPM.MAX);
        expect(BPM.DEFAULT).toBeGreaterThanOrEqual(BPM.MIN);
        expect(BPM.DEFAULT).toBeLessThanOrEqual(BPM.MAX);
    });

    it('TRACKS constants are correct', () => {
        expect(TRACKS.COUNT).toBe(6);
        expect(TRACKS.FX1).toBe(7);
        expect(TRACKS.FX2).toBe(8);
    });

    it('CHANNELS constants are correct', () => {
        expect(CHANNELS.MASTER).toBe(6);
        expect(CHANNELS.FX1).toBe(7);
        expect(CHANNELS.FX2).toBe(8);
    });
});

describe('lfoAmountToAngle', () => {
    it('maps 0 to minimum angle', () => {
        expect(lfoAmountToAngle(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
    });

    it('maps max amount to maximum angle', () => {
        expect(lfoAmountToAngle(LFO.AMOUNT_MAX)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('maps mid amount to center', () => {
        const midAmount = LFO.AMOUNT_MAX / 2;
        const angle = lfoAmountToAngle(midAmount);
        expect(angle).toBe(0);
    });
});

describe('synthFreqToAngle', () => {
    it('maps 0 to minimum angle', () => {
        expect(synthFreqToAngle(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
    });

    it('maps max freq to maximum angle', () => {
        expect(synthFreqToAngle(SYNTH.FREQ_MAX)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('maps mid freq to center', () => {
        const midFreq = SYNTH.FREQ_MAX / 2;
        const angle = synthFreqToAngle(midFreq);
        expect(angle).toBe(0);
    });
});

describe('calculateLfoModulation', () => {
    it('returns base value when amount is at default (no modulation)', () => {
        const result = calculateLfoModulation(64, LFO.AMOUNT_DEFAULT, 0);
        expect(result).toBe(64);
    });

    it('applies positive modulation when shape is positive', () => {
        const baseValue = 64;
        const amount = LFO.AMOUNT_MAX; // Maximum amount
        const shapeValue = 1; // Positive shape
        const result = calculateLfoModulation(baseValue, amount, shapeValue);
        expect(result).toBeGreaterThan(baseValue);
    });

    it('applies negative modulation when shape is negative', () => {
        const baseValue = 64;
        const amount = LFO.AMOUNT_MAX;
        const shapeValue = -1;
        const result = calculateLfoModulation(baseValue, amount, shapeValue);
        expect(result).toBeLessThan(baseValue);
    });

    it('clamps result to MIDI range', () => {
        // Try to push above 127
        const highResult = calculateLfoModulation(127, LFO.AMOUNT_MAX, 1);
        expect(highResult).toBeLessThanOrEqual(MIDI.MAX);

        // Try to push below 0
        const lowResult = calculateLfoModulation(0, LFO.AMOUNT_MAX, -1);
        expect(lowResult).toBeGreaterThanOrEqual(MIDI.MIN);
    });

    it('increases modulation depth with greater amount deviation from center', () => {
        const baseValue = 64;
        const smallAmount = 60; // Close to center (50)
        const largeAmount = 100; // Far from center

        const smallMod = calculateLfoModulation(baseValue, smallAmount, 1);
        const largeMod = calculateLfoModulation(baseValue, largeAmount, 1);

        expect(largeMod).toBeGreaterThan(smallMod);
    });
});

describe('SYNTH constants', () => {
    it('has valid frequency range', () => {
        expect(SYNTH.FREQ_MIN).toBe(0);
        expect(SYNTH.FREQ_MAX).toBe(100);
        expect(SYNTH.FREQ_DEFAULT).toBeGreaterThanOrEqual(SYNTH.FREQ_MIN);
        expect(SYNTH.FREQ_DEFAULT).toBeLessThanOrEqual(SYNTH.FREQ_MAX);
    });

    it('has valid octave range', () => {
        expect(SYNTH.OCTAVE_MIN).toBeLessThan(SYNTH.OCTAVE_MAX);
        expect(SYNTH.OCTAVE_DEFAULT).toBeGreaterThanOrEqual(SYNTH.OCTAVE_MIN);
        expect(SYNTH.OCTAVE_DEFAULT).toBeLessThanOrEqual(SYNTH.OCTAVE_MAX);
    });

    it('has valid sequence max', () => {
        expect(SYNTH.SEQ_MAX).toBe(29);
    });
});

describe('TIME constants', () => {
    it('has valid timing values', () => {
        expect(TIME.DOUBLE_CLICK_WINDOW).toBeGreaterThan(0);
        expect(TIME.CLOCK_QUARTER_NOTE).toBe(24);
        expect(TIME.BPM_HISTORY_SIZE).toBeGreaterThan(0);
    });

    it('has valid outlier threshold', () => {
        expect(TIME.BPM_OUTLIER_THRESHOLD).toBeGreaterThan(0);
        expect(TIME.BPM_OUTLIER_THRESHOLD).toBeLessThan(1);
    });
});

describe('UI constants', () => {
    it('has valid sensitivity values', () => {
        expect(UI.SLIDER_SENSITIVITY).toBeGreaterThan(0);
        expect(UI.LFO_SLIDER_SENSITIVITY).toBeGreaterThan(0);
    });

    it('has valid keyboard grid', () => {
        expect(UI.KEYBOARD_GRID_COLS).toBe(7);
    });

    it('has filter values array', () => {
        expect(Array.isArray(UI.FILTER_VALUES)).toBe(true);
        expect(UI.FILTER_VALUES.length).toBeGreaterThan(0);
    });
});

describe('FX_ENGINES', () => {
    it('has FX1 engines', () => {
        expect(FX_ENGINES.FX1).toContain('REV');
        expect(FX_ENGINES.FX1).toContain('CHO');
        expect(FX_ENGINES.FX1).toContain('DLY');
    });

    it('has FX2 engines', () => {
        expect(FX_ENGINES.FX2).toContain('FLT');
        expect(FX_ENGINES.FX2).toContain('CRU');
        expect(FX_ENGINES.FX2).toContain('DST');
        expect(FX_ENGINES.FX2).toContain('TRM');
        expect(FX_ENGINES.FX2).toContain('FRZ');
        expect(FX_ENGINES.FX2).toContain('TPE');
    });
});

describe('LFO_TARGETS', () => {
    it('has track targets with required properties', () => {
        expect(LFO_TARGETS.track).toBeDefined();
        const trackTargets = Object.values(LFO_TARGETS.track);
        trackTargets.forEach(target => {
            expect(target).toHaveProperty('cc');
            expect(target).toHaveProperty('defaultBase');
            expect(target).toHaveProperty('label');
        });
    });

    it('has fx1 targets', () => {
        expect(LFO_TARGETS.fx1).toBeDefined();
        expect(LFO_TARGETS.fx1).toHaveProperty('fx1_active');
        expect(LFO_TARGETS.fx1).toHaveProperty('fx1_param');
        expect(LFO_TARGETS.fx1).toHaveProperty('fx1_return');
    });

    it('has fx2 targets', () => {
        expect(LFO_TARGETS.fx2).toBeDefined();
        expect(LFO_TARGETS.fx2).toHaveProperty('fx2_active');
        expect(LFO_TARGETS.fx2).toHaveProperty('fx2_param1');
        expect(LFO_TARGETS.fx2).toHaveProperty('fx2_param2');
    });
});

describe('seqs', () => {
    it('has correct number of sequences', () => {
        expect(seqs.length).toBe(30);
    });

    it('includes standard sequences', () => {
        expect(seqs[0]).toBe('0000000000000000');
        expect(seqs[1]).toBe('1000000000000000');
    });

    it('includes special sequences', () => {
        expect(seqs).toContain('RND');
        expect(seqs).toContain('U1');
        expect(seqs).toContain('U6');
    });
});

describe('LFO_TRACK_OPTIONS', () => {
    it('has correct number of options', () => {
        expect(LFO_TRACK_OPTIONS.length).toBe(8);
    });

    it('includes all 6 tracks', () => {
        const trackLabels = LFO_TRACK_OPTIONS.map(o => o.label);
        expect(trackLabels).toContain('T1');
        expect(trackLabels).toContain('T6');
    });

    it('includes FX channels', () => {
        const fxOptions = LFO_TRACK_OPTIONS.filter(o => o.label.startsWith('FX'));
        expect(fxOptions.length).toBe(2);
        expect(fxOptions[0].value).toBe(7);
        expect(fxOptions[1].value).toBe(8);
    });
});

describe('EQ constants', () => {
    it('has correct values', () => {
        expect(EQ.NEUTRAL_VALUE).toBe(64);
        expect(EQ.MAX_DB).toBe(18);
        expect(EQ.DB_MULTIPLIER).toBeCloseTo(18 / 64);
    });
});

describe('LFO constants', () => {
    it('has valid rate range', () => {
        expect(LFO.RATE_MIN).toBeLessThan(LFO.RATE_MAX);
        expect(LFO.RATE_DEFAULT).toBeGreaterThanOrEqual(LFO.RATE_MIN);
    });

    it('has valid amount range', () => {
        expect(LFO.AMOUNT_MIN).toBeLessThan(LFO.AMOUNT_MAX);
        expect(LFO.AMOUNT_DEFAULT).toBe(50);
    });

    it('has correct count', () => {
        expect(LFO.COUNT).toBe(3);
    });

    it('has valid phase range', () => {
        expect(LFO.PHASE_MIN).toBe(0);
        expect(LFO.PHASE_MAX).toBe(127);
    });
});

describe('CC constants', () => {
    it('has standard MIDI CC values', () => {
        expect(CC.VOLUME).toBe(7);
        expect(CC.PAN).toBe(8);
        expect(CC.FILTER).toBe(74);
    });

    it('has FX-specific CC values', () => {
        expect(CC.FX).toBe(82);
        expect(CC.FX_ENGINE).toBe(15);
        expect(CC.FX_PARAM1).toBe(12);
        expect(CC.FX_PARAM2).toBe(13);
    });

    it('has EQ CC values', () => {
        expect(CC.EQ_HIGH).toBe(85);
        expect(CC.EQ_MID).toBe(86);
        expect(CC.EQ_LOW).toBe(87);
    });
});

describe('KNOB_ANGLE constants', () => {
    it('has symmetric angle range', () => {
        expect(KNOB_ANGLE.MIN_ANGLE).toBe(-150);
        expect(KNOB_ANGLE.MAX_ANGLE).toBe(150);
        expect(Math.abs(KNOB_ANGLE.MIN_ANGLE)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('has correct total range', () => {
        expect(KNOB_ANGLE.TOTAL_RANGE).toBe(300);
    });

    it('has correct MIDI range', () => {
        expect(KNOB_ANGLE.MIDI_RANGE).toBe(127);
    });
});

describe('SCHEMA_VERSION', () => {
    it('is a positive integer', () => {
        expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
        expect(SCHEMA_VERSION).toBeGreaterThan(0);
    });
});

describe('midiToEqDisplay - edge cases', () => {
    it('handles minimum value (0)', () => {
        const result = midiToEqDisplay(0);
        expect(result).toMatch(/^-\d+dB$/);
        expect(result).toBe('-18dB');
    });

    it('handles maximum value (127)', () => {
        const result = midiToEqDisplay(127);
        expect(result).toMatch(/^\+\d+dB$/);
    });

    it('handles values above neutral', () => {
        const result = midiToEqDisplay(70);
        expect(result).toMatch(/^\+\d+dB$/);
    });

    it('handles values below neutral', () => {
        const result = midiToEqDisplay(60);
        expect(result).toMatch(/^-\d+dB$/);
    });
});

describe('clampMidiValue - edge cases', () => {
    it('handles extreme negative values', () => {
        expect(clampMidiValue(-1000)).toBe(0);
        expect(clampMidiValue(-Infinity)).toBe(0);
    });

    it('handles extreme positive values', () => {
        expect(clampMidiValue(1000)).toBe(127);
    });

    it('handles rounding at boundaries', () => {
        expect(clampMidiValue(0.4)).toBe(0);
        expect(clampMidiValue(126.5)).toBe(127);
        expect(clampMidiValue(127.4)).toBe(127);
    });
});

describe('calculateBpmSyncRate - edge cases', () => {
    it('handles minimum BPM', () => {
        const rate = calculateBpmSyncRate(BPM.MIN, 1);
        expect(rate).toBeGreaterThanOrEqual(LFO.RATE_MIN);
        expect(rate).toBeLessThanOrEqual(LFO.RATE_MAX);
    });

    it('handles maximum BPM', () => {
        const rate = calculateBpmSyncRate(BPM.MAX, 1);
        expect(rate).toBeGreaterThanOrEqual(LFO.RATE_MIN);
        expect(rate).toBeLessThanOrEqual(LFO.RATE_MAX);
    });

    it('handles very slow multiplier', () => {
        const rate = calculateBpmSyncRate(120, 0.25);
        expect(rate).toBeGreaterThanOrEqual(LFO.RATE_MIN);
    });

    it('handles very fast multiplier', () => {
        const rate = calculateBpmSyncRate(120, 4);
        expect(rate).toBeLessThanOrEqual(LFO.RATE_MAX);
    });

    it('produces integer rate values', () => {
        const rate = calculateBpmSyncRate(120, 1);
        expect(Number.isInteger(rate)).toBe(true);
    });
});

describe('createAngleConverter - edge cases', () => {
    it('handles max value of 1', () => {
        const converter = createAngleConverter(1);
        expect(converter(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
        expect(converter(1)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('handles large max values', () => {
        const converter = createAngleConverter(10000);
        expect(converter(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
        expect(converter(10000)).toBe(KNOB_ANGLE.MAX_ANGLE);
        expect(converter(5000)).toBe(0);
    });

    it('returns correct intermediate values', () => {
        const converter = createAngleConverter(100);
        expect(converter(25)).toBe(-75); // 25% of range
        expect(converter(75)).toBe(75);  // 75% of range
    });
});

describe('calculateLfoModulation - edge cases', () => {
    it('handles zero base value', () => {
        const result = calculateLfoModulation(0, LFO.AMOUNT_DEFAULT, 1);
        expect(result).toBe(0);
    });

    it('handles max base value', () => {
        const result = calculateLfoModulation(127, LFO.AMOUNT_DEFAULT, -1);
        expect(result).toBe(127);
    });

    it('handles minimum amount', () => {
        const result = calculateLfoModulation(64, LFO.AMOUNT_MIN, 1);
        expect(result).toBeGreaterThanOrEqual(MIDI.MIN);
        expect(result).toBeLessThanOrEqual(MIDI.MAX);
    });

    it('handles shape value of 0', () => {
        const result = calculateLfoModulation(64, LFO.AMOUNT_MAX, 0);
        expect(result).toBe(64);
    });

    it('produces integer output', () => {
        const result = calculateLfoModulation(64, 75, 0.5);
        expect(Number.isInteger(result)).toBe(true);
    });
});

describe('seqs - pattern validation', () => {
    it('all standard patterns have 16 characters', () => {
        const standardSeqs = seqs.filter(s => typeof s === 'string' && s.length === 16);
        expect(standardSeqs.length).toBe(23); // Excluding RND and U1-U6
    });

    it('standard patterns only contain 0 and 1', () => {
        const standardSeqs = seqs.filter(s => typeof s === 'string' && s.length === 16);
        standardSeqs.forEach(seq => {
            expect(seq).toMatch(/^[01]+$/);
        });
    });

    it('first pattern is all off', () => {
        expect(seqs[0]).toBe('0000000000000000');
    });

    it('last standard pattern is all on', () => {
        expect(seqs[22]).toBe('1111111111111111');
    });

    it('user patterns are U1 through U6', () => {
        expect(seqs.slice(24, 30)).toEqual(['U1', 'U2', 'U3', 'U4', 'U5', 'U6']);
    });
});

describe('LFO_TARGETS - CC mappings', () => {
    it('track volume uses CC 7', () => {
        expect(LFO_TARGETS.track.vol.cc).toBe(CC.VOLUME);
    });

    it('track filter uses CC 74', () => {
        expect(LFO_TARGETS.track.flt.cc).toBe(CC.FILTER);
    });

    it('track pan uses CC 8', () => {
        expect(LFO_TARGETS.track.pan.cc).toBe(CC.PAN);
    });

    it('fx1 active uses CC 82', () => {
        expect(LFO_TARGETS.fx1.fx1_active.cc).toBe(CC.FX);
    });

    it('fx1 param uses CC 12', () => {
        expect(LFO_TARGETS.fx1.fx1_param.cc).toBe(CC.FX_PARAM1);
    });

    it('fx2 param2 uses CC 13', () => {
        expect(LFO_TARGETS.fx2.fx2_param2.cc).toBe(CC.FX_PARAM2);
    });
});

describe('LFO_TRACK_OPTIONS - value mapping', () => {
    it('track values are 0-5', () => {
        const trackOptions = LFO_TRACK_OPTIONS.slice(0, 6);
        trackOptions.forEach((opt, index) => {
            expect(opt.value).toBe(index);
        });
    });

    it('labels match track numbers', () => {
        expect(LFO_TRACK_OPTIONS[0].label).toBe('T1');
        expect(LFO_TRACK_OPTIONS[5].label).toBe('T6');
    });
});

describe('MIDI constants - system messages', () => {
    it('has valid status bytes', () => {
        expect(MIDI.CC_STATUS).toBe(0xB0);
        expect(MIDI.NOTE_ON).toBe(0x90);
        expect(MIDI.NOTE_OFF).toBe(0x80);
    });

    it('has valid system realtime messages', () => {
        expect(MIDI.SYSTEM_REALTIME.START).toBe(0xFA);
        expect(MIDI.SYSTEM_REALTIME.CONTINUE).toBe(0xFB);
        expect(MIDI.SYSTEM_REALTIME.STOP).toBe(0xFC);
        expect(MIDI.SYSTEM_REALTIME.CLOCK).toBe(0xF8);
    });

    it('has correct realtime threshold', () => {
        expect(MIDI.REALTIME_THRESHOLD).toBe(0xF8);
    });
});

describe('FX_ENGINES - array lengths', () => {
    it('FX1 has 3 engines', () => {
        expect(FX_ENGINES.FX1.length).toBe(3);
    });

    it('FX2 has 6 engines', () => {
        expect(FX_ENGINES.FX2.length).toBe(6);
    });
});

describe('Angle conversion consistency', () => {
    it('midiToAngle and createAngleConverter(127) produce consistent results', () => {
        const customConverter = createAngleConverter(MIDI.MAX);
        for (let i = 0; i <= 127; i++) {
            expect(midiToAngle(i)).toBe(customConverter(i));
        }
    });

    it('lfoRateToAngle range matches LFO.RATE_MAX', () => {
        expect(lfoRateToAngle(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
        expect(lfoRateToAngle(LFO.RATE_MAX)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('lfoAmountToAngle range matches LFO.AMOUNT_MAX', () => {
        expect(lfoAmountToAngle(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
        expect(lfoAmountToAngle(LFO.AMOUNT_MAX)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });

    it('synthFreqToAngle range matches SYNTH.FREQ_MAX', () => {
        expect(synthFreqToAngle(0)).toBe(KNOB_ANGLE.MIN_ANGLE);
        expect(synthFreqToAngle(SYNTH.FREQ_MAX)).toBe(KNOB_ANGLE.MAX_ANGLE);
    });
});

describe('createTrackValueKey - edge cases', () => {
    it('handles channel 0', () => {
        expect(createTrackValueKey(0, 0)).toBe('0-0');
    });

    it('handles max CC value', () => {
        expect(createTrackValueKey(0, 127)).toBe('0-127');
    });

    it('handles master channel', () => {
        expect(createTrackValueKey(CHANNELS.MASTER, CC.VOLUME)).toBe('6-7');
    });
});

describe('BPM constants', () => {
    it('has reasonable default BPM', () => {
        expect(BPM.DEFAULT).toBe(100);
    });

    it('has valid min/max range', () => {
        expect(BPM.MIN).toBeGreaterThan(0);
        expect(BPM.MAX).toBeLessThanOrEqual(999);
        expect(BPM.MIN).toBeLessThan(BPM.MAX);
    });

    it('default is within range', () => {
        expect(BPM.DEFAULT).toBeGreaterThanOrEqual(BPM.MIN);
        expect(BPM.DEFAULT).toBeLessThanOrEqual(BPM.MAX);
    });
});

describe('midiToAngle - comprehensive', () => {
    it('is monotonically increasing', () => {
        let prevAngle = midiToAngle(0);
        for (let i = 1; i <= 127; i++) {
            const angle = midiToAngle(i);
            expect(angle).toBeGreaterThan(prevAngle);
            prevAngle = angle;
        }
    });

    it('has correct range', () => {
        const minAngle = midiToAngle(0);
        const maxAngle = midiToAngle(127);
        expect(maxAngle - minAngle).toBe(KNOB_ANGLE.TOTAL_RANGE);
    });

    it('produces symmetric output around center', () => {
        const angle0 = midiToAngle(0);
        const angle127 = midiToAngle(127);
        expect(Math.abs(angle0)).toBeCloseTo(Math.abs(angle127), 0);
    });
});

describe('clampMidiValue - additional', () => {
    it('handles NaN gracefully (returns NaN)', () => {
        expect(Number.isNaN(clampMidiValue(NaN))).toBe(true);
    });

    it('handles very precise decimals', () => {
        expect(clampMidiValue(63.999999)).toBe(64);
        expect(clampMidiValue(64.000001)).toBe(64);
    });
});

describe('calculateLfoModulation - additional edge cases', () => {
    it('handles negative shape values', () => {
        const result = calculateLfoModulation(64, 75, -1);
        expect(result).toBeLessThanOrEqual(MIDI.MAX);
        expect(result).toBeGreaterThanOrEqual(MIDI.MIN);
    });

    it('symmetry: positive and negative shapes produce opposite modulation', () => {
        const baseValue = 64;
        const amount = 75;
        const posResult = calculateLfoModulation(baseValue, amount, 1);
        const negResult = calculateLfoModulation(baseValue, amount, -1);
        expect(posResult + negResult - 2 * baseValue).toBeCloseTo(0, 0);
    });
});

describe('LFO_TARGETS - comprehensive validation', () => {
    it('all track targets have required properties', () => {
        Object.values(LFO_TARGETS.track).forEach(target => {
            expect(target).toHaveProperty('cc');
            expect(target).toHaveProperty('defaultBase');
            expect(target).toHaveProperty('label');
            expect(typeof target.cc).toBe('number');
            expect(typeof target.defaultBase).toBe('number');
            expect(typeof target.label).toBe('string');
        });
    });

    it('all fx1 targets have required properties', () => {
        Object.values(LFO_TARGETS.fx1).forEach(target => {
            expect(target).toHaveProperty('cc');
            expect(target).toHaveProperty('defaultBase');
            expect(target).toHaveProperty('label');
        });
    });

    it('all fx2 targets have required properties', () => {
        Object.values(LFO_TARGETS.fx2).forEach(target => {
            expect(target).toHaveProperty('cc');
            expect(target).toHaveProperty('defaultBase');
            expect(target).toHaveProperty('label');
        });
    });
});

describe('seqs - comprehensive validation', () => {
    it('has 30 total sequences (24 patterns + RND + 6 user)', () => {
        expect(seqs.length).toBe(30);
    });

    it('RND is at index 23', () => {
        expect(seqs[23]).toBe('RND');
    });

    it('pattern indices 0-22 are 16-char binary strings', () => {
        for (let i = 0; i <= 22; i++) {
            expect(seqs[i]).toMatch(/^[01]{16}$/);
        }
    });
});

describe('TRACKS constants', () => {
    it('has correct count', () => {
        expect(TRACKS.COUNT).toBe(6);
    });

    it('has correct FX channel values', () => {
        expect(TRACKS.FX1).toBe(7);
        expect(TRACKS.FX2).toBe(8);
    });
});

describe('CHANNELS constants', () => {
    it('has correct MASTER channel', () => {
        expect(CHANNELS.MASTER).toBe(6);
    });

    it('has correct FX channels matching TRACKS', () => {
        expect(CHANNELS.FX1).toBe(TRACKS.FX1);
        expect(CHANNELS.FX2).toBe(TRACKS.FX2);
    });
});

describe('CC constants - comprehensive', () => {
    it('all CC values are in valid MIDI range', () => {
        Object.values(CC).forEach(value => {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(127);
        });
    });

    it('has all required CC mappings', () => {
        expect(CC.VOLUME).toBeDefined();
        expect(CC.FILTER).toBeDefined();
        expect(CC.PAN).toBeDefined();
        expect(CC.FX).toBeDefined();
        expect(CC.EQ_HIGH).toBeDefined();
        expect(CC.EQ_MID).toBeDefined();
        expect(CC.EQ_LOW).toBeDefined();
    });
});
