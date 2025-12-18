/**
 * Shared Utilities for HTML5 Game Lab
 * Provides error handling, localStorage management, and common utilities
 */

// ====== Safe LocalStorage ======
const SafeStorage = {
    /**
     * Safely get item from localStorage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key doesn't exist or error occurs
     * @returns {*} Stored value or default
     */
    get(key, defaultValue = null) {
        try {
            if (!this.isAvailable()) {
                return defaultValue;
            }
            const value = localStorage.getItem(key);
            return value !== null ? JSON.parse(value) : defaultValue;
        } catch (e) {
            console.warn('localStorage get failed:', e);
            return defaultValue;
        }
    },

    /**
     * Safely set item in localStorage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} Success status
     */
    set(key, value) {
        try {
            if (!this.isAvailable()) {
                return false;
            }
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn('localStorage set failed:', e);
            return false;
        }
    },

    /**
     * Check if localStorage is available
     * @returns {boolean}
     */
    isAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Remove item from localStorage
     * @param {string} key - Storage key
     */
    remove(key) {
        try {
            if (this.isAvailable()) {
                localStorage.removeItem(key);
            }
        } catch (e) {
            console.warn('localStorage remove failed:', e);
        }
    }
};

// ====== Browser Support Detection ======
const BrowserSupport = {
    /**
     * Check if Canvas 2D is supported
     * @returns {boolean}
     */
    checkCanvas() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext && canvas.getContext('2d'));
        } catch (e) {
            return false;
        }
    },

    /**
     * Check if Audio API is supported
     * @returns {boolean}
     */
    checkAudio() {
        try {
            return !!(new Audio().canPlayType);
        } catch (e) {
            return false;
        }
    },

    /**
     * Check if requestAnimationFrame is supported
     * @returns {boolean}
     */
    checkAnimationFrame() {
        return !!(window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame);
    },

    /**
     * Get all support status
     * @returns {Object}
     */
    getStatus() {
        return {
            canvas: this.checkCanvas(),
            audio: this.checkAudio(),
            animationFrame: this.checkAnimationFrame(),
            localStorage: SafeStorage.isAvailable()
        };
    }
};

// ====== Error Handler ======
const ErrorHandler = {
    /**
     * Show user-friendly error message
     * @param {string} message - Error message
     * @param {boolean} fatal - If true, stops game execution
     */
    showError(message, fatal = false) {
        console.error(message);
        
        // Create error overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            font-family: system-ui, sans-serif;
            padding: 20px;
            text-align: center;
        `;
        
        overlay.innerHTML = `
            <h2 style="color: #ef4444; margin-bottom: 20px;">⚠️ Error</h2>
            <p style="margin-bottom: 20px;">${message}</p>
            ${fatal ? '' : '<button onclick="this.parentElement.remove()" style="padding: 10px 20px; background: #22c55e; border: none; border-radius: 5px; color: white; cursor: pointer;">OK</button>'}
        `;
        
        document.body.appendChild(overlay);
        
        if (fatal) {
            throw new Error(message);
        }
    },

    /**
     * Handle sound loading errors gracefully
     * @param {string} soundName - Name of the sound that failed
     */
    handleSoundError(soundName) {
        console.warn(`Sound "${soundName}" failed to load. Game will continue without sound.`);
        // Don't show error to user for missing sounds - game is still playable
    }
};

// ====== Input Utilities ======
const InputUtils = {
    /**
     * Get canvas coordinates from mouse/touch event
     * @param {HTMLElement} canvas - Canvas element
     * @param {Event} event - Mouse or touch event
     * @returns {Object} {x, y} coordinates
     */
    getCanvasCoordinates(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clientX = event.clientX || (event.touches && event.touches[0].clientX);
        const clientY = event.clientY || (event.touches && event.touches[0].clientY);
        
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    },

    /**
     * Prevent default touch behaviors
     */
    preventTouchDefaults() {
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault(); // Prevent pinch zoom
            }
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });
    }
};

// ====== Performance Utilities ======
const PerformanceUtils = {
    /**
     * Throttle function calls
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
};

// Export utilities (for use in modules or global scope)
if (typeof window !== 'undefined') {
    window.GameUtils = {
        SafeStorage,
        BrowserSupport,
        ErrorHandler,
        InputUtils,
        PerformanceUtils
    };
}

// For Node.js environments (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SafeStorage,
        BrowserSupport,
        ErrorHandler,
        InputUtils,
        PerformanceUtils
    };
}

