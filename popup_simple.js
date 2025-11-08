// Popup script for displaying autofill suggestions (MVP - No Auth)

// Request field data from background script
function requestFieldData() {
  clearError();
  showLoading(true);

  chrome.runtime.sendMessage({ type: "GET_FIELDS" }, (response) => {
    showLoading(false);

    if (chrome.runtime.lastError) {
      console.error("Error getting fields:", chrome.runtime.lastError);
      showError(chrome.runtime.lastError.message);
      return;
    }

    if (response && response.success && response.data) {
      if (response.data.suggestions && response.data.suggestions.length > 0) {
        renderSuggestions(response.data);
      } else if (response.data.message) {
        showInfo(response.data.message);
      } else {
        showInfo("No suggestions available yet. Waiting for form detection...");
      }
    } else {
      showInfo("No form fields detected on this page.");
    }
  });
}

// Check API connection status
function checkAPIStatus() {
  chrome.runtime.sendMessage({ type: "GET_API_STATUS" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error checking API status:", chrome.runtime.lastError);
      updateStatus("disconnected", "Error checking connection");
      return;
    }

    if (response && response.success) {
      updateStatus(response.status, getStatusMessage(response.status));
    } else {
      updateStatus("disconnected", "Backend disconnected");
    }
  });
}

// Get status message
function getStatusMessage(status) {
  switch (status) {
    case "connected":
      return "Connected to AutoFlow Backend";
    case "disconnected":
      return "Backend disconnected";
    case "error":
      return "Backend error";
    default:
      return "Unknown status";
  }
}

// Update connection status display
function updateStatus(status, message) {
  const statusElement = document.getElementById("status");
  const statusText = document.getElementById("status-text");

  statusElement.className = `status ${status}`;
  statusText.textContent = message;
}

// Show/hide loading indicator
function showLoading(show) {
  const statusElement = document.getElementById("status");

  if (show) {
    statusElement.classList.add("loading");
    statusElement.innerHTML =
      '<div class="loading-spinner"></div><span id="status-text">Loading...</span>';
  } else {
    statusElement.classList.remove("loading");
    checkAPIStatus();
  }
}

// Display error message
function showError(message) {
  const errorContainer = document.getElementById("error-container");
  errorContainer.innerHTML = `<div class="error-message">${escapeHtml(
    message
  )}</div>`;
}

// Clear error messages
function clearError() {
  const errorContainer = document.getElementById("error-container");
  errorContainer.innerHTML = "";
}

// Show success message
function showSuccess(message, autoDismiss = true) {
  const errorContainer = document.getElementById("error-container");
  errorContainer.innerHTML = `
    <div class="error-message" style="background-color: #d4edda; border-color: #c3e6cb; color: #155724;">
      ${escapeHtml(message)}
    </div>
  `;

  if (autoDismiss) {
    setTimeout(() => {
      errorContainer.innerHTML = "";
    }, 3000);
  }
}

// Show informational message
function showInfo(message) {
  const errorContainer = document.getElementById("error-container");
  errorContainer.innerHTML = `
    <div class="error-message" style="background-color: #d1ecf1; border-color: #bee5eb; color: #0c5460;">
      ${escapeHtml(message)}
    </div>
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Render autofill suggestions
function renderSuggestions(data) {
  const suggestionsContainer = document.getElementById("suggestions-container");
  const suggestionsList = document.getElementById("suggestions-list");
  const messageContainer = document.getElementById(
    "suggestions-message-container"
  );
  const processingTimeContainer = document.getElementById(
    "processing-time-container"
  );

  suggestionsList.innerHTML = "";
  messageContainer.innerHTML = "";
  processingTimeContainer.innerHTML = "";

  if (!data.suggestions || data.suggestions.length === 0) {
    suggestionsContainer.style.display = "none";
    if (data.message) {
      showInfo(data.message);
    }
    return;
  }

  suggestionsContainer.style.display = "block";

  if (data.message) {
    messageContainer.innerHTML = `<div style="margin-bottom: 12px; color: #666; font-size: 13px;">${escapeHtml(
      data.message
    )}</div>`;
  }

  const suggestionsHtml = data.suggestions
    .map((suggestion, index) => {
      const confidence = suggestion.confidence || 0;
      const confidencePercent = Math.round(confidence * 100);

      let confidenceClass = "low";
      let confidenceLabel = "Low";

      if (confidence >= 0.8) {
        confidenceClass = "high";
        confidenceLabel = "High";
      } else if (confidence >= 0.6) {
        confidenceClass = "medium";
        confidenceLabel = "Medium";
      }

      const fieldLabel =
        suggestion.field_label ||
        suggestion.field_identifier ||
        "Unknown Field";

      return `
      <div class="suggestion-item" data-index="${index}">
        <div class="field-info">
          <div class="field-label">${escapeHtml(fieldLabel)}</div>
          <div class="confidence-badge ${confidenceClass}">
            ${confidenceLabel} (${confidencePercent}%)
          </div>
        </div>
        <div class="suggested-value">${escapeHtml(
          suggestion.suggested_value || ""
        )}</div>
        <div class="suggestion-actions">
          <button class="apply-btn" data-index="${index}">Apply</button>
          <button class="reject-btn" data-index="${index}">Reject</button>
        </div>
      </div>
    `;
    })
    .join("");

  suggestionsList.innerHTML = suggestionsHtml;

  if (data.processing_time_ms) {
    processingTimeContainer.textContent = `Processing time: ${data.processing_time_ms}ms`;
  }

  addSuggestionEventListeners(data.suggestions);
}

// Add event listeners for suggestion buttons
function addSuggestionEventListeners(suggestions) {
  const applyAllButton = document.getElementById("apply-all-button");
  if (applyAllButton) {
    applyAllButton.onclick = () => handleApplyAll(suggestions);
  }

  const applyButtons = document.querySelectorAll(".apply-btn");
  applyButtons.forEach((button) => {
    button.onclick = () => {
      const index = parseInt(button.getAttribute("data-index"));
      handleApplySuggestion(suggestions[index], index);
    };
  });

  const rejectButtons = document.querySelectorAll(".reject-btn");
  rejectButtons.forEach((button) => {
    button.onclick = () => {
      const index = parseInt(button.getAttribute("data-index"));
      handleRejectSuggestion(index);
    };
  });
}

// Handle applying a single suggestion
function handleApplySuggestion(suggestion, index) {
  console.log("Applying suggestion:", suggestion);

  clearError();
  showLoading(true);

  chrome.runtime.sendMessage(
    { type: "APPLY_SUGGESTION", suggestion: suggestion },
    (response) => {
      showLoading(false);

      if (chrome.runtime.lastError) {
        console.error("Error applying suggestion:", chrome.runtime.lastError);
        showError(chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success) {
        console.log("Suggestion applied successfully");
        showSuccess("Suggestion applied successfully", true);
        removeSuggestionItem(index);
      } else {
        console.error("Failed to apply suggestion:", response?.error);
        showError(response?.error || "Failed to apply suggestion");
      }
    }
  );
}

// Handle applying all suggestions
function handleApplyAll(suggestions) {
  console.log("Applying all suggestions:", suggestions);

  clearError();
  showLoading(true);

  const applyAllButton = document.getElementById("apply-all-button");
  if (applyAllButton) {
    applyAllButton.disabled = true;
    applyAllButton.textContent = "Applying...";
  }

  chrome.runtime.sendMessage(
    { type: "APPLY_ALL_SUGGESTIONS", suggestions: suggestions },
    (response) => {
      showLoading(false);

      if (chrome.runtime.lastError) {
        console.error("Error applying suggestions:", chrome.runtime.lastError);
        showError(chrome.runtime.lastError.message);

        if (applyAllButton) {
          applyAllButton.disabled = false;
          applyAllButton.textContent = "Apply All";
        }
        return;
      }

      if (response && response.success) {
        console.log("All suggestions applied successfully");

        const appliedCount = response.appliedCount || 0;
        const failedCount = response.failedCount || 0;

        if (failedCount === 0) {
          showSuccess(
            `Successfully applied all ${appliedCount} suggestion(s)`,
            true
          );
        } else if (appliedCount === 0) {
          showError(`Failed to apply all ${suggestions.length} suggestion(s)`);
        } else {
          showInfo(
            `Applied ${appliedCount} of ${suggestions.length} suggestion(s). ${failedCount} failed.`
          );
        }

        const suggestionsList = document.getElementById("suggestions-list");
        suggestionsList.innerHTML =
          '<div class="no-suggestions">All suggestions applied!</div>';

        if (applyAllButton) {
          applyAllButton.style.display = "none";
        }
      } else {
        console.error("Failed to apply suggestions:", response?.error);
        showError(response?.error || "Failed to apply suggestions");

        if (applyAllButton) {
          applyAllButton.disabled = false;
          applyAllButton.textContent = "Apply All";
        }
      }
    }
  );
}

// Handle rejecting a suggestion
function handleRejectSuggestion(index) {
  console.log("Rejecting suggestion at index:", index);
  removeSuggestionItem(index);
}

// Remove a suggestion item from the UI
function removeSuggestionItem(index) {
  const suggestionItem = document.querySelector(
    `.suggestion-item[data-index="${index}"]`
  );
  if (suggestionItem) {
    suggestionItem.style.transition = "opacity 0.3s";
    suggestionItem.style.opacity = "0";

    setTimeout(() => {
      suggestionItem.remove();

      const remainingSuggestions =
        document.querySelectorAll(".suggestion-item");
      if (remainingSuggestions.length === 0) {
        const suggestionsList = document.getElementById("suggestions-list");
        suggestionsList.innerHTML =
          '<div class="no-suggestions">No suggestions remaining</div>';

        const applyAllButton = document.getElementById("apply-all-button");
        if (applyAllButton) {
          applyAllButton.style.display = "none";
        }
      }
    }, 300);
  }
}

// Handle "Get Suggestions" button click
function handleGetSuggestions() {
  const getSuggestionsButton = document.getElementById(
    "get-suggestions-button"
  );

  if (getSuggestionsButton) {
    getSuggestionsButton.disabled = true;
    getSuggestionsButton.textContent = "Detecting fields...";
  }

  clearError();
  showLoading(true);

  // Trigger field detection on current page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      console.log("📤 Sending DETECT_FIELDS to tab:", tabs[0].id);
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "DETECT_FIELDS" },
        (response) => {
          showLoading(false);

          if (chrome.runtime.lastError) {
            console.error("⚠️ Content script error:", chrome.runtime.lastError);
            showError(
              "Content script not loaded. Please refresh the page and try again."
            );

            if (getSuggestionsButton) {
              getSuggestionsButton.disabled = false;
              getSuggestionsButton.textContent = "Get Autofill Suggestions";
            }
          } else {
            console.log("✅ Field detection response:", response);

            if (response && response.success) {
              if (response.sent) {
                // User approved and data was sent to backend
                // Wait a moment for the API response to be processed
                setTimeout(() => {
                  requestFieldData();
                }, 1000);
              } else {
                // User declined to send data
                showInfo(
                  response.message ||
                    "Field detection completed but data was not sent to backend."
                );

                if (getSuggestionsButton) {
                  getSuggestionsButton.disabled = false;
                  getSuggestionsButton.textContent = "Get Autofill Suggestions";
                }
              }
            } else {
              showError("Failed to detect fields. Please try again.");

              if (getSuggestionsButton) {
                getSuggestionsButton.disabled = false;
                getSuggestionsButton.textContent = "Get Autofill Suggestions";
              }
            }
          }
        }
      );
    } else {
      showLoading(false);
      showError("No active tab found.");

      if (getSuggestionsButton) {
        getSuggestionsButton.disabled = false;
        getSuggestionsButton.textContent = "Get Autofill Suggestions";
      }
    }
  });
}

// Initialize popup
function initialize() {
  console.log("🚀 AutoFlow popup initialized (MVP - No Auth)");

  checkAPIStatus();

  // Add event listener to "Get Suggestions" button
  const getSuggestionsButton = document.getElementById(
    "get-suggestions-button"
  );
  if (getSuggestionsButton) {
    getSuggestionsButton.addEventListener("click", handleGetSuggestions);
  }

  // Request any existing field data (in case user had previous suggestions)
  requestFieldData();
}

// Run on popup load
document.addEventListener("DOMContentLoaded", initialize);
