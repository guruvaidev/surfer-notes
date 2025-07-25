// Content script for Kamali Assistant Sidebar
// Handles sidebar integration with webpages

let sidebarInjected = false;
let sidebarVisible = false;
let sidebarFrame = null;
let toggleButton = null;
let resizeHandle = null;
let isResizing = false;
let mainContent = null;
let defaultSidebarWidth = 350;
let sidebarWidth = defaultSidebarWidth;

console.log("Kamali Assistant contentScript.js loaded");

// Create and inject the sidebar iframe
function injectSidebar() {
  if (sidebarInjected && sidebarFrame) {
    console.log("Sidebar already injected, not creating a new one");
    return;
  }
  
  console.log("Injecting sidebar into the page");
  
  // Clean up first
  removeSidebar();

  // Get saved sidebar width
  chrome.storage.local.get(['sidebarWidth'], (result) => {
    if (result.sidebarWidth) {
      sidebarWidth = result.sidebarWidth;
    }
  });
  
  // Create sidebar iframe
  sidebarFrame = document.createElement('iframe');
  sidebarFrame.id = 'kamali-sidebar-frame';
  sidebarFrame.src = chrome.runtime.getURL('sidebar.html');
  sidebarFrame.classList.add('kamali-sidebar');
  sidebarFrame.setAttribute('allow', 'clipboard-read; clipboard-write');
  sidebarFrame.style.cssText = `
    position: fixed;
    top: 0;
    right: -${sidebarWidth}px; /* Start hidden */
    width: ${sidebarWidth}px;
    height: 100vh;
    border: none;
    z-index: 9999;
    transition: right 0.3s ease-in-out;
    border-top-left-radius: 15px;
    border-bottom-left-radius: 15px;
  `;
  
  document.body.appendChild(sidebarFrame);
  
  // Add resize handle
  resizeHandle = document.createElement('div');
  resizeHandle.id = 'kamali-sidebar-resize';
  resizeHandle.style.cssText = `
    position: fixed;
    top: 0;
    right: ${sidebarWidth}px;
    width: 1px;
    height: 100vh;
    cursor: ew-resize;
    z-index: 10000;
    opacity: 0.2;
    display: none;
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(resizeHandle);

  // Hover effect for resize handle
  resizeHandle.addEventListener('mouseenter', () => {
    resizeHandle.style.opacity = '0.8';
  });

  resizeHandle.addEventListener('mouseleave', () => {
    if (!isResizing) {
      resizeHandle.style.opacity = '0.2';
    }
  });
  
  // Resize functionality
  let startX, startWidth;
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(sidebarFrame.style.width, 10);
    document.body.style.userSelect = 'none'; // Prevent text selection
    document.body.style.cursor = 'ew-resize'; 
    resizeHandle.style.opacity = '0.8';
    document.addEventListener('mousemove', resizeMove);
    document.addEventListener('mouseup', resizeStop);

    // Add overlay to capture mouse events while resizing
    const overlay = document.createElement('div');
    overlay.id = 'kamali-resize-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 9990;
      cursor: ew-resize;
    `;
    document.body.appendChild(overlay);
  });
  
  function resizeMove(e) {
    if (!isResizing) return;
    const width = startWidth - (e.clientX - startX);
    const minWidth = 300;
    const maxWidth = 300;//Math.min(window.innerWidth - 100, 800); // Respect screen size
    
    if (width >= minWidth && width <= maxWidth) {
      sidebarWidth = width;
      sidebarFrame.style.width = `${width}px`;
      resizeHandle.style.right = `${width}px`;

      // Adjust page content
      if (sidebarVisible) {
        adjustMainContent(width);
        // Keep toggle button positioned correctly
        toggleButton.style.right = `${width + 20}px`;
      }
    }
  }
  
  function resizeStop() {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = ''; // Restore selection
      document.body.style.cursor = '';
      resizeHandle.style.opacity = '0.2';
      document.removeEventListener('mousemove', resizeMove);
      document.removeEventListener('mouseup', resizeStop);

      // Remove overlay
      const overlay = document.getElementById('kamali-resize-overlay');
      if (overlay) overlay.remove();

      // Save width preference
      chrome.storage.local.set({ sidebarWidth: sidebarWidth }, () => {
        console.log('Sidebar width saved:', sidebarWidth);
      });
    }
  }
  
  // Add floating toggle button
  if (!toggleButton || !document.getElementById('kamali-sidebar-toggle')) {
    toggleButton = document.createElement('button');
    toggleButton.id = 'kamali-sidebar-toggle';
    toggleButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        style="
        display:block;
        margin:auto;
        width: 24px; 
        height: 24px;
        fill:none;"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    `;
    toggleButton.style.boxSizing = 'border-box';
    toggleButton.classList.add('sidebar-toggle-btn');
    toggleButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      cursor: pointer;
      z-index: 9998;
      display: flex;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      overflow: hidden;
      padding:0;
      margin:0;
      border-width: 2px;
      border-style: solid;
    `;
    
    document.body.appendChild(toggleButton);
    
    // Toggle sidebar when clicked
    toggleButton.addEventListener('click', () => {
      toggleSidebar();
    });
    
    // Make button draggable
    toggleButton.addEventListener('mousedown', handleToggleButtonDrag);
  }
  
  sidebarInjected = true;
  console.log("Sidebar injected successfully");
}

function adjustMainContent(sidebarWidth) {
  const ourElements = ['kamali-sidebar-frame', 'kamali-sidebar-resize', 'kamali-sidebar-toggle', 'kamali-resize-overlay'];

  document.body.style.marginRight = '0';
  document.documentElement.style.overflowX = 'auto';

  let mainContent = document.body;

  if (ourElements.includes(mainContent.id)) {
    mainContent = document.body;
  }

  if (sidebarVisible && sidebarWidth > 0) {
    document.body.style.boxSizing = 'border-box';

    mainContent.style.transition = 'padding-right 0.3s ease-in-out';
    mainContent.style.paddingRight = `${sidebarWidth}px`;
    mainContent.style.boxSizing = 'border-box';

    Array.from(document.querySelectorAll('*')).forEach(el => {
      const id = el.id || '';
      if (!ourElements.includes(id) && !id.startsWith('kamali-') && el.offsetParent !== null) {
        const computedStyle = window.getComputedStyle(el);
        if (computedStyle.position === 'fixed' || computedStyle.position === 'sticky') {
          if (!el.dataset.originalRight) {
            el.dataset.originalRight = el.style.right || computedStyle.right;
            const currentRight = parseFloat(computedStyle.right) || 0;
            el.style.right = `${currentRight + sidebarWidth}px`;
          }
        }
      }
    });

    const selectors = ['.ad', '.ads', '#ad', '.advertisement', '.menu', '.navigation', '.nav', '#menu'];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const computedStyle = window.getComputedStyle(el);
        if (!el.dataset.originalMarginRight) {
          el.dataset.originalMarginRight = el.style.marginRight || computedStyle.marginRight;
          const currentMarginRight = parseFloat(computedStyle.marginRight) || 0;
          el.style.marginRight = `${currentMarginRight + sidebarWidth}px`;
        }
      });
    });

    document.documentElement.style.overflowX = 'hidden';
  } else {
    document.body.style.marginRight = '0';

    mainContent.style.paddingRight = '0';

    Array.from(document.querySelectorAll('[data-original-right]')).forEach(el => {
      el.style.right = el.dataset.originalRight;
      delete el.dataset.originalRight;
    });

    const selectors = ['.ad', '.ads', '#ad', '.advertisement', '.menu', '.navigation', '.nav', '#menu'];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (el.dataset.originalMarginRight) {
          el.style.marginRight = el.dataset.originalMarginRight;
          delete el.dataset.originalMarginRight;
        }
      });
    });

    document.documentElement.style.overflowX = 'auto';
  }
}

// Show/hide the sidebar
function toggleSidebar() {
  if (!sidebarInjected) {
    injectSidebar();
  }
  
  sidebarVisible = !sidebarVisible;
  
  console.log("Toggling sidebar visibility:", sidebarVisible ? "showing" : "hiding");
  
  if (sidebarVisible) {
    sidebarFrame.style.right = '0';
    resizeHandle.style.display = 'block';
    resizeHandle.style.right = `${sidebarWidth}px`;
    toggleButton.style.right = `${sidebarWidth + 20}px`;
    toggleButton.style.display = 'block';
    
    adjustMainContent(sidebarWidth);
  } else {
    sidebarFrame.style.right = `-${sidebarWidth}px`;
    resizeHandle.style.display = 'none';
    toggleButton.style.right = '20px';
    toggleButton.style.display = "block";
    
    adjustMainContent(0);
  }
  chrome.storage.local.set({ toggleButtonVisible: true }, () => {
    console.log("Toggle button visibility state saved as visible");
  });
  chrome.runtime.sendMessage({
    action: "sidebarStateChanged",
    isVisible: sidebarVisible
  });
  
  return sidebarVisible;
}

// Make toggle button draggable
function handleToggleButtonDrag(mousedownEvent) {
  mousedownEvent.preventDefault();
  
  const initialX = mousedownEvent.clientX;
  const initialY = mousedownEvent.clientY;
  const initialRight = parseInt(window.getComputedStyle(toggleButton).right);
  const initialTop = parseInt(window.getComputedStyle(toggleButton).top);
  
  function moveToggleButton(mousemoveEvent) {
    const deltaX = initialX - mousemoveEvent.clientX;
    const deltaY = mousemoveEvent.clientY - initialY;
    
    const newRight = Math.max(20, initialRight + deltaX);
    const newTop = Math.max(20, initialTop + deltaY);
    
    toggleButton.style.right = `${newRight}px`;
    toggleButton.style.top = `${newTop}px`;
  }
  
  function stopDrag() {
    document.removeEventListener('mousemove', moveToggleButton);
    document.removeEventListener('mouseup', stopDrag);
  }
  
  document.addEventListener('mousemove', moveToggleButton);
  document.addEventListener('mouseup', stopDrag);
}

// Remove sidebar elements
function removeSidebar() {
  const existingFrame = document.getElementById('kamali-sidebar-frame');
  if (existingFrame) {
    existingFrame.remove();
  }
  
  const existingResizeHandle = document.getElementById('kamali-sidebar-resize');
  if (existingResizeHandle) {
    existingResizeHandle.remove();
  }
}

// Handle messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  
  if (message.action === "toggleSidebar") {
    const isVisible = toggleSidebar();
    sendResponse({success: true, isVisible: isVisible});
  } else if (message.action === "isSidebarVisible") {
    sendResponse({isVisible: sidebarVisible});
  } else if (message.action === "reinjectSidebar") {
    sidebarInjected = false;
    injectSidebar();
    if (sidebarVisible) {
      sidebarFrame.style.right = '0';
      resizeHandle.style.display = 'block';
      resizeHandle.style.right = `${sidebarWidth}px`;
      toggleButton.style.right = `${sidebarWidth + 20}px`;
    }
    sendResponse({success: true});
  }
  return true; 
});

function applyThemeToContentScriptElements(colors) {
    if (!colors) return;

    if (sidebarFrame) {
        sidebarFrame.style.backgroundColor = colors.bgPrimary;
    }
    if (resizeHandle) {
        resizeHandle.style.backgroundColor = colors.accentPrimary;
    }
    if (toggleButton) {
        toggleButton.style.backgroundColor = colors.bgPrimary;
        toggleButton.style.borderColor = colors.accentPrimary;
        toggleButton.style.boxShadow = `0 2px 10px ${colors.shadowColor}`;
        const svg = toggleButton.querySelector('svg');
        if (svg) {
            svg.setAttribute('stroke', colors.accentPrimary);
        }
    }
}

// Handle messages from the sidebar iframe
window.addEventListener('message', (event) => {
  if (event.source === sidebarFrame?.contentWindow) {
    console.log("Received message from sidebar iframe:", event.data);
    
    if (event.data.action === "toggleSidebar") {
      toggleSidebar();
    } else if (event.data.action === "closeSidebar") {
      sidebarVisible = false;
      sidebarFrame.style.right = `-${sidebarWidth}px`;
      resizeHandle.style.display = 'none';
      toggleButton.style.right = '20px';
      toggleButton.style.display = 'none'; 
      adjustMainContent(0);
      chrome.storage.local.set({ toggleButtonVisible: false }, () => {
        console.log("Toggle button visibility state saved as hidden");
      });
      chrome.runtime.sendMessage({
        action: "sidebarStateChanged",
        isVisible: false
      });
    } else if (event.data.action === "updateTheme") {
        applyThemeToContentScriptElements(event.data.colors);
    } else if (event.data.action === "updateToggleButtonColor") { // Legacy support
        if (toggleButton && event.data.iconColor) {
            toggleButton.style.borderColor = event.data.iconColor;
            const svg = toggleButton.querySelector('svg');
            if (svg) {
              svg.setAttribute('stroke', event.data.iconColor);
            }
        }
        if (toggleButton && event.data.backgroundColor) {
            toggleButton.style.backgroundColor = event.data.backgroundColor;
        }
    }
    
    if (event.data.forwardToBackground) {
      chrome.runtime.sendMessage(event.data);
    }
  }
});

// Initialize sidebar based on settings
function initializeSidebar() {
  chrome.storage.local.get(['sidebarSettings', 'globalSidebarState','toggleButtonVisible', 'kamaliTheme'], (result) => {
    console.log("Checking sidebar settings:", result);
    const settings = result.sidebarSettings || {};
    const globalState = result.globalSidebarState || { isVisible: false };
    const toggleButtonVisible = result.toggleButtonVisible !== undefined ? result.toggleButtonVisible : false;
    
    injectSidebar();

    if (toggleButtonVisible) {
      toggleButton.style.display = 'block';
    } else {
      toggleButton.style.display = 'none';
    }
    if (settings.alwaysShow || globalState.isVisible) {
      console.log("Auto-showing sidebar based on settings or global state");
      sidebarVisible = true;
      sidebarFrame.style.right = '0';
      resizeHandle.style.display = 'block';
      resizeHandle.style.right = `${sidebarWidth}px`;
      toggleButton.style.right = `${sidebarWidth + 20}px`;
      toggleButton.style.display = 'block'; 
      adjustMainContent(sidebarWidth);
      
      chrome.runtime.sendMessage({
        action: "sidebarStateChanged",
        isVisible: true
      });
    } else {
      adjustMainContent(0);
    }
  });
}
// Message from background script to show the toggle button
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  
  if (message.action === "showToggleButton") {
    if(toggleButton) {
        toggleButton.style.display = 'block';
    }
    chrome.storage.local.set({ toggleButtonVisible: true }, () => {
      console.log("Toggle button visibility state saved as visible");
    });
  }
});
// Initialize when page loads
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initializeSidebar();
} else {
  document.addEventListener('DOMContentLoaded', initializeSidebar);
}

// Ensure sidebar is properly shown when tab becomes active
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !sidebarInjected) {
    initializeSidebar();
  }
});
