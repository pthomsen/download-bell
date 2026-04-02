// tests/setup.js
// Provides a global `chrome` mock that captures listener callbacks
// and lets individual tests configure storage/offscreen responses.

const chrome = {
  downloads: {
    onChanged: { addListener: jest.fn() },
  },
  storage: {
    local: { get: jest.fn(), remove: jest.fn(), set: jest.fn() },
  },
  offscreen: {
    hasDocument:    jest.fn(),
    createDocument: jest.fn(),
  },
  runtime: {
    getURL:     jest.fn((path) => `chrome-extension://test-id/${path}`),
    sendMessage: jest.fn(),
    onMessage:  { addListener: jest.fn() },
  },
};

global.chrome = chrome;
