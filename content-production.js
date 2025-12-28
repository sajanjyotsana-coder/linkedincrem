class RateLimiter {
  constructor(maxRequests = 3, windowMs = 5000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }

  getWaitTime() {
    if (this.requests.length < this.maxRequests) {
      return 0;
    }

    const oldestRequest = this.requests[0];
    const waitTime = this.windowMs - (Date.now() - oldestRequest);
    return Math.max(0, waitTime);
  }
}

class LinkedInProfileExtractor {
  constructor() {
    this.profileData = {};
    this.isExtracting = false;
    this.rateLimiter = new RateLimiter(3, 5000);
    this.init();
  }

  init() {
    this.setupMessageListener();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.performInitialExtraction(), 1000);
      });
    } else {
      setTimeout(() => this.performInitialExtraction(), 1000);
    }
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
        case 'extractProfile':
          await this.extractProfileData();
          sendResponse({ success: true, data: this.profileData });
          break;

        case 'getProfileData':
          sendResponse({ success: true, data: this.profileData });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async performInitialExtraction() {
    if (!this.isLinkedInProfilePage()) {
      return;
    }

    if (!this.rateLimiter.canMakeRequest()) {
      const waitTime = this.rateLimiter.getWaitTime();
      setTimeout(() => this.performInitialExtraction(), waitTime);
      return;
    }

    await this.extractProfileData();

    try {
      chrome.runtime.sendMessage({
        action: 'profileDataExtracted',
        data: this.profileData
      });
    } catch (error) {
      // Side panel not available
    }
  }

  isLinkedInProfilePage() {
    return window.location.href.includes('linkedin.com/in/');
  }

  async extractProfileData() {
    if (this.isExtracting) return;

    this.isExtracting = true;

    try {
      await this.waitForProfileContent();

      const profileData = {
        fullName: this.extractFullName(),
        jobTitle: this.extractJobTitle(),
        company: this.extractCompany(),
        location: this.extractLocation(),
        profileUrl: window.location.href,
        profilePicture: this.extractProfilePicture(),
        scrapedAt: new Date().toISOString()
      };

      this.profileData = this.cleanProfileData(profileData);

      try {
        chrome.runtime.sendMessage({
          action: 'profileDataExtracted',
          data: this.profileData
        });
      } catch (messageError) {
        // Side panel not available
      }

    } catch (error) {
      try {
        chrome.runtime.sendMessage({
          action: 'profileExtractionError',
          error: error.message
        });
      } catch (messageError) {
        // Side panel not available
      }
    } finally {
      this.isExtracting = false;
    }
  }

  async waitForProfileContent() {
    const maxAttempts = 10;
    let attempts = 0;

    const selectors = [
      'h1.text-heading-xlarge',
      '.pv-text-details__left-panel h1',
      'h1[data-generated-suggestion-target]'
    ];

    while (attempts < maxAttempts) {
      const nameElement = this.findElement(selectors);

      if (nameElement && nameElement.textContent.trim()) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    throw new Error('Profile content not found after waiting');
  }

  extractFullName() {
    const selectors = [
      'h1.text-heading-xlarge.inline.t-24.v-align-middle.break-words',
      'h1.text-heading-xlarge',
      '.pv-text-details__left-panel h1',
      'h1[data-generated-suggestion-target]',
      'main h1:first-of-type'
    ];

    const element = this.findElement(selectors);
    return element ? this.cleanText(element.textContent) : '';
  }

  extractJobTitle() {
    const selectors = [
      '.pv-text-details__left-panel .text-body-medium.break-words',
      'section[data-section="profileHeader"] .text-body-medium',
      'h1.text-heading-xlarge + div .text-body-medium'
    ];

    const element = this.findElement(selectors);
    let jobTitle = element ? this.cleanText(element.textContent) : '';
    return this.cleanJobTitle(jobTitle);
  }

  extractCompany() {
    const selectors = [
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-14.t-normal span[aria-hidden="true"]',
      '.experience-section .pv-entity__summary-info:first-child .pv-entity__secondary-title'
    ];

    const element = this.findElement(selectors);
    let company = element ? this.cleanText(element.textContent) : '';
    return this.cleanCompanyName(company);
  }

  extractLocation() {
    const selectors = [
      '.pv-text-details__left-panel .text-body-small.inline.t-black--light.break-words',
      '.pv-top-card .text-body-small.inline.t-black--light'
    ];

    const element = this.findElement(selectors);
    return element ? this.cleanText(element.textContent) : '';
  }


  extractProfilePicture() {
    const selectors = [
      '.pv-top-card__photo img',
      '.presence-entity__image img',
      '.profile-photo-edit__preview img'
    ];

    const element = this.findElement(selectors);
    return element ? element.src : '';
  }

  findElement(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      } catch (e) {
        // Invalid selector, continue
      }
    }
    return null;
  }

  cleanText(text) {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 1000);
  }

  cleanJobTitle(jobTitle) {
    if (!jobTitle) return '';

    return jobTitle
      .replace(/^at\s+/i, '')
      .replace(/\s*•.*$/, '')
      .replace(/\s*\|.*$/, '')
      .replace(/\s*\(.*\)$/, '')
      .trim();
  }

  cleanCompanyName(company) {
    if (!company) return '';

    return company
      .replace(/\s*\(.*\)$/, '')
      .replace(/\s*•.*$/, '')
      .replace(/\s*,.*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }


  cleanProfileData(data) {
    const cleaned = {};

    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        cleaned[key] = this.cleanText(data[key]);
      } else {
        cleaned[key] = data[key];
      }
    });

    return cleaned;
  }
}

const extractor = new LinkedInProfileExtractor();

let lastUrl = location.href;
let observerActive = false;

function setupNavigationObserver() {
  if (observerActive) return;

  observerActive = true;

  const observer = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (extractor.isLinkedInProfilePage()) {
        setTimeout(() => extractor.performInitialExtraction(), 1500);
      }
    }
  });

  observer.observe(document, { subtree: true, childList: true });
}

if (document.readyState === 'complete') {
  setupNavigationObserver();
} else {
  window.addEventListener('load', setupNavigationObserver);
}
