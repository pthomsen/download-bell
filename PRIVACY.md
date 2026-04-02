# Privacy Policy

**Download Bell** is a Chrome extension that plays sound notifications for browser download events.

## Data Collection

Download Bell does not collect, transmit, or share any personal data. No analytics, no tracking, no external servers.

## Local Storage

Your preferences (volume, enabled state, custom sound files, per-file trim levels) are stored locally on your device using the browser's built-in `chrome.storage.local` API. This data never leaves your browser and is not accessible to anyone other than you.

## Permissions

The extension requests the following permissions for the sole purposes described:

| Permission | Purpose |
|---|---|
| `downloads` | Listen for download completion and failure events |
| `storage` | Save your preferences locally on your device |
| `offscreen` | Play audio from a service worker context (required by Chrome's Manifest V3) |
| `notifications` | Display desktop notifications for download events |

## Third Parties

Download Bell makes no network requests and shares no data with any third party.

## Changes

If this policy changes in a meaningful way, the update will be noted in the release history on GitHub.

## Contact

Questions or concerns: open an issue at https://github.com/pthomsen/download-bell/issues