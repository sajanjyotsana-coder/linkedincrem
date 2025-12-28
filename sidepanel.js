/**
 * Side panel functionality for LinkedIn to Airtable extension
 * Handles UI interactions, form management, and data persistence
 */

class SidePanelManager {
  constructor() {
    this.isLoading = false;
    this.currentProfileData = {};
    this.fieldMappings = {};
    this.defaultFieldMappings = {
      fullName: 'Name',
      jobTitle: 'Job Title',
      company: 'Company',
      location: 'Location',
      email: 'Email',
      phone: 'Phone',
      profileUrl: 'LinkedIn URL',
      profilePicture: 'Profile Picture',
      tags: 'Tag',
      notes: 'Notes'
    };
    this.init();
  }

  /**
   * Initialize side panel
   */
  async init() {
    this.setupEventListeners();
    this.setupMessageListener();
    await this.loadConfiguration();
    await this.checkCurrentPage();
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Configuration toggle
    document.getElementById('configToggle').addEventListener('click', () => {
      this.toggleConfiguration();
    });

    // Save configuration
    document.getElementById('saveConfig').addEventListener('click', () => {
      this.saveConfiguration();
    });

    // Test field mappings
    document.getElementById('testMappings').addEventListener('click', () => {
      this.testFieldMappings();
    });

    // Form submission
    document.getElementById('contactForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveContact();
    });

    // Clear form
    document.getElementById('clearForm').addEventListener('click', () => {
      this.clearForm();
    });

    // Real-time validation
    document.getElementById('fullName').addEventListener('blur', () => {
      this.validateField('fullName');
    });

    document.getElementById('email').addEventListener('blur', () => {
      this.validateField('email');
    });

    // Auto-save configuration on input
    ['apiToken', 'baseId', 'tableId'].forEach(fieldId => {
      document.getElementById(fieldId).addEventListener('input', 
        this.debounce(() => this.saveConfiguration(), 1000)
      );
    });

    // Auto-save field mappings on input and update badges
    Object.keys(this.defaultFieldMappings).forEach(dataKey => {
      const mappingField = document.getElementById(`mapping-${dataKey}`);
      if (mappingField) {
        mappingField.addEventListener('input',
          this.debounce(async () => {
            await this.saveConfiguration();
            // Refresh field type badges after saving
            const config = await this.getCurrentConfig();
            if (config.apiToken && config.baseId && config.tableId) {
              const fieldsResult = await chrome.runtime.sendMessage({
                action: 'fetchAvailableFields',
                config: config
              });
              if (fieldsResult.success) {
                this.updateFieldTypeBadges(fieldsResult.fieldTypes);
              }
            }
          }, 1000)
        );
      }
    });
  }

  /**
   * Setup message listener for background script communication
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'profileDataExtracted':
        this.populateForm(request.data);
        this.updateStatus('Profile data loaded');
        sendResponse({ success: true });
        break;

      case 'profileExtractionError':
        this.showAlert(`Failed to extract profile data: ${request.error}`, 'error');
        this.updateStatus('Error', 'error');
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  }

  /**
   * Toggle configuration section visibility
   */
  toggleConfiguration() {
    const toggle = document.getElementById('configToggle');
    const content = document.getElementById('configContent');
    
    const isExpanded = content.classList.contains('expanded');
    
    if (isExpanded) {
      content.classList.remove('expanded');
      toggle.classList.remove('expanded');
    } else {
      content.classList.add('expanded');
      toggle.classList.add('expanded');
    }
  }

  /**
   * Load configuration from storage
   */
  async loadConfiguration() {
    try {
      const result = await chrome.storage.sync.get(['airtableConfig', 'fieldMappings']);
      
      if (result.airtableConfig) {
        const config = result.airtableConfig;
        document.getElementById('apiToken').value = config.apiToken || '';
        document.getElementById('baseId').value = config.baseId || '';
        document.getElementById('tableId').value = config.tableId || '';
      }

      // Load field mappings
      this.fieldMappings = result.fieldMappings || {};
      this.populateFieldMappings();
      
    } catch (error) {
      console.error('Failed to load configuration:', error);
      this.showAlert('Failed to load saved configuration', 'error');
    }
  }

  /**
   * Save configuration to storage
   */
  async saveConfiguration() {
    const config = {
      apiToken: document.getElementById('apiToken').value.trim(),
      baseId: document.getElementById('baseId').value.trim(),
      tableId: document.getElementById('tableId').value.trim()
    };

    // Collect field mappings
    const fieldMappings = {};
    Object.keys(this.defaultFieldMappings).forEach(dataKey => {
      const mappingField = document.getElementById(`mapping-${dataKey}`);
      if (mappingField && mappingField.value.trim()) {
        fieldMappings[dataKey] = mappingField.value.trim();
      }
    });

    try {
      await chrome.storage.sync.set({ 
        airtableConfig: config,
        fieldMappings: fieldMappings
      });
      
      this.fieldMappings = fieldMappings;
      
      // Test connection if all fields are filled
      if (config.apiToken && config.baseId && config.tableId) {
        this.updateStatus('Testing connection...', 'loading');
        
        const testResult = await chrome.runtime.sendMessage({
          action: 'testAirtableConnection',
          config: config
        });

        if (testResult.success) {
          // Fetch available fields to refresh schema cache and update UI
          const fieldsResult = await chrome.runtime.sendMessage({
            action: 'fetchAvailableFields',
            config: config
          });

          if (fieldsResult.success) {
            this.updateFieldTypeBadges(fieldsResult.fieldTypes);
          }

          this.showAlert('Configuration saved and connection verified', 'success');
          this.updateStatus('Connected');
        } else {
          this.showAlert(`Configuration saved but connection failed: ${testResult.error}`, 'warning');
          this.updateStatus('Config saved');
        }
      } else {
        this.showAlert('Configuration saved', 'success');
        this.updateStatus('Config saved');
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      this.showAlert('Failed to save configuration', 'error');
      this.updateStatus('Error', 'error');
    }
  }

  /**
   * Populate field mapping inputs with saved values
   */
  populateFieldMappings() {
    Object.keys(this.defaultFieldMappings).forEach(dataKey => {
      const mappingField = document.getElementById(`mapping-${dataKey}`);
      if (mappingField) {
        const savedMapping = this.fieldMappings[dataKey];
        const defaultMapping = this.defaultFieldMappings[dataKey];
        mappingField.value = savedMapping || '';
        mappingField.placeholder = defaultMapping;
      }
    });
  }

  /**
   * Test field mappings with current profile data
   */
  async testFieldMappings() {
    try {
      const config = await this.getCurrentConfig();
      
      if (!config.apiToken || !config.baseId || !config.tableId) {
        this.showAlert('Please configure Airtable settings first', 'error');
        return;
      }

      // Use current profile data or sample data
      const testData = Object.keys(this.currentProfileData).length > 0
        ? this.currentProfileData
        : {
          fullName: 'Test User',
          jobTitle: 'Test Position',
          company: 'Test Company',
          location: 'Test Location',
          email: 'test@example.com',
          phone: '+1234567890',
          profileUrl: 'https://linkedin.com/in/test',
          profilePicture: 'https://via.placeholder.com/200',
          tags: 'test-tag',
          notes: 'Test notes'
        };

      this.updateStatus('Testing field mappings...', 'loading');
      
      const result = await chrome.runtime.sendMessage({
        action: 'testFieldMappings',
        data: testData,
        config: config,
        fieldMappings: this.fieldMappings
      });

      if (result.success) {
        this.showAlert('Field mappings are valid!', 'success');
        this.updateStatus('Mappings verified');
        this.clearAllMappingErrors();
      } else {
        this.showAlert(`Field mapping test failed: ${result.error}`, 'error');
        this.updateStatus('Mapping test failed', 'error');
        
        // Highlight specific field errors
        if (result.unknownFields && result.unknownFields.length > 0) {
          this.highlightUnknownFields(result.unknownFields);
        }
      }

    } catch (error) {
      console.error('Field mapping test error:', error);
      this.showAlert('Failed to test field mappings', 'error');
      this.updateStatus('Test failed', 'error');
    }
  }

  /**
   * Highlight unknown fields in the mapping interface
   */
  highlightUnknownFields(unknownFields) {
    unknownFields.forEach(fieldName => {
      // Find which mapping corresponds to this field name
      Object.keys(this.defaultFieldMappings).forEach(dataKey => {
        const mappingField = document.getElementById(`mapping-${dataKey}`);
        const errorDiv = document.getElementById(`mapping-${dataKey}-error`);

        if (mappingField && mappingField.value === fieldName) {
          mappingField.classList.add('error');
          if (errorDiv) {
            errorDiv.textContent = `Field "${fieldName}" not found in Airtable`;
            errorDiv.classList.add('visible');
          }
        }
      });
    });
  }

  /**
   * Highlight fields with type errors in the mapping interface
   */
  highlightFieldErrors(fieldErrors) {
    fieldErrors.forEach(({ field, error }) => {
      // Find which mapping corresponds to this field name
      Object.keys(this.defaultFieldMappings).forEach(dataKey => {
        const mappingField = document.getElementById(`mapping-${dataKey}`);
        const errorDiv = document.getElementById(`mapping-${dataKey}-error`);

        if (mappingField && mappingField.value === field) {
          mappingField.classList.add('error');
          if (errorDiv) {
            errorDiv.textContent = `${field}: ${error}`;
            errorDiv.classList.add('visible');
          }
        }
      });
    });
  }

  /**
   * Clear all mapping error states
   */
  clearAllMappingErrors() {
    Object.keys(this.defaultFieldMappings).forEach(dataKey => {
      const mappingField = document.getElementById(`mapping-${dataKey}`);
      const errorDiv = document.getElementById(`mapping-${dataKey}-error`);
      
      if (mappingField) {
        mappingField.classList.remove('error');
      }
      if (errorDiv) {
        errorDiv.classList.remove('visible');
      }
    });
  }

  /**
   * Check current page and update status accordingly
   */
  async checkCurrentPage() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      if (!currentTab || !currentTab.url?.includes('linkedin.com/in/')) {
        this.updateStatus('Navigate to a LinkedIn profile');
        return;
      }

      this.updateStatus('Waiting for profile data...', 'loading');
      
      // Try to trigger profile extraction after a short delay
      setTimeout(async () => {
        try {
          const response = await chrome.tabs.sendMessage(currentTab.id, {
            action: 'extractProfile'
          });
          console.log('Manual extraction triggered:', response);
        } catch (error) {
          console.log('Could not trigger manual extraction:', error);
          // This is expected if content script isn't ready yet
        }
      }, 2000);
      
    } catch (error) {
      console.error('Failed to check current page:', error);
      this.updateStatus('Ready to extract profile data');
    }
  }

  /**
   * Populate form with extracted LinkedIn data
   */
  populateForm(profileData) {
    this.currentProfileData = profileData;

    // Auto-fill fields and mark them as auto-filled
    const autoFillFields = [
      'fullName', 'jobTitle', 'company', 'location', 'profileUrl'
    ];

    autoFillFields.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element && profileData[fieldId]) {
        element.value = profileData[fieldId];
        element.classList.add('auto-filled');

        // Clear any previous errors
        this.clearFieldError(fieldId);
      }
    });

    // Set readonly URL
    const profileUrlField = document.getElementById('profileUrl');
    if (profileUrlField) {
      profileUrlField.value = profileData.profileUrl || '';
    }

    // Handle profile picture display
    this.displayProfilePicture(profileData.profilePicture);

    this.showAlert('Profile data extracted successfully', 'success');
  }

  /**
   * Display profile picture from extracted data
   */
  displayProfilePicture(pictureUrl) {
    const img = document.getElementById('profilePictureImg');
    const placeholder = document.getElementById('profilePicturePlaceholder');
    const loading = document.getElementById('profilePictureLoading');
    const status = document.getElementById('profilePictureStatus');

    if (!pictureUrl) {
      // No picture URL provided
      if (img) img.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
      if (loading) loading.style.display = 'none';
      if (status) {
        status.textContent = 'No profile picture found';
        status.className = 'profile-picture-status warning';
      }
      return;
    }

    // Show loading state
    if (placeholder) placeholder.style.display = 'none';
    if (loading) loading.style.display = 'flex';
    if (status) status.className = 'profile-picture-status';

    // Set image source and handle load/error
    if (img) {
      img.onload = () => {
        img.style.display = 'block';
        if (loading) loading.style.display = 'none';
        if (status) {
          status.textContent = 'Profile picture captured';
          status.className = 'profile-picture-status success';
        }
      };

      img.onerror = () => {
        img.style.display = 'none';
        if (loading) loading.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        if (status) {
          status.textContent = 'Failed to load profile picture';
          status.className = 'profile-picture-status error';
        }
      };

      img.src = pictureUrl;
    }
  }

  /**
   * Save contact to Airtable
   */
  async saveContact() {
    if (this.isLoading) return;

    try {
      // Validate form
      if (!this.validateForm()) {
        this.showAlert('Please fix the form errors before saving', 'error');
        return;
      }

      // Get configuration
      const configResult = await chrome.storage.sync.get(['airtableConfig']);
      
      if (!configResult.airtableConfig) {
        this.showAlert('Please configure Airtable settings first', 'error');
        this.toggleConfiguration();
        return;
      }

      const config = configResult.airtableConfig;
      
      if (!config.apiToken || !config.baseId || !config.tableId) {
        this.showAlert('Airtable configuration is incomplete', 'error');
        this.toggleConfiguration();
        return;
      }

      // Collect form data
      const contactData = this.collectFormData();
      
      // Set loading state
      this.setLoadingState(true);
      this.updateStatus('Saving to Airtable...', 'loading');

      // Save to Airtable via background script
      const result = await chrome.runtime.sendMessage({
        action: 'saveToAirtable',
        data: contactData,
        config: config,
        fieldMappings: this.fieldMappings
      });

      if (result.success) {
        let alertMessage = result.message || 'Contact saved successfully!';

        // Show detailed info about excluded fields if any
        if (result.excludedFields && result.excludedFields.length > 0) {
          console.group('Excluded Fields');
          result.excludedFields.forEach(excluded => {
            console.warn(`Field "${excluded.field}" excluded: ${excluded.reason}`);
            if (excluded.expectedType) {
              console.log(`  Expected type: ${excluded.expectedType}`);
            }
          });
          console.groupEnd();

          // Add excluded fields to alert message
          const fieldNames = result.excludedFields.map(f => f.field).join(', ');
          alertMessage += `\n\nExcluded fields: ${fieldNames}`;
        }

        this.showAlert(alertMessage, 'success');
        this.updateStatus('Saved successfully');

        // Clear manual fields but keep auto-filled data
        this.clearManualFields();
      } else {
        let errorMessage = result.error || 'Failed to save contact';

        // Log detailed error info for debugging
        console.group('Save Contact Error');
        console.error('Error Message:', result.error);
        if (result.fieldErrors) {
          console.error('Field Errors:', JSON.stringify(result.fieldErrors, null, 2));
        }
        if (result.unknownFields) {
          console.error('Unknown Fields:', JSON.stringify(result.unknownFields, null, 2));
        }
        console.groupEnd();

        // Handle field-specific errors
        if (result.fieldErrors && result.fieldErrors.length > 0) {
          const fieldNames = result.fieldErrors.map(fe => fe.field).join(', ');

          if (result.fieldErrors.length === 1) {
            errorMessage += `\n\nProblem with field: ${fieldNames}`;
          } else {
            errorMessage += `\n\nProblems with fields: ${fieldNames}`;
          }

          this.highlightFieldErrors(result.fieldErrors);
        }

        // Handle field mapping errors specifically
        if (result.unknownFields && result.unknownFields.length > 0) {
          const fieldList = result.unknownFields.join(', ');
          errorMessage += `\n\nThe following field(s) don't exist in your Airtable table: ${fieldList}`;
          errorMessage += '\n\nPlease update your field mappings in the configuration section.';
          this.highlightUnknownFields(result.unknownFields);
        }

        this.showAlert(errorMessage, 'error');
        this.updateStatus('Save failed', 'error');
      }

    } catch (error) {
      console.error('Save contact error:', error);
      this.showAlert('An unexpected error occurred while saving', 'error');
      this.updateStatus('Save failed', 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Collect all form data
   */
  collectFormData() {
    return {
      fullName: document.getElementById('fullName').value.trim(),
      jobTitle: document.getElementById('jobTitle').value.trim(),
      company: document.getElementById('company').value.trim(),
      location: document.getElementById('location').value.trim(),
      profileUrl: document.getElementById('profileUrl').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      tags: document.getElementById('tags').value.trim(),
      notes: document.getElementById('notes').value.trim(),
      profilePicture: this.currentProfileData.profilePicture || ''
    };
  }

  /**
   * Validate form fields
   */
  validateForm() {
    let isValid = true;

    // Validate required fields
    isValid = this.validateField('fullName') && isValid;

    // Validate email format if provided
    const email = document.getElementById('email').value.trim();
    if (email && !this.isValidEmail(email)) {
      this.showFieldError('email', 'Please enter a valid email address');
      isValid = false;
    } else {
      this.clearFieldError('email');
    }

    return isValid;
  }

  /**
   * Validate individual field
   */
  validateField(fieldId) {
    const field = document.getElementById(fieldId);
    const value = field.value.trim();

    if (fieldId === 'fullName' && !value) {
      this.showFieldError(fieldId, 'Full name is required');
      return false;
    }

    if (fieldId === 'email' && value && !this.isValidEmail(value)) {
      this.showFieldError(fieldId, 'Please enter a valid email address');
      return false;
    }

    this.clearFieldError(fieldId);
    return true;
  }

  /**
   * Show field validation error
   */
  showFieldError(fieldId, message) {
    const errorElement = document.getElementById(`${fieldId}Error`);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.add('visible');
    }
    
    const field = document.getElementById(fieldId);
    if (field) {
      field.style.borderColor = 'var(--error-color)';
    }
  }

  /**
   * Clear field validation error
   */
  clearFieldError(fieldId) {
    const errorElement = document.getElementById(`${fieldId}Error`);
    if (errorElement) {
      errorElement.classList.remove('visible');
    }
    
    const field = document.getElementById(fieldId);
    if (field) {
      field.style.borderColor = '';
    }
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Clear manual entry fields only
   */
  clearManualFields() {
    const manualFields = ['email', 'phone', 'tags', 'notes'];
    
    manualFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = '';
      }
    });
  }

  /**
   * Clear entire form
   */
  clearForm() {
    const form = document.getElementById('contactForm');
    if (form) {
      form.reset();

      // Remove auto-filled styling
      form.querySelectorAll('.auto-filled').forEach(field => {
        field.classList.remove('auto-filled');
      });

      // Clear all errors
      form.querySelectorAll('.field-error').forEach(error => {
        error.classList.remove('visible');
      });

      // Reset field borders
      form.querySelectorAll('.field-input, .field-textarea').forEach(field => {
        field.style.borderColor = '';
      });
    }

    // Reset profile picture display
    const img = document.getElementById('profilePictureImg');
    const placeholder = document.getElementById('profilePicturePlaceholder');
    const loading = document.getElementById('profilePictureLoading');
    const status = document.getElementById('profilePictureStatus');

    if (img) img.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    if (loading) loading.style.display = 'none';
    if (status) {
      status.textContent = '';
      status.className = 'profile-picture-status';
    }

    this.currentProfileData = {};
    this.showAlert('Form cleared', 'success');
  }

  /**
   * Set loading state for save button
   */
  setLoadingState(loading) {
    this.isLoading = loading;
    const saveButton = document.getElementById('saveContact');
    const spinner = document.getElementById('saveSpinner');

    if (loading) {
      saveButton.classList.add('loading');
      saveButton.disabled = true;
    } else {
      saveButton.classList.remove('loading');
      saveButton.disabled = false;
    }
  }

  /**
   * Update status indicator
   */
  updateStatus(text, type = 'ready') {
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');

    if (statusText) {
      statusText.textContent = text;
    }

    if (statusDot) {
      statusDot.className = 'status-dot';
      if (type === 'loading') {
        statusDot.classList.add('loading');
      } else if (type === 'error') {
        statusDot.classList.add('error');
      }
    }
  }

  /**
   * Show alert message
   */
  showAlert(message, type = 'success') {
    const alertElement = document.getElementById('alertMessage');
    
    if (alertElement) {
      alertElement.textContent = message;
      alertElement.className = `alert alert--${type} visible`;

      // Auto-hide after 4 seconds
      setTimeout(() => {
        alertElement.classList.remove('visible');
      }, 4000);
    }
  }

  /**
   * Debounce function for auto-save
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Utility function to sanitize input
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return '';

    const div = document.createElement('div');
    div.textContent = input;
    const sanitized = div.innerHTML;

    return sanitized
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  /**
   * Update field type badges based on Airtable schema
   */
  updateFieldTypeBadges(fieldTypes) {
    if (!fieldTypes) return;

    // Define compatibility rules for each data field
    const dataFieldCompatibility = {
      fullName: ['singleLineText', 'multilineText', 'richText'],
      jobTitle: ['singleLineText', 'multilineText', 'richText'],
      company: ['singleLineText', 'multilineText', 'richText'],
      location: ['singleLineText', 'multilineText', 'richText'],
      profileUrl: ['url', 'singleLineText', 'multilineText'],
      profilePicture: ['url', 'multipleAttachments', 'singleLineText'],
      email: ['email', 'singleLineText', 'multilineText'],
      phone: ['phoneNumber', 'singleLineText', 'multilineText'],
      tags: ['multipleSelects', 'singleSelect', 'singleLineText', 'multilineText'],
      notes: ['multilineText', 'richText', 'singleLineText']
    };

    // Update each field mapping badge
    Object.keys(this.defaultFieldMappings).forEach(dataKey => {
      const mappingField = document.getElementById(`mapping-${dataKey}`);
      const badgeElement = document.getElementById(`mapping-${dataKey}-type`);

      if (!mappingField || !badgeElement) return;

      const airtableFieldName = mappingField.value.trim() || this.defaultFieldMappings[dataKey];
      const fieldType = fieldTypes[airtableFieldName];

      if (!fieldType) {
        // Field not found in Airtable
        if (mappingField.value.trim()) {
          badgeElement.textContent = 'Not Found';
          badgeElement.className = 'field-type-badge incompatible';
          badgeElement.style.display = 'inline-block';
        } else {
          badgeElement.style.display = 'none';
        }
        return;
      }

      // Check compatibility
      const compatibleTypes = dataFieldCompatibility[dataKey] || [];
      const isCompatible = compatibleTypes.includes(fieldType);

      // Format field type for display
      const displayType = this.formatFieldType(fieldType);

      badgeElement.textContent = displayType;
      badgeElement.className = `field-type-badge ${isCompatible ? 'compatible' : 'warning'}`;
      badgeElement.style.display = 'inline-block';
    });
  }

  /**
   * Format Airtable field type for display
   */
  formatFieldType(fieldType) {
    const typeMap = {
      singleLineText: 'Text',
      multilineText: 'Long Text',
      richText: 'Rich Text',
      url: 'URL',
      email: 'Email',
      phoneNumber: 'Phone',
      multipleSelects: 'Multi-Select',
      singleSelect: 'Single Select',
      multipleAttachments: 'Attachment',
      multipleRecordLinks: 'Linked Record',
      number: 'Number',
      currency: 'Currency',
      percent: 'Percent',
      checkbox: 'Checkbox',
      date: 'Date',
      dateTime: 'Date Time',
      rating: 'Rating'
    };

    return typeMap[fieldType] || fieldType;
  }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  new SidePanelManager();
});

// Extension of SidePanelManager class with additional methods
Object.assign(SidePanelManager.prototype, {
  /**
   * Get current configuration
   */
  async getCurrentConfig() {
    const result = await chrome.storage.sync.get(['airtableConfig', 'fieldMappings']);
    return {
      ...result.airtableConfig,
      fieldMappings: result.fieldMappings || {}
    };
  }
});