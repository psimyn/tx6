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
    clampMidiValue,
    createTrackValueKey,
    midiToEqDisplay,
    calculateBpmSyncRate,
    createAngleConverter,
    midiToAngle,
    lfoRateToAngle,
    lfoAmountToAngle,
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
