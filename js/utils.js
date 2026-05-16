/**
 * Utility functions for common operations
 */

/**
 * Debounce function - delays execution until after wait time has passed
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} immediate - Execute immediately on first call
 * @returns {Function} Debounced function
 */
function debounce(func, wait = CONFIG.PERFORMANCE.DEBOUNCE_DELAY, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

/**
 * Throttle function - limits execution to once per wait time
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit = CONFIG.PERFORMANCE.THROTTLE_DELAY) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Safe DOM query with error handling
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element (default: document)
 * @returns {Element|null} Found element or null
 */
function safeQuerySelector(selector, context = document) {
  try {
    return context.querySelector(selector);
  } catch (error) {
    if (CONFIG.DEV_MODE) {
      console.error(`Query selector error: ${selector}`, error);
    }
    return null;
  }
}

/**
 * Safe DOM query all with error handling
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element (default: document)
 * @returns {NodeList|Array} Found elements or empty array
 */
function safeQuerySelectorAll(selector, context = document) {
  try {
    return context.querySelectorAll(selector);
  } catch (error) {
    if (CONFIG.DEV_MODE) {
      console.error(`Query selector all error: ${selector}`, error);
    }
    return [];
  }
}

/**
 * Execute function safely with error handling
 * @param {Function} fn - Function to execute
 * @param {string} context - Context description for error logging
 * @param {*} defaultValue - Default value to return on error
 * @returns {*} Function result or default value
 */
function safeExecute(fn, context = 'Unknown', defaultValue = null) {
  try {
    return fn();
  } catch (error) {
    if (CONFIG.DEV_MODE) {
      console.error(`Error in ${context}:`, error);
    }
    return defaultValue;
  }
}

/**
 * Check if DOM is ready
 * @returns {boolean} True if DOM is ready
 */
function isDOMReady() {
  return document.readyState === 'complete' || document.readyState === 'interactive';
}

/**
 * Wait for DOM to be ready
 * @param {Function} callback - Callback to execute when ready
 */
function onDOMReady(callback) {
  if (isDOMReady()) {
    callback();
  } else {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  }
}

/**
 * Wait for window to be fully loaded
 * @param {Function} callback - Callback to execute when loaded
 */
function onWindowLoad(callback) {
  if (document.readyState === 'complete') {
    callback();
  } else {
    window.addEventListener('load', callback, { once: true });
  }
}

/**
 * Create a cached element getter
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element
 * @returns {Function} Cached getter function
 */
function createCachedGetter(selector, context = document) {
  let cached = null;
  return function() {
    if (!cached || !document.contains(cached)) {
      cached = safeQuerySelector(selector, context);
    }
    return cached;
  };
}

/**
 * Batch DOM reads and writes for better performance
 * @param {Function} readFn - Function that performs DOM reads
 * @param {Function} writeFn - Function that performs DOM writes
 */
function batchDOMOperations(readFn, writeFn) {
  // Read phase
  const data = readFn();
  
  // Use requestAnimationFrame for write phase
  requestAnimationFrame(() => {
    writeFn(data);
  });
}

/**
 * Clean up function for timers and observers
 */
class CleanupManager {
  constructor() {
    this.timers = new Set();
    this.observers = new Set();
    this.listeners = new Map();
  }

  addTimer(timerId) {
    this.timers.add(timerId);
    return timerId;
  }

  addObserver(observer) {
    this.observers.add(observer);
    return observer;
  }

  addEventListener(element, event, handler, options) {
    if (!this.listeners.has(element)) {
      this.listeners.set(element, []);
    }
    this.listeners.get(element).push({ event, handler, options });
    element.addEventListener(event, handler, options);
  }

  cleanup() {
    // Clear all timers
    this.timers.forEach(timerId => {
      clearTimeout(timerId);
      clearInterval(timerId);
    });
    this.timers.clear();

    // Disconnect all observers
    this.observers.forEach(observer => {
      observer.disconnect();
    });
    this.observers.clear();

    // Remove all event listeners
    this.listeners.forEach((listeners, element) => {
      listeners.forEach(({ event, handler, options }) => {
        element.removeEventListener(event, handler, options);
      });
    });
    this.listeners.clear();
  }
}

// Global cleanup manager instance
const cleanupManager = new CleanupManager();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanupManager.cleanup();
});

