// popup.js

const $ = id => document.getElementById(id);

const KEYS = {
  complete: {
    sound: 'completeSound', name: 'completeSoundName', trim: 'completeTrim',
  },
  fail: {
    sound: 'failSound', name: 'failSoundName', trim: 'failTrim',
  },
};

function pct(v) {
  return Math.round(parseFloat(v) * 100) + '%';
}

function setLabel(el, name) {
  el.textContent = name || 'Default (built-in)';
  el.classList.toggle('custom', !!name);
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupSoundPicker(type, savedName, savedTrim) {
  const nameEl     = $(`${type}-name`);
  const trimRow    = $(`${type}-trim-row`);
  const trimSlider = $(`${type}-trim`);
  const trimLabel  = $(`${type}-trim-label`);
  const uploadBtn  = $(`${type}-upload-btn`);
  const uploadFile = $(`${type}-upload`);
  const defaultBtn = $(`${type}-default`);
  const previewBtn = $(`${type}-preview`);
  const { sound: soundKey, name: nameKey, trim: trimKey } = KEYS[type];

  // Initialise label and trim row visibility.
  setLabel(nameEl, savedName);
  trimSlider.value = savedTrim ?? 1.0;
  trimLabel.textContent = pct(trimSlider.value);
  trimRow.classList.toggle('visible', !!savedName);

  // Trim slider
  trimSlider.addEventListener('input', () => {
    trimLabel.textContent = pct(trimSlider.value);
    chrome.storage.local.set({ [trimKey]: parseFloat(trimSlider.value) });
  });

  // Trigger hidden file input
  uploadBtn.addEventListener('click', () => uploadFile.click());

  // Handle file selection
  uploadFile.addEventListener('change', async () => {
    const file = uploadFile.files[0];
    if (!file) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Loading…';

    try {
      const dataUrl = await readAsDataURL(file);
      await chrome.storage.local.set({ [soundKey]: dataUrl, [nameKey]: file.name });
      setLabel(nameEl, file.name);
      trimRow.classList.add('visible');
    } catch (e) {
      console.error('[Download Bell] upload failed', e);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload…';
      uploadFile.value = '';
    }
  });

  // Reset to built-in default — clear sound, name, trim
  defaultBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove([soundKey, nameKey, trimKey]);
    setLabel(nameEl, null);
    trimSlider.value = 1.0;
    trimLabel.textContent = '100%';
    trimRow.classList.remove('visible');
  });

  // Preview
  previewBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'preview', type });
  });
}

async function init() {
  const data = await chrome.storage.local.get([
    'enabled', 'volume',
    'completeSound', 'completeSoundName', 'completeTrim',
    'failSound',     'failSoundName',     'failTrim',
  ]);

  // Enabled toggle
  const toggle = $('toggle');
  toggle.checked = data.enabled !== false;
  toggle.addEventListener('change', () =>
    chrome.storage.local.set({ enabled: toggle.checked })
  );

  // Master volume
  const volSlider = $('volume');
  const volLabel  = $('vol-label');
  volSlider.value = data.volume ?? 0.8;
  volLabel.textContent = pct(volSlider.value);
  volSlider.addEventListener('input', () => {
    volLabel.textContent = pct(volSlider.value);
    chrome.storage.local.set({ volume: parseFloat(volSlider.value) });
  });

  // Sound pickers
  setupSoundPicker('complete', data.completeSoundName ?? null, data.completeTrim ?? 1.0);
  setupSoundPicker('fail',     data.failSoundName     ?? null, data.failTrim     ?? 1.0);
}

document.addEventListener('DOMContentLoaded', init);
