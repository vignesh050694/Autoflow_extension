# Chrome Extension Profile Dropdown Feature

## Overview

Added a profile dropdown to the Chrome extension popup, allowing users to select which profile context to use for autofill directly from the extension.

## Changes Made

### 1. **popup.html**

- Added profile selector dropdown above the "Get Autofill Suggestions" button
- Added refresh button to reload profiles from backend
- Clean, consistent styling with the rest of the popup

### 2. **popup.js**

- **`loadProfiles()`** - Fetches profiles from backend API and populates dropdown
- **`saveSelectedProfile()`** - Saves selected profile to Chrome storage
- **`getSelectedProfile()`** - Gets currently selected profile
- Profile change listener with success notification
- Refresh button handler
- Loads saved profile on popup open

### 3. **background.js**

- Modified `sendFieldsToAPI()` to include `profile_id` in API request
- Reads selected profile from Chrome storage
- Sends `null` for default profile, actual profile_id for others
- Logs which profile is being used for each autofill request

## How It Works

### Profile Selection Flow

```
1. User opens extension popup
2. Extension loads profiles from backend (/api/profiles/)
3. Displays profiles with document counts
4. User selects profile (e.g., "Professional")
5. Selection saved to Chrome storage
6. User clicks "Get Autofill Suggestions"
7. Background script reads selected profile
8. Sends autofill request with profile_id
9. Backend filters by user_id + profile_id
10. Returns suggestions from selected profile only
```

### Storage

```javascript
// Saved in chrome.storage.local
{
  "selectedProfile": "professional"  // or "default", "founder", etc.
}
```

### API Integration

```javascript
// Extension sends:
{
  "url": "https://example.com/form",
  "fields": [...],
  "profile_id": "professional"  // or null for default
}

// Backend filters by:
Filter(
  must=[
    FieldCondition(key="user_id", match=...),
    FieldCondition(key="profile_id", match="professional")
  ]
)
```

## UI Features

### Profile Dropdown

- Shows "Default" by default
- Lists all profiles with document counts
  - Example: "Professional (5 docs)"
  - Example: "Founder (3 docs)"
- Updates instantly when changed
- Shows success message on switch

### Refresh Button

- Small 🔄 button next to label
- Reloads profiles from backend
- Useful after adding profiles via web app
- Shows success notification

### Profile Info

- Document counts shown in dropdown
- Helps users know which profile has data
- Empty profiles shown but marked with (0 docs)

## Example Usage

### Scenario 1: Job Application

```
1. User has uploaded professional resume to "Professional" profile
2. Opens job application form
3. Opens extension popup
4. Selects "Professional" from dropdown
5. Clicks "Get Autofill Suggestions"
6. Form fills with professional experience, skills, work email
```

### Scenario 2: Investor Form

```
1. User has uploaded pitch deck to "Founder" profile
2. Opens investor application form
3. Opens extension popup
4. Selects "Founder" from dropdown
5. Clicks "Get Autofill Suggestions"
6. Form fills with startup info, founder role, company details
```

### Scenario 3: Personal Form

```
1. User has uploaded personal documents to "Personal" profile
2. Opens personal information form
3. Opens extension popup
4. Selects "Personal" or keeps "Default"
5. Clicks "Get Autofill Suggestions"
6. Form fills with personal info, hobbies, personal email
```

## Benefits

1. **One-Click Context Switching** - No need to go to web app
2. **Inline with Workflow** - Select profile right before autofill
3. **Visual Feedback** - See document counts for each profile
4. **Persistent Selection** - Remembers last used profile
5. **Easy Refresh** - Update profile list without closing popup

## Code Snippets

### Loading Profiles

```javascript
async function loadProfiles() {
  const response = await fetch("http://localhost:8000/api/profiles/");
  const data = await response.json();

  // Populate dropdown with profiles
  data.profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.name.toLowerCase().replace(/\s+/g, "-");
    option.textContent = `${profile.name} (${profile.document_count} docs)`;
    dropdown.appendChild(option);
  });
}
```

### Sending with Profile

```javascript
async function sendFieldsToAPI(fieldData) {
  const { selectedProfile } = await chrome.storage.local.get([
    "selectedProfile",
  ]);

  const requestData = {
    ...fieldData,
    profile_id: selectedProfile === "default" ? null : selectedProfile,
  };

  await fetch("http://localhost:8000/api/fields", {
    method: "POST",
    body: JSON.stringify(requestData),
  });
}
```

## Testing

### Test Cases

1. ✅ Dropdown shows default profile
2. ✅ Loads profiles from backend
3. ✅ Shows document counts
4. ✅ Saves selection to storage
5. ✅ Loads saved selection on open
6. ✅ Sends profile_id in API request
7. ✅ Refresh button updates profiles
8. ✅ Success message on profile change
9. ✅ Works with no profiles (default only)
10. ✅ Backend filters correctly by profile

### Manual Testing Steps

1. Open extension popup
2. Verify "Default" is selected
3. Click refresh - verify profiles load
4. Select "Professional" - verify saved
5. Close and reopen - verify "Professional" still selected
6. Fill form - verify uses professional data
7. Change to "Founder" - verify uses founder data
8. Check backend logs - verify profile_id sent correctly

## Future Enhancements

1. **Profile Creation in Extension** - Add "Create Profile" button
2. **Profile Stats** - Show more details on hover
3. **Color Coding** - Different colors for different profile types
4. **Quick Switch** - Keyboard shortcuts (Ctrl+1, Ctrl+2, etc.)
5. **Profile Badges** - Visual badges for work/personal/custom
6. **Auto-detect** - Suggest profile based on form type
7. **Profile Sync** - Sync selected profile across devices

## Notes

- Profile dropdown appears above the autofill button
- Refresh button prevents stale profile list
- Default profile always available as fallback
- Profile selection persists across browser sessions
- Works seamlessly with existing autofill flow
- No breaking changes to existing functionality
