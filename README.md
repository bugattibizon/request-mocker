# Request Mocker

A Chrome extension for mocking `fetch` and `XMLHttpRequest` responses — useful for QA, local development, and testing edge cases without changing backend code.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this directory.

The extension icon will appear in your toolbar. Click it to open the popup.

## Usage

### Creating a rule

1. Click the extension icon to open the popup.
2. Click **Add Rule**.
3. Configure the rule:
   - **Name** — optional label for the rule
   - **Method** — HTTP method to match, or `ANY` to match all methods
   - **URL Pattern** — substring or regex to match against the full request URL
   - **Is Regex** — treat the URL pattern as a regular expression
   - **Status Code** — response status (e.g. `200`, `404`, `500`)
   - **Response Headers** — JSON object of headers (e.g. `{"Content-Type": "application/json"}`)
   - **Response Body** — response body text
   - **Delay (ms)** — artificial delay before the response is returned
4. Click **Save**.

Rules are matched in order — the first matching enabled rule wins.

### Enabling / disabling

- Toggle individual rules on or off with the switch next to each rule.
- Use the global **Enable / Disable** toggle to suspend all mocking without deleting rules.

### Import / Export

Use the **Export** button to save all rules as a `.json` file, and **Import** to load them back. Useful for sharing rule sets across machines or team members.

## How it works

Because Chrome extensions run in an isolated JavaScript context, the extension uses a two-script approach to intercept page requests:

- **`bridge.js`** runs in the isolated content script context (which can access `chrome.storage`) and forwards rules to the page via a `CustomEvent`.
- **`interceptor.js`** runs in the page's main world (same context as page JavaScript) and overrides `window.fetch` and `window.XMLHttpRequest` using the forwarded rules.

This lets the interceptor return synthetic responses before any network request is made.
