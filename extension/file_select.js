document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const statusDiv = document.getElementById('status');

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const text = e.target.result;
                // Format as JSON to avoid parsing errors later
                const formattedContent = [{
                    documents: [{
                        page_content: text,
                        metadata: {
                            timestamp: new Date().toISOString(),
                            fileName: file.name
                        }
                    }]
                }];
                const jsonContent = JSON.stringify(formattedContent);
                
                statusDiv.textContent = 'File stored successfully!';
                
                chrome.runtime.sendMessage({
                    action: "storeFile",
                    content: jsonContent,
                    fileName: file.name
                }, (response) => {
                    if (response.status === "file stored") {
                        statusDiv.textContent = 'File stored for session!';
                    }
                });
            };
            
            reader.readAsText(file);
        }
    });

    chrome.runtime.sendMessage({ action: "readFile" }, (response) => {
        if (response.content) {
            statusDiv.textContent = `Using stored file: ${response.fileName}`;
            fileInput.disabled = true;
        }
    });
});