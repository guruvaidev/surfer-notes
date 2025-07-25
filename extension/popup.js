const API_BASE_URL = 'http://127.0.0.1:8000';
let processingHistory = false;

document.addEventListener("DOMContentLoaded", () => {
    // Get all UI elements
    const chatWindow = document.getElementById("chat-window");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const syncBtn = document.getElementById("sync-btn");
    const summarizeBtn = document.getElementById("summarize-btn");
    const statusMessage = document.getElementById("status-message");
    const popoutBtn = document.getElementById("popout-btn");
    const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
    const clearChatBtn = document.getElementById("clear-chat-btn");
    const settingsBtn = document.getElementById("settings-btn");

    // Check for font awesome icon loading issues
    checkAndActivateFallbackIcons();

    // First check for synced URLs
    checkSyncedUrls();
    // Connect to backend on load
    connectBackend();
    // Load chat history (this assumes history is shared via storage)
    loadChatHistory();

    // Add listener for storage changes (to detect syncs from other windows)
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace === 'local') {
            // Update for synced URLs changes
            if (changes.syncedUrls) {
                const urls = changes.syncedUrls.newValue;
                if (urls && urls.length > 0) {
                    statusMessage.textContent = `${urls.length} URLs synced. Ready for queries.`;
                }
            }
            
            // Update for chat history changes
            if (changes.chatHistory && chatWindow) {
                chatWindow.innerHTML = changes.chatHistory.newValue;
                setTimeout(() => {
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                    // Format messages properly
                    formatChatMessages();
                }, 0);
            }
            
            // Update for global sidebar state
            if (changes.globalSidebarState && toggleSidebarBtn) {
                const state = changes.globalSidebarState.newValue;
                // toggleSidebarBtn.textContent = state.isVisible ? "Hide Sidebar" : "Show Sidebar";
            }
        }
    });

    // Format all existing messages in the chat with proper data attributes
    function formatChatMessages() {
        const userMessages = document.querySelectorAll('.user-message');
        const llmMessages = document.querySelectorAll('.llm-message');
        
        userMessages.forEach(message => {
            // Add data-sender if not already present
            if (!message.hasAttribute('data-sender')) {
                message.setAttribute('data-sender', 'You');
            }
            
            // Update text content to remove the prefix if it exists
            let content = message.textContent;
            if (content.startsWith('You: ')) {
                message.textContent = content.substring(5);
            }
        });
        
        llmMessages.forEach(message => {
            // Add data-sender if not already present
            if (!message.hasAttribute('data-sender')) {
                message.setAttribute('data-sender', 'Assistant');
            }
            
            // Update text content to remove the prefix if it exists
            let content = message.textContent;
            if (content.startsWith('LLM: ')) {
                message.textContent = content.substring(5);
            }
            
            // Add copy button if not present
            addCopyButtonToMessage(message);
        });
    }

    // Add copy button to a message
    function addCopyButtonToMessage(messageEl) {
        // Only add button if it doesn't already have one
        if (!messageEl.querySelector('.copy-btn')) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = '<i class="fas fa-copy"></i>';
            copyBtn.title = 'Copy text';
            copyBtn.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent any parent handlers
                
                // Create a clean copy of the message without the button
                const clonedMessage = messageEl.cloneNode(true);
                const btnInClone = clonedMessage.querySelector('.copy-btn');
                if (btnInClone) btnInClone.remove();
                
                // Get the text content from the cleaned clone
                let textToCopy = clonedMessage.textContent.trim();
                
                // Use execCommand for more reliable clipboard access
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';  // Avoid scrolling to bottom
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                try {
                    const successful = document.execCommand('copy');
                    if (successful) {
                        // Visual feedback
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = 'Copied!';
                        copyBtn.style.backgroundColor = '#008000'; // Green background
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                            copyBtn.style.backgroundColor = ''; // Reset background
                        }, 1500);
                    }
                } catch (err) {
                    console.error('Copy failed:', err);
                    copyBtn.textContent = 'Error!';
                    copyBtn.style.backgroundColor = '#ff0000'; // Red background
                    setTimeout(() => {
                        copyBtn.textContent = '<i class="fas fa-copy"></i>';
                        copyBtn.style.backgroundColor = ''; // Reset background
                    }, 1500);
                }
                
                document.body.removeChild(textArea);
            });
            messageEl.appendChild(copyBtn);
        }
    }

    // Check current sidebar state in active tab
    function checkSidebarState() {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "isSidebarVisible" }, (response) => {
                    if (!chrome.runtime.lastError && response) {
                        // Update button text based on sidebar state
                        updateSidebarButtonText(response.isVisible);
                    }
                });
            }
        });
    }
    
    // Update the sidebar button text based on state
    function updateSidebarButtonText(isVisible) {
        if (toggleSidebarBtn) {
            const icon = isVisible ? 
                '<i class="fas fa-columns"></i><span class="label">Toggle Sidebar</span>': 
                '<i class="fas fa-columns"></i><span class="label">Toggle Sidebar</span>';
            toggleSidebarBtn.innerHTML = icon;
        }
    }
    
    // Check sidebar state on load
    checkSidebarState();

    function checkSyncedUrls() {
        chrome.storage.local.get(['syncedUrls'], (result) => {
            if (result.syncedUrls && result.syncedUrls.length > 0) {
                console.log("Found previously synced URLs:", result.syncedUrls.length);
                statusMessage.textContent = `${result.syncedUrls.length} URLs synced. Ready for queries.`;
            }
        });
    }

    function connectBackend() {
        fetch(`${API_BASE_URL}/`, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
        })
        .then(response => {
            if (response.ok) {
                // Only update status message if we don't have synced URLs already
                chrome.storage.local.get(['syncedUrls'], (result) => {
                    if (!result.syncedUrls || result.syncedUrls.length === 0) {
                        statusMessage.textContent = 'Ready to sync!';
                    }
                });
                syncBtn.disabled = false;
                if (summarizeBtn) summarizeBtn.disabled = false;
            } else {
                statusMessage.textContent = 'Backend not connected';
                syncBtn.disabled = true;
                if (summarizeBtn) summarizeBtn.disabled = true;
            }
        })
        .catch(error => {
            statusMessage.textContent = 'Error connecting backend';
            syncBtn.disabled = true;
            if (summarizeBtn) summarizeBtn.disabled = true;
            console.error('Backend connection error:', error);
        });
    }

    function syncHistory() {
        if (processingHistory) return;

        processingHistory = true;
        statusMessage.textContent = `Syncing browsing history...`;
        syncBtn.disabled = true;

        // Get current tab URL
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            const urls = tabs && tabs.length > 0 ? [tabs[0].url] : [];
            console.log("Current tab URL for sync:", urls);

            // Call the backend to sync the current tab's history
            fetch(`${API_BASE_URL}/extract_current`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ urls: urls })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Sync response:", data);
                statusMessage.textContent = `Successfully synced browsing history!`;
                
                // Support different response formats
                const summary = data.Summary || data.summary || data.text || 
                            data.result || data.content || "No summary available.";
                
                // Store the summary and context
                chrome.storage.local.set({ 
                    summary: summary,
                    Context: data || "No Context available."
                }, () => {
                    console.log("Summary and Context saved to chrome storage.");
                });
                
                syncBtn.disabled = false;
                processingHistory = false;
                
                // Show notification
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'History Synced',
                    message: 'Your browsing history has been analyzed.'
                });
            })
            .catch(error => {
                statusMessage.textContent = 'Error syncing history';
                console.error('Error syncing history:', error);
                syncBtn.disabled = false;
                processingHistory = false;
            });
        });
    }

    // Function to generate page summary
    function summarizeCurrentPage() {
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
          if (tabs && tabs.length > 0 && tabs[0].url) {
            statusMessage.textContent = 'Generating summary...';
            if (summarizeBtn) summarizeBtn.disabled = true;
            
            // Get current tab URL
            const pageUrl = tabs[0].url;
            console.log("Attempting to summarize page:", pageUrl);
            
            try {
              // Retrieve context from chrome.storage.local
              chrome.storage.local.get(["Context"], async (result) => {
                const context = result.Context || "No Context available.";
                console.log("Retrieved Context:", context);
      
                try {
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
      
                  // Extract note_data as the summary
                  const summary = data.note_data || data.summary || data.text || 
                                 data.result || data.content || "No summary available.";

                  summary = data.note_data
      
                  // Store the summary and context
                  chrome.storage.local.set({ 
                    summary: summary,
                    Context: data || "No Context available."
                  }, () => {
                    console.log("Summary and Context saved to chrome storage.");
                  });
      
                  // Show notification with summary
                  showNotification(
                    "Page Summary", 
                    "Summary of the current page is ready.", 
                    true, 
                    summary
                  );
      
                  statusMessage.textContent = 'Summary generated!';
                  if (summarizeBtn) summarizeBtn.disabled = false;
                } catch (error) {
                  console.error(`Error generating summary:`, error);
                  statusMessage.textContent = 'Error generating summary';
                  if (summarizeBtn) summarizeBtn.disabled = false;
      
                  // Display error message
                  showNotification(
                    "Error", 
                    "Failed to generate summary: " + error.message
                  );
                }
              });
            } catch (error) {
              console.error(`Error retrieving context:`, error);
              statusMessage.textContent = 'Error generating summary';
              if (summarizeBtn) summarizeBtn.disabled = false;
      
              // Display error message
              showNotification(
                "Error", 
                "Failed to retrieve context: " + error.message
              );
            }
          } else {
            statusMessage.textContent = 'No active page to summarize';
          }
        });
      }

    // Enhanced function to force scroll to bottom
    function forceScrollToBottom(element) {
        if (!element) return;
        
        // Immediate scroll attempt
        element.scrollTop = element.scrollHeight;
        
        // Multiple delayed scroll attempts to ensure it works
        const scrollAttempts = [10, 50, 100, 300, 500];
        scrollAttempts.forEach(delay => {
            setTimeout(() => { 
                element.scrollTop = element.scrollHeight;
            }, delay);
        });
    }

    function appendMessage(message, className, sender) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add(className);
        messageDiv.setAttribute('data-sender', sender);
        messageDiv.textContent = message;
        
        // Append first
        chatWindow.appendChild(messageDiv);
        
        // Scroll with multiple attempts
        forceScrollToBottom(chatWindow);
        
        // Add copy button to LLM messages
        if (className === "llm-message") {
            addCopyButtonToMessage(messageDiv);
        }
        
        return messageDiv;
    }
    
    // Save chat history to localStorage (Shared with floating panel)
    function saveChatHistory() {
        const chatHistory = chatWindow.innerHTML;
        chrome.storage.local.set({ chatHistory: chatHistory }, () => {
            // Force scroll to bottom after saving
            forceScrollToBottom(chatWindow);
        });
    }
    
    // Load chat history from localStorage
    function loadChatHistory() {
        chrome.storage.local.get(['chatHistory'], (result) => {
            if (result.chatHistory) {
                chatWindow.innerHTML = result.chatHistory;
                
                // Scroll to bottom after loading
                forceScrollToBottom(chatWindow);
                
                // Format all messages properly
                formatChatMessages();
            }
        });
    }
    
    // Clear chat history
    function clearChat() {
        if (confirm("Are you sure you want to clear the chat history?")) {
            chatWindow.innerHTML = '';
            saveChatHistory();
            statusMessage.textContent = 'Chat history cleared';
        }
    }

    // --- Event Listeners --- 
    
    if (clearChatBtn) {
        clearChatBtn.addEventListener("click", clearChat);
    }
    
    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            // Open settings in a new tab
            chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
        });
    }

    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener("click", () => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs && tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "toggleSidebar" }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log("Error toggling sidebar:", chrome.runtime.lastError);
                            
                            // Content script might not be injected yet, let's inject it
                            chrome.scripting.executeScript({
                                target: { tabId: tabs[0].id },
                                files: ["contentScript.js"]
                            })
                            .then(() => {
                                // Try again after injecting
                                setTimeout(() => {
                                    chrome.tabs.sendMessage(tabs[0].id, { action: "toggleSidebar" }, (res) => {
                                        if (res && res.success) {
                                            updateSidebarButtonText(true);
                                        }
                                    });
                                }, 200);
                            })
                            .catch(err => {
                                console.error("Error injecting content script:", err);
                                statusMessage.textContent = "Error toggling sidebar";
                            });
                        } else if (response) {
                            updateSidebarButtonText(response.isVisible);
                        }
                    });
                }
            });
        });
    }
    
    if (summarizeBtn) {
        summarizeBtn.addEventListener("click", () => {
            summarizeCurrentPage();
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener("click", () => {
            const message = chatInput.value.trim();
            if (message) {
                sendQuery(message);
                chatInput.value = "";
            }
        });
    }

    if (chatInput) {
        chatInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                sendBtn.click(); // Trigger button click
            }
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener("click", () => {
            syncHistory();
        });
    }

    // Pop-out Button Logic
    if (popoutBtn) {
        popoutBtn.addEventListener("click", () => {
            console.log("Popout button clicked");
            // Send a message to the background script to open the floating panel
            chrome.runtime.sendMessage({ action: "openFloatingPanel" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError);
                    statusMessage.textContent = "Error opening panel.";
                } else if (response && response.success) {
                    console.log("Background script acknowledged, closing popup.");
                    // Close the popup after the floating panel is signaled to open
                    window.close();
                } else {
                    console.log("Background script did not respond successfully.");
                    statusMessage.textContent = "Panel may not have opened.";
                }
            });
        });
    }

    function sendQuery(query) {
        if (!query) return;
        
        appendMessage(query, "user-message", "You");
        saveChatHistory(); // Save user message immediately
        
        fetch(`${API_BASE_URL}/api/receive-query`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: query })
        })
        .then(response => response.json())
        .then(data => {
            const messageEl = appendMessage(data.answer, "llm-message", "Assistant");
            
            // Save after response
            saveChatHistory();
            
            // Try one more time after a delay to ensure scrolling works
            setTimeout(() => {
                if (chatWindow.scrollHeight - chatWindow.scrollTop > chatWindow.clientHeight) {
                    console.log("Content not fully scrolled, forcing scroll again");
                    forceScrollToBottom(chatWindow);
                }
            }, 300);
        })
        .catch(error => {
            appendMessage("Error: couldn't respond", "llm-message", "Assistant");
            console.error('Error in LLM response:', error);
            saveChatHistory(); // Save error message too
        });
    }

    // Function to detect Font Awesome loading failures and activate fallbacks
    function checkAndActivateFallbackIcons() {
        console.log("Checking if Font Awesome icons loaded correctly in popup...");
        
        // Check if Font Awesome is loaded properly
        const fontAwesomeLoaded = (function() {
            // Create a test icon element
            const testIcon = document.createElement('i');
            testIcon.className = 'fas fa-sync-alt';
            testIcon.style.position = 'absolute';
            testIcon.style.visibility = 'hidden';
            document.body.appendChild(testIcon);
            
            // Get computed styles
            const styles = window.getComputedStyle(testIcon);
            const fontFamily = styles.getPropertyValue('font-family');
            const width = styles.getPropertyValue('width');
            
            // Clean up test element
            document.body.removeChild(testIcon);
            
            // Check if it's using the Font Awesome font family and has proper dimensions
            return fontFamily.includes('Font Awesome') && width !== '0px';
        })();
        
        if (!fontAwesomeLoaded) {
            console.log("Font Awesome not loaded correctly in popup, activating fallback icons");
            
            // Show all SVG fallbacks
            document.querySelectorAll('.icon-fallback svg').forEach(svg => {
                svg.style.display = 'block';
            });
        } else {
            console.log("Font Awesome loaded correctly in popup");
        }
    }
});
