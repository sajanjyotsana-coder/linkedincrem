/**
 * Content script for LinkedIn profile data extraction
 * Runs on LinkedIn profile pages to extract user data
 */

class LinkedInProfileExtractor {
  constructor() {
    this.profileData = {};
    this.isExtracting = false;
    this.init();
  }

  /**
   * Initialize the content script
   */
  init() {
    this.setupMessageListener();
    
    // Wait for page to be fully loaded before initial extraction
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.performInitialExtraction(), 1000);
      });
    } else {
      setTimeout(() => this.performInitialExtraction(), 1000);
    }
  }

  /**
   * Setup message listener for communication with side panel
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  /**
   * Handle incoming messages from side panel
   */
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
      console.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Perform initial profile extraction when page loads
   */
  async performInitialExtraction() {
    if (this.isLinkedInProfilePage()) {
      console.log('LinkedIn profile page detected, starting extraction...');
      await this.extractProfileData();

      // Notify side panel if it's open
      try {
        console.log('Sending profile data to side panel:', this.profileData);
        chrome.runtime.sendMessage({
          action: 'profileDataExtracted',
          data: this.profileData
        });
      } catch (error) {
        // Side panel might not be open, which is fine
        console.log('Side panel not available for initial extraction:', error);
      }

      // Retry after another delay if data wasn't extracted
      if (!this.profileData.fullName) {
        console.log('Full name not found, retrying extraction in 3 seconds...');
        setTimeout(() => {
          this.performInitialExtraction();
        }, 3000);
      }
    }
  }

  /**
   * Check if current page is a LinkedIn profile page
   */
  isLinkedInProfilePage() {
    return window.location.href.includes('linkedin.com/in/');
  }

  /**
   * Extract profile data from LinkedIn page
   */
  async extractProfileData() {
    if (this.isExtracting) return;
    
    this.isExtracting = true;
    console.log('🚀 Starting profile data extraction...');
    console.log('📍 Current URL:', window.location.href);
    console.log('📄 Document ready state:', document.readyState);
    
    try {
      // Wait for dynamic content to load
      await this.waitForProfileContent();
      
      console.log('✅ Profile content is ready, starting field extraction...');
      
      const profileData = {
        fullName: this.extractFullName(),
        jobTitle: this.extractJobTitle(),
        company: this.extractCompany(),
        location: this.extractLocation(),
        profileUrl: window.location.href,
        profilePicture: this.extractProfilePicture()
      };

      // Clean and validate extracted data
      this.profileData = this.cleanProfileData(profileData);
      console.log('🎉 Final profile data extracted:', this.profileData);
      
      // Send data to side panel
      try {
        chrome.runtime.sendMessage({
          action: 'profileDataExtracted',
          data: this.profileData
        });
        console.log('📤 Profile data sent to side panel successfully');
      } catch (messageError) {
        console.log('❌ Failed to send message to side panel:', messageError);
      }

    } catch (error) {
      console.error('❌ Profile extraction error:', error);
      
      try {
        chrome.runtime.sendMessage({
          action: 'profileExtractionError',
          error: error.message
        });
      } catch (messageError) {
        console.log('❌ Failed to send error message to side panel:', messageError);
      }
    } finally {
      this.isExtracting = false;
    }
  }

  /**
   * Wait for profile content to be available
   */
  async waitForProfileContent() {
    const maxAttempts = 20;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const nameElement = this.findElement([
        'h1[data-generated-suggestion-target]',
        '.text-heading-xlarge',
        '.pv-text-details__left-panel h1',
        '.ph5 h1',
        'h1.break-words',
        'h1'
      ]);

      if (nameElement && nameElement.textContent.trim()) {
        console.log('Profile content found, proceeding with extraction');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    console.warn('Profile content not found after 10 seconds, attempting extraction anyway');
  }

  /**
   * Extract full name from profile
   */
  extractFullName() {
    console.log('🏷️ Starting full name extraction...');
    
    const selectors = [
      // Most specific modern LinkedIn selectors
      'h1.text-heading-xlarge.inline.t-24.v-align-middle.break-words',
      'h1.text-heading-xlarge.inline',
      'h1.text-heading-xlarge',
      
      // Profile header section targeting
      'section[data-section="profileHeader"] h1',
      '.pv-text-details__left-panel h1.text-heading-xlarge',
      '.pv-text-details__left-panel h1',
      
      // Top card variations
      '.pv-top-card h1',
      '.pv-top-card--list h1',
      '.ph5 h1',
      
      // Generic fallbacks
      'h1[data-generated-suggestion-target]',
      'h1[data-anonymize="person-name"]',
      'h1.break-words',
      '.text-heading-xlarge',
      
      // Very broad fallbacks
      'main h1:first-of-type',
      'article h1:first-of-type'
    ];

    const element = this.findElement(selectors);
    const name = element ? this.cleanText(element.textContent) : '';
    
    console.log('📝 Full name extraction result:');
    console.log(`  Raw text: "${element?.textContent}"`);
    console.log(`  Cleaned name: "${name}"`);
    
    console.log('Extracted name:', name);
    return name;
  }

  /**
   * Extract job title from most recent position in Experience section
   * NOTE: This extracts the job title from the first entry in the Experience section,
   * NOT the profile headline that appears under the name
   */
  extractJobTitle() {
    console.log('💼 Starting job title extraction from Experience section...');

    const selectors = [
      // Modern LinkedIn Experience section (most common)
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .mr1.t-bold span[aria-hidden="true"]',
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-bold span[aria-hidden="true"]',
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-bold',

      // Experience section with data-section attribute
      'section[data-section="experience"] .pvs-list__paged-list-item:first-child .mr1.t-bold span[aria-hidden="true"]',
      'section[data-section="experience"] .pvs-list__paged-list-item:first-child .t-bold span[aria-hidden="true"]',
      'section[data-section="experience"] .pvs-list__paged-list-item:first-child .t-bold',

      // Alternative modern structure
      'section[data-section="experience"] li:first-child .t-bold span[aria-hidden="true"]',
      'section[data-section="experience"] li:first-child .t-bold',

      // New selectors for current LinkedIn structure
      '#experience ~ div li:first-child .t-bold span[aria-hidden="true"]',
      '#experience ~ div li:first-child .t-bold',
      '#experience + div li:first-child .t-bold span[aria-hidden="true"]',
      '#experience + div li:first-child .t-bold',

      // Experience section with pvs-list class
      '.experience-section .pvs-list__paged-list-item:first-child .mr1.t-bold span[aria-hidden="true"]',
      '.experience-section .pvs-list__paged-list-item:first-child .t-bold span[aria-hidden="true"]',
      '.experience-section .pvs-list__paged-list-item:first-child .t-bold',

      // Generic bold text in first experience item
      'section .pvs-list li:first-child .t-bold span[aria-hidden="true"]',
      'section .pvs-list li:first-child .t-bold',

      // Legacy experience selectors
      '.experience-section .pv-entity__summary-info:first-child h3 span[aria-hidden="true"]',
      '.experience-section .pv-entity__summary-info:first-child h3',
      '.pv-profile-section.experience .pv-profile-section__list-item:first-child h3',
      '.experience-section ul li:first-child h3',

      // Generic experience fallbacks
      '[id*="experience"] li:first-child .t-bold span[aria-hidden="true"]',
      '[id*="experience"] li:first-child .t-bold'
    ];

    let jobTitle = '';
    let matchedSelector = null;
    let element = null;

    // Try each selector and validate the result
    for (const selector of selectors) {
      element = document.querySelector(selector);
      if (element) {
        const text = this.cleanText(element.textContent);

        // Validate that this is actually a job title
        if (this.isValidJobTitle(text)) {
          jobTitle = text;
          matchedSelector = selector;
          console.log(`  ✅ Found valid job title with selector: ${selector}`);
          break;
        } else {
          console.log(`  ❌ Rejected text from selector "${selector}": "${text}"`);
        }
      }
    }

    console.log('📝 Job title extraction results:');
    console.log(`  Matched selector: ${matchedSelector || 'None'}`);
    console.log(`  Raw text: "${element?.textContent || 'N/A'}"`);
    console.log(`  After cleanText: "${jobTitle}"`);

    // Clean the job title
    jobTitle = this.cleanJobTitle(jobTitle);

    console.log(`  After cleanJobTitle: "${jobTitle}"`);
    console.log('✅ Extracted job title:', jobTitle);
    return jobTitle;
  }

  /**
   * Clean job title text (remove extra info and formatting)
   */
  cleanJobTitle(jobTitle) {
    if (!jobTitle) return '';

    return jobTitle
      .replace(/^at\s+/i, '')                    // Remove "at Company"
      .replace(/^company:\s*/i, '')              // Remove "Company: Name"
      .replace(/\s*·\s*(Full-time|Part-time|Contract|Freelance|Internship|Self-employed).*$/i, '') // Remove employment type
      .replace(/\s*-\s*(Full-time|Part-time|Contract|Freelance|Internship|Self-employed).*$/i, '') // Remove employment type with dash
      .replace(/\s*•.*$/, '')                    // Remove bullet points and following text
      .replace(/\s*\|.*$/, '')                   // Remove pipe separators and following text
      .replace(/\s*·.*$/, '')                    // Remove middle dots and following text
      .replace(/\s*\(.*\)$/, '')                 // Remove parenthetical info
      .replace(/\s*\d+\s*yr(s)?.*$/i, '')        // Remove duration like "2 yrs 3 mos"
      .replace(/\s*\d{4}\s*[-–].*$/i, '')        // Remove date ranges
      .replace(/\s+/g, ' ')                      // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Clean company name text (remove extra info and formatting)
   */
  cleanCompanyName(company) {
    if (!company) return '';

    return company
      // Remove employment type indicators
      .replace(/\s*·\s*(Full-time|Part-time|Contract|Freelance|Internship|Self-employed).*$/i, '')
      .replace(/\s*-\s*(Full-time|Part-time|Contract|Freelance|Internship|Self-employed).*$/i, '')

      // Remove employee count and company info
      .replace(/\s*\([\d,]+\+?\s*employees?\)/i, '')  // Remove "(1,000+ employees)"
      .replace(/\s*\(.*\)$/, '')                      // Remove other parenthetical info

      // Remove duration and dates
      .replace(/\s*·\s*\d+\s*yr(s)?.*$/i, '')         // Remove "· 2 yrs 3 mos"
      .replace(/\s*\d+\s*yr(s)?\s*\d*\s*mo(s)?.*$/i, '') // Remove duration
      .replace(/\s*\d{4}\s*[-–].*$/i, '')              // Remove date ranges

      // Remove location if it leaked through
      .replace(/\s*,\s*[A-Z][a-z]+.*$/, '')           // Remove ", City, State"

      // Remove bullets and separators
      .replace(/\s*•.*$/, '')                          // Remove bullet points and following text
      .replace(/\s*\|.*$/, '')                         // Remove pipe separators and following text
      .replace(/\s*·.*$/, '')                          // Remove middle dots and following text

      // Remove common prefixes
      .replace(/^company:\s*/i, '')                    // Remove "Company:" prefix
      .replace(/^at\s+/i, '')                          // Remove "at" prefix

      // Remove link text artifacts
      .replace(/\s*link$/i, '')                        // Remove "Company name link"
      .replace(/\s*page$/i, '')                        // Remove "Company page"

      // Clean up whitespace and punctuation
      .replace(/\s*\.\s*$/, '')                       // Remove trailing dots
      .replace(/\s+/g, ' ')                            // Replace multiple spaces with single space
      .replace(/^[\s-]+|[\s-]+$/g, '')                 // Trim spaces and dashes
      .trim();
  }

  /**
   * Extract company from most recent position in Experience section
   */
  extractCompany() {
    console.log('🏢 Starting company extraction from Experience section...');

    // Try multiple ways to find the first experience item
    const experienceSelectors = [
      '[data-field="experience"] .pvs-list__paged-list-item:first-child',
      'section[data-section="experience"] li:first-child',
      '#experience ~ div li:first-child',
      '#experience + div li:first-child',
      'section:has(#experience) li:first-child',
      'div:has(> div > span:has(> #experience)) ul li:first-child',
      '.experience-section li:first-child',
      'section .pvs-list li:first-child'
    ];

    let firstExperienceItem = null;
    for (const selector of experienceSelectors) {
      try {
        firstExperienceItem = document.querySelector(selector);
        if (firstExperienceItem) {
          console.log(`✅ Found experience item with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Selector failed: ${selector}`);
      }
    }

    if (!firstExperienceItem) {
      console.warn('❌ No experience section found on page with standard selectors');
      console.log('Available sections:', Array.from(document.querySelectorAll('section[data-section]')).map(s => s.getAttribute('data-section')));
      console.log('Trying alternative approach...');

      // Try to find any section containing "Experience" text
      const allSections = document.querySelectorAll('section');
      for (const section of allSections) {
        const heading = section.querySelector('h2, h3, [id*="experience"], [id="experience"]');
        if (heading && heading.textContent.toLowerCase().includes('experience')) {
          console.log('Found Experience section by text content');
          firstExperienceItem = section.querySelector('li:first-child, ul > div:first-child');
          if (firstExperienceItem) {
            console.log('✅ Found experience item via text-based search');
            break;
          }
        }
      }
    }

    if (!firstExperienceItem) {
      console.warn('❌ Could not locate any experience items');
      return '';
    }

    console.log('📋 First experience item HTML:', firstExperienceItem.innerHTML.substring(0, 500));

    let isGrouped = false;
    // Check if this item contains nested list (indicates grouped roles)
    const hasNestedList = firstExperienceItem.querySelector('ul.pvs-list') !== null;
    isGrouped = hasNestedList;
    console.log(`  Experience layout: ${isGrouped ? 'Grouped (multiple roles)' : 'Single role'}`);

    const selectors = isGrouped ? this.getGroupedCompanySelectors() : this.getSingleRoleCompanySelectors();

    let company = '';
    let matchedSelector = null;
    let element = null;
    let attemptCount = 0;

    // Try each selector and validate the result
    for (const selector of selectors) {
      attemptCount++;
      element = document.querySelector(selector);
      if (element) {
        const text = this.cleanText(element.textContent);
        console.log(`  Attempt ${attemptCount}: Found element with selector "${selector}"`);
        console.log(`    Text content: "${text}"`);

        // Validate that this is actually a company name
        if (this.isValidCompanyName(text)) {
          company = text;
          matchedSelector = selector;
          console.log(`  ✅ Found valid company with selector: ${selector}`);
          break;
        } else {
          console.log(`  ❌ Rejected text from selector "${selector}": "${text}"`);
        }
      } else {
        console.log(`  Attempt ${attemptCount}: No element found for selector "${selector}"`);
      }
    }

    // If still no company found, try fallback approach
    if (!company) {
      console.log('⚠️ Standard selectors failed, trying fallback extraction...');
      company = this.extractCompanyFallback(firstExperienceItem);
    }

    console.log('📝 Company extraction results:');
    console.log(`  Matched selector: ${matchedSelector || 'Fallback method'}`);
    console.log(`  Raw text: "${element?.textContent || 'N/A'}"`);
    console.log(`  After cleanText: "${company}"`);

    // Clean the company name
    company = this.cleanCompanyName(company);

    console.log(`  After cleanCompanyName: "${company}"`);
    console.log('✅ Extracted company:', company);
    return company;
  }

  /**
   * Fallback method to extract company when standard selectors fail
   */
  extractCompanyFallback(experienceItem) {
    console.log('🔍 Attempting fallback company extraction...');

    // Try to find all text elements and analyze them
    const allTextElements = experienceItem.querySelectorAll('.t-14, .t-normal, span[aria-hidden="true"]');
    console.log(`  Found ${allTextElements.length} potential text elements`);

    for (let i = 0; i < allTextElements.length; i++) {
      const element = allTextElements[i];
      const text = this.cleanText(element.textContent);

      // Skip empty, very short, or bold elements (likely job titles)
      if (!text || text.length < 2 || element.classList.contains('t-bold')) {
        continue;
      }

      console.log(`  Fallback candidate ${i + 1}: "${text}"`);

      // Use relaxed validation for fallback
      if (this.isValidCompanyNameRelaxed(text)) {
        console.log(`  ✅ Fallback found valid company: "${text}"`);
        return text;
      }
    }

    console.log('  ❌ Fallback extraction found no valid company');
    return '';
  }

  /**
   * Get selectors for grouped experience (multiple roles at one company)
   */
  getGroupedCompanySelectors() {
    return [
      // Grouped: Company name is at parent level before nested roles
      '[data-field="experience"] .pvs-list__paged-list-item:first-child > div > div > div:first-child .t-14.t-normal span[aria-hidden="true"]',
      '[data-field="experience"] .pvs-list__paged-list-item:first-child > div .t-14.t-normal span[aria-hidden="true"]',
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-14.t-normal:not(:has(.t-bold)) span[aria-hidden="true"]',

      // Alternative grouped structures
      'section[data-section="experience"] .pvs-list__paged-list-item:first-child > div .t-14.t-normal span[aria-hidden="true"]',
      'section[data-section="experience"] li:first-child > div > div:first-child .t-14.t-normal',

      // New grouped selectors
      '#experience ~ div li:first-child > div .t-14.t-normal span[aria-hidden="true"]',
      '#experience + div li:first-child > div .t-14.t-normal span[aria-hidden="true"]',
      'section .pvs-list li:first-child > div .t-14.t-normal span[aria-hidden="true"]',

      // Legacy grouped
      '.experience-section .pv-entity__company-summary-info .pv-entity__secondary-title',
      '.experience-section li:first-child > .pv-entity__company-summary-info h3 + span'
    ];
  }

  /**
   * Get selectors for single role experience
   */
  getSingleRoleCompanySelectors() {
    return [
      // Most common modern structure - company as second text block
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-14.t-normal span[aria-hidden="true"]',
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-14.t-normal.break-words span[aria-hidden="true"]',
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-14.t-normal:not(.t-bold)',

      // Try broader selectors without requiring exact classes
      '[data-field="experience"] .pvs-list__paged-list-item:first-child .t-14:not(.t-bold) span',
      '[data-field="experience"] .pvs-list__paged-list-item:first-child span.t-14.t-normal',
      '[data-field="experience"] li:first-child .t-14.t-normal',

      // New selectors for current LinkedIn structure
      '#experience ~ div li:first-child .t-14.t-normal span[aria-hidden="true"]',
      '#experience ~ div li:first-child .t-14.t-normal:not(.t-bold)',
      '#experience + div li:first-child .t-14.t-normal span[aria-hidden="true"]',
      '#experience + div li:first-child .t-14.t-normal:not(.t-bold)',

      // Experience section variations
      'section[data-section="experience"] .pvs-list__paged-list-item:first-child .t-14.t-normal span[aria-hidden="true"]',
      'section[data-section="experience"] li:first-child .t-14.t-normal:not(.t-bold)',
      'section[data-section="experience"] li:first-child .t-14 span',
      '.experience-section .pvs-list__paged-list-item:first-child .t-14.t-normal span[aria-hidden="true"]',
      '.experience-section .pvs-list__paged-list-item:first-child .t-14.t-normal',
      '.experience-section .pvs-list__paged-list-item:first-child .pv-entity__secondary-title',

      // Generic selectors for pvs-list structure
      'section .pvs-list li:first-child .t-14.t-normal span[aria-hidden="true"]',
      'section .pvs-list li:first-child .t-14.t-normal:not(.t-bold)',

      // Legacy experience selectors
      '.experience-section .pv-entity__summary-info:first-child .pv-entity__secondary-title',
      '.experience-section .pv-profile-section__list-item:first-child .pv-entity__secondary-title',
      '.pv-profile-section.experience .pv-profile-section__list-item:first-child .pv-entity__secondary-title',

      // Fallbacks from profile header
      '.pv-text-details__left-panel .pv-entity__secondary-title',
      '.pv-top-card .pv-entity__secondary-title',
      '.ph5 .pv-entity__secondary-title',

      // Additional fallbacks
      '.pv-top-card--experience-list .pv-entity__secondary-title',
      '.experience-section .pv-entity__summary-info h3 + .pv-entity__secondary-title'
    ];
  }

  /**
   * Validate if extracted text is a valid company name (strict)
   */
  isValidCompanyName(text) {
    if (!text || text.length < 2) {
      console.log('    Validation failed: Text too short');
      return false;
    }

    // Company names should be reasonable length
    if (text.length > 150) {
      console.log('    Validation failed: Text too long for company name');
      return false;
    }

    // Reject if it's just employment type
    const employmentTypePatterns = [
      /^(Full-time|Part-time|Contract|Freelance|Internship|Self-employed)$/i,
      /^·\s*(Full-time|Part-time|Contract|Freelance|Internship)$/i
    ];

    for (const pattern of employmentTypePatterns) {
      if (pattern.test(text)) {
        console.log(`    Validation failed: Looks like employment type: ${pattern}`);
        return false;
      }
    }

    // Reject if it's just a date or duration
    const datePatterns = [
      /^\d{4}\s*[-–]\s*(\d{4}|Present|Current)$/i,
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i,
      /^\d+\s*yr(s)?\s*\d*\s*mo(s)?$/i,
      /^\d+\s*yr(s)?$/i
    ];

    for (const pattern of datePatterns) {
      if (pattern.test(text)) {
        console.log(`    Validation failed: Looks like date/duration: ${pattern}`);
        return false;
      }
    }

    // Reject common job title patterns (to avoid confusion)
    const jobTitlePatterns = [
      /^(Senior|Junior|Lead|Principal|Chief|Head of|Director of|Manager of|Associate)/i,
      /Engineer$/i,
      /Developer$/i,
      /Designer$/i,
      /Analyst$/i,
      /Consultant$/i,
      /Specialist$/i
    ];

    // Only reject if it STRONGLY looks like a job title (be less strict)
    let jobTitleScore = 0;
    for (const pattern of jobTitlePatterns) {
      if (pattern.test(text)) jobTitleScore++;
    }

    if (jobTitleScore >= 2) {
      console.log('    Validation failed: Strongly resembles a job title');
      return false;
    }

    // Reject UI elements
    const uiElements = [
      /^(Message|Connect|Follow|More|Experience|Show all|See less)$/i,
      /^(Edit|Delete|Add|Remove)$/i,
      /^Company name$/i
    ];

    for (const pattern of uiElements) {
      if (pattern.test(text)) {
        console.log(`    Validation failed: Looks like UI element: ${pattern}`);
        return false;
      }
    }

    // Reject connection degree text
    if (this.isConnectionDegreeText(text)) {
      console.log('    Validation failed: Looks like connection degree text');
      return false;
    }

    console.log('    Validation passed: Text appears to be a valid company name');
    return true;
  }

  /**
   * Relaxed validation for fallback company extraction
   */
  isValidCompanyNameRelaxed(text) {
    if (!text || text.length < 2) return false;
    if (text.length > 150) return false;

    // Only reject obvious non-company patterns
    const rejectPatterns = [
      /^(Full-time|Part-time|Contract|Freelance|Internship)$/i,
      /^\d{4}\s*[-–]\s*(\d{4}|Present)$/i,
      /^\d+\s*yr(s)?\s*\d*\s*mo(s)?$/i,
      /^(Message|Connect|Follow|More|Show all)$/i
    ];

    return !rejectPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Extract location from profile
   */
  extractLocation() {
    const selectors = [
      // More specific location selectors that avoid connection degree text
      '.pv-text-details__left-panel .text-body-small.inline.t-black--light.break-words',
      '.pv-text-details__left-panel .text-body-small:not([aria-label*="connection"])',
      '.pv-text-details__left-panel .text-body-small.inline:last-child',
      '.pv-top-card .text-body-small.inline.t-black--light:not(:first-child)',
      '.ph5 .text-body-small.inline.t-black--light',
      '.pv-top-card--list-bullet .text-body-small',
      '[data-generated-suggestion-target] ~ .text-body-small.inline.t-black--light'
    ];
    const element = this.findElement(selectors);
    let location = element ? this.cleanText(element.textContent) : '';

    console.log('📍 Location extraction:');
    console.log(`  Raw text: "${element ? element.textContent : 'No element found'}"`);
    console.log(`  After cleanText: "${location}"`);
    console.log('✅ Extracted location:', location);
    return location;
  }

  /**
   * Check if text is connection degree related
   */
  isConnectionDegreeText(text) {
    const connectionPatterns = [
      /\d+(st|nd|rd|th)\s*degree/i,
      /\d+\s*connection/i,
      /mutual connection/i,
      /follow/i,
      /message/i,
      /connect/i
    ];
    
    return connectionPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Validate if extracted text is a valid job title from Experience section
   */
  isValidJobTitle(text) {
    if (!text || text.length < 2) {
      console.log('    Validation failed: Text too short');
      return false;
    }

    // Job titles should be reasonable length
    if (text.length > 200) {
      console.log('    Validation failed: Text too long for job title');
      return false;
    }

    // Reject if it's just a date or date range (sometimes first element might be duration)
    const dateOnlyPatterns = [
      /^\d{4}\s*[-–]\s*(\d{4}|Present|Current)$/i,
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[-–].*$/i,
      /^\d+\s*yr(s)?\s*\d*\s*mo(s)?$/i
    ];

    for (const pattern of dateOnlyPatterns) {
      if (pattern.test(text)) {
        console.log(`    Validation failed: Looks like date/duration only: ${pattern}`);
        return false;
      }
    }

    // Reject if it looks like connection degree or UI text
    if (this.isConnectionDegreeText(text)) {
      console.log('    Validation failed: Looks like connection degree text');
      return false;
    }

    // Reject common UI elements or section headers
    const uiElements = [
      /^(Message|Connect|Follow|More|Experience|Show all|See less)$/i,
      /^\d+(st|nd|rd|th)\s*$/i,
      /^(Edit|Delete|Add|Remove)$/i
    ];

    for (const pattern of uiElements) {
      if (pattern.test(text)) {
        console.log(`    Validation failed: Looks like UI element: ${pattern}`);
        return false;
      }
    }

    // Reject if text looks like a company name pattern (all caps, common suffixes)
    const companyPatterns = [
      /^[A-Z\s&,\.]+\s+(Inc\.|LLC|Ltd\.|Corp\.|Corporation|Company)$/i
    ];

    for (const pattern of companyPatterns) {
      if (pattern.test(text)) {
        console.log(`    Validation failed: Looks like company name: ${pattern}`);
        return false;
      }
    }

    console.log('    Validation passed: Text appears to be a valid job title');
    return true;
  }

  /**
   * Check if text is likely a geographical location
   */
  isLikelyLocation(text) {
    // Common location indicators
    const locationPatterns = [
      /\b(county|city|state|province|country)\b/i,
      /\b(united states|usa|canada|uk|australia)\b/i,
      /\b(california|new york|texas|florida|illinois)\b/i,
      /,\s*[A-Z]{2}\b/, // State abbreviations like ", CA"
      /\b\w+,\s*\w+/    // City, State pattern
    ];
    
    // If it matches location patterns, it's likely a location
    if (locationPatterns.some(pattern => pattern.test(text))) {
      return true;
    }
    
    // If it contains common location words
    const locationWords = ['area', 'region', 'metro', 'greater', 'district'];
    if (locationWords.some(word => text.toLowerCase().includes(word))) {
      return true;
    }
    
    // If it has comma-separated parts (typical location format)
    const parts = text.split(',').map(part => part.trim());
    if (parts.length >= 2 && parts.every(part => part.length > 1)) {
      return true;
    }
    
    return false;
  }


  /**
   * Extract profile picture URL
   */
  extractProfilePicture() {
    const selectors = [
      '.pv-top-card__photo img',
      '.presence-entity__image img',
      '.profile-photo-edit__preview img',
      '.pv-top-card--photo img'
    ];

    const element = this.findElement(selectors);
    return element ? element.src : '';
  }

  /**
   * Find element using multiple selectors (fallback approach)
   */
  findElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  /**
   * Clean extracted text data
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .trim()
      .substring(0, 1000); // Limit length to prevent overly long data
  }

  /**
   * Clean and validate all profile data
   */
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

// Initialize the extractor when script loads
const extractor = new LinkedInProfileExtractor();

// Handle page navigation within LinkedIn SPA
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (extractor.isLinkedInProfilePage()) {
      setTimeout(() => extractor.performInitialExtraction(), 1500);
    }
  }
}).observe(document, { subtree: true, childList: true });