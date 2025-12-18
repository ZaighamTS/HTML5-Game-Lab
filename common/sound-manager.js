/**
 * Sound Manager for HTML5 Game Lab
 * Handles sound preloading, playback, and error handling
 */

class SoundManager {
    constructor() {
        this.sounds = new Map();
        this.muted = false;
        this.volume = 1.0;
        this.loaded = false;
        this.loading = false;
        this.loadPromises = [];
    }

    /**
     * Preload multiple sounds
     * @param {Array<{name: string, path: string}>} soundList - Array of sound objects
     * @returns {Promise<void>}
     */
    async preloadSounds(soundList) {
        if (this.loading) {
            return Promise.all(this.loadPromises);
        }

        this.loading = true;
        this.loadPromises = soundList.map(({name, path}) => {
            return new Promise((resolve, reject) => {
                try {
                    const audio = new Audio(path);
                    audio.preload = 'auto';
                    
                    // Set volume
                    audio.volume = this.volume;
                    
                    // Handle successful load
                    const handleCanPlay = () => {
                        audio.removeEventListener('canplaythrough', handleCanPlay);
                        audio.removeEventListener('error', handleError);
                        this.sounds.set(name, audio);
                        resolve({name, success: true});
                    };
                    
                    // Handle load error
                    const handleError = () => {
                        audio.removeEventListener('canplaythrough', handleCanPlay);
                        audio.removeEventListener('error', handleError);
                        if (window.GameUtils && window.GameUtils.ErrorHandler) {
                            window.GameUtils.ErrorHandler.handleSoundError(name);
                        }
                        resolve({name, success: false}); // Resolve instead of reject to continue
                    };
                    
                    audio.addEventListener('canplaythrough', handleCanPlay);
                    audio.addEventListener('error', handleError);
                    
                    // Start loading
                    audio.load();
                    
                    // Timeout after 5 seconds
                    setTimeout(() => {
                        if (!this.sounds.has(name)) {
                            handleError();
                        }
                    }, 5000);
                    
                } catch (error) {
                    if (window.GameUtils && window.GameUtils.ErrorHandler) {
                        window.GameUtils.ErrorHandler.handleSoundError(name);
                    }
                    resolve({name, success: false});
                }
            });
        });

        await Promise.all(this.loadPromises);
        this.loaded = true;
        this.loading = false;
    }

    /**
     * Play a sound
     * @param {string} name - Sound name
     * @param {number} volume - Optional volume override (0-1)
     */
    play(name, volume = null) {
        if (this.muted || !this.loaded) return;
        
        const sound = this.sounds.get(name);
        if (sound) {
            try {
                sound.currentTime = 0;
                sound.volume = volume !== null ? volume : this.volume;
                const playPromise = sound.play();
                
                // Handle play promise rejection (browser autoplay policy)
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // User interaction required - this is normal
                        console.debug(`Sound "${name}" play prevented by browser policy`);
                    });
                }
            } catch (error) {
                console.warn(`Failed to play sound "${name}":`, error);
            }
        }
    }

    /**
     * Stop a sound
     * @param {string} name - Sound name
     */
    stop(name) {
        const sound = this.sounds.get(name);
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    }

    /**
     * Stop all sounds
     */
    stopAll() {
        this.sounds.forEach(sound => {
            sound.pause();
            sound.currentTime = 0;
        });
    }

    /**
     * Set volume for all sounds
     * @param {number} volume - Volume level (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.sounds.forEach(sound => {
            sound.volume = this.volume;
        });
        
        // Save to localStorage
        if (window.GameUtils && window.GameUtils.SafeStorage) {
            window.GameUtils.SafeStorage.set('soundVolume', this.volume);
        }
    }

    /**
     * Toggle mute
     * @param {boolean} muted - Optional mute state
     */
    toggleMute(muted = null) {
        this.muted = muted !== null ? muted : !this.muted;
        
        // Save to localStorage
        if (window.GameUtils && window.GameUtils.SafeStorage) {
            window.GameUtils.SafeStorage.set('soundMuted', this.muted);
        }
        
        return this.muted;
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        if (window.GameUtils && window.GameUtils.SafeStorage) {
            this.volume = window.GameUtils.SafeStorage.get('soundVolume', 1.0);
            this.muted = window.GameUtils.SafeStorage.get('soundMuted', false);
        }
    }

    /**
     * Check if a sound is loaded
     * @param {string} name - Sound name
     * @returns {boolean}
     */
    isLoaded(name) {
        return this.sounds.has(name);
    }

    /**
     * Get loading progress
     * @returns {number} Progress percentage (0-100)
     */
    getLoadingProgress() {
        if (!this.loading) return this.loaded ? 100 : 0;
        // This is a simple implementation - could be enhanced with actual progress tracking
        return 50; // Placeholder
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.SoundManager = new SoundManager();
    window.SoundManager.loadSettings();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundManager;
}

