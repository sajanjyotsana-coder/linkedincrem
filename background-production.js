class Logger {
  static isProduction = !chrome.runtime.getManifest().version.includes('dev');

  static log(...args) {
    if (!this.isProduction) {
      console.log('[LinkedInSaver]', ...args);
    }
  }

  static warn(...args) {
    if (!this.isProduction) {
      console.warn('[LinkedInSaver]', ...args);
    }
  }

  static error(...args) {
    console.error('[LinkedInSaver]', ...args);
  }
}

class AirtableService {
  constructor() {
    this.defaultFieldMappings = {
      fullName: 'Name',
      jobTitle: 'Job Title',
      company: 'Company',
      location: 'Location',
      email: 'Email',
      phone: 'Phone',
      profileUrl: 'LinkedIn URL',
      profilePicture: 'Profile Picture',
      tags: 'Tags',
      notes: 'Notes',
      scrapedAt: 'Date Added'
    };
  }

  async saveToAirtable(contactData, config, fieldMappings = {}) {
    if (!config.apiToken || !config.baseId || !config.tableId) {
      return {
        success: false,
        error: 'Airtable configuration is incomplete'
      };
    }

    const url = `https://api.airtable.com/v0/${config.baseId}/${config.tableId}`;
    let responseData = null;

    try {
      const fields = this.mapContactDataToAirtable(contactData, fieldMappings);

      Object.keys(fields).forEach(key => {
        if (!fields[key]) {
          delete fields[key];
        }
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });

      try {
        responseData = await response.json();
      } catch (jsonError) {
        Logger.warn('Failed to parse response JSON:', jsonError);
        responseData = {};
      }

      if (!response.ok) {
        const errorInfo = this.parseAirtableError(
          new Error(`HTTP ${response.status}: ${response.statusText}`),
          responseData
        );

        return {
          success: false,
          error: errorInfo.message,
          unknownFields: errorInfo.unknownFields
        };
      }

      return {
        success: true,
        recordId: responseData.id,
        message: 'Contact saved successfully to Airtable'
      };

    } catch (error) {
      Logger.error('Airtable save error:', error);

      const errorInfo = this.parseAirtableError(error, responseData);

      return {
        success: false,
        error: errorInfo.message,
        unknownFields: errorInfo.unknownFields
      };
    }
  }

  async testAirtableConnection(config) {
    if (!config.apiToken || !config.baseId || !config.tableId) {
      return {
        success: false,
        error: 'Please provide all required configuration fields'
      };
    }

    let responseData = null;

    try {
      const url = `https://api.airtable.com/v0/${config.baseId}/${config.tableId}?maxRecords=1`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`
        }
      });

      try {
        responseData = await response.json();
      } catch (jsonError) {
        Logger.warn('Failed to parse test response JSON:', jsonError);
        responseData = {};
      }

      if (!response.ok) {
        let errorMessage = responseData.error?.message || `HTTP ${response.status}`;

        if (response.status === 401) {
          errorMessage = 'Invalid API token';
        } else if (response.status === 404) {
          errorMessage = 'Base or table not found';
        }

        return {
          success: false,
          error: errorMessage
        };
      }

      return {
        success: true,
        message: 'Airtable connection successful'
      };

    } catch (error) {
      Logger.error('Airtable test error:', error);

      let errorMessage = error.message;
      if (error.message.includes('401')) {
        errorMessage = 'Invalid API token';
      } else if (error.message.includes('404')) {
        errorMessage = 'Base or table not found';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your internet connection.';
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async testFieldMappings(sampleData, config, fieldMappings) {
    if (!config.apiToken || !config.baseId || !config.tableId) {
      return {
        success: false,
        error: 'Please provide all required configuration fields'
      };
    }

    let responseData = null;

    try {
      const url = `https://api.airtable.com/v0/${config.baseId}/${config.tableId}`;

      const testFields = this.mapContactDataToAirtable(sampleData, fieldMappings);

      Object.keys(testFields).forEach(key => {
        if (typeof testFields[key] === 'string') {
          testFields[key] = '[TEST] ' + testFields[key];
        }
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: testFields })
      });

      try {
        responseData = await response.json();
      } catch (jsonError) {
        Logger.warn('Failed to parse field mapping test response JSON:', jsonError);
        responseData = {};
      }

      if (!response.ok) {
        const errorInfo = this.parseAirtableError(new Error(`HTTP ${response.status}`), responseData);
        return {
          success: false,
          error: errorInfo.message,
          unknownFields: errorInfo.unknownFields,
          responseData: responseData
        };
      }

      if (responseData.id) {
        try {
          await fetch(`${url}/${responseData.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${config.apiToken}`
            }
          });
        } catch (deleteError) {
          Logger.warn('Could not delete test record:', deleteError);
        }
      }

      return {
        success: true,
        message: 'Field mappings are valid'
      };

    } catch (error) {
      Logger.error('Field mapping test error:', error);

      const errorInfo = this.parseAirtableError(error, responseData);

      return {
        success: false,
        error: errorInfo.message,
        unknownFields: errorInfo.unknownFields
      };
    }
  }

  mapContactDataToAirtable(contactData, fieldMappings) {
    const mappings = { ...this.defaultFieldMappings, ...fieldMappings };
    const fields = {};

    Object.keys(mappings).forEach(dataKey => {
      const airtableField = mappings[dataKey];
      if (airtableField && contactData[dataKey]) {
        fields[airtableField] = contactData[dataKey];
      }
    });

    return fields;
  }

  parseAirtableError(error, responseData = null) {
    let errorMessage = error.message;
    let unknownFields = [];

    if (responseData && responseData.error) {
      const airtableError = responseData.error;

      if (airtableError.type === 'UNKNOWN_FIELD_NAME') {
        unknownFields.push(airtableError.message.match(/"([^"]+)"/)?.[1]);
        errorMessage = `Unknown field: ${unknownFields[0]}. Please check your field mappings.`;
      }
    }

    if (error.message.includes('401')) {
      errorMessage = 'Invalid API token. Please check your Airtable configuration.';
    } else if (error.message.includes('403')) {
      errorMessage = 'Permission denied. Check your API token permissions.';
    } else if (error.message.includes('404')) {
      errorMessage = 'Base or table not found. Please verify your Base ID and Table ID.';
    } else if (error.message.includes('429')) {
      errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
    } else if (error.message.includes('network')) {
      errorMessage = 'Network error. Please check your internet connection.';
    }

    return {
      message: errorMessage,
      unknownFields: unknownFields
    };
  }
}

class BackgroundService {
  constructor() {
    this.airtableService = new AirtableService();
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.setupActionListener();
    Logger.log('Background service initialized');
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'saveToAirtable':
          const result = await this.airtableService.saveToAirtable(
            request.data,
            request.config,
            request.fieldMappings
          );
          sendResponse(result);
          break;

        case 'testAirtableConnection':
          const testResult = await this.airtableService.testAirtableConnection(request.config);
          sendResponse(testResult);
          break;

        case 'testFieldMappings':
          const mappingResult = await this.airtableService.testFieldMappings(
            request.data,
            request.config,
            request.fieldMappings
          );
          sendResponse(mappingResult);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      Logger.error('Background service error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  setupActionListener() {
    chrome.action.onClicked.addListener(async (tab) => {
      await this.openSidePanel(tab.id);
    });
  }

  async openSidePanel(tabId) {
    if (!tabId) return;

    try {
      await chrome.sidePanel.open({ tabId });
    } catch (error) {
      Logger.error('Failed to open side panel:', error);
    }
  }
}

const backgroundService = new BackgroundService();

chrome.runtime.onStartup.addListener(() => {
  Logger.log('LinkedIn to Airtable extension started');
});

chrome.runtime.onInstalled.addListener((details) => {
  Logger.log('LinkedIn to Airtable extension installed/updated', details);
});
