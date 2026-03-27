'use strict';

// Store the inspected tab ID so background.js can filter navigation events
// and so panel.js can identify which tab's captures to show.
chrome.storage.local.set({ devtoolsTabId: chrome.devtools.inspectedWindow.tabId });

chrome.devtools.panels.create('Request Mocker', 'icon16.png', 'panel.html');
