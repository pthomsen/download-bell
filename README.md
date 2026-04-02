# 🔔 Download Bell

A free, lightweight Chrome extension that plays a sound when a download completes or fails.

Built because every alternative either costs money, requires a subscription, or went unmaintained after Manifest V3.

## Features

- **Sound on completion** - pleasant ascending C–E–G arpeggio by default
- **Sound on failure** - descending A→F tone by default
- **Custom sounds** - upload any audio file (MP3, WAV, OGG, AAC, FLAC) for either event
- **Per-file level trim** - balance loud/quiet custom sounds against each other without touching master volume
- **Master volume control** - single knob for everything
- **Enable/disable toggle** - silence all notifications instantly
- **Works in Brave, Opera, and any Chromium-based browser**
- **No data collected** - all settings stored locally via `chrome.storage.local`

## Installation

### From the Chrome Web Store

*(Coming soon)*

### Manual / Developer install

1. Clone or download this repo
2. Go to `chrome://extensions` (or `brave://extensions`, `opera://extensions`)
3. Enable **Developer mode** (toggle, top right)
4. Click **Load unpacked** and select this folder

## Usage

Click the 🔔 bell icon in your toolbar to open settings.

| Control | Description |
|---|---|
| Toggle | Enable or disable all sounds |
| Volume | Master volume - applies to both events |
| Upload… | Replace the default synth sound with your own audio file |
| Level | Per-file trim slider - appears only when a custom file is loaded |
| Default | Revert to the built-in synthesised sound |
| ▶ Test | Preview the current sound at the current volume |

**Effective volume** = master volume × per-file level trim.  
So if master is 80% and a file's level is 50%, it plays at 40%.

## Sounds that do and don't trigger a notification

| Event | Sound |
|---|---|
| Download completed | ✅ Complete sound |
| Network / server error | ✅ Failure sound |
| User cancelled download | ❌ Silent |
| Browser closed mid-download | ❌ Silent |
| Clearing the downloads list | ❌ Silent |

## Development

```bash
npm install        # install Jest
npm test           # run unit tests (55 tests across background + offscreen)
npm run test:watch # watch mode
npm run coverage   # coverage report
```

### Project structure

```
background.js      # service worker — download event listener, storage, offscreen lifecycle
offscreen.js       # Web Audio API — synth sounds + custom file playback
offscreen.html     # shell document required for audio in MV3 service workers
popup.html         # settings UI
popup.js           # settings UI logic
manifest.json      # MV3 manifest
icons/             # 16, 48, 128px icons
tests/
  setup.js         # global Chrome API mocks
  background.test.js
  offscreen.test.js
```

### Architecture notes

Chrome's Manifest V3 service workers don't have access to the Web Audio API, so audio playback is delegated to an [offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen). `background.js` handles all download events and sends messages to the offscreen document to play sounds. Custom audio files are stored as data URLs in `chrome.storage.local`.

## Contributing

Bug reports and PRs welcome. Please include or update tests for any logic changes.

## License

MIT
