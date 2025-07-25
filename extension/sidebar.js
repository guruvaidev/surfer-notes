// Sidebar JavaScript
const API_BASE_URL = 'http://127.0.0.1:8000';
let processingHistory = false;
let notes = [];
let currentTab = 'chat'; // 'chat' or 'notes'

document.addEventListener("DOMContentLoaded", () => {
  console.log("Sidebar script loaded");
  
  // Get UI elements
  const chatWindow = document.getElementById("chat-window");
  const notesWindow = document.getElementById("notes-window");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const syncBtn = document.getElementById("sync-btn");
  const summarizeBtn = document.getElementById("summarize-btn");
  const clearChatBtn = document.getElementById("clear-chat-btn");
  const statusMessage = document.getElementById("status-message");
  const chatTabBtn = document.getElementById("chat-tab-btn");
  const notesTabBtn = document.getElementById("notes-tab-btn");
  const popoutBtn = document.getElementById("popout-btn");
  const enterPipBtn = document.getElementById("enter-pip-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const minimizeBtn = document.getElementById("sidebar-minimize-btn");
  const closeBtn = document.getElementById("sidebar-close-btn");
  const alwaysShowSidebar = document.getElementById("always-show-sidebar");
  
  // Initialize settings
  loadSettings();
  
  // Connect to backend on load
  connectBackend();
  
  // Load chat history (shared across all interfaces)
  loadChatHistory();
  
  // Load saved notes
  loadNotes();
  
  // Set initial tab
  switchTab('chat');
  
  // Add listener for storage changes (to detect syncs from other windows)
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
      // Update for synced URLs changes
      if (changes.syncedUrls) {
        const urls = changes.syncedUrls.newValue;
        if (urls && urls.length > 0) {
          statusMessage.textContent = `${urls.length} URLs synced.`;
        }
      }
      
      // Update for chat history changes
      if (changes.chatHistory && chatWindow) {
        chatWindow.innerHTML = changes.chatHistory.newValue;
        setTimeout(() => {
          chatWindow.scrollTop = chatWindow.scrollHeight;
          // Add proper data attributes and copy buttons
          formatChatMessages();
        }, 0);
      }
      
      // Update for notes changes
      if (changes.notes) {
        notes = changes.notes.newValue || [];
        renderNotes();
      }
      
      // Update for settings changes
      if (changes.sidebarSettings && alwaysShowSidebar) {
        const settings = changes.sidebarSettings.newValue;
        if (alwaysShowSidebar) {
          alwaysShowSidebar.checked = settings.alwaysShow;
        }
      }
      
      // ---- Theme Syncing ----
      // Check if the theme preference changed in another tab/window
      if (changes.kamaliTheme) {
        const newTheme = changes.kamaliTheme.newValue || 'dark';
        console.log("Theme changed in storage, applying:", newTheme);
        // Apply the updated theme to this instance of the sidebar
        applyTheme(newTheme);
      }
      // ---- End Theme Syncing ----
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
      
      // Update text content to remove the prefix if it exists in text
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
      
      // Update text content to remove the prefix if it exists in text
      let content = message.textContent;
      if (content.startsWith('LLM: ')) {
        message.textContent = content.substring(5);
      }
      
      // Remove any existing copy buttons to prevent duplicates
      const existingCopyBtn = message.querySelector('.copy-btn');
      if (existingCopyBtn) {
        existingCopyBtn.remove();
      }
      
      // Add fresh copy button to ensure functionality
      addCopyButtonToMessage(message);
    });
  }

  // Add copy button to a message
  function addCopyButtonToMessage(messageEl) {
    // Only add button if it doesn't already have one
    if (!messageEl.querySelector('.copy-btn')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
      copyBtn.setAttribute('title', 'Copy message');
      
      copyBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent any parent handlers
        
        // Get the message text - make a clean copy without the button
        const clonedMessage = messageEl.cloneNode(true);
        const btnInClone = clonedMessage.querySelector('.copy-btn');
        if (btnInClone) btnInClone.remove();
        
        // Extract the text and remove the sender prefix if present
        let text = clonedMessage.textContent.trim();
        
        // Use the unified copy function for consistent behavior
        copyTextToClipboard(text, copyBtn);
      });
      
      messageEl.appendChild(copyBtn);
    }
  }

  // Switch between chat and notes tabs
  function switchTab(tab) {
    currentTab = tab;
    
    if (chatWindow) chatWindow.style.display = tab === 'chat' ? 'flex' : 'none';
    if (notesWindow) notesWindow.style.display = tab === 'notes' ? 'block' : 'none';
    if (chatInput){
        chatInput.style.display = tab === 'chat' ? 'block' : 'none';
        document.querySelector('.chat-input-container').style.padding = (tab === 'chat') ? '10px 15px' : '0px';
    }
    if (sendBtn) sendBtn.style.display = tab === 'chat' ? 'inline-block' : 'none';
    
    // Update active tab button styling
    if (chatTabBtn) {
      chatTabBtn.classList.toggle('active-tab', tab === 'chat');
    }
    if (notesTabBtn) {
      notesTabBtn.classList.toggle('active-tab', tab === 'notes');
    }
    
    // Render notes if switching to notes tab
    if (tab === 'notes') {
      renderNotes();
    }
  }

  function loadSettings() {
    chrome.storage.local.get(['sidebarSettings'], (result) => {
      const settings = result.sidebarSettings || { alwaysShow: false };
      
      if (alwaysShowSidebar) {
        alwaysShowSidebar.checked = settings.alwaysShow;
      }
    });
  }
  
  function saveSettings() {
    const settings = {
      alwaysShow: alwaysShowSidebar?.checked || false
    };
    
    chrome.storage.local.set({ sidebarSettings: settings }, () => {
      console.log('Settings saved:', settings);
    });
  }

  function connectBackend() {
    fetch(`${API_BASE_URL}/`, {
      method: 'GET',
      headers: {'Content-Type': 'application/json'},
    })
    .then(response => {
      if (response.ok) {
        statusMessage.textContent = 'Connected to backend';
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
        
      fetch(`${API_BASE_URL}/extract_current`, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ urls: urls })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
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
        
        // Show notification
        showNotification(
          "History synced successfully!", 
          "Your browsing history has been analyzed.",
          true,
          summary
        );
        
        syncBtn.disabled = false;
        processingHistory = false;
      })
      .catch(error => {
        console.error(`Error syncing history:`, error);
        statusMessage.textContent = "Error: Failed to sync history";
        syncBtn.disabled = false;
        processingHistory = false;
      });
    });
  }

  // Function to show a notification
  function showNotification(title, message, hasAddToNotes = false, summary = "") {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'kamali-notification';
    
    // Create notification content
    notification.innerHTML = `
      <div class="notification-header">
        <span class="notification-title">${title}</span>
        <button class="notification-close"><i class="fas fa-times"></i></button>
      </div>
      <div class="notification-body">${message}</div>
      ${hasAddToNotes ? 
        `<div class="notification-actions">
          <button class="add-to-notes-btn">Add to Notes</button>
          <button class="copy-summary-btn">Copy</button>
        </div>` : ''}
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Setup close button
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    // Setup Add to Notes and Copy buttons if present
    if (hasAddToNotes) {
      const addToNotesBtn = notification.querySelector('.add-to-notes-btn');
      const copySummaryBtn = notification.querySelector('.copy-summary-btn');
      
      addToNotesBtn.addEventListener('click', () => {
        addNoteFromSummary(summary);
        notification.classList.remove('show');
        setTimeout(() => {
          notification.remove();
        }, 300);
      });
      
      copySummaryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTextToClipboard(summary, copySummaryBtn);
      });
    }
    
    // Auto-close after 8 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.classList.remove('show');
        setTimeout(() => {
          if (document.body.contains(notification)) {
            notification.remove();
          }
        }, 300);
      }
    }, 8000);
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
              //const summary = data.note_data || data.summary || data.text || 
                //             data.result || data.content || "No summary available.";
              const summary = data.note_data; 
  
              // Store the summary and context
              chrome.storage.local.set({ 
                summary: summary,
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

  // Notes management
  function loadNotes() {
    chrome.storage.local.get(['notes'], (result) => {
      notes = result.notes || [];
      renderNotes();
    });
  }
  
  function saveNotes() {
    chrome.storage.local.set({ notes }, () => {
      console.log('Notes saved:', notes);
    });
  }
  
  function addNoteFromSummary(summaryText) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs && tabs.length > 0) {
        const pageTitle = tabs[0].title || 'Untitled Page';
        const pageUrl = tabs[0].url;
        
        const newNote = {
          id: Date.now(),
          title: pageTitle,
          content: summaryText,
          url: pageUrl,
          date: new Date().toISOString()
        };
        
        notes.unshift(newNote);
        saveNotes();
        
        // Switch to notes tab to show the new note
        switchTab('notes');
        
        // Show feedback
        statusMessage.textContent = 'Note added successfully!';
        setTimeout(() => {
          statusMessage.textContent = '';
        }, 3000);
      }
    });
  }

  function deleteNote(noteId) {
    notes = notes.filter(note => note.id !== noteId);
    saveNotes();
    renderNotes();
  }
  
  function renderNotes() {
    if (!notesWindow) return;
    
    if (notes.length === 0) {
      notesWindow.innerHTML = '<div class="empty-notes">No notes yet. Use the "Summarize" button to create notes from web pages.</div>';
      return;
    }
    
    notesWindow.innerHTML = '';
    
    notes.forEach(note => {
      const noteEl = document.createElement('div');
      noteEl.className = 'note-item';
      
      const dateObj = new Date(note.date);
      const formattedDate = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      
      noteEl.innerHTML = `
        <div class="note-header">
          <h3 class="note-title">${note.title}</h3>
          <div class="note-actions">
            <button class="note-copy-btn" title="Copy note"><i class="fas fa-copy"></i></button>
            <button class="note-delete-btn" title="Delete note"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div class="note-content">${note.content.replace(/\n/g, '<br>')}</div>
        <div class="note-footer">
          <span class="note-date">${formattedDate}</span>
          ${note.url ? `<a href="${note.url}" class="note-link" target="_blank" title="Open original page"><i class="fas fa-external-link-alt"></i></a>` : ''}
        </div>
      `;
      
      // Setup delete button
      const deleteBtn = noteEl.querySelector('.note-delete-btn');
      deleteBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this note?')) {
          deleteNote(note.id);
        }
      });
      
      // Setup copy button
      const copyBtn = noteEl.querySelector('.note-copy-btn');
      copyBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        copyTextToClipboard(note.content, copyBtn); 
      });
      
      notesWindow.appendChild(noteEl);
    });
  }

  function addManualNote() {
    const title = prompt("Enter note title:");
    if (!title) return; // User cancelled
    
    const content = prompt("Enter note content:");
    if (content === null) return; // User cancelled
    
    const newNote = {
      id: Date.now(),
      title: title.trim(),
      content: content.trim(),
      url: null, // No URL for manual notes
      date: new Date().toISOString()
    };
    
    notes.unshift(newNote);
    saveNotes();
    renderNotes(); // Re-render notes list
    
    statusMessage.textContent = 'Manual note added!';
    setTimeout(() => {
      statusMessage.textContent = '';
    }, 3000);
  }

  // Save chat history to localStorage (Shared with popup and floating panel)
  function saveChatHistory() {
    // Persist entire chat HTML so that copy buttons and messages survive reload
    const chatHistory = chatWindow.innerHTML;
    chrome.storage.local.set({ chatHistory }, () => {
      // Chat history saved
    });
  }

  // Load chat history from localStorage
  function loadChatHistory() {
    chrome.storage.local.get(['chatHistory'], (result) => {
      if (result.chatHistory) {
        chatWindow.innerHTML = result.chatHistory;
        chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll to bottom after loading
        
        // Format all messages properly and ensure copy buttons are added
        formatChatMessages();
        
        // Double-check that each LLM message has a copy button
        const llmMessages = chatWindow.querySelectorAll('.llm-message');
        llmMessages.forEach(message => {
          if (!message.querySelector('.copy-btn')) {
            addCopyButtonToMessage(message);
          }
        });
      }
    });
  }

    // Clear chat history
    function clearChatHistory() {
      if (confirm('Are you sure you want to clear the chat history? This cannot be undone.')) {
        chatWindow.innerHTML = '';
        saveChatHistory();
        statusMessage.textContent = 'Chat history cleared';
        setTimeout(() => {
          statusMessage.textContent = '';
        }, 3000);
      }
    }

  function appendMessage(message, className, sender) {
    const chatWindow = document.getElementById("chat-window");
    if (!chatWindow) return;
    
    const messageDiv = document.createElement("div");
    messageDiv.classList.add(className);
    messageDiv.setAttribute('data-sender', sender);
    messageDiv.textContent = message;
    
    // Append message first
    chatWindow.appendChild(messageDiv);
    
    // Add copy button to LLM messages
    if (className === "llm-message") {
      addCopyButtonToMessage(messageDiv);
    }
  }

// Send query to backend 
function sendQuery(query) {
  if (!query) return;

  const chatWindow = document.getElementById("chat-window");
  if (!chatWindow) {
    console.error("Chat window not found");
    return;
  }


  /* 1. Show the user's message and save immediately */
  appendMessage(query, "user-message", "You");
  chrome.storage.local.set({ chatHistory: chatWindow.innerHTML });


  /* 2. Call the backend */
  fetch(`${API_BASE_URL}/api/receive-query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  })
    .then(resp => {
      if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
      return resp.json();
    })
    .then(data => {
      /* 3. Show assistant reply and save */
      appendMessage(data.answer, "llm-message", "Assistant");
      chrome.storage.local.set({ chatHistory: chatWindow.innerHTML });

      /* 4. Ensure we're scrolled to the newest message */
      forceScrollToBottom(chatWindow);
    })
    .catch(err => {
      console.error("LLM response error:", err);
      appendMessage(
        "Error: couldn't respond. " + err.message,
        "llm-message",
        "Assistant"
      );
      chrome.storage.local.set({ chatHistory: chatWindow.innerHTML });


      forceScrollToBottom(chatWindow);
    });
}

  // // Open settings modal
  // function openSettings() {
  //   // Create settings modal
  //   const settingsModal = document.createElement('div');
  //   settingsModal.className = 'kamali-modal';
  //   settingsModal.innerHTML = `
  //     <div class="modal-content">
  //       <div class="modal-header">
  //         <h2>Kamali Assistant Settings</h2>
  //         <button class="modal-close-btn"><i class="fas fa-times"></i></button>
  //       </div>
  //       <div class="modal-body">
  //         <div class="settings-section">
  //           <h3>Display Settings</h3>
  //           <div class="setting-item">
  //             <label>
  //               <input type="checkbox" id="settings-always-show"> 
  //               <span>Always show sidebar on new tabs</span>
  //             </label>
  //           </div>
  //           <div class="setting-item">
  //             <label>Theme:</label>
  //             <select id="settings-theme">
  //               <option value="dark">Dark</option>
  //               <option value="light">Light</option>
  //             </select>
  //           </div>
  //         </div>
  //         <div class="settings-section">
  //           <h3>About</h3>
  //           <p>Kamali Assistant v1.0.1</p>
  //           <p>© 2025 Kamali Inc. - All rights reserved</p>
  //         </div>
  //       </div>
  //       <div class="modal-footer">
  //         <button id="settings-save-btn" class="kamali-btn">Save Changes</button>
  //       </div>
  //     </div>
  //   `;
    
  //   document.body.appendChild(settingsModal);
    
  //   // Get settings elements
  //   const closeModalBtn = settingsModal.querySelector('.modal-close-btn');
  //   const alwaysShowCheckbox = settingsModal.querySelector('#settings-always-show');
  //   const themeSelect = settingsModal.querySelector('#settings-theme');
  //   const saveBtn = settingsModal.querySelector('#settings-save-btn');
    
  //   // Load current settings
  //   chrome.storage.local.get(['sidebarSettings', 'kamaliTheme'], (result) => {
  //     const settings = result.sidebarSettings || { alwaysShow: false };
  //     const currentTheme = result.kamaliTheme || 'dark';
      
  //     alwaysShowCheckbox.checked = settings.alwaysShow;
  //     themeSelect.value = currentTheme;
  //   });
    
  //   // Close modal handler
  //   closeModalBtn.addEventListener('click', () => {
  //     settingsModal.remove();
  //   });
    
  //   // Save settings handler
  //   saveBtn.addEventListener('click', () => {
  //     const newSettings = {
  //       alwaysShow: alwaysShowCheckbox.checked
  //     };
      
  //     const newTheme = themeSelect.value;
      
  //     // Save settings
  //     chrome.storage.local.set({ 
  //       sidebarSettings: newSettings,
  //       kamaliTheme: newTheme
  //     }, () => {
  //       console.log('Settings saved');
        
  //       // Apply new settings
  //       if (alwaysShowSidebar) {
  //         alwaysShowSidebar.checked = newSettings.alwaysShow;
  //       }
        
  //       // Apply theme
  //       applyTheme(newTheme);
        
  //       // Close modal
  //       settingsModal.remove();
        
  //       // Show confirmation
  //       statusMessage.textContent = 'Settings saved';
  //       setTimeout(() => {
  //         statusMessage.textContent = '';
  //       }, 3000);
  //     });
  //   });
    
  //   // Click outside to close
  //   settingsModal.addEventListener('click', (e) => {
  //     if (e.target === settingsModal) {
  //       settingsModal.remove();
  //     }
  //   });
  // }

  // // Helper to update the status message
  // function updateStatusMessage(text, type) {
  //   if (!statusMessage) return;
  //   statusMessage.textContent = text;
  //   statusMessage.className = '';
  //   if (type) statusMessage.classList.add(type);
  // }

  // --- Event Listeners ---
  
  // Tab switching
  if (chatTabBtn) {
    chatTabBtn.addEventListener("click", () => {
      switchTab('chat');
    });
  }
  
  if (notesTabBtn) {
    notesTabBtn.addEventListener("click", () => {
      switchTab('notes');
    });
  }
  
  // Add new note button
  const addNoteBtn = document.getElementById('add-note-btn');
  if (addNoteBtn) {
    addNoteBtn.addEventListener('click', addManualNote);
  }
  
  // Theme toggle button
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
  
  // Minimize the sidebar (communicate with contentScript)
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      window.parent.postMessage({ action: "toggleSidebar" }, "*");
    });
  }
  
  // Close the sidebar
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.parent.postMessage({ action: "closeSidebar" }, "*");
    });
  }
  
  // PiP mode button
  if (enterPipBtn) {
    enterPipBtn.addEventListener("click", () => {
      window.parent.postMessage({ 
        action: "openFloatingPanel",
        forwardToBackground: true 
      }, "*");
    });
  }

  // Send button
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const message = chatInput.value.trim();
      if (message) {
        sendQuery(message);
        chatInput.value = "";
      }
    });
  }

  // Chat input Enter key
  if (chatInput) {
    chatInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        const message = chatInput.value.trim();
        if (message) {
          sendQuery(message);
          chatInput.value = "";
          event.preventDefault(); // Prevent the default Enter behavior
        }
      }
    });
  }

  // Sync button
  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      syncHistory();
    });
  }
  
  // Summarize button
  if (summarizeBtn) {
    summarizeBtn.addEventListener("click", () => {
      summarizeCurrentPage();
    });
  }

  // Clear chat button
  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      clearChatHistory();
    });
  }
  
  // Settings button
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      // openSettings();
      chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    });
  }

  // Pop-out Button Logic
  if (popoutBtn) {
    popoutBtn.addEventListener("click", () => {
      console.log("Popout button clicked");
      
      // Disable the button temporarily to prevent multiple clicks
      popoutBtn.disabled = true;
      popoutBtn.style.opacity = "0.7";
      
      // Show status message
      statusMessage.textContent = "Opening floating panel...";
      
      // Tell background script to open floating panel
      chrome.runtime.sendMessage({ action: "openFloatingPanel" }, (response) => {
        // Re-enable the button after a short delay
        setTimeout(() => {
          popoutBtn.disabled = false;
          popoutBtn.style.opacity = "1";
          
          if (response && response.success) {
            statusMessage.textContent = "Floating panel opened!";
            setTimeout(() => {
              statusMessage.textContent = "";
            }, 3000);
          } else {
            statusMessage.textContent = "Failed to open floating panel";
            setTimeout(() => {
              statusMessage.textContent = "";
            }, 3000);
          }
        }, 500);
      });
    });
  }
  
  // Settings listeners
  if (alwaysShowSidebar) {
    alwaysShowSidebar.addEventListener("change", saveSettings);
  }
  
  // --- Initialization ---
  
  // Apply saved theme on load
  applySavedTheme();

  // Add a function to detect Font Awesome loading failures and activate fallbacks
  checkAndActivateFallbackIcons();
});

// --- Theme Management ---

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.innerHTML = theme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fa-regular fa-moon"></i>';
  }

  // Notify content script to update its themed elements
  const style = getComputedStyle(document.documentElement);
  const colors = {
    accentPrimary: style.getPropertyValue('--text-primary').trim(),
    bgPrimary: style.getPropertyValue('--bg-primary').trim(),
    shadowColor: style.getPropertyValue('--shadow-color').trim(),
    textOnAccent: style.getPropertyValue('--text-on-accent').trim()
  };
  
  window.parent.postMessage({
    action: "updateTheme",
    theme: theme,
    colors: colors
  }, "*");
}

function toggleTheme() {
  chrome.storage.local.get(['kamaliTheme'], (result) => {
    const currentTheme = result.kamaliTheme || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    chrome.storage.local.set({ kamaliTheme: newTheme });
  });
}

function applySavedTheme() {
  chrome.storage.local.get(['kamaliTheme'], (result) => {
    const savedTheme = result.kamaliTheme || 'dark'; // Default to dark
    applyTheme(savedTheme);
  });
}



// Enhanced function to force scroll to bottom
function forceScrollToBottom(element) {
  if (!element) return;
  
  // Get any sticky elements that might affect scrolling
  const chatInput = document.querySelector('.chat-input-container');
  const chatActions = document.querySelector('.chat-actions');
  
  // Calculate extra padding needed to account for sticky elements
  const extraPadding = (chatInput ? chatInput.offsetHeight : 0) + 
                      (chatActions ? chatActions.offsetHeight : 0);
  
  // Immediate scroll attempt with extra padding for sticky elements
  element.scrollTop = element.scrollHeight + extraPadding;
  
  // Multiple delayed scroll attempts to ensure it works
  const scrollAttempts = [10, 50, 100, 300, 500];
  scrollAttempts.forEach(delay => {
    setTimeout(() => { 
      element.scrollTop = element.scrollHeight + extraPadding;
    }, delay);
  });
}

// Append message to chat window
function appendMessage(message, className, sender) {
  const chatWindow = document.getElementById("chat-window");
  if (!chatWindow) {
    console.error("Chat window not found");
    return;
  }
  
  const messageDiv = document.createElement("div");
  messageDiv.classList.add(className);
  messageDiv.setAttribute('data-sender', sender);
  messageDiv.textContent = message;
  
  // Add copy button to LLM messages
  if (className === "llm-message") {
    addCopyButtonToMessage(messageDiv);
  }
  
  // Apply current theme styling to new messages
  chrome.storage.local.get(['kamaliTheme'], (result) => {
    const currentTheme = result.kamaliTheme || 'dark';
    
    // Apply light mode styling if needed
    if (currentTheme === 'light') {
      if (className === "user-message") {
        messageDiv.style.color = '#000000'; // Black text for contrast
        messageDiv.style.backgroundColor = '#E8F4FF'; // Light blue background
      } else if (className === "llm-message") {
        messageDiv.style.color = '#000000'; // Black text for contrast
        messageDiv.style.backgroundColor = '#E5F7E5'; // Light green background
        
        // Style the copy button with dark cyan
        const copyBtn = messageDiv.querySelector('.copy-btn');
        if (copyBtn) {
          copyBtn.style.color = '#000000';
          copyBtn.addEventListener('mouseover', () => {
            copyBtn.style.color = '#008B8B'; // Dark cyan on hover
          });
          copyBtn.addEventListener('mouseout', () => {
            copyBtn.style.color = '#000000';
          });
        }
      }
    }
  });
  
  // Append message to chat window
  chatWindow.appendChild(messageDiv);
  
  // Force scroll to bottom
  forceScrollToBottom(chatWindow);
  
  return messageDiv;
}

// Send query to backend
function sendQuery(query) {
  if (!query) return;
  
  const chatWindow = document.getElementById("chat-window");
  if (!chatWindow) {
    console.error("Chat window not found");
    return;
  }
  
  console.log("Sending query:", query);
  appendMessage(query, "user-message", "You");
  
  // Save user message immediately
  const chatHistory = chatWindow.innerHTML;
  chrome.storage.local.set({ chatHistory: chatHistory }, () => {
    console.log('Chat message saved.');
  });
  
  fetch(`${API_BASE_URL}/api/receive-query`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query: query })
  })
  .then(response => response.json())
  .then(data => {
    console.log("Response received:", data);
    appendMessage(data.answer, "llm-message", "Assistant");
    
    // Save response
    const updatedHistory = chatWindow.innerHTML;
    chrome.storage.local.set({ chatHistory: updatedHistory }, () => {
      // Force scroll to bottom after saving response
      forceScrollToBottom(chatWindow);
      
      // Try one more time after a short delay to ensure it works
      setTimeout(() => {
        if (chatWindow.scrollHeight - chatWindow.scrollTop > chatWindow.clientHeight) {
          console.log("Content not fully scrolled, forcing scroll again");
          forceScrollToBottom(chatWindow);
        }
      }, 300);
    });
  })
  .catch(error => {
    console.error('Error in LLM response:', error);
    appendMessage("Error: couldn't respond", "llm-message", "Assistant");
    
    // Save error message too
    const updatedHistory = chatWindow.innerHTML;
    chrome.storage.local.set({ chatHistory: updatedHistory }, () => {
      // Force scroll to bottom after saving error
      forceScrollToBottom(chatWindow);
    });
  });
}

// Add a function to detect Font Awesome loading failures and activate fallbacks
function checkAndActivateFallbackIcons() {
  console.log("Checking if Font Awesome icons loaded correctly...");
  
  // Check if Font Awesome is loaded properly
  const fontAwesomeLoaded = (function() {
    // Create a test icon element
    const testIcon = document.createElement('i');
    testIcon.className = 'fas fa-comment';
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
    console.log("Font Awesome not loaded correctly, activating fallback icons");
    
    // Show all SVG fallbacks
    document.querySelectorAll('.icon-fallback svg').forEach(svg => {
      svg.style.display = 'block';
    });
    
    // Notify parent about icon issues
    if (window.parent !== window) {
      window.parent.postMessage({
        action: "fontAwesomeFailed",
        useIconFallbacks: true
      }, '*');
    }
  } else {
    console.log("Font Awesome loaded correctly");
  }
}

// Call the fallback check after a delay to ensure icons had a chance to load
setTimeout(checkAndActivateFallbackIcons, 1000);

// Helper function to copy text to clipboard
function copyTextToClipboard(text, buttonElement) {
  if (!text || !buttonElement) return;
  
  const originalText = buttonElement.innerHTML;
  const isIconButton = originalText.includes('fa-copy');
  
  // Use the Clipboard API if available
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Success feedback
        if (isIconButton) {
          buttonElement.innerHTML = '<i class="fas fa-check"></i>';
        } else {
          buttonElement.textContent = 'Copied!';
        }
        buttonElement.style.backgroundColor = '#00FFFF';
        buttonElement.style.color = '#000000';
        
        // Reset after 1.5 seconds
        setTimeout(() => {
          if (isIconButton) {
            buttonElement.innerHTML = '<i class="fas fa-copy"></i>';
          } else {
            buttonElement.textContent = originalText;
          }
          buttonElement.style.backgroundColor = '';
          buttonElement.style.color = '';
        }, 1500);
      })
      .catch(err => {
        // Use fallback on error
        console.error('Clipboard API error:', err);
        fallbackCopyText(text, buttonElement, originalText, isIconButton);
      });
  } else {
    // Use fallback for older browsers
    fallbackCopyText(text, buttonElement, originalText, isIconButton);
  }
}

// Fallback copy method for older browsers
function fallbackCopyText(text, buttonElement, originalText, isIconButton) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      // Success feedback
      if (isIconButton) {
        buttonElement.innerHTML = '<i class="fas fa-check"></i>';
      } else {
        buttonElement.textContent = 'Copied!';
      }
      buttonElement.style.backgroundColor = '#00FFFF';
      buttonElement.style.color = '#000000';
    } else {
      // Error feedback
      if (isIconButton) {
        buttonElement.innerHTML = '<i class="fas fa-times"></i>';
      } else {
        buttonElement.textContent = 'Error!';
      }
      buttonElement.style.backgroundColor = 'rgba(255,0,0,0.3)';
    }
  } catch (err) {
    console.error('Copy fallback error:', err);
    // Error feedback
    if (isIconButton) {
      buttonElement.innerHTML = '<i class="fas fa-times"></i>';
    } else {
      buttonElement.textContent = 'Error!';
    }
    buttonElement.style.backgroundColor = 'rgba(255,0,0,0.3)';
  }
  
  document.body.removeChild(textArea);
  
  // Reset after 1.5 seconds
  setTimeout(() => {
    if (isIconButton) {
      buttonElement.innerHTML = '<i class="fas fa-copy"></i>';
    } else {
      buttonElement.textContent = originalText;
    }
    buttonElement.style.backgroundColor = '';
    buttonElement.style.color = '';
  }, 1500);
}
