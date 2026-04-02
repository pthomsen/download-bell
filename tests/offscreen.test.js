// tests/offscreen.test.js

const flushPromises = () => new Promise((r) => setImmediate(r));

// ─── Web Audio API mock ───────────────────────────────────────────────────────
//
// offscreen.js does `const ctx = new AudioContext()` at module load time, so:
//   1. global.AudioContext must exist before require('../offscreen')
//   2. The module holds a reference to the *instance* returned by that one call.
//      Replacing mockCtx in beforeEach won't help — we must mutate the same object.
//
// Strategy:
//   - Build mockCtx once here at module scope.
//   - Use a plain object { value } for state so the getter can be updated.
//   - beforeEach re-registers mockImplementations (jest.clearAllMocks only
//     clears call counts; jest.resetAllMocks would also wipe implementations,
//     so we stick with clearAllMocks + explicit re-registration).

const ctxState = { value: 'running' };

// Per-test tracking arrays — emptied in wireAudioMocks().
let createdOscillators  = [];
let createdGainNodes    = [];
let createdBufferSources = [];

const mockAudioBuffer = {};

const buildOscillator = () => ({
  type: null,
  frequency: { value: null },
  connect: jest.fn(),
  start:   jest.fn(),
  stop:    jest.fn(),
});

const buildGainNode = () => ({
  gain: {
    value: null,
    setValueAtTime:               jest.fn(),
    linearRampToValueAtTime:      jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
  },
  connect: jest.fn(),
});

const buildBufferSource = () => ({
  buffer:  null,
  connect: jest.fn(),
  start:   jest.fn(),
});

// Single persistent instance — the module keeps a reference to this.
const mockCtx = {
  get state() { return ctxState.value; },
  currentTime:  0,
  destination:  {},
  resume:             jest.fn(),
  decodeAudioData:    jest.fn(),
  createOscillator:   jest.fn(),
  createGain:         jest.fn(),
  createBufferSource: jest.fn(),
};

global.AudioContext = jest.fn(() => mockCtx);

// ─── fetch mock helpers ───────────────────────────────────────────────────────

const FAKE_ARRAY_BUFFER = new ArrayBuffer(8);

function mockFetchOk() {
  global.fetch = jest.fn().mockResolvedValue({
    arrayBuffer: jest.fn().mockResolvedValue(FAKE_ARRAY_BUFFER),
  });
}

function mockFetchFail() {
  global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
}

// ─── Re-wire mockCtx implementations + reset tracking ────────────────────────
//
// Called in beforeAll (before module load) and beforeEach (after clearAllMocks).

function wireAudioMocks() {
  createdOscillators   = [];
  createdGainNodes     = [];
  createdBufferSources = [];
  ctxState.value = 'running';

  mockCtx.resume.mockResolvedValue(undefined);
  mockCtx.decodeAudioData.mockResolvedValue(mockAudioBuffer);

  mockCtx.createOscillator.mockImplementation(() => {
    const n = buildOscillator();
    createdOscillators.push(n);
    return n;
  });
  mockCtx.createGain.mockImplementation(() => {
    const n = buildGainNode();
    createdGainNodes.push(n);
    return n;
  });
  mockCtx.createBufferSource.mockImplementation(() => {
    const n = buildBufferSource();
    createdBufferSources.push(n);
    return n;
  });
}

// ─── Load module & capture listener ──────────────────────────────────────────

let onMessageCb;

beforeAll(() => {
  wireAudioMocks();
  mockFetchOk();
  chrome.runtime.onMessage.addListener.mockImplementation((cb) => { onMessageCb = cb; });
  jest.resetModules();
  require('../offscreen');
});

beforeEach(() => {
  jest.clearAllMocks();   // clears call counts only — does NOT wipe implementations
  wireAudioMocks();       // re-register impls + reset arrays/state
  mockFetchOk();
  // Restore listener capture (clearAllMocks resets mockImplementation state).
  chrome.runtime.onMessage.addListener.mockImplementation((cb) => { onMessageCb = cb; });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function sendMsg(overrides = {}) {
  onMessageCb({
    target: 'offscreen', action: 'play',
    type: 'complete', volume: 0.8, customSound: null,
    ...overrides,
  });
}

// ─── Message routing ──────────────────────────────────────────────────────────

describe('message routing', () => {
  test('ignores messages with wrong target', async () => {
    onMessageCb({ target: 'background', action: 'play', type: 'complete', volume: 0.8, customSound: null });
    await flushPromises();
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('ignores messages with wrong action', async () => {
    onMessageCb({ target: 'offscreen', action: 'stop', type: 'complete', volume: 0.8, customSound: null });
    await flushPromises();
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('routes to synth when customSound is null', async () => {
    sendMsg({ customSound: null });
    await flushPromises();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('routes to playFile when customSound is a data URL', async () => {
    sendMsg({ customSound: 'data:audio/mp3;base64,ABC123' });
    await flushPromises();
    expect(global.fetch).toHaveBeenCalledWith('data:audio/mp3;base64,ABC123');
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
  });
});

// ─── synthComplete ────────────────────────────────────────────────────────────

describe('synthComplete', () => {
  beforeEach(async () => {
    sendMsg({ type: 'complete', volume: 0.8, customSound: null });
    await flushPromises();
  });

  test('creates 3 oscillators for the C-E-G arpeggio', () => {
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
  });

  test('all oscillators use sine wave', () => {
    expect(createdOscillators.every(o => o.type === 'sine')).toBe(true);
  });

  test('uses correct frequencies: C5, E5, G5', () => {
    expect(createdOscillators.map(o => o.frequency.value)).toEqual([523.25, 659.25, 783.99]);
  });

  test('connects each oscillator through a gain node to destination', () => {
    createdOscillators.forEach((osc, i) => {
      expect(osc.connect).toHaveBeenCalledWith(createdGainNodes[i]);
      expect(createdGainNodes[i].connect).toHaveBeenCalledWith(mockCtx.destination);
    });
  });

  test('starts and stops every oscillator', () => {
    createdOscillators.forEach(osc => {
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
    });
  });

  test('peak gain is volume * 0.5', () => {
    createdGainNodes.forEach(g => {
      const peak = g.gain.linearRampToValueAtTime.mock.calls[0][0];
      expect(peak).toBeCloseTo(0.8 * 0.5);
    });
  });

  test('applies full gain envelope: setValueAtTime → linearRamp → exponentialRamp', () => {
    createdGainNodes.forEach(g => {
      expect(g.gain.setValueAtTime).toHaveBeenCalledTimes(1);
      expect(g.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
      expect(g.gain.exponentialRampToValueAtTime).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── synthFail ────────────────────────────────────────────────────────────────

describe('synthFail', () => {
  beforeEach(async () => {
    sendMsg({ type: 'fail', volume: 0.8, customSound: null });
    await flushPromises();
  });

  test('creates 2 oscillators for the A→F descent', () => {
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  test('all oscillators use triangle wave', () => {
    expect(createdOscillators.every(o => o.type === 'triangle')).toBe(true);
  });

  test('uses correct frequencies: A4, F4', () => {
    expect(createdOscillators.map(o => o.frequency.value)).toEqual([440, 349.23]);
  });

  test('peak gain is volume * 0.45', () => {
    createdGainNodes.forEach(g => {
      const peak = g.gain.linearRampToValueAtTime.mock.calls[0][0];
      expect(peak).toBeCloseTo(0.8 * 0.45);
    });
  });

  test('connects each oscillator through a gain node to destination', () => {
    createdOscillators.forEach((osc, i) => {
      expect(osc.connect).toHaveBeenCalledWith(createdGainNodes[i]);
      expect(createdGainNodes[i].connect).toHaveBeenCalledWith(mockCtx.destination);
    });
  });
});

// ─── complete vs fail: volume scaling ────────────────────────────────────────

describe('volume scaling', () => {
  test('complete scales by 0.5, fail by 0.45, complete is louder', async () => {
    sendMsg({ type: 'complete', volume: 1.0 });
    await flushPromises();
    const completePeak = createdGainNodes[0].gain.linearRampToValueAtTime.mock.calls[0][0];

    // Reset tracking for the second call without a full beforeEach cycle.
    wireAudioMocks();

    sendMsg({ type: 'fail', volume: 1.0 });
    await flushPromises();
    const failPeak = createdGainNodes[0].gain.linearRampToValueAtTime.mock.calls[0][0];

    expect(completePeak).toBeCloseTo(0.5);
    expect(failPeak).toBeCloseTo(0.45);
    expect(completePeak).toBeGreaterThan(failPeak);
  });
});

// ─── playFile ─────────────────────────────────────────────────────────────────

describe('playFile', () => {
  test('fetches the data URL and decodes the array buffer', async () => {
    sendMsg({ customSound: 'data:audio/mp3;base64,TEST', volume: 0.7 });
    await flushPromises();
    expect(global.fetch).toHaveBeenCalledWith('data:audio/mp3;base64,TEST');
    expect(mockCtx.decodeAudioData).toHaveBeenCalledWith(FAKE_ARRAY_BUFFER);
  });

  test('creates a buffer source and assigns the decoded audio to it', async () => {
    sendMsg({ customSound: 'data:audio/mp3;base64,TEST', volume: 0.7 });
    await flushPromises();
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(createdBufferSources[0].buffer).toBe(mockAudioBuffer);
  });

  test('sets gain node value to the requested volume', async () => {
    sendMsg({ customSound: 'data:audio/mp3;base64,TEST', volume: 0.6 });
    await flushPromises();
    expect(createdGainNodes[0].gain.value).toBe(0.6);
  });

  test('connects buffer source → gain → destination and calls start()', async () => {
    sendMsg({ customSound: 'data:audio/mp3;base64,TEST', volume: 0.8 });
    await flushPromises();
    const src  = createdBufferSources[0];
    const gain = createdGainNodes[0];
    expect(src.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(mockCtx.destination);
    expect(src.start).toHaveBeenCalledTimes(1);
  });

  test('resumes context before playing if state is suspended', async () => {
    ctxState.value = 'suspended';
    sendMsg({ customSound: 'data:audio/mp3;base64,TEST', volume: 0.8 });
    await flushPromises();
    expect(mockCtx.resume).toHaveBeenCalled();
  });

  test('does not call resume when context is already running', async () => {
    ctxState.value = 'running';
    sendMsg({ customSound: 'data:audio/mp3;base64,TEST', volume: 0.8 });
    await flushPromises();
    expect(mockCtx.resume).not.toHaveBeenCalled();
  });

  test('falls back to synth when fetch rejects', async () => {
    mockFetchFail();
    sendMsg({ type: 'complete', customSound: 'data:audio/mp3;base64,BAD', volume: 0.8 });
    await flushPromises();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });

  test('falls back to synth when decodeAudioData rejects', async () => {
    mockCtx.decodeAudioData.mockRejectedValue(new Error('bad format'));
    sendMsg({ type: 'complete', customSound: 'data:audio/mp3;base64,BAD', volume: 0.8 });
    await flushPromises();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });

  test('fallback synth uses sine oscillators for complete type', async () => {
    mockFetchFail();
    sendMsg({ type: 'complete', customSound: 'data:audio/mp3;base64,BAD', volume: 0.8 });
    await flushPromises();
    expect(createdOscillators.every(o => o.type === 'sine')).toBe(true);
  });

  test('fallback synth uses triangle oscillators for fail type', async () => {
    mockFetchFail();
    sendMsg({ type: 'fail', customSound: 'data:audio/mp3;base64,BAD', volume: 0.8 });
    await flushPromises();
    expect(createdOscillators.every(o => o.type === 'triangle')).toBe(true);
  });
});

// ─── synthDefault: suspended context ─────────────────────────────────────────

describe('synthDefault — suspended context', () => {
  test('calls ctx.resume() before synthesising if context is suspended', async () => {
    ctxState.value = 'suspended';
    sendMsg({ type: 'complete', customSound: null });
    await flushPromises();
    expect(mockCtx.resume).toHaveBeenCalled();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });
});
