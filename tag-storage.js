class TagStorageService {
  constructor() {
    this.STORAGE_KEY = 'tagSuggestions';
    this.MAX_TAGS = 1000;
  }

  async getAllTags() {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      return result[this.STORAGE_KEY] || {};
    } catch (error) {
      console.error('Failed to load tags:', error);
      return {};
    }
  }

  async recordTags(tagsString) {
    if (!tagsString || typeof tagsString !== 'string') {
      return;
    }

    const tags = tagsString
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length <= 100);

    if (tags.length === 0) {
      return;
    }

    try {
      const allTags = await this.getAllTags();
      const now = Date.now();

      tags.forEach(tag => {
        if (allTags[tag]) {
          allTags[tag].count += 1;
          allTags[tag].lastUsed = now;
        } else {
          allTags[tag] = {
            count: 1,
            firstUsed: now,
            lastUsed: now
          };
        }
      });

      const tagCount = Object.keys(allTags).length;
      if (tagCount > this.MAX_TAGS) {
        this.pruneOldTags(allTags, tagCount - this.MAX_TAGS);
      }

      await chrome.storage.local.set({ [this.STORAGE_KEY]: allTags });
      console.log('Tags recorded successfully:', tags);
    } catch (error) {
      console.error('Failed to record tags:', error);
    }
  }

  pruneOldTags(allTags, removeCount) {
    const sortedTags = Object.entries(allTags)
      .sort((a, b) => {
        if (a[1].count !== b[1].count) {
          return a[1].count - b[1].count;
        }
        return a[1].lastUsed - b[1].lastUsed;
      });

    for (let i = 0; i < removeCount; i++) {
      delete allTags[sortedTags[i][0]];
    }
  }

  async getSuggestions(filterText = '', excludeTags = [], limit = 20) {
    try {
      const allTags = await this.getAllTags();
      const lowerFilter = filterText.toLowerCase().trim();
      const excludeSet = new Set(excludeTags.map(t => t.toLowerCase().trim()));

      let suggestions = Object.entries(allTags)
        .filter(([tag]) => {
          const lowerTag = tag.toLowerCase();
          return !excludeSet.has(lowerTag) &&
                 (lowerFilter === '' || lowerTag.includes(lowerFilter));
        })
        .map(([tag, data]) => ({
          tag,
          count: data.count,
          lastUsed: data.lastUsed
        }))
        .sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return b.lastUsed - a.lastUsed;
        })
        .slice(0, limit);

      return suggestions;
    } catch (error) {
      console.error('Failed to get tag suggestions:', error);
      return [];
    }
  }

  async clearAllTags() {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
      console.log('All tags cleared');
    } catch (error) {
      console.error('Failed to clear tags:', error);
    }
  }

  async getStatistics() {
    try {
      const allTags = await this.getAllTags();
      const tags = Object.entries(allTags);

      if (tags.length === 0) {
        return {
          totalTags: 0,
          totalUsage: 0,
          mostUsedTag: null,
          mostUsedCount: 0
        };
      }

      const totalUsage = tags.reduce((sum, [, data]) => sum + data.count, 0);
      const mostUsed = tags.reduce((max, current) =>
        current[1].count > max[1].count ? current : max
      );

      return {
        totalTags: tags.length,
        totalUsage,
        mostUsedTag: mostUsed[0],
        mostUsedCount: mostUsed[1].count
      };
    } catch (error) {
      console.error('Failed to get tag statistics:', error);
      return {
        totalTags: 0,
        totalUsage: 0,
        mostUsedTag: null,
        mostUsedCount: 0
      };
    }
  }

  async exportTags() {
    try {
      const allTags = await this.getAllTags();
      return JSON.stringify(allTags, null, 2);
    } catch (error) {
      console.error('Failed to export tags:', error);
      return null;
    }
  }

  async importTags(jsonString) {
    try {
      const importedTags = JSON.parse(jsonString);

      if (typeof importedTags !== 'object' || importedTags === null) {
        throw new Error('Invalid tag data format');
      }

      const currentTags = await this.getAllTags();

      Object.entries(importedTags).forEach(([tag, data]) => {
        if (typeof data === 'object' && data.count && data.lastUsed) {
          if (currentTags[tag]) {
            currentTags[tag].count += data.count;
            currentTags[tag].lastUsed = Math.max(currentTags[tag].lastUsed, data.lastUsed);
          } else {
            currentTags[tag] = data;
          }
        }
      });

      await chrome.storage.local.set({ [this.STORAGE_KEY]: currentTags });
      console.log('Tags imported successfully');
      return true;
    } catch (error) {
      console.error('Failed to import tags:', error);
      return false;
    }
  }
}
