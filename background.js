// background.js — Download Bell service worker

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play download notification sounds',
  });
}

async function triggerSound(type) {
  const data = await chrome.storage.local.get([
    'enabled', 'volume',
    'completeSound', 'failSound',
    'completeTrim',  'failTrim',
  ]);

  if (data.enabled === false) return;

  const master = data.volume ?? 0.8;
  const trim   = type === 'complete'
    ? (data.completeTrim ?? 1.0)
    : (data.failTrim     ?? 1.0);
  const volume = master * trim;

  const customSound = type === 'complete'
    ? (data.completeSound ?? null)
    : (data.failSound ?? null);

  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'play',
      type,
      volume,
      customSound,
    });
  } catch (e) {
    // Offscreen doc may not be ready yet on very fast completions — not fatal.
    console.warn('[Download Bell]', e.message);
  }
}

// Errors that are user-initiated, not genuine failures.
// USER_CANCELLED : explicit cancel button or clearing the downloads list
// USER_SHUTDOWN  : browser closed mid-download
const USER_ERRORS = new Set(['USER_CANCELLED', 'USER_CANCELED','USER_SHUTDOWN']);

// Listen to download state changes.
// 'complete'     → success sound
// 'interrupted'  → failure sound, but only for real errors — not user cancellations
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  if (delta.state.current === 'complete') {
    triggerSound('complete');
  } else if (delta.state.current === 'interrupted') {
    console.log('[Download Bell] interrupted, error:', delta.error?.current);
    const error = delta.error?.current;
    if (USER_ERRORS.has(error)) return;
    triggerSound('fail');
  }
});



// Preview requests from popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'preview') triggerSound(msg.type);
});
