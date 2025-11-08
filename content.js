// Content script for form detection and field extraction

// Inject CSS styles for autofilled fields
function injectStyles() {
  if (document.getElementById("autoflow-styles")) {
    return; // Styles already injected
  }

  const style = document.createElement("style");
  style.id = "autoflow-styles";
  style.textContent = `
    .autofilled {
      background-color: #e8f5e9 !important;
      border: 2px solid #4caf50 !important;
      transition: all 0.3s ease;
    }
  `;
  document.head.appendChild(style);
}

// Check if an element is a custom element (web component)
function isCustomElement(element) {
  return element.tagName.includes("-");
}

// Try to access Shadow DOM input from a custom element
function findShadowInput(customElement) {
  if (!customElement.shadowRoot) {
    return null;
  }

  // Common input selectors inside shadow DOM
  const inputSelectors = [
    "input",
    "textarea",
    "select",
    '[role="textbox"]',
    '[role="combobox"]',
    '[contenteditable="true"]',
  ];

  for (const selector of inputSelectors) {
    const shadowInput = customElement.shadowRoot.querySelector(selector);
    if (shadowInput) {
      console.log(
        `Found shadow input in ${customElement.tagName}:`,
        shadowInput
      );
      return shadowInput;
    }
  }

  return null;
}

// Extract metadata from custom element attributes
function extractCustomElementMetadata(customElement) {
  const metadata = {
    tagName: customElement.tagName.toLowerCase(),
    id: customElement.id || "",
    name: customElement.getAttribute("name") || "",
    placeholder: customElement.getAttribute("placeholder") || "",
    label: customElement.getAttribute("label") || "",
    type: customElement.getAttribute("type") || "text",
    required: customElement.hasAttribute("required"),
    disabled: customElement.hasAttribute("disabled"),
  };

  // Check for common attribute patterns
  const attrs = customElement.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    // Capture amplify-child-path, formcontrolname, etc.
    if (
      attr.name.includes("path") ||
      attr.name.includes("name") ||
      attr.name.includes("control")
    ) {
      metadata.customAttribute = attr.name;
      metadata.customAttributeValue = attr.value;
    }
  }

  return metadata;
}

// Detect all forms on the page (including shadow DOM components)
function detectForms() {
  const allFields = [];

  // Check if this is a Google Form
  const isGoogleForm =
    window.location.hostname.includes("docs.google.com") &&
    window.location.pathname.includes("/forms/");

  if (isGoogleForm) {
    console.log("🎯 Google Forms detected! Using specialized detection...");
    const googleFields = detectGoogleFormsFields();
    console.log(`Found ${googleFields.length} Google Forms fields`);
    return googleFields;
  }

  const forms = document.querySelectorAll("form");
  console.log(`detectForms: Found ${forms.length} forms on page`);

  forms.forEach((form) => {
    console.log(`Processing form:`, form);
    const fields = extractFieldData(form);
    console.log(`Form yielded ${fields.length} fields`);
    allFields.push(...fields);
  });

  // Also look for standalone custom elements outside forms
  const customElements = document.querySelectorAll("*");
  customElements.forEach((element) => {
    if (
      isCustomElement(element) &&
      !element.closest("form") &&
      element.shadowRoot
    ) {
      const shadowInput = findShadowInput(element);
      if (shadowInput) {
        const metadata = extractCustomElementMetadata(element);
        const fieldData = {
          type: metadata.type,
          name: metadata.name || metadata.customAttributeValue || "",
          id: metadata.id,
          placeholder: metadata.placeholder,
          label: metadata.label,
          fieldPattern: "simple",
          interactionHint: "shadow_dom",
          isCustomElement: true,
          customElementTag: metadata.tagName,
          shadowInput: true,
        };
        allFields.push(fieldData);
        console.log("Custom element field detected:", fieldData);
      }
    }
  });

  return allFields;
}

// Find nearby buttons for an input field (for array-type interactions)
function findNearbyButton(inputElement, buttonTextPatterns) {
  const container = inputElement.parentElement;
  if (!container) return null;

  // Look for buttons within the same container and one level up
  const searchContainers = [container, container.parentElement];

  for (const searchContainer of searchContainers) {
    if (!searchContainer) continue;

    const buttons = searchContainer.querySelectorAll(
      'button, input[type="button"], input[type="submit"]'
    );

    for (const button of buttons) {
      const buttonText = button.textContent.trim().toLowerCase();
      const buttonValue = (button.value || "").toLowerCase();

      // Check if button matches any pattern
      for (const pattern of buttonTextPatterns) {
        const patternLower = pattern.toLowerCase();
        if (
          buttonText.includes(patternLower) ||
          buttonValue.includes(patternLower)
        ) {
          // Calculate distance to ensure proximity
          const inputRect = inputElement.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          const distance =
            Math.abs(inputRect.right - buttonRect.left) +
            Math.abs(inputRect.top - buttonRect.top);

          // If button is within 200px, consider it nearby
          if (distance < 200) {
            return button;
          }
        }
      }
    }
  }

  return null;
}

// Detect if field is part of an array pattern (input + Add button)
function detectArrayPattern(inputElement) {
  const addButton = findNearbyButton(inputElement, [
    "add",
    "+",
    "add more",
    "insert",
  ]);

  if (addButton) {
    return {
      isArrayField: true,
      addButton: addButton,
      addButtonText: addButton.textContent.trim(),
    };
  }

  return {
    isArrayField: false,
    addButton: null,
  };
}

// Detect trigger buttons that reveal dynamic sections
function detectTriggerButtons(rootElement = document.body) {
  const triggerButtons = [];
  const buttons = rootElement.querySelectorAll(
    'button, a.btn, div[role="button"]'
  );

  buttons.forEach((button) => {
    const text = button.textContent.trim().toLowerCase();

    // Common patterns for trigger buttons
    const triggerPatterns = [
      /\+\s*add/i,
      /add\s+\w+/i,
      /new\s+\w+/i,
      /more\s+\w+/i,
      /additional/i,
      /another/i,
    ];

    const isTrigger = triggerPatterns.some((pattern) => pattern.test(text));

    if (isTrigger) {
      triggerButtons.push({
        element: button,
        text: button.textContent.trim(),
        selector: button.id
          ? `#${button.id}`
          : button.className
          ? `.${button.className.split(" ")[0]}`
          : null,
      });
    }
  });

  console.log(
    `Detected ${triggerButtons.length} trigger buttons:`,
    triggerButtons
  );
  return triggerButtons;
}

// Detect Google Forms fields
function detectGoogleFormsFields() {
  const fields = [];

  // Google Forms uses specific data attributes for questions
  const questions = document.querySelectorAll('[role="listitem"]');

  console.log(`Found ${questions.length} Google Forms questions`);

  questions.forEach((question) => {
    // Get question text
    const questionText =
      question.querySelector('[role="heading"]')?.textContent?.trim() || "";

    // Find input elements within this question
    const textInputs = question.querySelectorAll(
      'input[type="text"], textarea'
    );
    const radioInputs = question.querySelectorAll('input[type="radio"]');
    const checkboxInputs = question.querySelectorAll('input[type="checkbox"]');
    const selectInputs = question.querySelectorAll("select");

    // Handle text inputs
    textInputs.forEach((input) => {
      const dataParams = input.getAttribute("data-params") || "";
      const ariaLabel = input.getAttribute("aria-label") || "";

      // Use questionText as the primary identifier for Google Forms
      // This ensures consistency between detection and application
      const fieldIdentifier =
        questionText || ariaLabel || input.name || input.id;

      if (!fieldIdentifier) {
        console.warn("Skipping Google Forms field without identifier");
        return;
      }

      fields.push({
        type: input.tagName.toLowerCase() === "textarea" ? "textarea" : "text",
        name: fieldIdentifier,
        id: input.id || "",
        placeholder: input.placeholder || "",
        label: questionText || ariaLabel,
        fieldPattern: "simple",
        interactionHint: "google_forms",
        isGoogleForms: true,
        dataParams: dataParams,
      });

      console.log(
        `Google Forms text field: "${questionText}" (identifier: "${fieldIdentifier}")`
      );
    });

    // Handle radio buttons
    if (radioInputs.length > 0) {
      const options = [];
      const radioName = radioInputs[0].name;

      // Use questionText as identifier for consistency
      const fieldIdentifier = questionText || radioName;

      if (!fieldIdentifier) {
        console.warn("Skipping Google Forms radio without identifier");
        return;
      }

      radioInputs.forEach((radio) => {
        const label = radio.getAttribute("aria-label") || radio.value;
        options.push({
          value: radio.value,
          label: label,
        });
      });

      fields.push({
        type: "radio",
        name: fieldIdentifier,
        id: radioInputs[0].id || "",
        placeholder: "",
        label: questionText,
        fieldPattern: "simple",
        interactionHint: "google_forms",
        isGoogleForms: true,
        options: options,
      });

      console.log(
        `Google Forms radio field: "${questionText}" (identifier: "${fieldIdentifier}") with ${options.length} options`
      );
    }

    // Handle checkboxes
    if (checkboxInputs.length > 0) {
      checkboxInputs.forEach((checkbox, idx) => {
        const checkboxLabel = checkbox.getAttribute("aria-label") || "";

        // Use checkbox aria-label or questionText as identifier
        const fieldIdentifier = checkboxLabel || questionText || checkbox.name;

        if (!fieldIdentifier) {
          console.warn("Skipping Google Forms checkbox without identifier");
          return;
        }

        fields.push({
          type: "checkbox",
          name: fieldIdentifier,
          id: checkbox.id || "",
          placeholder: "",
          label: checkboxLabel || questionText,
          fieldPattern: "simple",
          interactionHint: "google_forms",
          isGoogleForms: true,
          value: checkbox.value || "on",
        });
      });

      console.log(
        `Google Forms checkbox field: "${questionText}" (${checkboxInputs.length} options)`
      );
    }

    // Handle dropdowns
    selectInputs.forEach((select) => {
      // Use questionText as identifier for consistency
      const fieldIdentifier = questionText || select.name || select.id;

      if (!fieldIdentifier) {
        console.warn("Skipping Google Forms select without identifier");
        return;
      }

      const options = [];
      select.querySelectorAll("option").forEach((option) => {
        if (option.value) {
          options.push({
            value: option.value,
            label: option.textContent.trim(),
          });
        }
      });

      fields.push({
        type: "select",
        name: fieldIdentifier,
        id: select.id || "",
        placeholder: "",
        label: questionText,
        fieldPattern: "simple",
        interactionHint: "google_forms",
        isGoogleForms: true,
        options: options,
      });

      console.log(
        `Google Forms select field: "${questionText}" (identifier: "${fieldIdentifier}") with ${options.length} options`
      );
    });
  });

  return fields;
}

// Extract field data from a form element with enhanced pattern detection
function extractFieldData(formElement) {
  const fields = [];

  // Regular inputs
  const inputs = formElement.querySelectorAll("input, textarea, select");
  console.log(`Found ${inputs.length} regular inputs`);

  // Custom web components (shadow DOM)
  const customElements = formElement.querySelectorAll("*");
  const customInputs = [];

  console.log(
    `Scanning ${customElements.length} elements for custom components`
  );

  customElements.forEach((element) => {
    if (isCustomElement(element)) {
      console.log(
        `Found custom element: ${
          element.tagName
        }, has shadowRoot: ${!!element.shadowRoot}`
      );
      const shadowInput = findShadowInput(element);
      if (shadowInput) {
        console.log(
          `Shadow input found for ${element.tagName}:`,
          shadowInput.tagName
        );
        customInputs.push({ wrapper: element, input: shadowInput });
      } else {
        console.warn(`No shadow input found for ${element.tagName}`);
      }
    }
  });

  console.log(`Found ${customInputs.length} custom element inputs`);

  // Process regular inputs
  inputs.forEach((input) => {
    // Skip buttons, submit, hidden, and other non-data fields
    const type = input.type || input.tagName.toLowerCase();
    if (["submit", "button", "hidden", "image", "reset"].includes(type)) {
      return;
    }

    // Extract label with multiple strategies
    let label = "";
    if (input.id) {
      const labelElement = document.querySelector(`label[for="${input.id}"]`);
      if (labelElement) {
        label = labelElement.textContent.trim();
      }
    }
    // Fallback: check for parent label
    if (!label) {
      const parentLabel = input.closest("label");
      if (parentLabel) {
        label = parentLabel.textContent.trim();
      }
    }
    // Fallback: check for aria-label
    if (!label && input.getAttribute("aria-label")) {
      label = input.getAttribute("aria-label");
    }
    // Fallback: check for preceding text node or label-like element
    if (!label) {
      const prevSibling = input.previousElementSibling;
      if (
        prevSibling &&
        (prevSibling.tagName === "LABEL" || prevSibling.tagName === "SPAN")
      ) {
        label = prevSibling.textContent.trim();
      }
    }

    // Skip fields without a name or id (can't be identified later)
    if (!input.name && !input.id) {
      console.warn(`Skipping field without name or id:`, input);
      return;
    }

    // Detect array pattern
    const arrayPattern = detectArrayPattern(input);

    const fieldData = {
      type: type,
      name: input.name || "",
      id: input.id || "",
      placeholder: input.placeholder || "",
      label: label,
      fieldPattern: arrayPattern.isArrayField ? "array" : "simple",
      interactionHint: arrayPattern.isArrayField ? "type_and_add" : "direct",
    };

    // Store add button info if it's an array field
    if (arrayPattern.isArrayField) {
      fieldData.addButtonText = arrayPattern.addButtonText;
    }

    // Extract options for select dropdowns
    if (
      input.tagName.toLowerCase() === "select" ||
      type === "select-one" ||
      type === "select-multiple"
    ) {
      const options = [];
      input.querySelectorAll("option").forEach((option) => {
        options.push({
          value: option.value,
          text: option.textContent.trim(),
        });
      });
      fieldData.options = options;
      console.log(`Select field detected: ${input.name}, options:`, options);
    }

    // Extract options for radio buttons (group by name)
    if (type === "radio") {
      const radioGroup = formElement.querySelectorAll(
        `input[type="radio"][name="${input.name}"]`
      );
      const options = [];
      radioGroup.forEach((radio) => {
        // Get label for this specific radio button
        let radioLabel = "";
        if (radio.id) {
          const radioLabelElement = document.querySelector(
            `label[for="${radio.id}"]`
          );
          if (radioLabelElement) {
            radioLabel = radioLabelElement.textContent.trim();
          }
        }
        if (!radioLabel) {
          const parentLabel = radio.closest("label");
          if (parentLabel) {
            radioLabel = parentLabel.textContent.trim();
          }
        }

        options.push({
          value: radio.value,
          text: radioLabel || radio.value,
        });
      });
      fieldData.options = options;
    }

    // Extract value for checkbox
    if (type === "checkbox") {
      fieldData.value = input.value || "on";
      fieldData.checked = input.checked;
    }

    console.log(`Field extracted:`, fieldData);
    fields.push(fieldData);
  });

  // Process custom web components with shadow DOM
  customInputs.forEach(({ wrapper, input }) => {
    const metadata = extractCustomElementMetadata(wrapper);
    const type = input.type || input.tagName.toLowerCase();

    // Skip non-data fields
    if (["submit", "button", "hidden", "image", "reset"].includes(type)) {
      return;
    }

    // Skip if no identifier
    if (!metadata.name && !metadata.id) {
      console.warn(`Skipping custom element without name or id:`, wrapper);
      return;
    }

    // Detect array pattern for custom elements
    const arrayPattern = detectArrayPattern(wrapper);

    const fieldData = {
      type: type,
      name: metadata.name || metadata.customAttributeValue || "",
      id: metadata.id,
      placeholder: metadata.placeholder,
      label: metadata.label,
      fieldPattern: arrayPattern.isArrayField ? "array" : "simple",
      interactionHint: arrayPattern.isArrayField
        ? "type_and_add"
        : "shadow_dom",
      isCustomElement: true,
      customElementTag: metadata.tagName,
      shadowInput: true,
    };

    if (arrayPattern.isArrayField) {
      fieldData.addButtonText = arrayPattern.addButtonText;
    }

    console.log(`Custom element field extracted:`, fieldData);
    fields.push(fieldData);
  });

  return fields;
}

// Scroll through page and detect all forms
async function scrollAndDetectAllForms() {
  // Store original scroll position
  const originalScrollY = window.scrollY;

  // Set to track unique form elements to avoid duplicates
  const detectedElements = new Set();
  const allFields = [];

  // Get viewport height for scrolling increments
  const viewportHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;

  // Maximum timeout: 30 seconds
  const maxTimeout = 30000;
  const startTime = Date.now();

  // Scroll to top first
  window.scrollTo(0, 0);
  await sleep(500); // Wait for content to render

  let currentPosition = 0;

  while (currentPosition < documentHeight) {
    // Check timeout
    if (Date.now() - startTime > maxTimeout) {
      console.warn("Scroll detection timeout reached");
      break;
    }

    // Detect forms at current position
    const fields = detectForms();

    // Add fields, deduplicating by element reference
    fields.forEach((field) => {
      // Create unique key based on field properties
      const fieldKey = `${field.type}-${field.name}-${field.id}-${field.placeholder}`;

      if (!detectedElements.has(fieldKey)) {
        detectedElements.add(fieldKey);
        allFields.push(field);
      }
    });

    // Scroll down by viewport height
    currentPosition += viewportHeight;
    window.scrollTo(0, currentPosition);

    // Wait for lazy-loaded content to render
    await sleep(500);
  }

  // Restore original scroll position
  window.scrollTo(0, originalScrollY);

  console.log(
    `Scroll detection complete. Found ${allFields.length} unique fields.`
  );
  return allFields;
}

// Helper function for delays
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Send extracted fields to background script (enhanced with patterns)
function sendFieldsToBackground(fields) {
  if (fields.length > 0) {
    // Detect trigger buttons on the page
    const triggerButtons = detectTriggerButtons();

    chrome.runtime.sendMessage(
      {
        type: "FIELDS_DETECTED",
        data: {
          url: window.location.href,
          timestamp: Date.now(),
          fields: fields,
          triggerButtons: triggerButtons.map((tb) => ({
            text: tb.text,
            selector: tb.selector,
          })),
          hasArrayFields: fields.some((f) => f.fieldPattern === "array"),
          hasTriggerButtons: triggerButtons.length > 0,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
        } else {
          console.log("Fields sent to background:", response);
        }
      }
    );
  }
}

// Track dynamically added fields for smart detection
let dynamicFieldsCache = new Map();
let pendingSuggestions = new Map(); // Store suggestions waiting for fields to appear
let customElementStrategies = new Map(); // Cache interaction strategies for custom elements

// Analyze a custom element and determine best interaction strategy
async function analyzeCustomElement(customElement) {
  const tagName = customElement.tagName.toLowerCase();

  // Check cache first
  if (customElementStrategies.has(tagName)) {
    console.log(`Using cached strategy for ${tagName}`);
    return customElementStrategies.get(tagName);
  }

  console.log(`Analyzing custom element: ${tagName}`);

  const strategy = {
    tagName: tagName,
    hasShadowRoot: !!customElement.shadowRoot,
    shadowInputSelector: null,
    supportsValueProperty: false,
    supportsSetValueMethod: false,
    requiredEvents: ["input", "change", "blur"],
    frameworkHint: null,
  };

  // Check for shadow DOM
  if (customElement.shadowRoot) {
    const shadowInput = findShadowInput(customElement);
    if (shadowInput) {
      strategy.shadowInputSelector = shadowInput.tagName.toLowerCase();
    }
  }

  // Check for value property
  try {
    if ("value" in customElement) {
      strategy.supportsValueProperty = true;
    }
  } catch (e) {}

  // Check for setValue method
  if (typeof customElement.setValue === "function") {
    strategy.supportsSetValueMethod = true;
  }

  // Detect framework from tag prefix
  if (tagName.startsWith("zbk-")) {
    strategy.frameworkHint = "Dropbox Components";
  } else if (tagName.startsWith("mat-")) {
    strategy.frameworkHint = "Angular Material";
  } else if (tagName.startsWith("amplify-")) {
    strategy.frameworkHint = "AWS Amplify";
  } else if (tagName.startsWith("ion-")) {
    strategy.frameworkHint = "Ionic";
  }

  // Cache the strategy
  customElementStrategies.set(tagName, strategy);

  console.log(`Strategy for ${tagName}:`, strategy);
  return strategy;
}

// Observe DOM changes for dynamically added forms and fields
function observeDOMChanges() {
  let debounceTimer;

  const observer = new MutationObserver((mutations) => {
    let hasNewFields = false;
    let newFields = [];

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Element node
          // Check for new forms
          if (node.tagName === "FORM" || node.querySelector("form")) {
            hasNewFields = true;
            console.log("New form detected on page");
          }

          // Check for new input fields
          if (
            node.tagName === "INPUT" ||
            node.tagName === "TEXTAREA" ||
            node.tagName === "SELECT"
          ) {
            hasNewFields = true;
            newFields.push(node);
            console.log("New field detected:", node.name || node.id);
          }

          // Check for custom elements (web components)
          if (isCustomElement(node)) {
            hasNewFields = true;
            newFields.push(node);
            console.log("New custom element detected:", node.tagName);

            // Analyze it asynchronously
            analyzeCustomElement(node).catch((e) =>
              console.error("Error analyzing custom element:", e)
            );
          }

          // Check for fields within added nodes
          const inputs = node.querySelectorAll?.("input, textarea, select");
          if (inputs && inputs.length > 0) {
            hasNewFields = true;
            newFields.push(...inputs);
            console.log(`${inputs.length} new fields detected in added node`);
          }

          // Check for custom elements within added nodes
          const customElements = node.querySelectorAll?.("*");
          if (customElements) {
            customElements.forEach((element) => {
              if (isCustomElement(element)) {
                hasNewFields = true;
                newFields.push(element);
                console.log("New custom element detected:", element.tagName);

                // Analyze it asynchronously
                analyzeCustomElement(element).catch((e) =>
                  console.error("Error analyzing custom element:", e)
                );
              }
            });
          }
        }
      });
    });

    if (hasNewFields) {
      // Debounce: wait 500ms before processing (performance optimization)
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Check if we have pending suggestions for these new fields
        newFields.forEach((field) => {
          const fieldId = field.name || field.id;
          if (fieldId && pendingSuggestions.has(fieldId)) {
            console.log(
              `Applying pending suggestion to newly appeared field: ${fieldId}`
            );
            const suggestion = pendingSuggestions.get(fieldId);
            applyValueToField(
              fieldId,
              suggestion.suggested_value,
              suggestion.field_pattern,
              suggestion.interaction_hint
            ).then(() => {
              pendingSuggestions.delete(fieldId);
            });
          }
        });

        // Update cache with new fields
        newFields.forEach((field) => {
          const fieldId = field.name || field.id;
          if (fieldId) {
            dynamicFieldsCache.set(fieldId, field);
          }
        });
      }, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false, // Don't observe attribute changes for performance
  });

  return observer;
}

// Initialize on page load
async function initialize() {
  console.log("🚀 AutoFlow content script loaded!");
  console.log("🔍 Page URL:", window.location.href);

  // Inject CSS styles for visual feedback
  injectStyles();

  // Only detect forms without scrolling automatically
  // Do NOT send to background - wait for user permission
  console.log("✅ AutoFlow ready. Waiting for user action...");

  // Start observing for dynamic forms (but don't send automatically)
  observeDOMChanges();

  // Log custom elements found immediately
  setTimeout(() => {
    const customEls = document.querySelectorAll("*");
    let customCount = 0;
    customEls.forEach((el) => {
      if (el.tagName.includes("-")) {
        customCount++;
        console.log(
          `📦 Custom element found: ${
            el.tagName
          }, shadowRoot: ${!!el.shadowRoot}`
        );
      }
    });
    console.log(`📊 Total custom elements on page: ${customCount}`);
  }, 500);
}

// Click a trigger button and wait for dynamic content to appear
async function clickTriggerButton(triggerSelector, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const button = document.querySelector(triggerSelector);

      if (!button) {
        console.warn(`Trigger button not found: ${triggerSelector}`);
        if (attempt < maxRetries - 1) {
          await sleep(500);
          continue;
        }
        return { success: false, error: "Button not found" };
      }

      // Scroll button into view
      button.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(200);

      // Click the button
      button.click();
      console.log(`Clicked trigger button: ${triggerSelector}`);

      // Wait for dynamic content to appear
      await sleep(800);

      return { success: true };
    } catch (error) {
      console.error(
        `Error clicking trigger button (attempt ${attempt + 1}):`,
        error
      );
      if (attempt < maxRetries - 1) {
        await sleep(500);
      } else {
        return { success: false, error: error.message };
      }
    }
  }
}

// Apply nested section data (click trigger, then fill fields)
async function applyNestedSection(sectionData) {
  console.log("Applying nested section:", sectionData);

  // Click the trigger button first
  if (sectionData.trigger) {
    const triggerResult = await clickTriggerButton(sectionData.trigger);
    if (!triggerResult.success) {
      return {
        success: false,
        error: `Failed to click trigger: ${triggerResult.error}`,
      };
    }
  }

  // Now fill the fields within this section
  const results = [];

  for (const [fieldId, value] of Object.entries(sectionData.fields || {})) {
    const result = await applyValueToField(fieldId, value, "simple", "direct");
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;

  return {
    success: successCount > 0,
    results: results,
    message: `Filled ${successCount}/${results.length} fields in section`,
  };
}

// Apply value to an array field (type each value and click Add button)
async function applyArrayValues(field, values, addButton) {
  console.log(
    `Applying array values to field: ${field.name || field.id}`,
    values
  );

  const results = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    try {
      // Focus the field first
      field.focus();
      await sleep(50);

      // Set the value
      field.value = value;

      // Dispatch input event
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));

      // Wait a bit for UI to process
      await sleep(150);

      // Click the Add button
      if (addButton) {
        addButton.click();
        console.log(`Clicked Add button for value: ${value}`);

        // Wait for the UI to update (add the chip/tag)
        await sleep(400);

        results.push({ success: true, value: value });
      } else {
        // Fallback: just press Enter
        field.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          })
        );
        field.dispatchEvent(
          new KeyboardEvent("keypress", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          })
        );
        await sleep(300);
        results.push({ success: true, value: value });
      }
    } catch (error) {
      console.error(`Error adding array value ${value}:`, error);
      results.push({ success: false, value: value, error: error.message });
    }
  }

  return results;
}

// Apply value to Google Forms field
async function applyGoogleFormsValue(fieldIdentifier, value) {
  console.log(`🔍 Applying Google Forms value to: "${fieldIdentifier}"`);
  console.log(`   Value to apply: "${value}"`);

  try {
    // Find all questions
    const questions = document.querySelectorAll('[role="listitem"]');
    console.log(`   Found ${questions.length} questions on form`);

    for (const question of questions) {
      const questionText =
        question.querySelector('[role="heading"]')?.textContent?.trim() || "";

      // Find text inputs
      const textInputs = question.querySelectorAll(
        'input[type="text"], textarea'
      );
      for (const input of textInputs) {
        const inputName = input.name || "";
        const inputId = input.id || "";
        const ariaLabel = input.getAttribute("aria-label") || "";

        console.log(
          `   Checking text input: name="${inputName}", id="${inputId}", question="${questionText}", aria="${ariaLabel}"`
        );

        // Match by name, id, question text, or aria-label
        if (
          inputName === fieldIdentifier ||
          inputId === fieldIdentifier ||
          questionText === fieldIdentifier ||
          ariaLabel === fieldIdentifier ||
          questionText.toLowerCase().includes(fieldIdentifier.toLowerCase()) ||
          fieldIdentifier.toLowerCase().includes(questionText.toLowerCase())
        ) {
          console.log(`   ✅ MATCH FOUND! Filling text field...`);

          input.focus();
          await sleep(100);

          // Set value using multiple methods
          input.value = value;
          input.setAttribute("value", value);

          // Trigger Google Forms events
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("blur", { bubbles: true }));

          input.classList.add("autofilled");
          setTimeout(() => input.classList.remove("autofilled"), 2000);

          console.log(`✅ Filled Google Forms text field: ${questionText}`);
          return { success: true, field: fieldIdentifier };
        }
      }

      // Find radio buttons
      const radioInputs = question.querySelectorAll('input[type="radio"]');
      if (radioInputs.length > 0) {
        const radioName = radioInputs[0].name || "";
        console.log(
          `   Checking radio group: name="${radioName}", question="${questionText}"`
        );

        if (
          radioName === fieldIdentifier ||
          questionText === fieldIdentifier ||
          questionText.toLowerCase().includes(fieldIdentifier.toLowerCase()) ||
          fieldIdentifier.toLowerCase().includes(questionText.toLowerCase())
        ) {
          console.log(`   ✅ MATCH FOUND! Looking for radio option...`);

          for (const radio of radioInputs) {
            const label = radio.getAttribute("aria-label") || "";
            const radioValue = radio.value || "";

            console.log(
              `      Checking radio option: "${label}" (value="${radioValue}")`
            );

            if (
              label.toLowerCase().includes(value.toLowerCase()) ||
              radioValue.toLowerCase().includes(value.toLowerCase()) ||
              value.toLowerCase().includes(label.toLowerCase())
            ) {
              console.log(`      ✅ Clicking radio option: "${label}"`);
              radio.click();
              await sleep(200);
              console.log(`✅ Selected Google Forms radio: ${label}`);
              return { success: true, field: fieldIdentifier };
            }
          }
        }
      }

      // Find checkboxes
      const checkboxInputs = question.querySelectorAll(
        'input[type="checkbox"]'
      );
      for (const checkbox of checkboxInputs) {
        const label = checkbox.getAttribute("aria-label") || "";
        const checkboxName = checkbox.name || "";

        console.log(
          `   Checking checkbox: name="${checkboxName}", label="${label}", question="${questionText}"`
        );

        if (
          checkboxName === fieldIdentifier ||
          label === fieldIdentifier ||
          questionText === fieldIdentifier ||
          questionText.toLowerCase().includes(fieldIdentifier.toLowerCase()) ||
          fieldIdentifier.toLowerCase().includes(questionText.toLowerCase())
        ) {
          const shouldCheck = typeof value === "boolean" ? value : true;

          console.log(`   ✅ MATCH FOUND! Should check: ${shouldCheck}`);

          if (shouldCheck && !checkbox.checked) {
            checkbox.click();
            await sleep(200);
          } else if (!shouldCheck && checkbox.checked) {
            checkbox.click();
            await sleep(200);
          }
          console.log(`✅ Updated Google Forms checkbox: ${label}`);
          return { success: true, field: fieldIdentifier };
        }
      }

      // Find dropdowns
      const selects = question.querySelectorAll("select");
      for (const select of selects) {
        const selectName = select.name || "";
        const selectId = select.id || "";

        console.log(
          `   Checking select: name="${selectName}", id="${selectId}", question="${questionText}"`
        );

        if (
          selectName === fieldIdentifier ||
          selectId === fieldIdentifier ||
          questionText === fieldIdentifier ||
          questionText.toLowerCase().includes(fieldIdentifier.toLowerCase()) ||
          fieldIdentifier.toLowerCase().includes(questionText.toLowerCase())
        ) {
          console.log(`   ✅ MATCH FOUND! Looking for option...`);

          for (const option of select.options) {
            const optionText = option.textContent.trim();
            const optionValue = option.value;

            console.log(
              `      Checking option: "${optionText}" (value="${optionValue}")`
            );

            if (
              optionText.toLowerCase().includes(value.toLowerCase()) ||
              optionValue === value ||
              value.toLowerCase().includes(optionText.toLowerCase())
            ) {
              console.log(`      ✅ Selecting option: "${optionText}"`);
              select.value = optionValue;
              select.dispatchEvent(new Event("change", { bubbles: true }));
              console.log(`✅ Selected Google Forms option: ${optionText}`);
              return { success: true, field: fieldIdentifier };
            }
          }
        }
      }
    }

    console.error(`❌ Field not found: "${fieldIdentifier}"`);
    console.log(`   Available questions on form:`);
    questions.forEach((q, idx) => {
      const qText =
        q.querySelector('[role="heading"]')?.textContent?.trim() ||
        "No heading";
      console.log(`   ${idx + 1}. "${qText}"`);
    });

    return { success: false, field: fieldIdentifier, error: "Field not found" };
  } catch (error) {
    console.error(`❌ Error applying Google Forms value:`, error);
    return { success: false, field: fieldIdentifier, error: error.message };
  }
}

// Apply a single suggestion to a form field (enhanced with pattern detection)
async function applyValueToField(
  fieldIdentifier,
  value,
  fieldPattern = "simple",
  interactionHint = "direct",
  retryOnFailure = true
) {
  console.log(`\n🎯 applyValueToField called:`);
  console.log(`   Field: ${fieldIdentifier}`);
  console.log(`   Value: ${value}`);
  console.log(`   Pattern: ${fieldPattern}`);
  console.log(`   Hint: ${interactionHint}`);

  try {
    // Handle Google Forms
    if (interactionHint === "google_forms") {
      return await applyGoogleFormsValue(fieldIdentifier, value);
    }

    // Handle nested section data (has trigger and fields)
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.trigger &&
      value.fields
    ) {
      return await applyNestedSection(value);
    }

    // Handle nested array (multiple sections)
    if (fieldPattern === "nested_array" && Array.isArray(value)) {
      const results = [];
      for (const sectionData of value) {
        const result = await applyNestedSection(sectionData);
        results.push(result);
      }
      const successCount = results.filter((r) => r.success).length;
      return {
        success: successCount > 0,
        field: fieldIdentifier,
        nestedResults: results,
        message: `Filled ${successCount}/${value.length} nested sections`,
      };
    }

    // Validate fieldIdentifier
    if (!fieldIdentifier || fieldIdentifier.trim() === "") {
      console.error("Invalid field identifier: empty or null");
      return {
        success: false,
        field: fieldIdentifier,
        error: "Invalid field identifier",
      };
    }

    let field = null;
    let shadowInput = null;
    let customElementWrapper = null;

    // If interaction hint is shadow_dom, skip regular selectors and go straight to custom elements
    if (interactionHint === "shadow_dom") {
      console.log(
        `🎯 Shadow DOM hint detected, searching for custom element with identifier: ${fieldIdentifier}`
      );

      // Try to find custom element by various attributes
      const customElementSelectors = [
        `[name="${fieldIdentifier}"]`,
        `#${CSS.escape(fieldIdentifier)}`,
        `[amplify-child-path="${fieldIdentifier}"]`,
        `[formcontrolname="${fieldIdentifier}"]`,
      ];

      for (const customSelector of customElementSelectors) {
        try {
          console.log(`   Trying selector: ${customSelector}`);
          const element = document.querySelector(customSelector);
          console.log(`   Found element:`, element?.tagName);

          if (element && isCustomElement(element)) {
            console.log(`   ✅ Is custom element, looking for shadow input`);
            customElementWrapper = element;
            shadowInput = findShadowInput(element);
            if (shadowInput) {
              console.log(
                `   ✅ Found shadow input for ${fieldIdentifier}:`,
                shadowInput.tagName
              );
              field = shadowInput; // Use shadow input for filling
              break;
            } else {
              console.log(`   ❌ No shadow input found`);
            }
          } else if (element) {
            console.log(`   ⚠️ Element found but not a custom element`);
          }
        } catch (e) {
          console.log(`   ❌ Selector error:`, e.message);
          continue;
        }
      }
    } else {
      // Regular field lookup for non-shadow DOM fields
      let selector = "";
      if (fieldIdentifier) {
        // Escape special characters in selector
        const escapedId = CSS.escape(fieldIdentifier);
        selector = `[name="${escapedId}"], #${escapedId}`;
      }

      field = selector ? document.querySelector(selector) : null;

      // If field not found, check if it's in the cache or wait for it
      if (!field && dynamicFieldsCache.has(fieldIdentifier)) {
        field = dynamicFieldsCache.get(fieldIdentifier);
      }
    }

    // Check if it's a custom element with shadow DOM (fallback if not found above)
    if (!field && interactionHint !== "shadow_dom") {
      console.log(
        `🔍 Searching for custom element with identifier: ${fieldIdentifier}`
      );

      // Try to find custom element by various attributes
      const customElementSelectors = [
        `[name="${fieldIdentifier}"]`,
        `#${CSS.escape(fieldIdentifier)}`,
        `[amplify-child-path="${fieldIdentifier}"]`,
        `[formcontrolname="${fieldIdentifier}"]`,
      ];

      for (const customSelector of customElementSelectors) {
        try {
          console.log(`   Trying selector: ${customSelector}`);
          const element = document.querySelector(customSelector);
          console.log(`   Found element:`, element?.tagName);

          if (element && isCustomElement(element)) {
            console.log(`   ✅ Is custom element, looking for shadow input`);
            customElementWrapper = element;
            shadowInput = findShadowInput(element);
            if (shadowInput) {
              console.log(
                `   ✅ Found shadow input for ${fieldIdentifier}:`,
                shadowInput.tagName
              );
              field = shadowInput; // Use shadow input for filling
              break;
            } else {
              console.log(`   ❌ No shadow input found`);
            }
          } else if (element) {
            console.log(`   ⚠️ Element found but not a custom element`);
          }
        } catch (e) {
          console.log(`   ❌ Selector error:`, e.message);
          // Invalid selector, continue
          continue;
        }
      }
    }

    if (!field) {
      // Store as pending suggestion if field might appear dynamically
      if (retryOnFailure) {
        console.log(`Field not found, storing as pending: ${fieldIdentifier}`);
        pendingSuggestions.set(fieldIdentifier, {
          field_identifier: fieldIdentifier,
          suggested_value: value,
          field_pattern: fieldPattern,
          interaction_hint: interactionHint,
        });
      }

      console.error(`Field not found: ${fieldIdentifier}`);
      return {
        success: false,
        field: fieldIdentifier,
        error: "Field not found (saved as pending)",
        pending: true,
      };
    }

    // Check if field is accessible (not disabled or readonly)
    if (field.disabled || field.readOnly) {
      console.warn(`Field is not accessible: ${fieldIdentifier}`);
      return {
        success: false,
        field: fieldIdentifier,
        error: "Field is disabled or readonly",
      };
    }

    // Scroll field into view
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(200);

    // Handle array fields
    if (fieldPattern === "array" && Array.isArray(value)) {
      const addButton = findNearbyButton(field, [
        "add",
        "+",
        "add more",
        "insert",
      ]);
      const arrayResults = await applyArrayValues(field, value, addButton);

      const successCount = arrayResults.filter((r) => r.success).length;

      return {
        success: successCount > 0,
        field: fieldIdentifier,
        arrayResults: arrayResults,
        message: `Added ${successCount}/${value.length} values`,
      };
    }

    // Handle simple fields
    const finalValue = Array.isArray(value) ? value.join(", ") : value;

    console.log(`📝 Filling field with value: "${finalValue}"`);
    console.log(`   Field element:`, field.tagName);
    console.log(`   Is shadow input:`, !!customElementWrapper);

    // If it's a shadow DOM element, prefer setting on wrapper
    if (customElementWrapper) {
      console.log(`   🔄 Setting value on custom element wrapper first`);
      console.log(`   Wrapper tag: ${customElementWrapper.tagName}`);
      console.log(`   Shadow input tag: ${field.tagName}`);
      console.log(`   Shadow input type: ${field.type}`);

      // Focus the shadow input directly (not the wrapper)
      console.log(`   🎯 Focusing shadow input...`);
      field.focus();
      await sleep(100);
      console.log(
        `   Active element after focus:`,
        document.activeElement?.tagName
      );

      // Set value directly on shadow input
      console.log(`   📝 Setting value on shadow input...`);
      const oldValue = field.value;
      field.value = finalValue;
      console.log(`   Old value: "${oldValue}"`);
      console.log(`   New value: "${field.value}"`);
      console.log(`   Value set successfully: ${field.value === finalValue}`);

      // Dispatch events on shadow input FIRST (most important)
      console.log(`   📢 Dispatching events on shadow input...`);
      field.dispatchEvent(
        new Event("input", { bubbles: true, composed: true })
      );
      field.dispatchEvent(
        new Event("change", { bubbles: true, composed: true })
      );

      // Then try setting on wrapper if it has value property
      console.log(`   🔄 Attempting to set on wrapper...`);
      try {
        if ("value" in customElementWrapper) {
          customElementWrapper.value = finalValue;
          console.log(`   ✅ Wrapper value set: ${customElementWrapper.value}`);
        } else {
          console.log(`   ⚠️ Wrapper has no .value property`);
        }
      } catch (e) {
        console.log(`   ⚠️ Error setting wrapper value:`, e.message);
      }

      // Dispatch events on wrapper for framework detection
      console.log(`   📢 Dispatching events on wrapper...`);
      customElementWrapper.dispatchEvent(
        new Event("input", { bubbles: true, composed: true })
      );
      customElementWrapper.dispatchEvent(
        new Event("change", { bubbles: true, composed: true })
      );

      // Blur the shadow input to trigger validation
      console.log(`   👋 Blurring shadow input...`);
      field.blur();
      field.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
      customElementWrapper.dispatchEvent(
        new Event("blur", { bubbles: true, composed: true })
      );

      // Try common framework-specific methods
      console.log(`   🔧 Trying framework-specific methods...`);
      if (typeof customElementWrapper.setValue === "function") {
        console.log(`   Calling setValue()`);
        customElementWrapper.setValue(finalValue);
      }
      if (typeof customElementWrapper.updateValue === "function") {
        console.log(`   Calling updateValue()`);
        customElementWrapper.updateValue(finalValue);
      }

      console.log(`   ✅ Shadow DOM fill complete`);
    } else {
      // Regular field (not custom element)
      field.focus();
      await sleep(50);
      field.value = finalValue;
      console.log(`   ✅ Value set on regular field: ${field.value}`);

      // Dispatch input and change events to trigger form validation
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.dispatchEvent(new Event("blur", { bubbles: true }));
      console.log(`   ✅ Events dispatched on regular field`);
    }

    // Add visual feedback with 'autofilled' CSS class
    // Apply to wrapper if it's a custom element, otherwise to the field itself
    const elementToHighlight = customElementWrapper || field;
    elementToHighlight.classList.add("autofilled");
    setTimeout(() => {
      elementToHighlight.classList.remove("autofilled");
    }, 2000);

    console.log(`✅ Successfully applied value to field: ${fieldIdentifier}`);
    return {
      success: true,
      field: fieldIdentifier,
      usedShadowDOM: !!customElementWrapper,
    };
  } catch (error) {
    console.error(`Error applying value to field ${fieldIdentifier}:`, error);
    return {
      success: false,
      field: fieldIdentifier,
      error: error.message,
    };
  }
}

// Apply all suggestions to form fields (with async support)
async function applyAllSuggestions(suggestions) {
  console.log(`\n🔄 Starting to apply ${suggestions.length} suggestions...`);

  if (!suggestions || suggestions.length === 0) {
    console.warn("⚠️ No suggestions to apply!");
    return {
      results: [],
      summary: { total: 0, succeeded: 0, failed: 0 },
    };
  }

  const results = [];

  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];
    console.log(
      `\n--- Processing suggestion ${i + 1}/${suggestions.length} ---`
    );
    console.log("Suggestion details:", {
      field_identifier: suggestion.field_identifier,
      suggested_value: suggestion.suggested_value,
      field_pattern: suggestion.field_pattern,
      interaction_hint: suggestion.interaction_hint,
    });

    const result = await applyValueToField(
      suggestion.field_identifier,
      suggestion.suggested_value,
      suggestion.field_pattern || "simple",
      suggestion.interaction_hint || "direct"
    );

    console.log(`Result for field ${suggestion.field_identifier}:`, result);
    results.push(result);

    // Small delay between fields for better visual feedback
    await sleep(100);
  }

  // Count successes and failures
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  console.log(`\n📊 Final Summary:`);
  console.log(`   ✅ Succeeded: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}`);
  console.log(`   📝 Total: ${suggestions.length}`);

  return {
    results: results,
    summary: {
      total: suggestions.length,
      succeeded: successCount,
      failed: failureCount,
    },
  };
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);

  if (message.type === "PING") {
    console.log("🏓 PING received, responding with PONG");
    sendResponse({ success: true, message: "Content script is loaded" });
    return true;
  }

  if (message.type === "DETECT_FIELDS") {
    // Manually trigger field detection - user clicking extension is permission
    console.log("✅ Manual field detection triggered by user");

    // Wait a bit for custom elements to be ready, then detect visible fields
    // (No scrolling to avoid disrupting user experience)
    setTimeout(() => {
      const fields = detectForms();
      console.log(
        `📊 Detected ${fields.length} fields (including custom elements)`
      );

      // Automatically send to backend - user already gave permission by clicking extension
      if (fields.length > 0) {
        sendFieldsToBackground(fields);
        sendResponse({
          success: true,
          fieldCount: fields.length,
          sent: true,
          message: `Detected ${fields.length} fields`,
        });
      } else {
        sendResponse({
          success: false,
          fieldCount: 0,
          sent: false,
          message: "No form fields detected on this page",
        });
      }
    }, 300); // Wait 300ms for custom elements to initialize

    return true; // Keep channel open for async response
  }

  if (message.type === "APPLY_SUGGESTION") {
    console.log("\n🎯 ========== APPLY SINGLE SUGGESTION STARTED ==========");
    console.log(
      "📦 Received suggestion:",
      JSON.stringify(message.data, null, 2)
    );
    console.log("📍 Field identifier:", message.data?.field_identifier);
    console.log("📝 Suggested value:", message.data?.suggested_value);
    console.log("🎨 Field pattern:", message.data?.field_pattern);
    console.log("🔄 Interaction hint:", message.data?.interaction_hint);

    // Validate data
    if (!message.data) {
      console.error("❌ No data in message!");
      sendResponse({ success: false, error: "No suggestion data provided" });
      return true;
    }

    if (!message.data.field_identifier) {
      console.error("❌ No field_identifier in suggestion data!");
      sendResponse({ success: false, error: "Missing field_identifier" });
      return true;
    }

    // Apply a single suggestion (async)
    applyValueToField(
      message.data.field_identifier,
      message.data.suggested_value,
      message.data.field_pattern || "simple",
      message.data.interaction_hint || "direct"
    )
      .then((result) => {
        console.log("✅ Apply single completed:", result);
        console.log(
          "🎯 ========== APPLY SINGLE SUGGESTION FINISHED ==========\n"
        );
        sendResponse(result);
      })
      .catch((error) => {
        console.error("❌ Apply single failed:", error);
        console.error("❌ Error stack:", error.stack);
        console.log(
          "🎯 ========== APPLY SINGLE SUGGESTION FAILED ==========\n"
        );
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === "APPLY_ALL_SUGGESTIONS") {
    console.log("\n🎨 ========== APPLY ALL SUGGESTIONS STARTED ==========");
    console.log(
      `📦 Received ${
        message.data.suggestions?.length || 0
      } suggestions to apply`
    );
    console.log(
      "📋 Suggestions data:",
      JSON.stringify(message.data.suggestions, null, 2)
    );

    // Apply all suggestions (async)
    applyAllSuggestions(message.data.suggestions)
      .then((result) => {
        console.log("✅ Apply all completed:", result);
        console.log(
          "🎨 ========== APPLY ALL SUGGESTIONS FINISHED ==========\n"
        );
        sendResponse(result);
      })
      .catch((error) => {
        console.error("❌ Apply all failed:", error);
        console.log("🎨 ========== APPLY ALL SUGGESTIONS FAILED ==========\n");
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  return false;
});

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
