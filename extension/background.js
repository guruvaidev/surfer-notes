// Background script for Kamali Assistant
// Manages sidebar state and floating panel windows across tabs

// Set the API base URL
const API_BASE_URL = 'http://127.0.0.1:8000';

// Track sidebar visibility globally
let globalSidebarState = { isVisible: false };

// Handle messages from other extension components
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openFloatingPanel") {
    openIntermediatePanel();
    sendResponse({ success: true });
    return true; // Keep channel open for async response
  } else if (message.action === "toggleSidebar") {
    toggleSidebarInActiveTab();
    sendResponse({ success: true });
    return true;
  } else if (message.action === "sidebarStateChanged") {
    // Update badge and global state
    updateSidebarBadge(message.isVisible);
    globalSidebarState.isVisible = message.isVisible;
    chrome.storage.local.set({ globalSidebarState });
    
    sendResponse({ success: true });
    return true;
  } else if (message.action === "applyGlobalSidebarState") {
    applySidebarStateToTab(sender.tab.id);
    sendResponse({ success: true });
    return true;
  }
});

// Track the pop-out window
let intermediatePanelWindowId = null;

// Update the extension icon to show sidebar status
function updateSidebarBadge(isVisible) {
  if (isVisible) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#00FFFF" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Apply sidebar state to a specific tab
function applySidebarStateToTab(tabId) {
  chrome.tabs.sendMessage(tabId, { 
    action: "reinjectSidebar", 
    globalState: globalSidebarState 
  }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script not ready - inject it first
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["contentScript.js"]
      })
      .then(() => {
        // Try again after script is loaded
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { 
            action: "reinjectSidebar",
            globalState: globalSidebarState
          });
        }, 200);
      })
      .catch(err => console.error("Error injecting content script:", err));
    }
  });
}

// Toggle the sidebar in the currently active tab
function toggleSidebarInActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "toggleSidebar" }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not ready - inject it first
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["contentScript.js"]
          })
          .then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, { action: "toggleSidebar" });
            }, 200);
          })
          .catch(err => console.error("Error injecting content script:", err));
        } else if (response) {
          updateSidebarBadge(response.isVisible);
          
          // Update global state
          globalSidebarState.isVisible = response.isVisible;
          chrome.storage.local.set({ globalSidebarState });
        }
      });
    }
  });
}

// Get appropriate window position based on screen size
async function getWindowPositioning() {
  const displays = await chrome.system.display.getInfo();
  const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
  const workArea = primaryDisplay.workArea;

  const width = 330; 
  const height = 570;

  // Position in top-right corner
  const left = Math.max(workArea.left, workArea.left + workArea.width - width);
  const top = Math.max(workArea.top, workArea.top + 50);

  // Make sure it fits on screen
  const finalWidth = Math.min(width, workArea.width);
  const finalHeight = Math.min(height, workArea.height);

  return { 
    width: finalWidth, 
    height: finalHeight, 
    left: left, 
    top: top
  };
}

// Open the floating panel window
async function openIntermediatePanel() {
  const positioning = await getWindowPositioning();

  // Reuse existing window if available
  if (intermediatePanelWindowId !== null) {
    try {
      await chrome.windows.get(intermediatePanelWindowId);
      chrome.windows.update(intermediatePanelWindowId, { focused: true, state: 'normal' });
      return;
    } catch (e) {
      intermediatePanelWindowId = null; // Clear stale ID
    }
  }

  // Create new window
  chrome.windows.create({
    url: chrome.runtime.getURL("floating_panel.html"),
    type: "popup",
    width: positioning.width,
    height: positioning.height,
    left: positioning.left,
    top: positioning.top,
    focused: true
  }, (window) => {
    if (chrome.runtime.lastError) {
      console.error("Error creating window:", chrome.runtime.lastError);
      return;
    }
    if (window) {
      intermediatePanelWindowId = window.id;
      
      // Clean up when window closes
      const removedListener = (closedWindowId) => {
        if (closedWindowId === intermediatePanelWindowId) {
          intermediatePanelWindowId = null;
          chrome.windows.onRemoved.removeListener(removedListener);
        }
      };
      chrome.windows.onRemoved.addListener(removedListener);
    }
  });
}

// Handle extension icon clicks
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "isSidebarVisible" }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script not loaded, show popup instead
      // (popup opens automatically due to default_popup in manifest)
    } else {
      // Content script loaded, toggle sidebar
      toggleSidebarInActiveTab();
    }
  });
});

// Handle new tabs being created
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Wait until the tab is fully loaded and is the active tab
  if (changeInfo.status === "complete" && tab.active && tab.url) {
    // Ignore internal extension pages
    if (!tab.url.startsWith("chrome-extension://")) {
      chrome.storage.local.get(['globalSidebarState'], async (result) => {
        globalSidebarState = result.globalSidebarState || { isVisible: false };
        console.log("Current Page URL:", tab.url);

        try {
          const urlSuccess = await sendUrlToBackend(tab.url);

          chrome.storage.local.get(["Context"], async (result) => {
            const context = result.Context || "No Context available.";
            console.log("Retrieved Context:", context);
  
            
              const fileData = Array.isArray(context) ? context : [context];
              const response = await fetch(`${API_BASE_URL}/api/receive-url-file`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: JSON.stringify(fileData) })
              });
  
              if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
              }
  
              const data = await response.json();
              console.log("Summary response:", data);

              const summary = data.note_data;

              chrome.storage.local.set({ 
                summary: summary
              }, () => {
                console.log("Summary and Context saved to chrome storage.");
              });
          console.log("URL sent successfully:", urlSuccess);
        });
      } catch (err) {
          console.error("Failed to send URL:", err);
        }
      });
    }
  }
});


// Initialize extension state
function initializeGlobalState() {
  chrome.storage.local.get(['globalSidebarState'], (result) => {
    if (result.globalSidebarState) {
      globalSidebarState = result.globalSidebarState;
      updateSidebarBadge(globalSidebarState.isVisible);
    }
  });
}


async function sendUrlToBackend(url) {
  try {
      console.log("Sending URL to /extract_current:", url);
      let response = await fetch(`${API_BASE_URL}/extract_current`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: [url] })
      });

      if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
      }

      let result = await response.json();
      console.log("URL sent successfully:", result);

      chrome.storage.local.set({ 
          summary: result.Summary || "No summary available.",
          Context: result || "No Context available."
      }, () => {
          console.log("Summary and Context saved to chrome storage.");
      });

      return true;
  } catch (error) {
      console.error("Error sending URL:", error);
      return false;
  }
}


// Start the extension
initializeGlobalState(); 