const API_BASE_URL = 'http://127.0.0.1:8000';
let processingHistory = false;
let pipWindow = null;

// Function to check if currently running inside a Document PiP window
function isInPiPWindow() {
    try {
        return window.documentPictureInPicture && window.documentPictureInPicture.window === window;
    } catch (e) {
        return false; 
    }
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("floating_panel.js loaded - DOM Content Loaded");
    const isPiP = isInPiPWindow();
    console.log(`Running context: ${isPiP ? 'PiP Window' : 'Regular Window'}`);
    
    // Get UI elements
    const chatContainer = document.querySelector('.chat-container');
    if (!chatContainer) {
        console.error("Chat container not found!");
        return;
    }
    const chatWindow = document.getElementById("chat-window");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const syncBtn = document.getElementById("sync-btn");
    const statusMessage = document.getElementById("status-message");
    const urlInput = document.getElementById("url-input");
    const enterPipBtn = document.getElementById("enter-pip-btn");
    const pipCloseBtn = document.getElementById("pip-close-btn");
    const pipBackToTabBtn = document.getElementById("pip-back-to-tab-btn");

    // --- Core Chat Functionality ---
    console.log("Initializing chat functionality...");
    // First check for synced URLs
    checkSyncedUrls();
    connectBackend();
    loadChatHistory();

    // Add listener for storage changes (to detect syncs from other windows)
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace === 'local') {
            // Update for synced URLs changes
            if (changes.syncedUrls) {
                const urls = changes.syncedUrls.newValue;
                if (urls && urls.length > 0 && statusMessage) {
                    statusMessage.textContent = `${urls.length} URLs synced. Ready for queries.`;
                }
            }
            
            // Update for chat history changes
            if (changes.chatHistory && chatWindow) {
                chatWindow.innerHTML = changes.chatHistory.newValue;
                setTimeout(() => {
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                    // Add copy buttons to LLM messages
                    addCopyButtonsToLLMMessages();
                }, 0);
            }
        }
    });

    // Function to add copy buttons to all LLM messages
    function addCopyButtonsToLLMMessages() {
        const llmMessages = document.querySelectorAll('.llm-message');
        llmMessages.forEach(message => {
            // Only add button if it doesn't already have one
            if (!message.querySelector('.copy-btn')) {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                copyBtn.title = 'Copy text';
                copyBtn.addEventListener('click', function() {
                    // Create a clean copy of the message without the button
                    const clonedMessage = message.cloneNode(true);
                    const btnInClone = clonedMessage.querySelector('.copy-btn');
                    if (btnInClone) btnInClone.remove();
                    
                    // Extract text content (remove LLM prefix if present)
                    let textToCopy = clonedMessage.textContent.trim();
                    if (textToCopy.startsWith('LLM: ')) {
                        textToCopy = textToCopy.substring(5).trim();
                    }
                    
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
                            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                            setTimeout(() => {
                                copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                            }, 1500);
                        }
                    } catch (err) {
                        console.error('Copy failed:', err);
                        copyBtn.innerHTML = '<i class="fas fa-times"></i>';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1500);
                    }
                    
                    document.body.removeChild(textArea);
                });
                message.appendChild(copyBtn);
            }
        });
    }

    function checkSyncedUrls() {
        chrome.storage.local.get(['syncedUrls'], (result) => {
            if (result.syncedUrls && result.syncedUrls.length > 0 && statusMessage) {
                console.log("Found previously synced URLs:", result.syncedUrls.length);
                statusMessage.textContent = `${result.syncedUrls.length} URLs synced. Ready for queries.`;
            }
        });
    }

    function connectBackend() {
        if (!statusMessage) return;
        fetch(`${API_BASE_URL}/`, { 
            method: 'GET', 
            headers: {'Content-Type': 'application/json'} 
        })
        .then(response => {
            if (response.ok) {
                // Only update status message if we don't have synced URLs already
                chrome.storage.local.get(['syncedUrls'], (result) => {
                    if ((!result.syncedUrls || result.syncedUrls.length === 0) && statusMessage) {
                        statusMessage.textContent = 'Ready to sync!';
                    }
                });
                if (syncBtn) syncBtn.disabled = false;
            } else {
                statusMessage.textContent = 'Backend not connected';
                if (syncBtn) syncBtn.disabled = true;
            }
        })
        .catch(error => {
            statusMessage.textContent = 'Error connecting backend';
            if (syncBtn) syncBtn.disabled = true;
            console.error('Backend connection error:', error);
        });
    }

    function syncUrls() {
        if (processingHistory || !statusMessage || !syncBtn) return;
        processingHistory = true;
        statusMessage.textContent = `Syncing browsing history...`;
        syncBtn.disabled = true;

        // Get current tab URL
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            const urls = tabs && tabs.length > 0 ? [tabs[0].url] : [];
            console.log("Current tab URL for sync:", urls);
            
            if (!urls || urls.length === 0 || !urls[0]) {
                statusMessage.textContent = "Error: No URL to sync";
                syncBtn.disabled = false;
                processingHistory = false;
                return;
            }

            // Call the backend to sync the current tab's history
            fetch(`${API_BASE_URL}/extract_current`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: urls })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Sync response:", data);
                statusMessage.textContent = `Successfully synced history!`;
                
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
            })
            .catch(error => {
                statusMessage.textContent = 'Error syncing history';
                console.error('Error syncing history:', error);
            })
            .finally(() => {
                syncBtn.disabled = false;
                processingHistory = false;
            });
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
    
    function appendMessage(message, className) {
        const chatWindow = document.getElementById("chat-window");
        if (!chatWindow) return;
        
        const messageDiv = document.createElement("div");
        messageDiv.classList.add(className);
        messageDiv.textContent = message;
        
        // Append to chat window
        chatWindow.appendChild(messageDiv);
        
        // Add copy button for LLM messages
        if (className === "llm-message") {
            addCopyButtonToLLMMessage(messageDiv);
        }
        
        // Force scroll to bottom
        forceScrollToBottom(chatWindow);
        
        return messageDiv;
    }
    
    function sendQuery(query) {
        if (!query) return;
        
        const chatWindow = document.getElementById("chat-window");
        appendMessage(query, "user-message");
        
        // Save chat history
        saveChatHistory();
        
        fetch(`${API_BASE_URL}/api/receive-query`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: query })
        })
        .then(response => response.json())
        .then(data => {
            const messageEl = appendMessage(data.answer, "llm-message");
            
            // Save chat history after response
            saveChatHistory();
            
            // Try again after a delay to ensure scrolling works
            setTimeout(() => {
                if (chatWindow.scrollHeight - chatWindow.scrollTop > chatWindow.clientHeight) {
                    console.log("Content not fully scrolled, forcing scroll again");
                    forceScrollToBottom(chatWindow);
                }
            }, 300);
        })
        .catch(error => {
            console.error('Error in LLM response:', error);
            appendMessage("Error: couldn't respond", "llm-message");
            
            // Save chat history after error
            saveChatHistory();
        });
    }

    // --- PiP Button Logic ---
    // Only show and setup Enter PiP button if not already in PiP
    if (enterPipBtn) {
        if (!isPiP) {
            enterPipBtn.style.display = 'block';
            enterPipBtn.addEventListener("click", handleEnterPiP);
        } else {
            enterPipBtn.style.display = 'none';
        }
    }

    // PiP IMPLEMENTATION
    async function handleEnterPiP() {
        console.log("Enter PiP button clicked");
        
        if (!('documentPictureInPicture' in window)) {
            console.error('Document PiP API not supported');
            if (statusMessage) statusMessage.textContent = 'Error: PiP API not available';
            return;
        }

        if (enterPipBtn) enterPipBtn.disabled = true;
        if (statusMessage) statusMessage.textContent = 'Opening PiP window...';
        
        try {
            if (chatWindow) saveChatHistory();
            
            let currentChatHtml = chatWindow ? chatWindow.innerHTML : '';

            pipWindow = await window.documentPictureInPicture.requestWindow({
                width: 300,
                height: 500
            });
            
            if (!pipWindow) {
                throw new Error("Failed to create PiP window");
            }
            
            const [pipHtml, commonCss, pipCss, fontAwesomeCss] = await Promise.all([
                fetch(chrome.runtime.getURL('floating_panel_pip.html')).then(res => res.text()),
                fetch(chrome.runtime.getURL('common.css')).then(res => res.text()),
                fetch(chrome.runtime.getURL('floating_panel_pip.css')).then(res => res.text()),
                fetch("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css").then(res => res.text())
            ]);

            pipWindow.document.open();
            pipWindow.document.write(pipHtml);
            
            const style = pipWindow.document.createElement('style');
            style.textContent = commonCss + '\n' + pipCss + '\n' + fontAwesomeCss;
            pipWindow.document.head.appendChild(style);

            const chatWin = pipWindow.document.getElementById('chat-window');
            if(chatWin) {
                chatWin.innerHTML = currentChatHtml;
            }
            pipWindow.document.close();
            
            console.log("PiP window content written, now setting up event handlers");
            
            // Get elements from PiP window
            const pipChatWindow = pipWindow.document.getElementById('chat-window');
            const pipChatInput = pipWindow.document.getElementById('chat-input');
            const pipSendBtn = pipWindow.document.getElementById('send-btn');
            const pipSyncBtn = pipWindow.document.getElementById('sync-btn');
            const pipStatusMessage = pipWindow.document.getElementById('status-message');
            const pipCloseBtn = pipWindow.document.getElementById('pip-close-btn');

            function pipForceScrollToBottom(element) {
                if (!element) return;
                element.scrollTop = element.scrollHeight;
                setTimeout(() => { element.scrollTop = element.scrollHeight; }, 100);
            }
            
            function pipAppendMessage(message, className) {
                if (!pipChatWindow) return;
                const messageDiv = pipWindow.document.createElement("div");
                messageDiv.classList.add(className);
                messageDiv.textContent = message;
                
                pipChatWindow.appendChild(messageDiv);
                
                pipChatWindow.scrollTop = pipChatWindow.scrollHeight;
                setTimeout(() => { pipChatWindow.scrollTop = pipChatWindow.scrollHeight; }, 50);
                setTimeout(() => { pipChatWindow.scrollTop = pipChatWindow.scrollHeight; }, 250);
            }
            
            function pipSaveChatHistory() {
                if (!pipChatWindow) return;
                const chatHistory = pipChatWindow.innerHTML;
                chrome.storage.local.set({ chatHistory: chatHistory }, () => {
                    console.log("PiP chat history saved");
                });
            }
            
            function pipCheckSyncedUrls() {
                chrome.storage.local.get(['syncedUrls'], (result) => {
                    if (result.syncedUrls && result.syncedUrls.length > 0 && pipStatusMessage) {
                        pipStatusMessage.textContent = `${result.syncedUrls.length} URLs synced. Ready for queries.`;
                    }
                });
            }
            
            function pipSendQuery(query) {
                if (!query || !pipStatusMessage) return;
                pipAppendMessage(`You: ${query}`, "user-message");
                pipSaveChatHistory();
                
                fetch(`${API_BASE_URL}/api/receive-query`, { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ query: query }) 
                })
                .then(response => response.json())
                .then(data => {
                    pipAppendMessage(`LLM: ${data.answer}`, "llm-message");
                    pipSaveChatHistory();
                    pipForceScrollToBottom(pipChatWindow);
                })
                .catch(error => {
                    console.error('PiP error in LLM response:', error);
                    pipAppendMessage(`LLM: Error: couldn't respond`, "llm-message");
                    pipSaveChatHistory();
                    pipForceScrollToBottom(pipChatWindow);
                });
            }
            
            function pipSyncUrls() {
                if (processingHistory || !pipStatusMessage || !pipSyncBtn) return;
                
                processingHistory = true;
                pipStatusMessage.textContent = `Syncing browsing history...`;
                pipSyncBtn.disabled = true;

                chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
                    const urls = tabs && tabs.length > 0 ? [tabs[0].url] : [];
                    
                    if (!urls || urls.length === 0 || !urls[0]) {
                        pipStatusMessage.textContent = "Error: No URL to sync";
                        pipSyncBtn.disabled = false;
                        processingHistory = false;
                        return;
                    }
                
                    fetch(`${API_BASE_URL}/extract_current`, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ urls: urls })
                    })
                    .then(response => response.json())
                    .then(data => {
                        pipStatusMessage.textContent = `Successfully synced history!`;
                        
                        const summary = data.Summary || data.summary || data.text || 
                                      data.result || data.content || "No summary available.";
                        
                        chrome.storage.local.set({ 
                            summary: summary,
                            Context: data || "No Context available."
                        });
                    })
                    .catch(error => {
                        console.error('PiP error syncing history:', error);
                        pipStatusMessage.textContent = 'Error syncing history';
                    })
                    .finally(() => {
                        pipSyncBtn.disabled = false;
                        processingHistory = false;
                    });
                });
            }
            
            pipCheckSyncedUrls();
            
            fetch(`${API_BASE_URL}`, { method: 'GET', headers: {'Content-Type': 'application/json'} })
            .then(response => {
                if (!response.ok) {
                    pipStatusMessage.textContent = 'Backend not connected';
                    if (pipSyncBtn) pipSyncBtn.disabled = true;
                } else if (pipSyncBtn) {
                    pipSyncBtn.disabled = false;
                }
            })
            .catch(error => {
                console.error('PiP backend connection error:', error);
                pipStatusMessage.textContent = 'Error connecting backend';
                if (pipSyncBtn) pipSyncBtn.disabled = true;
            });
            
            if (pipCloseBtn) {
                pipCloseBtn.addEventListener('click', () => pipWindow.close());
            }
            
            if (pipSendBtn && pipChatInput) {
                pipSendBtn.addEventListener('click', () => {
                    const message = pipChatInput.value.trim();
                    if (message) {
                        pipSendQuery(message);
                        pipChatInput.value = '';
                    }
                });
                
                pipChatInput.addEventListener('keypress', (event) => {
                    if (event.key === 'Enter') {
                        pipSendBtn.click();
                    }
                });
            }
            
            if (pipSyncBtn) {
                pipSyncBtn.addEventListener('click', () => pipSyncUrls());
            }
            
            if (pipChatWindow) {
                 pipForceScrollToBottom(pipChatWindow);
            }
            
            pipWindow.addEventListener("pagehide", () => {
                enterPipBtn.disabled = false;
            });
            
            if (statusMessage) statusMessage.textContent = 'PiP window opened successfully';
            
        } catch (error) {
            console.error("Error creating PiP window:", error);
            if (statusMessage) statusMessage.textContent = `PiP Error: ${error.message}`;
            if (pipWindow) {
                try { pipWindow.close(); } catch (e) {}
                pipWindow = null;
            }
            if (enterPipBtn) enterPipBtn.disabled = false;
        }
    }

    // --- PiP Control Buttons ---
    if (pipCloseBtn) {
        pipCloseBtn.addEventListener("click", () => {
            console.log("Close button clicked");
            window.close();
        });
    }
    
    if (pipBackToTabBtn) {
        pipBackToTabBtn.addEventListener("click", () => {
            console.log("Back to tab button clicked");
            window.close();
        });
    }

    // --- Standard Event Listeners ---
    if (sendBtn && chatInput) {
        sendBtn.addEventListener("click", () => {
            const message = chatInput.value.trim();
            if (message) {
                sendQuery(message);
                chatInput.value = "";
            }
        });
        
        chatInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                sendBtn.click();
            }
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener("click", syncUrls);
    }
    
    console.log("floating_panel.js initialization complete");

    // Add a function to detect Font Awesome loading failures and activate fallbacks
    function checkAndActivateFallbackIcons() {
        console.log("Checking if Font Awesome icons loaded correctly in floating panel...");
        
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
            console.log("Font Awesome not loaded correctly in floating panel, activating fallback icons");
            
            // Show all SVG fallbacks
            document.querySelectorAll('.icon-fallback svg').forEach(svg => {
                svg.style.display = 'block';
            });
        } else {
            console.log("Font Awesome loaded correctly in floating panel");
        }
    }

    // Call the fallback check after a delay to ensure icons had a chance to load
    setTimeout(checkAndActivateFallbackIcons, 1000);

    // Add copy button to LLM message
    function addCopyButtonToLLMMessage(messageEl) {
        if (!messageEl || messageEl.querySelector('.copy-btn')) return;
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.title = 'Copy text';
        
        copyBtn.addEventListener('click', function() {
            // Create a clean copy of the message without the button
            const clonedMessage = messageEl.cloneNode(true);
            const btnInClone = clonedMessage.querySelector('.copy-btn');
            if (btnInClone) btnInClone.remove();
            
            // Get the text content and clean any prefixes
            let textToCopy = clonedMessage.textContent.trim();
            
            // Try to use modern clipboard API first with fallback
            try {
                navigator.clipboard.writeText(textToCopy).then(
                    () => {
                        // Visual feedback on success
                        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1500);
                    },
                    () => {
                        // Fallback if permission denied
                        fallbackCopyText(textToCopy);
                    }
                );
            } catch (err) {
                // Fallback for browsers that don't support the API
                fallbackCopyText(textToCopy);
            }
        });
        
        function fallbackCopyText(text) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';  // Avoid scrolling
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    // Visual feedback
                    copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 1500);
                } else {
                    copyBtn.innerHTML = '<i class="fas fa-times"></i>';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 1500);
                }
            } catch (err) {
                console.error('Copy failed:', err);
                copyBtn.innerHTML = '<i class="fas fa-times"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                }, 1500);
            }
            
            document.body.removeChild(textArea);
        }
        
        messageEl.appendChild(copyBtn);
    }

    // Add missing chat history functions for the floating panel
    function saveChatHistory() {
        const chatWindow = document.getElementById("chat-window");
        if (!chatWindow) return;
        
        const chatHistory = chatWindow.innerHTML;
        chrome.storage.local.set({ chatHistory: chatHistory }, () => {
            // Force scroll to bottom after saving
            forceScrollToBottom(chatWindow);
        });
    }

    function loadChatHistory() {
        const chatWindow = document.getElementById("chat-window");
        if (!chatWindow) return;
        
        chrome.storage.local.get(['chatHistory'], (result) => {
            if (result.chatHistory) {
                chatWindow.innerHTML = result.chatHistory;
                
                // Scroll to bottom after loading
                forceScrollToBottom(chatWindow);
                
                // Add copy buttons to LLM messages
                document.querySelectorAll('.llm-message').forEach(message => {
                    addCopyButtonToLLMMessage(message);
                });
            }
        });
    }
}); 