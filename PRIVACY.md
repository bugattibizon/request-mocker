# Privacy Policy — Request Mocker

_Last updated: 2026-09-14_

Request Mocker is a browser developer tool. This policy explains what it does with data.

## Summary
Request Mocker does **not** collect, store, or transmit your personal data to the
developer or any third party. Everything the extension does happens locally in your
own browser.

## What the extension accesses
To do its job — intercepting and mocking or rerouting a page's `fetch` and
`XMLHttpRequest` calls — the extension runs on the pages you choose to test and can
read and modify those network requests and responses. This processing happens
in-memory, on your device, only while you use the tool.

## What is stored, and where
The following are saved using the browser's local extension storage
(`chrome.storage.local`) **on your device only**:
- your mock rules (URL patterns, status codes, headers, response bodies, delays);
- header-injection entries;
- Branch Mode and theme settings;
- optionally, a request/response you explicitly "capture" in the DevTools panel to
  turn into a mock rule.

This data never leaves your device. It is not sent to the developer or to any server.

## Network connections made by the extension
The extension makes exactly one outbound request of its own: an **update check** that
fetches the project's public `manifest.json` from GitHub to compare version numbers
and show an "update available" indicator. This request contains no personal data and
sends no information about you or your browsing.

## What is NOT done
- No analytics, telemetry, tracking, or advertising.
- No selling or sharing of data.
- No accounts, no sign-in, no cloud storage.

## Permissions
- `host access (all sites)` — so the tool can intercept requests on whatever site you
  are testing;
- `declarativeNetRequest` — to adjust request/response headers for Branch Mode;
- `storage` — to save your rules and settings locally.

## Contact
Questions: open an issue at https://github.com/bugattibizon/request-mocker

## Changes
If this policy changes, the updated version will be published at this URL.
