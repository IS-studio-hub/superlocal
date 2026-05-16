/**
 * Configuration constants for the application
 * Centralized configuration to avoid magic numbers and strings
 */

const CONFIG = {
  // Animation durations (in milliseconds)
  ANIMATION: {
    DURATION: 600,
    EASING: 'cubic-bezier(0.4, 0, 0.2, 1)',
    LINE_DELAY: 50,
  },

  // Retry intervals (in milliseconds)
  RETRY: {
    INITIAL: 50,
    SHORT: 100,
    MEDIUM: 500,
    LONG: 1000,
    VERY_LONG: 2000,
    EXTRA_LONG: 3000,
    MAX: 5000,
  },

  // Selector strings
  SELECTORS: {
    FOOTER: '#footer',
    PHYSICS_CONTAINER: '[data-framer-name="Physics DSK"]',
    PHYSICS_BODIES: '[id^="physics-body-footer"]',
    LOGO: '[data-framer-name="Logo"]',
    MAIN: '#main',
    BODY: 'body',
  },

  // Physics constants
  PHYSICS: {
    GRAVITY: 0.4,
    FRICTION: 0.98,
    BOUNCE: 0.7,
    MIN_VELOCITY: 0.1,
    DRAG_VELOCITY_MULTIPLIER: 0.35,
  },

  // Performance settings
  PERFORMANCE: {
    DEBOUNCE_DELAY: 100,
    THROTTLE_DELAY: 16, // ~60fps
    MUTATION_DEBOUNCE: 100,
    IDLE_CALLBACK_TIMEOUT: 500,
  },

  // Development mode
  DEV_MODE: false, // Set to true for development logging
};

// Freeze config to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.ANIMATION);
Object.freeze(CONFIG.RETRY);
Object.freeze(CONFIG.SELECTORS);
Object.freeze(CONFIG.PHYSICS);
Object.freeze(CONFIG.PERFORMANCE);

