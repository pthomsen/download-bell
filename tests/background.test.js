// tests/background.test.js

const flushPromises = () => new Promise((r) => setImmediate(r));

let onChangedCb;
let onMessageCb;

beforeAll(() => {
  chrome.downloads.onChanged.addListener.mockImplementation((cb) => { onChangedCb = cb; });
  chrome.runtime.onMessage.addListener.mockImplementation((cb)  => { onMessageCb = cb; });
  require('../background');
});

// Default storage: enabled, master volume 0.8, no trim, no custom sounds.
const DEFAULT_STORAGE = { enabled: true, volume: 0.8 };

beforeEach(() => {
  jest.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue(DEFAULT_STORAGE);
  chrome.offscreen.hasDocument.mockResolvedValue(true);
  chrome.offscreen.createDocument.mockResolvedValue(undefined);
  chrome.runtime.sendMessage.mockResolvedValue(undefined);
});

// ─── onChanged: complete ─────────────────────────────────────────────────────

describe('onChanged — complete', () => {
  test('plays the complete sound', async () => {
    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'offscreen', action: 'play', type: 'complete' })
    );
  });

  test('sends null customSound when no custom complete sound is stored', async () => {
    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customSound: null })
    );
  });

  test('passes custom complete sound from storage', async () => {
    const fakeDataUrl = 'data:audio/mp3;base64,ABC123';
    chrome.storage.local.get.mockResolvedValue({ ...DEFAULT_STORAGE, completeSound: fakeDataUrl });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customSound: fakeDataUrl })
    );
  });
});

// ─── onChanged: interrupted ──────────────────────────────────────────────────

describe('onChanged — interrupted', () => {
  test('plays the fail sound for a genuine network error', async () => {
    onChangedCb({ state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fail' })
    );
  });

  test('plays the fail sound for a server error', async () => {
    onChangedCb({ state: { current: 'interrupted' }, error: { current: 'SERVER_FAILED' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fail' })
    );
  });

  test('plays the fail sound when error field is absent', async () => {
    onChangedCb({ state: { current: 'interrupted' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fail' })
    );
  });

  test('silent for USER_CANCELLED (e.g. clearing the downloads list)', async () => {
    onChangedCb({ state: { current: 'interrupted' }, error: { current: 'USER_CANCELLED' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('silent for USER_SHUTDOWN (browser closed mid-download)', async () => {
    onChangedCb({ state: { current: 'interrupted' }, error: { current: 'USER_SHUTDOWN' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('passes custom fail sound from storage', async () => {
    const fakeDataUrl = 'data:audio/wav;base64,XYZ789';
    chrome.storage.local.get.mockResolvedValue({ ...DEFAULT_STORAGE, failSound: fakeDataUrl });

    onChangedCb({ state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customSound: fakeDataUrl })
    );
  });
});

// ─── onChanged: no state change ──────────────────────────────────────────────

describe('onChanged — no state field', () => {
  test('does nothing when delta has no state (e.g. progress update)', async () => {
    onChangedCb({ bytesReceived: { current: 1024 } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

// ─── Volume: master only (no trim) ───────────────────────────────────────────

describe('volume — master only', () => {
  test('passes master volume when no trim is stored', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.5 });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: 0.5 })
    );
  });

  test('defaults master volume to 0.8 when not in storage', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: 0.8 })
    );
  });
});

// ─── Volume: trim applied ─────────────────────────────────────────────────────

describe('volume — trim', () => {
  test('effective volume = master * completeTrim for complete events', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.8, completeTrim: 0.5 });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: expect.closeTo(0.4, 5) })
    );
  });

  test('effective volume = master * failTrim for fail events', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.8, failTrim: 0.25 });

    onChangedCb({ state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: expect.closeTo(0.2, 5) })
    );
  });

  test('completeTrim does not affect fail volume', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.8, completeTrim: 0.1 });

    onChangedCb({ state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } });
    await flushPromises();

    // failTrim absent → defaults to 1.0, so effective = 0.8 * 1.0 = 0.8
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: expect.closeTo(0.8, 5) })
    );
  });

  test('failTrim does not affect complete volume', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.8, failTrim: 0.1 });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    // completeTrim absent → defaults to 1.0, so effective = 0.8 * 1.0 = 0.8
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: expect.closeTo(0.8, 5) })
    );
  });

  test('trim of 1.0 is a no-op (full master volume passes through)', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.6, completeTrim: 1.0 });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: expect.closeTo(0.6, 5) })
    );
  });

  test('trim of 0 silences the sound without disabling', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.8, completeTrim: 0 });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: 0 })
    );
  });
});

// ─── Enabled flag ─────────────────────────────────────────────────────────────

describe('enabled flag', () => {
  test('suppresses all sounds when enabled is false', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: false, volume: 0.8 });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('plays sound when enabled is true', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 0.8 });

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  });
});

// ─── Offscreen document lifecycle ────────────────────────────────────────────

describe('offscreen document', () => {
  test('creates the offscreen document when it does not exist', async () => {
    chrome.offscreen.hasDocument.mockResolvedValue(false);

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.offscreen.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: ['AUDIO_PLAYBACK'] })
    );
  });

  test('skips createDocument when offscreen document already exists', async () => {
    chrome.offscreen.hasDocument.mockResolvedValue(true);

    onChangedCb({ state: { current: 'complete' } });
    await flushPromises();

    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  test('still plays sound even if createDocument throws', async () => {
    chrome.offscreen.hasDocument.mockResolvedValue(false);
    chrome.offscreen.createDocument.mockRejectedValue(new Error('already exists'));

    await expect(async () => {
      onChangedCb({ state: { current: 'complete' } });
      await flushPromises();
    }).not.toThrow();
  });
});

// ─── Preview messages from popup ──────────────────────────────────────────────

describe('onMessage — preview', () => {
  test('plays complete sound on preview:complete', async () => {
    onMessageCb({ action: 'preview', type: 'complete' });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'complete' })
    );
  });

  test('plays fail sound on preview:fail', async () => {
    onMessageCb({ action: 'preview', type: 'fail' });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fail' })
    );
  });

  test('trim is applied during preview', async () => {
    chrome.storage.local.get.mockResolvedValue({ enabled: true, volume: 1.0, completeTrim: 0.5 });

    onMessageCb({ action: 'preview', type: 'complete' });
    await flushPromises();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ volume: expect.closeTo(0.5, 5) })
    );
  });

  test('ignores messages with unknown action', async () => {
    onMessageCb({ action: 'something_else', type: 'complete' });
    await flushPromises();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
