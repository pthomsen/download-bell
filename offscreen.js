// offscreen.js — runs in an offscreen document with full DOM/Web Audio access

const ctx = new AudioContext();

// Synthesise a pleasant ascending arpeggio (C5-E5-G5) for success
function synthComplete(volume) {
  [[523.25, 0], [659.25, 0.13], [783.99, 0.26]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(volume * 0.5, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  });
}

// Synthesise a descending two-note error tone (A4 → F4)
function synthFail(volume) {
  [[440, 0], [349.23, 0.22]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(volume * 0.45, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

async function playFile(dataUrl, volume) {
  if (ctx.state === 'suspended') await ctx.resume();
  const response = await fetch(dataUrl);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.buffer = audioBuffer;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

function synthDefault(type, volume) {
  if (ctx.state === 'suspended') ctx.resume();
  if (type === 'complete') synthComplete(volume);
  else synthFail(volume);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen' || msg.action !== 'play') return;

  if (msg.customSound) {
    playFile(msg.customSound, msg.volume)
      .catch(() => synthDefault(msg.type, msg.volume));  // fall back to synth on decode error
  } else {
    synthDefault(msg.type, msg.volume);
  }
});
