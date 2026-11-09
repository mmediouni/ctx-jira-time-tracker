/**
 * Jira Time Tracker - IndexedDB Manager
 * Handles local persistence of time tracking entries, notes, and metrics.
 */

const DB_NAME = 'JiraTimeTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'time_entries';

class JiraTimeTrackerDB {
  constructor() {
    this.db = null;
  }

  /**
   * Initializes the IndexedDB database and schema.
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('ticketKey', 'ticketKey', { unique: false });
          store.createIndex('startTime', 'startTime', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Add a new completed time entry
   * @param {Object} entry
   */
  async addEntry(entry) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(entry);

      req.onsuccess = () => resolve(entry);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Update an existing entry (e.g. edit notes or duration)
   * @param {Object} entry
   */
  async updateEntry(entry) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);

      req.onsuccess = () => resolve(entry);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Delete an entry by id
   * @param {string} id
   */
  async deleteEntry(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get a single entry by id
   * @param {string} id
   */
  async getEntry(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Retrieve all entries, sorted by startTime descending (most recent first)
   */
  async getAllEntries() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
        resolve(list);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Get all entries for a specific ticket key
   * @param {string} ticketKey
   */
  async getEntriesByTicket(ticketKey) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('ticketKey');
      const req = index.getAll(ticketKey);

      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
        resolve(list);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Compute aggregated statistics (today, this week, total, by ticket)
   */
  async getStats() {
    const entries = await this.getAllEntries();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    // Start of current week (Monday)
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday).getTime();

    let totalSeconds = 0;
    let todaySeconds = 0;
    let weekSeconds = 0;
    const ticketSummary = {};

    for (const e of entries) {
      const dur = e.durationSeconds || 0;
      totalSeconds += dur;
      if (e.startTime >= startOfToday) {
        todaySeconds += dur;
      }
      if (e.startTime >= startOfWeek) {
        weekSeconds += dur;
      }

      const key = e.ticketKey || 'SANS-CLE';
      if (!ticketSummary[key]) {
        ticketSummary[key] = {
          ticketKey: key,
          ticketTitle: e.ticketTitle || 'Sans titre',
          ticketUrl: e.ticketUrl || '',
          totalSeconds: 0,
          entriesCount: 0
        };
      }
      ticketSummary[key].totalSeconds += dur;
      ticketSummary[key].entriesCount += 1;
    }

    return {
      totalEntries: entries.length,
      totalSeconds,
      todaySeconds,
      weekSeconds,
      ticketSummary: Object.values(ticketSummary).sort((a, b) => b.totalSeconds - a.totalSeconds)
    };
  }

  /**
   * Export all entries to CSV format
   */
  async exportToCSV() {
    const entries = await this.getAllEntries();
    if (entries.length === 0) return null;

    const headers = [
      'Ticket Key',
      'Ticket Title',
      'Duration (seconds)',
      'Duration (formatted)',
      'Start Time',
      'End Time',
      'Date',
      'Notes',
      'Ticket URL'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = entries.map(e => [
      escapeCsv(e.ticketKey || ''),
      escapeCsv(e.ticketTitle || ''),
      e.durationSeconds || 0,
      escapeCsv(e.formattedDuration || '00:00:00'),
      escapeCsv(e.startTime ? new Date(e.startTime).toLocaleString() : ''),
      escapeCsv(e.endTime ? new Date(e.endTime).toLocaleString() : ''),
      escapeCsv(e.startTime ? new Date(e.startTime).toISOString().slice(0, 10) : ''),
      escapeCsv(e.notes || ''),
      escapeCsv(e.ticketUrl || '')
    ].join(';')); // Semicolon format standard for French Excel

    return [headers.join(';'), ...rows].join('\r\n');
  }

  /**
   * Format seconds to HH:MM:SS
   */
  static formatDuration(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [
      String(h).padStart(2, '0'),
      String(m).padStart(2, '0'),
      String(s).padStart(2, '0')
    ].join(':');
  }

  /**
   * Format seconds to human friendly string (e.g., "1h 24m")
   */
  static formatHuman(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}

// Export singleton instance or class
if (typeof window !== 'undefined') {
  window.jiraDB = new JiraTimeTrackerDB();
}

