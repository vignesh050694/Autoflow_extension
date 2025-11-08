# AutoFlow Extension Testing Guide

This guide explains how to test the complete flow of the AutoFlow extension with the backend API.

## Prerequisites

1. **Backend Running**: Ensure the AutoFlow_backend is running on `http://localhost:8000`
2. **Chrome Browser**: You need Chrome or a Chromium-based browser
3. **Extension Loaded**: Load the extension in Chrome Developer Mode

## Step 1: Start the Backend

```bash
cd AutoFlow_backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
python main.py
```

Verify the backend is running by visiting: http://localhost:8000

You should see:
```json
{
  "message": "AutoFlow Backend API",
  "status": "running",
  "version": "0.1.0"
}
```

## Step 2: Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `AutoFlow_extension` directory
5. The extension should now appear in your extensions list

**Note**: You'll need to create placeholder icon files or the extension may show warnings. You can create simple PNG files:
- `icons/icon16.png` (16x16 pixels)
- `icons/icon48.png` (48x48 pixels)
- `icons/icon128.png` (128x128 pixels)

## Step 3: Test Form Detection

1. Open the `test_form.html` file in Chrome (File > Open File)
2. The content script should automatically detect forms on the page
3. Check the browser console (F12) for logs:
   - "AutoFlow content script loaded"
   - "Detected fields: [...]"
   - "Fields sent to background: {...}"

## Step 4: Test Background Script Communication

1. Open Chrome DevTools for the extension:
   - Go to `chrome://extensions/`
   - Find AutoFlow extension
   - Click "service worker" link (or "background page" in older Chrome)
2. Check the console for:
   - "AutoFlow background script loaded"
   - "Background received message: {...}"
   - "API response: {...}"

## Step 5: Test Popup UI

1. Click the AutoFlow extension icon in Chrome toolbar
2. The popup should display:
   - Connection status (green = connected, red = disconnected)
   - Current page URL
   - List of detected form fields with their properties

## Step 6: Test API Communication

1. With the backend running and a form page open, check the backend console
2. You should see logs like:
   ```
   Received field data from: file:///path/to/test_form.html
   Number of fields: X
   Timestamp: YYYY-MM-DD HH:MM:SS
   ```

## Step 7: Test Dynamic Form Detection

1. On the test_form.html page, click "Add Dynamic Form" button
2. Wait 2 seconds (debounce delay)
3. Check console - should see "New forms detected, extracting fields..."
4. Open the popup again - should show the newly added fields

## Complete Flow Test

The complete message flow is:

```
Web Page (test_form.html)
    ↓
Content Script (content.js)
    ↓ chrome.runtime.sendMessage
Background Script (background.js)
    ↓ fetch POST
Backend API (/api/fields)
    ↓ response
Background Script
    ↓ chrome.runtime.onMessage
Popup UI (popup.js)
```

## Troubleshooting

### Extension Not Detecting Forms
- Check browser console for errors
- Verify content script is injected (check Sources tab in DevTools)
- Reload the page

### API Connection Failed
- Verify backend is running on port 8000
- Check CORS settings in backend
- Check Network tab in DevTools for failed requests

### Popup Shows "No fields detected"
- Ensure you're on a page with forms
- Check that content script ran (look for console logs)
- Try refreshing the page

### Background Script Errors
- Check service worker console in chrome://extensions/
- Look for CORS or network errors
- Verify API endpoint is correct

## Manual API Testing

You can test the API directly with curl:

```bash
curl -X POST http://localhost:8000/api/fields \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://example.com",
    "timestamp": 1699999999000,
    "fields": [
      {
        "type": "text",
        "name": "username",
        "id": "user",
        "placeholder": "Enter username",
        "label": "Username"
      }
    ]
  }'
```

Expected response:
```json
{
  "message": "Field data received successfully",
  "url": "http://example.com",
  "fields_count": 1,
  "timestamp": 1699999999000
}
```

## Success Criteria

All tests pass if:
1. ✅ Content script detects forms on page load
2. ✅ Content script detects dynamically added forms within 2 seconds
3. ✅ Background script receives messages from content script
4. ✅ Background script successfully sends data to backend API
5. ✅ Backend API receives and processes field data
6. ✅ Popup displays connection status correctly
7. ✅ Popup displays extracted form fields
8. ✅ Complete flow works end-to-end

## Next Steps

After successful testing:
- Test on real websites with various form structures
- Test error handling (stop backend, test offline behavior)
- Test with multiple tabs open
- Test performance with large forms
