# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**request-mocker** is a Chrome Extension (Manifest V3) for intercepting and mocking HTTP requests (fetch and XMLHttpRequest) on any webpage. It has no build system, no package manager, and no external dependencies — all files are plain HTML/CSS/JavaScript loaded directly by Chrome.

To test changes: load the extension unpacked in `chrome://extensions` (enable Developer Mode → Load unpacked → select this directory), then reload the extension after any file change.

## Architecture

The extension uses a 3-layer communication model to bridge the gap between Chrome's isolated extension context and the page's JavaScript context:

```
popup.html  →  chrome.storage.local  ←→  background.js
                        ↓
                    bridge.js          (content script, isolated world — can access chrome APIs)
                        ↓  CustomEvent '__RM_sync'
                 interceptor.js        (content script, main world — same context as page JS)
                        ↓
             overrides window.fetch + window.XMLHttpRequest
```

### Files

- **`manifest.json`** — Extension metadata, permissions (`storage`), and content script declarations. `bridge.js` runs in the isolated world; `interceptor.js` runs in the main world (`"world": "MAIN"`).
- **`background.js`** — Service worker. Initializes `chrome.storage.local` with default state (`{ rules: [], enabled: true }`) on first install.
- **`bridge.js`** — Reads rules from `chrome.storage.local` and dispatches a `__RM_sync` CustomEvent to the page. Re-dispatches on every storage change, keeping the interceptor in sync without requiring Chrome API access.
- **`interceptor.js`** — The core logic. Overrides `window.fetch` and `window.XMLHttpRequest` in the page's main world. On each request, it finds the first matching enabled rule and returns a mocked `Response` (for fetch) or synthetic XHR response. Matching supports both substring (`url.includes(pattern)`) and regex (`new RegExp(pattern).test(url)`).
- **`popup.html`** — Self-contained UI (HTML + CSS + JS in one file). Manages rule CRUD via `chrome.storage.local`. Supports import/export as JSON.

### Rule Data Shape

```javascript
{
  id: string,           // unique ID
  enabled: boolean,
  name: string,
  method: string,       // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | '*'
  urlPattern: string,   // substring or regex pattern
  isRegex: boolean,
  statusCode: number,
  responseHeaders: string,  // JSON string
  responseBody: string,
  delay: number         // milliseconds
}
```

### Key Behaviors

- Rule matching returns the **first** matching enabled rule; order matters.
- The global enable/disable toggle (`enabled` flag in storage) bypasses all interception when false.
- Mocked fetch responses use `new Response(body, { status, headers })` wrapped in `setTimeout` for delay.
- Mocked XHR responses manually set `status`, `responseText`, `readyState`, and fire the appropriate events (`onreadystatechange`, `onload`).
