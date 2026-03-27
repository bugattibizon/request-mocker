'use strict';

// Store the inspected tab ID so background.js can filter navigation events
chrome.storage.local.set({ devtoolsTabId: chrome.devtools.inspectedWindow.tabId });

chrome.devtools.panels.create('Request Mocker', 'icon16.png', 'panel.html');
