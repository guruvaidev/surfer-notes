// Settings page JavaScript
document.addEventListener("DOMContentLoaded", () => {
    const alwaysShowSidebar = document.getElementById('always-show-sidebar');
    const clearAllData = document.getElementById('clear-all-data');
    const saveBtn = document.getElementById('save-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    
    // Load current settings
    loadSettings();
    
    // Save button click handler
    saveBtn.addEventListener('click', () => {
        saveSettings();
    });
    
    // Cancel button click handler
    cancelBtn.addEventListener('click', () => {
        window.close();
    });
    
    // Load settings from storage
    function loadSettings() {
        chrome.storage.local.get(['sidebarSettings'], (result) => {
            const settings = result.sidebarSettings || { alwaysShow: false };
            
            alwaysShowSidebar.checked = settings.alwaysShow;
        });
    }
    
    // Save settings to storage
    function saveSettings() {
        const settings = {
            alwaysShow: alwaysShowSidebar.checked
        };
        
        // Check if we need to clear all data
        if (clearAllData.checked) {
            // Clear chat history and notes
            chrome.storage.local.clear(() => {
                // Save just the new settings
                chrome.storage.local.set({ sidebarSettings: settings }, () => {
                    showSavedMessage('All data cleared and settings saved!');
                });
            });
        } else {
            // Just save the settings
            chrome.storage.local.set({ sidebarSettings: settings }, () => {
                showSavedMessage('Settings saved successfully!');
            });
        }
    }
    
    // Show a saved message and automatically close the window
    function showSavedMessage(message) {
        // Create a message element
        const savedMsg = document.createElement('div');
        savedMsg.textContent = message;
        savedMsg.className = 'saved-message';
        
        // Add to document
        document.body.appendChild(savedMsg);
        
        // Close window after delay
        setTimeout(() => {
            window.close();
        }, 1500);
    }
}); 