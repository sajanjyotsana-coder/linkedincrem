import { Logger } from './utils/logger.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { LinkedInSelectors } from './extractors/linkedin-selectors.js';
import { TextCleaners } from './extractors/text-cleaners.js';

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
      Logger.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async performInitialExtraction() {
    if (!this.isLinkedInProfilePage()) {
      return;
    }

    if (!this.rateLimiter.canMakeRequest()) {
      Logger.warn('Rate limit exceeded, waiting...');
      const waitTime = this.rateLimiter.getWaitTime();
      setTimeout(() => this.performInitialExtraction(), waitTime);
      return;
    }

    Logger.log('LinkedIn profile page detected, starting extraction...');
    await this.extractProfileData();

    try {
      chrome.runtime.sendMessage({
        action: 'profileDataExtracted',
        data: this.profileData
      });
    } catch (error) {
      Logger.debug('Side panel not available for initial extraction:', error);
    }
  }

  isLinkedInProfilePage() {
    return window.location.href.includes('linkedin.com/in/');
  }

  async extractProfileData() {
    if (this.isExtracting) return;

    this.isExtracting = true;
    Logger.log('Starting profile data extraction...');

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
      Logger.log('Profile data extracted successfully');

      try {
        chrome.runtime.sendMessage({
          action: 'profileDataExtracted',
          data: this.profileData
        });
      } catch (messageError) {
        Logger.debug('Failed to send message to side panel:', messageError);
      }

    } catch (error) {
      Logger.error('Profile extraction error:', error);

      try {
        chrome.runtime.sendMessage({
          action: 'profileExtractionError',
          error: error.message
        });
      } catch (messageError) {
        Logger.debug('Failed to send error message to side panel:', messageError);
      }
    } finally {
      this.isExtracting = false;
    }
  }

  async waitForProfileContent() {
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const nameElement = this.findElement(LinkedInSelectors.fullName);

      if (nameElement && nameElement.textContent.trim()) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    throw new Error('Profile content not found after waiting');
  }

  extractFullName() {
    const element = this.findElement(LinkedInSelectors.fullName);
    return element ? TextCleaners.cleanText(element.textContent) : '';
  }

  extractJobTitle() {
    const element = this.findElement(LinkedInSelectors.jobTitle);
    let jobTitle = element ? TextCleaners.cleanText(element.textContent) : '';
    return TextCleaners.cleanJobTitle(jobTitle);
  }

  extractCompany() {
    const element = this.findElement(LinkedInSelectors.company);
    let company = element ? TextCleaners.cleanText(element.textContent) : '';
    return TextCleaners.cleanCompanyName(company);
  }

  extractLocation() {
    const element = this.findElement(LinkedInSelectors.location);
    return element ? TextCleaners.cleanText(element.textContent) : '';
  }


  extractProfilePicture() {
    const element = this.findElement(LinkedInSelectors.profilePicture);
    return element ? element.src : '';
  }

  findElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  cleanProfileData(data) {
    const cleaned = {};

    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        cleaned[key] = TextCleaners.cleanText(data[key]);
      } else {
        cleaned[key] = data[key];
      }
    });

    return cleaned;
  }
}

const extractor = new LinkedInProfileExtractor();

let lastUrl = location.href;
let observer = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (extractor.isLinkedInProfilePage()) {
      setTimeout(() => extractor.performInitialExtraction(), 1500);
    }
  }
});

observer.observe(document, { subtree: true, childList: true });
