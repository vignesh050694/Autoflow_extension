// Background script for API communication and message routing (MVP - No Auth)

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const HARDCODED_USER_ID = "87f6ee1b-0ca8-4071-a50d-56671c6febe8"; // MVP: Hardcoded user ID
let latestFieldData = null;
let apiBaseUrl = DEFAULT_API_BASE_URL;

// Initialize API base URL from storage
chrome.storage.sync.get(["apiBaseUrl"], (result) => {
  if (result.apiBaseUrl) {
    apiBaseUrl = result.apiBaseUrl;
    console.log("Loaded API base URL from storage:", apiBaseUrl);
  } else {
    chrome.storage.sync.set({ apiBaseUrl: DEFAULT_API_BASE_URL });
    console.log("Initialized API base URL with default:", DEFAULT_API_BASE_URL);
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  if (message.type === "FIELDS_DETECTED") {
    // Store the latest field data
    latestFieldData = message.data;
    console.log(
      `📝 Stored field data: ${message.data.fields.length} fields detected`
    );

    // Notify popup immediately that fields were detected
    chrome.runtime
      .sendMessage({
        type: "FIELDS_DETECTED",
        data: message.data,
      })
      .catch((err) => {
        console.log("Popup not open, will show when opened");
      });

    // Check cache first
    const cacheKey = generateCacheKey(message.data.url, message.data.fields);

    getSuggestionsFromCache(cacheKey)
      .then((cachedData) => {
        if (cachedData) {
          console.log("✅ Using cached suggestions");
          latestFieldData = { ...message.data, ...cachedData };

          // Notify popup about cached suggestions
          chrome.runtime
            .sendMessage({
              type: "SUGGESTIONS_UPDATED",
              data: latestFieldData,
            })
            .catch((err) => {
              console.log("Popup not open");
            });

          sendResponse({ success: true, response: cachedData, cached: true });
        } else {
          // Send fields to API (user has already given permission in content script)
          console.log("📤 Sending fields to API with user consent...");
          sendFieldsToAPI(message.data)
            .then((response) => {
              console.log("✅ API response:", response);
              sendResponse({
                success: true,
                response: response,
                cached: false,
              });
            })
            .catch((error) => {
              console.error("❌ API error:", error);
              sendResponse({ success: false, error: error.message });
            });
        }
      })
      .catch((error) => {
        console.error("❌ Cache error:", error);
        // Fallback to API call
        sendFieldsToAPI(message.data)
          .then((response) => {
            console.log("✅ API response:", response);
            sendResponse({ success: true, response: response, cached: false });
          })
          .catch((error) => {
            console.error("❌ API error:", error);
            sendResponse({ success: false, error: error.message });
          });
      });

    return true; // Keep channel open for async response
  }

  if (message.type === "GET_FIELDS") {
    // Popup requesting latest field data
    sendResponse({ success: true, data: latestFieldData });
    return true;
  }

  if (message.type === "CLEAR_SUGGESTIONS") {
    // Clear all cached suggestions
    console.log("🗑️ Clearing all suggestions from cache");
    latestFieldData = null;

    // Also clear from chrome storage
    chrome.storage.local.remove("suggestionsCache", () => {
      console.log("✅ Suggestions cache cleared");
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_API_STATUS") {
    // Check API connection status
    checkAPIStatus()
      .then((status) => {
        sendResponse({ success: true, status: status });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          status: "disconnected",
          error: error.message,
        });
      });
    return true;
  }

  if (message.type === "APPLY_SUGGESTION") {
    console.log("📤 Background forwarding APPLY_SUGGESTION to content script");
    console.log(
      "📦 Suggestion data:",
      JSON.stringify(message.suggestion, null, 2)
    );

    // Forward single suggestion to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.error("❌ No active tab found");
        sendResponse({ success: false, error: "No active tab found" });
        return;
      }

      console.log("📍 Sending to tab:", tabs[0].id);
      console.log("📍 Tab URL:", tabs[0].url);

      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "APPLY_SUGGESTION", data: message.suggestion },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "❌ Error sending to content script:",
              chrome.runtime.lastError
            );
            sendResponse({
              success: false,
              error: "Content script not loaded. Please refresh the page.",
            });
          } else {
            console.log("✅ Content script responded:", response);
            sendResponse(response);
          }
        }
      );
    });
    return true;
  }

  if (message.type === "APPLY_ALL_SUGGESTIONS") {
    // Forward all suggestions to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ success: false, error: "No active tab found" });
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          type: "APPLY_ALL_SUGGESTIONS",
          data: { suggestions: message.suggestions },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error sending to content script:",
              chrome.runtime.lastError
            );
            sendResponse({
              success: false,
              error: "Content script not loaded. Please refresh the page.",
            });
          } else {
            if (response && response.summary) {
              sendResponse({
                success: true,
                appliedCount: response.summary.succeeded,
                failedCount: response.summary.failed,
                results: response.results,
              });
            } else {
              sendResponse(response);
            }
          }
        }
      );
    });
    return true;
  }
});

// Send fields to AutoFlow_backend API
async function sendFieldsToAPI(fieldData, retryCount = 0) {
  const maxRetries = 3;
  const backoffDelay = Math.pow(2, retryCount) * 1000;
  const requestTimeout = 15000;

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(`${apiBaseUrl}/api/fields`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(fieldData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return await handleAPIResponse(response, fieldData);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === "AbortError") {
        const error = new Error("Request timeout - please try again");
        error.status = 408;
        throw error;
      }

      throw fetchError;
    }
  } catch (error) {
    return await handleAPIError(
      error,
      fieldData,
      retryCount,
      maxRetries,
      backoffDelay
    );
  }
}

// Handle API response
async function handleAPIResponse(response, fieldData) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.detail ||
        `API returned ${response.status}: ${response.statusText}`
    );
    error.status = response.status;
    throw error;
  }

  const data = await response.json();

  // Store in cache
  const cacheKey = generateCacheKey(fieldData.url, fieldData.fields);
  await storeSuggestionsInCache(cacheKey, data);

  // Update latest field data
  if (data) {
    latestFieldData = { ...fieldData, ...data };

    // Notify popup that suggestions are ready
    console.log("📢 Broadcasting SUGGESTIONS_READY to popup");
    chrome.runtime
      .sendMessage({
        type: "SUGGESTIONS_READY",
        data: latestFieldData,
      })
      .catch((err) => {
        // Popup might not be open, that's okay
        console.log("Popup not open, suggestions cached for when it opens");
      });
  }

  return data;
}

// Handle API errors with retry logic
async function handleAPIError(
  error,
  fieldData,
  retryCount,
  maxRetries,
  backoffDelay
) {
  console.error(
    `API request failed (attempt ${retryCount + 1}/${maxRetries}):`,
    error
  );

  // Don't retry validation errors or timeouts
  if (error.status === 422 || error.status === 408) {
    throw error;
  }

  // Retry with exponential backoff for other errors
  if (retryCount < maxRetries - 1) {
    console.log(`Retrying in ${backoffDelay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    return sendFieldsToAPI(fieldData, retryCount + 1);
  }

  throw error;
}

// Generate cache key
function generateCacheKey(url, fields) {
  const fieldIds = fields
    .map((f) => `${f.name || f.id}`)
    .sort()
    .join(",");
  return `${url}:${fieldIds}`;
}

// Store suggestions in cache
async function storeSuggestionsInCache(cacheKey, data) {
  try {
    await chrome.storage.session.set({
      [cacheKey]: {
        data: data,
        timestamp: Date.now(),
      },
    });
    console.log("✅ Suggestions cached");
  } catch (error) {
    console.error("❌ Error caching suggestions:", error);
  }
}

// Get suggestions from cache
async function getSuggestionsFromCache(cacheKey) {
  try {
    const result = await chrome.storage.session.get(cacheKey);
    if (result[cacheKey]) {
      const cached = result[cacheKey];
      const cacheAge = Date.now() - cached.timestamp;
      const cacheMaxAge = 5 * 60 * 1000; // 5 minutes

      if (cacheAge < cacheMaxAge) {
        return cached.data;
      } else {
        await chrome.storage.session.remove(cacheKey);
      }
    }
  } catch (error) {
    console.error("❌ Error reading cache:", error);
  }
  return null;
}

// Check API connection status
async function checkAPIStatus() {
  try {
    const response = await fetch(`${apiBaseUrl}/`, { method: "GET" });
    return response.ok ? "connected" : "error";
  } catch (error) {
    return "disconnected";
  }
}

console.log("🚀 AutoFlow background script loaded (MVP - No Auth)");
