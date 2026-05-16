/**
 * Centralized initialization manager
 * Consolidates all initialization attempts into a single entry point
 */

class InitializationManager {
  constructor() {
    this.initialized = false;
    this.criticalTasks = [];
    this.nonCriticalTasks = [];
    this.deferredTasks = [];
    this.mutationObserver = null;
  }

  /**
   * Register a critical task (runs immediately on DOM ready)
   * @param {Function} task - Task function to execute
   * @param {string} name - Task name for logging
   */
  registerCritical(task, name = 'Unknown') {
    this.criticalTasks.push({ task, name });
  }

  /**
   * Register a non-critical task (runs when idle)
   * @param {Function} task - Task function to execute
   * @param {string} name - Task name for logging
   */
  registerNonCritical(task, name = 'Unknown') {
    this.nonCriticalTasks.push({ task, name });
  }

  /**
   * Register a deferred task (runs after initial load)
   * @param {Function} task - Task function to execute
   * @param {number} delay - Delay in milliseconds
   * @param {string} name - Task name for logging
   */
  registerDeferred(task, delay = CONFIG.RETRY.MEDIUM, name = 'Unknown') {
    this.deferredTasks.push({ task, delay, name });
  }

  /**
   * Execute critical tasks
   */
  executeCritical() {
    this.criticalTasks.forEach(({ task, name }) => {
      safeExecute(() => {
        task();
      }, `Critical task: ${name}`);
    });
  }

  /**
   * Execute non-critical tasks using requestIdleCallback
   */
  executeNonCritical() {
    const execute = () => {
      this.nonCriticalTasks.forEach(({ task, name }) => {
        safeExecute(() => {
          task();
        }, `Non-critical task: ${name}`);
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(execute, { timeout: CONFIG.PERFORMANCE.IDLE_CALLBACK_TIMEOUT });
    } else {
      setTimeout(execute, CONFIG.RETRY.SHORT);
    }
  }

  /**
   * Execute deferred tasks
   */
  executeDeferred() {
    this.deferredTasks.forEach(({ task, delay, name }) => {
      const timerId = setTimeout(() => {
        safeExecute(() => {
          task();
        }, `Deferred task: ${name}`);
      }, delay);
      cleanupManager.addTimer(timerId);
    });
  }

  /**
   * Initialize with proper DOM ready detection
   */
  init() {
    if (this.initialized) return;
    
    // Execute critical tasks immediately if DOM is ready
    if (isDOMReady()) {
      this.executeCritical();
      this.executeNonCritical();
    } else {
      // Wait for DOM ready
      onDOMReady(() => {
        this.executeCritical();
        this.executeNonCritical();
      });
    }

    // Execute deferred tasks
    this.executeDeferred();

    // Set up mutation observer for dynamic content
    this.setupMutationObserver();

    // Mark as initialized
    this.initialized = true;
  }

  /**
   * Set up mutation observer with debouncing
   */
  setupMutationObserver() {
    if (!document.body) {
      onDOMReady(() => this.setupMutationObserver());
      return;
    }

    const debouncedMutation = debounce(() => {
      this.executeCritical();
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => this.executeNonCritical(), { timeout: CONFIG.RETRY.SHORT });
      } else {
        setTimeout(() => this.executeNonCritical(), CONFIG.RETRY.SHORT);
      }
    }, CONFIG.PERFORMANCE.MUTATION_DEBOUNCE);

    this.mutationObserver = new MutationObserver(debouncedMutation);
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    cleanupManager.addObserver(this.mutationObserver);
  }

  /**
   * Cleanup all observers and timers
   */
  cleanup() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }
}

// Global initialization manager instance
const initManager = new InitializationManager();

// Initialize when script loads
if (isDOMReady()) {
  initManager.init();
} else {
  onDOMReady(() => initManager.init());
  onWindowLoad(() => {
    // Run deferred tasks one more time after full load
    initManager.executeDeferred();
  });
}

