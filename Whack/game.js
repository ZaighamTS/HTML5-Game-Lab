const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical game dimensions (used for game logic, not actual canvas pixels)
const GAME_WIDTH = 900;
const GAME_HEIGHT = 600;

// Optimize text rendering for crisp text
ctx.textBaseline = 'top';
ctx.textAlign = 'left';
// Enable better text rendering
if (ctx.imageSmoothingEnabled !== undefined) {
    ctx.imageSmoothingEnabled = true;
}

// ===== SETTINGS =====
const GRID_COLS = 3;
const GRID_ROWS = 3;
const HOLE_SIZE = 130;
const MOLE_SIZE = 90;
const HOLE_RADIUS = 50;
const START_TIME = 30; // seconds

// ===== GAME STATE =====
const START_LIVES = 3;
let holes = [];
let activeMoles = []; // Array of active moles (multiple moles support)
let score = 0;
let combo = 0;
let lives = START_LIVES;
let timeLeft = START_TIME;
let particles = []; // For hit effects
let screenShake = 0; // Screen shake on hit
let missClick = false; // Track if player clicked but missed

let spawnTimer = 0;
let baseSpawnInterval = 1.2; // Base spawn interval
let spawnInterval = 1.2; // Current spawn interval (modified by difficulty)

// Difficulty tracking
let baseDifficultyMultiplier = 1.0; // Time-based difficulty
let comboDifficultyMultiplier = 1.0; // Combo-based difficulty

let lastTime = 0;
let gameState = "menu"; // menu | playing | gameOver
let gameOverTime = 0; // Timestamp when game over state started
const GAME_OVER_DELAY = 3; // Seconds to wait before allowing restart
let animationTime = 0; // for UI animations
let mouseX = 0;
let mouseY = 0;
let bestScore = 0;
try {
    bestScore = parseInt(localStorage.getItem("whackBestScore") || "0", 10);
} catch (e) {
    bestScore = 0;
}

// ===== SOUNDS =====
const hitSound = new Audio("../Sounds/hit.wav");
const badSound = new Audio("../Sounds/bad.wav");
const goldenSound = new Audio("../Sounds/golden.wav");
const missSound = new Audio("../Sounds/miss.wav");
const gameStartSound = new Audio("../Sounds/gamestart.wav");
const gameOverSound = new Audio("../Sounds/gameover.wav");
const comboSound = new Audio("../Sounds/combo.wav");

// ===== SETUP =====
function setupHoles() {
    holes = [];
    const offsetX = (GAME_WIDTH - GRID_COLS * HOLE_SIZE) / 2;
    const offsetY = (GAME_HEIGHT - GRID_ROWS * HOLE_SIZE) / 2 - 20; // Center vertically

    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            holes.push({
                x: offsetX + c * HOLE_SIZE,
                y: offsetY + r * HOLE_SIZE
            });
        }
    }
}

// ===== INPUT =====
canvas.addEventListener("mousedown", handleHit);
canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleHit(e.touches[0]);
}, { passive: false });

function handleHit(e) {
    if (gameState !== "playing") return;
    
    const rect = canvas.getBoundingClientRect();
    // Transform screen coordinates to game coordinates (logical dimensions)
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check all active moles for hits
    let hitAnyMole = false;
    for (let i = activeMoles.length - 1; i >= 0; i--) {
        const mole = activeMoles[i];
        const moleDrawY = mole.holeY + mole.yOffset;
        const dx = x - mole.x;
        const dy = y - moleDrawY;

        if (Math.sqrt(dx * dx + dy * dy) < MOLE_SIZE / 2) {
            hitAnyMole = true;
            
            if (mole.type === "bad") {
                // Bad mole clicked - lose a life, no other effects
                lives--;
                mole.hit = true;
                mole.hitTimer = 0;
                mole.retreating = true;
                
                // Play bad mole sound
                badSound.currentTime = 0;
                badSound.play();
                
                // Create red particle effects
                createBadMoleParticles(mole.x, moleDrawY);
                screenShake = 0.2;
                
                if (lives <= 0) {
                    gameState = "gameOver";
                    if (gameOverTime === 0) {
                        gameOverTime = Date.now();
                        // Play game over sound
                        gameOverSound.currentTime = 0;
                        gameOverSound.play();
                    }
                    return; // Exit function immediately when game ends
                }
                break; // Only process one mole per click (exit loop)
            } else if (mole.type === "golden") {
                // Golden mole clicked - normal mole behavior + add time
                score += 10 + combo * 2;
                const oldCombo = combo;
                combo++;
                timeLeft += 10; // Add 10 seconds
                updateDifficulty();
                mole.hit = true;
                mole.hitTimer = 0;
                mole.retreating = true;
                
                // Play golden mole sound
                goldenSound.currentTime = 0;
                goldenSound.play();
                
                // Play combo sound if combo increased
                if (combo > oldCombo && combo > 1) {
                    comboSound.currentTime = 0;
                    comboSound.play();
                }
                
                // Create golden particle effects
                createGoldenMoleParticles(mole.x, moleDrawY);
                screenShake = 0.15;
            } else {
                // Normal mole clicked
                score += 10 + combo * 2;
                const oldCombo = combo;
                combo++;
                updateDifficulty();
                mole.hit = true;
                mole.hitTimer = 0;
                mole.retreating = true;
                
                // Play hit sound
                hitSound.currentTime = 0;
                hitSound.play();
                
                // Play combo sound if combo increased
                if (combo > oldCombo && combo > 1) {
                    comboSound.currentTime = 0;
                    comboSound.play();
                }
                
                // Create particle effects
                createHitParticles(mole.x, moleDrawY);
                screenShake = 0.15;
            }
            break; // Only hit one mole per click
        }
    }
    
    if (!hitAnyMole) {
        // Wrong click - deduct 5 seconds and reset combo/difficulty
        timeLeft = Math.max(0, timeLeft - 5);
        combo = 0;
        resetDifficulty();
        
        // Play miss sound
        missSound.currentTime = 0;
        missSound.play();
        
        if (timeLeft <= 0) {
            gameState = "gameOver";
            if (gameOverTime === 0) {
                gameOverTime = Date.now();
                // Play game over sound
                gameOverSound.currentTime = 0;
                gameOverSound.play();
            }
        }
    }
}

function createHitParticles(x, y) {
    const colors = ['#facc15', '#fbbf24', '#f59e0b', '#92400e'];
    for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const speed = 80 + Math.random() * 60;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 30,
            life: 0.4,
            maxLife: 0.4,
            size: 4 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

// ===== GAME CONTROL =====
function startGame() {
    score = 0;
    combo = 0;
    lives = START_LIVES;
    timeLeft = START_TIME;
    baseSpawnInterval = 1.2;
    spawnInterval = 1.2;
    spawnTimer = 0;
    activeMoles = [];
    particles = [];
    screenShake = 0;
    missClick = false;
    gameOverTime = 0;
    baseDifficultyMultiplier = 1.0;
    comboDifficultyMultiplier = 1.0;
    gameState = "playing";
    // Play game start sound
    gameStartSound.currentTime = 0;
    gameStartSound.play();
}

// Calculate difficulty multipliers
function updateDifficulty() {
    // Time-based difficulty: increases gradually over time
    const timeProgress = (START_TIME - timeLeft) / START_TIME; // 0 to 1
    baseDifficultyMultiplier = 1.0 + (timeProgress * 0.2); // 1.0 to 1.2 (more gradual)
    
    // Combo-based difficulty: increases gradually with combo (caps at 1.5x)
    comboDifficultyMultiplier = 1.0 + Math.min(combo * 0.05, 0.5); // 1.0 to 1.5 (more gradual)
    
    // Apply to spawn interval
    spawnInterval = baseSpawnInterval / (baseDifficultyMultiplier * comboDifficultyMultiplier);
    spawnInterval = Math.max(0.5, spawnInterval); // Minimum 0.5 seconds (slightly slower)
}

// Reset difficulty when combo is lost
function resetDifficulty() {
    comboDifficultyMultiplier = 1.0;
    updateDifficulty();
}

function spawnMole() {
    // Don't spawn if all holes are occupied
    const occupiedHoles = activeMoles.map(m => m.holeIndex);
    const availableHoles = holes.map((h, i) => i).filter(i => !occupiedHoles.includes(i));
    
    if (availableHoles.length === 0) return; // All holes occupied
    
    const randomHoleIndex = availableHoles[Math.floor(Math.random() * availableHoles.length)];
    const hole = holes[randomHoleIndex];
    
    // Cap maximum moles at once based on difficulty (max 3 moles at once)
    const maxMoles = Math.min(3, Math.floor(1 + comboDifficultyMultiplier));
    if (activeMoles.length >= maxMoles) return;
    
    // Determine mole type
    let moleType = "normal";
    const rand = Math.random();
    
    // Golden mole: 5% chance (very rare)
    if (rand < 0.05) {
        moleType = "golden";
    }
    // Bad mole: 15% chance
    else if (rand < 0.20) {
        moleType = "bad";
    }
    // Normal mole: 80% chance
    else {
        moleType = "normal";
    }
    
    const mole = {
        x: hole.x + HOLE_SIZE / 2,
        holeY: hole.y + HOLE_SIZE / 2,
        holeIndex: randomHoleIndex,
        type: moleType, // "normal" | "bad" | "golden"
        timer: 0,
        hit: false,
        hitTimer: 0,
        retreating: false,
        escapeTimer: 0,
        yOffset: 60, // Start fully underground (60 pixels below hole center)
        phase: "emerging", // "emerging" | "up" | "escaping"
        speedMultiplier: comboDifficultyMultiplier // Each mole uses current combo difficulty
    };
    
    activeMoles.push(mole);
}

// ===== UPDATE =====
function update(dt) {
    if (gameState !== "playing") return;

    // countdown timer
    timeLeft -= dt;
    if (timeLeft <= 0) {
        gameState = "gameOver";
        if (gameOverTime === 0) {
            gameOverTime = Date.now();
            // Play game over sound
            gameOverSound.currentTime = 0;
            gameOverSound.play();
        }
        return;
    }

    // Update particles
    particles = particles.filter(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt; // gravity
        p.life -= dt;
        return p.life > 0;
    });

    // Update screen shake
    if (screenShake > 0) {
        screenShake -= dt;
        if (screenShake < 0) screenShake = 0;
    }

    // Update difficulty based on time and combo
    updateDifficulty();
    
    // mole spawn logic - can spawn multiple moles
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
        spawnMole();
        spawnTimer = 0;
    }

    // mole lifetime and animation - process all active moles
    for (let i = activeMoles.length - 1; i >= 0; i--) {
        const mole = activeMoles[i];
        const speedMult = mole.speedMultiplier; // Use the speed multiplier from when mole spawned
        
        mole.timer += dt;
        
        if (mole.hit) {
            // Mole was hit - retreat quickly
            mole.hitTimer += dt;
            mole.phase = "escaping";
            
            // Retreat animation (go back down into hole) - faster with difficulty
            const retreatSpeed = 10 * speedMult;
            mole.yOffset = Math.min(60, mole.yOffset + retreatSpeed * 60 * dt);
            
            if (mole.yOffset >= 60 || mole.hitTimer > 0.3) {
                activeMoles.splice(i, 1); // Remove mole
            }
        } else {
            // Mole is active - handle emerging, staying up, and escaping
            // Animation speeds increase with combo difficulty
            const emergeTime = 0.4 / speedMult; // Faster with higher combo
            const upTime = 0.5 / speedMult; // Stay up for less time with higher combo
            const escapeTime = 0.2 / speedMult; // Escape faster with higher combo
            
            if (mole.phase === "emerging") {
                // Coming out of hole
                // yOffset goes from 60 (underground) to -25 (peeking above ground)
                const emergeProgress = Math.min(mole.timer / emergeTime, 1);
                mole.yOffset = 60 - (85 * emergeProgress); // 60 (underground) to -25 (peeking above)
                
                if (emergeProgress >= 1) {
                    mole.phase = "up";
                    mole.timer = 0; // Reset timer for "up" phase
                }
            } else if (mole.phase === "up") {
                // Staying up
                // Allow mole to peek above ground (negative yOffset = above hole center)
                mole.yOffset = -25; // Peek 25 pixels above ground level
                
                if (mole.timer > upTime) { // Stay up time varies with difficulty
                    mole.phase = "escaping";
                    mole.escapeTimer = 0;
                    mole.timer = 0; // Reset for escape phase
                }
            } else if (mole.phase === "escaping") {
                // Going back into hole
                // yOffset goes from -25 (peeking above) back to 60 (underground)
                mole.escapeTimer += dt;
                const escapeProgress = Math.min(mole.escapeTimer / escapeTime, 1);
                mole.yOffset = -25 + (85 * escapeProgress); // -25 (peeking) to 60 (underground)
                
                if (escapeProgress >= 1) {
                    // Mole escaped
                    if (mole.type === "bad") {
                        // Bad mole escape - no penalty, just remove it
                        activeMoles.splice(i, 1);
                    } else {
                        // Normal or golden mole escape - lose a life and reset combo/difficulty
                        lives--;
                        combo = 0;
                        resetDifficulty();
                        activeMoles.splice(i, 1);
                        
                        if (lives <= 0) {
                            gameState = "gameOver";
                            if (gameOverTime === 0) {
                                gameOverTime = Date.now();
                                // Play game over sound
                                gameOverSound.currentTime = 0;
                                gameOverSound.play();
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Reset miss click flag after frame
    if (missClick) {
        missClick = false;
    }
}

// ===== DRAW =====
function drawBackground() {
    // Calculate ground position based on hole positions (with fallback)
    const groundStartY = holes.length > 0 ? Math.max(holes[0].y - 80, 100) : GAME_HEIGHT * 0.4;
    
    // Improved sky gradient - more realistic sky colors
    const skyGradient = ctx.createLinearGradient(0, 0, 0, groundStartY);
    skyGradient.addColorStop(0, "#87CEEB");      // Light sky blue at top
    skyGradient.addColorStop(0.3, "#B0E0E6");   // Powder blue
    skyGradient.addColorStop(0.6, "#ADD8E6");   // Light blue
    skyGradient.addColorStop(0.9, "#98D8C8");   // Mint green (horizon)
    skyGradient.addColorStop(1, "#90EE90");     // Light green (near ground)
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, GAME_WIDTH, groundStartY);
    
    // Add some subtle clouds for atmosphere
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    // Cloud 1
    ctx.beginPath();
    ctx.arc(150, 80, 40, 0, Math.PI * 2);
    ctx.arc(180, 80, 50, 0, Math.PI * 2);
    ctx.arc(210, 80, 40, 0, Math.PI * 2);
    ctx.fill();
    // Cloud 2
    ctx.beginPath();
    ctx.arc(600, 120, 35, 0, Math.PI * 2);
    ctx.arc(625, 120, 45, 0, Math.PI * 2);
    ctx.arc(650, 120, 35, 0, Math.PI * 2);
    ctx.fill();
    // Cloud 3
    ctx.beginPath();
    ctx.arc(750, 60, 30, 0, Math.PI * 2);
    ctx.arc(770, 60, 40, 0, Math.PI * 2);
    ctx.arc(790, 60, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Ground/dirt area with better gradient
    const groundGradient = ctx.createLinearGradient(0, groundStartY, 0, GAME_HEIGHT);
    groundGradient.addColorStop(0, "#8B4513");   // Saddle brown
    groundGradient.addColorStop(0.5, "#654321"); // Dark brown
    groundGradient.addColorStop(1, "#5C4033");   // Very dark brown
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, groundStartY, GAME_WIDTH, GAME_HEIGHT - groundStartY);
    
    // Improved grass texture with variation
    ctx.fillStyle = "#7cb342";
    for (let i = 0; i < GAME_WIDTH; i += 3) {
        const grassHeight = 4 + Math.sin(i * 0.15) * 3 + Math.cos(i * 0.08) * 2;
        ctx.fillRect(i, groundStartY, 2, grassHeight);
    }
    // Add some darker grass patches for texture
    ctx.fillStyle = "#689F38";
    for (let i = 0; i < GAME_WIDTH; i += 7) {
        const grassHeight = 3 + Math.sin(i * 0.2) * 2;
        ctx.fillRect(i, groundStartY, 2, grassHeight);
    }
}

function drawHoles() {
    holes.forEach((h, index) => {
        const centerX = h.x + HOLE_SIZE / 2;
        const centerY = h.y + HOLE_SIZE / 2;
        
        // Hole shadow (dark interior)
        const holeGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, HOLE_RADIUS);
        holeGradient.addColorStop(0, "#1a1a1a");
        holeGradient.addColorStop(0.7, "#2d2d2d");
        holeGradient.addColorStop(1, "#3d3d3d");
        
        // Main hole (ellipse shape)
        ctx.fillStyle = holeGradient;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, HOLE_RADIUS, HOLE_RADIUS * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner shadow for depth
        const innerGradient = ctx.createRadialGradient(centerX, centerY - 10, 0, centerX, centerY, HOLE_RADIUS * 0.7);
        innerGradient.addColorStop(0, "rgba(0,0,0,0.6)");
        innerGradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = innerGradient;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, HOLE_RADIUS * 0.7, HOLE_RADIUS * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Grass around hole edge
        ctx.fillStyle = "#7cb342";
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const px = centerX + Math.cos(angle) * HOLE_RADIUS;
            const py = centerY + Math.sin(angle) * HOLE_RADIUS * 0.6;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function drawHoleRims() {
    // Draw hole rims/edges only for holes WITHOUT active moles, so moles appear in front
    holes.forEach((h, index) => {
        const hasActiveMole = activeMoles.some(mole => mole.holeIndex === index);
        if (hasActiveMole) return; // Skip rim when mole is up - mole should be in front
        
        const centerX = h.x + HOLE_SIZE / 2;
        const centerY = h.y + HOLE_SIZE / 2;
        
        ctx.strokeStyle = "#654321";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, HOLE_RADIUS, HOLE_RADIUS * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
    });
}

function drawMole() {
    // Draw all active moles
    activeMoles.forEach(mole => drawSingleMole(mole));
}

function drawSingleMole(activeMole) {
    if (!activeMole) return;

    ctx.save();
    
    // Ensure full opacity for moles (no transparency)
    ctx.globalAlpha = 1.0;
    
    const moleY = activeMole.holeY + activeMole.yOffset; // Mole comes from below (positive yOffset = below hole center)
    
    // Clip to hole area only when mole is emerging or retreating (not when fully up)
    // When yOffset is negative (mole is above ground), don't clip so the top can show
    if (activeMole.yOffset > 0) {
        // Mole is still emerging or retreating - clip to hole shape
        const holeCenterY = activeMole.holeY;
        ctx.beginPath();
        ctx.ellipse(activeMole.x, holeCenterY, HOLE_RADIUS, HOLE_RADIUS * 0.6, 0, 0, Math.PI * 2);
        ctx.clip();
    }
    // When yOffset <= 0 (mole is fully up), no clipping so the top can peek above ground
    
    // Apply rotation for hit effect
    if (activeMole.hit) {
        ctx.translate(activeMole.x, moleY);
        ctx.rotate(Math.sin(activeMole.hitTimer * 30) * 0.2);
        ctx.translate(-activeMole.x, -moleY);
    }
    
    ctx.translate(activeMole.x, moleY);

    // Improved body shadow with blur effect
    ctx.save();
    // Create shadow with multiple layers for blur effect
    for (let i = 0; i < 3; i++) {
        const shadowAlpha = (0.4 - i * 0.1) / (i + 1);
        const shadowSize = 1 + i * 2;
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(0, MOLE_SIZE / 2 + 8 + i, 
                   MOLE_SIZE / 2 * 0.9 + shadowSize, 
                   MOLE_SIZE / 2 * 0.3 + shadowSize * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Determine mole colors based on type
    let bodyBaseColor, bodyDarkColor, bodyLightColor;
    if (activeMole.type === "bad") {
        // Bad mole: red/purple colors
        bodyBaseColor = "#dc2626";
        bodyDarkColor = "#7f1d1d";
        bodyLightColor = "#ef4444";
    } else if (activeMole.type === "golden") {
        // Golden mole: bright gold/yellow colors
        bodyBaseColor = "#fbbf24";
        bodyDarkColor = "#d97706";
        bodyLightColor = "#fef08a";
    } else {
        // Normal mole: brown colors
        bodyBaseColor = "#d97706";
        bodyDarkColor = "#78350f";
        bodyLightColor = "#f59e0b";
    }
    
    // Draw solid opaque base circle FIRST to ensure no transparency
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = bodyBaseColor;
    ctx.beginPath();
    ctx.arc(0, 0, MOLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw body gradient on top of solid base
    const bodyGradient = ctx.createRadialGradient(-12, -18, 5, 0, 0, MOLE_SIZE / 2);
    if (activeMole.type === "bad") {
        bodyGradient.addColorStop(0, bodyLightColor);
        bodyGradient.addColorStop(0.3, bodyBaseColor);
        bodyGradient.addColorStop(0.7, "#991b1b");
        bodyGradient.addColorStop(1, bodyDarkColor);
    } else if (activeMole.type === "golden") {
        bodyGradient.addColorStop(0, bodyLightColor);
        bodyGradient.addColorStop(0.3, bodyBaseColor);
        bodyGradient.addColorStop(0.7, "#f59e0b");
        bodyGradient.addColorStop(1, bodyDarkColor);
    } else {
        bodyGradient.addColorStop(0, bodyLightColor);
        bodyGradient.addColorStop(0.3, bodyBaseColor);
        bodyGradient.addColorStop(0.7, "#92400e");
        bodyGradient.addColorStop(1, bodyDarkColor);
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(0, 0, MOLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Add darker side shadow for depth (using multiply blend mode for better effect)
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(MOLE_SIZE / 4, MOLE_SIZE / 4, MOLE_SIZE / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Improved body highlight with multiple layers (using screen blend mode for highlights)
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(-15, -20, MOLE_SIZE / 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Secondary highlight for more realistic lighting
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(-8, -12, MOLE_SIZE / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Improved nose with better shading
    ctx.globalAlpha = 1.0;
    const noseGradient = ctx.createRadialGradient(-1, 4, 0, 0, 5, 6);
    noseGradient.addColorStop(0, "#333");
    noseGradient.addColorStop(1, "#000");
    ctx.fillStyle = noseGradient;
    ctx.beginPath();
    ctx.ellipse(0, 5, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose highlight
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.ellipse(-2, 4, 2.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose nostrils
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-2, 6, 1.5, 0, Math.PI * 2);
    ctx.arc(2, 6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes - different based on mole type
    if (activeMole.type === "bad") {
        // Bad mole: red eyes with X marks
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(-18, -8, 8, 0, Math.PI * 2);
        ctx.arc(18, -8, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // X marks in eyes
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-22, -12);
        ctx.lineTo(-14, -4);
        ctx.moveTo(-14, -12);
        ctx.lineTo(-22, -4);
        ctx.moveTo(14, -12);
        ctx.lineTo(22, -4);
        ctx.moveTo(22, -12);
        ctx.lineTo(14, -4);
        ctx.stroke();
    } else if (activeMole.type === "golden") {
        // Golden mole: bright yellow/white eyes with sparkle
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(-18, -8, 8, 0, Math.PI * 2);
        ctx.arc(18, -8, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye shine (larger for golden)
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(-16, -10, 4, 0, Math.PI * 2);
        ctx.arc(20, -10, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupils (smaller for cute look)
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(-18, -8, 3, 0, Math.PI * 2);
        ctx.arc(18, -8, 3, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Normal mole: white eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-18, -8, 8, 0, Math.PI * 2);
        ctx.arc(18, -8, 8, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(-16, -10, 3, 0, Math.PI * 2);
        ctx.arc(20, -10, 3, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(-18, -8, 4, 0, Math.PI * 2);
        ctx.arc(18, -8, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 12, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Improved ears with better shading and detail
    ctx.globalAlpha = 1.0;
    const earSize = 14;
    
    // Ear base color based on mole type
    let earColor, earInsideColor;
    if (activeMole.type === "bad") {
        earColor = "#991b1b";
        earInsideColor = "#7f1d1d";
    } else if (activeMole.type === "golden") {
        earColor = "#f59e0b";
        earInsideColor = "#d97706";
    } else {
        earColor = "#78350f";
        earInsideColor = "#92400e";
    }
    
    // Left ear with gradient
    const leftEarGradient = ctx.createRadialGradient(-25, -20, 0, -25, -20, earSize);
    leftEarGradient.addColorStop(0, bodyLightColor || "#f59e0b");
    leftEarGradient.addColorStop(1, earColor);
    ctx.fillStyle = leftEarGradient;
    ctx.beginPath();
    ctx.arc(-25, -20, earSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Right ear with gradient
    const rightEarGradient = ctx.createRadialGradient(25, -20, 0, 25, -20, earSize);
    rightEarGradient.addColorStop(0, bodyLightColor || "#f59e0b");
    rightEarGradient.addColorStop(1, earColor);
    ctx.fillStyle = rightEarGradient;
    ctx.beginPath();
    ctx.arc(25, -20, earSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Ear shadows for depth
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.arc(-25, -18, earSize * 0.7, 0, Math.PI * 2);
    ctx.arc(25, -18, earSize * 0.7, 0, Math.PI * 2);
    ctx.fill();
    
    // Ear insides with better color
    ctx.fillStyle = earInsideColor;
    ctx.beginPath();
    ctx.arc(-25, -20, earSize * 0.65, 0, Math.PI * 2);
    ctx.arc(25, -20, earSize * 0.65, 0, Math.PI * 2);
    ctx.fill();
    
    // Ear highlights
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(-23, -22, 3, 0, Math.PI * 2);
    ctx.arc(27, -22, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawParticles() {
    particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

function updateUI() {
    const scoreEl = document.getElementById('whackScore');
    const timeEl = document.getElementById('whackTime');
    const livesEl = document.getElementById('whackLives');
    const comboEl = document.getElementById('whackCombo');
    const comboValEl = document.getElementById('whackComboVal');
    const menuOverlay = document.getElementById('whackMenuOverlay');
    const gameOverOverlay = document.getElementById('whackGameOverOverlay');
    const hud = document.getElementById('whackHud');
    if (scoreEl) scoreEl.textContent = score;
    if (timeEl) {
        timeEl.textContent = Math.ceil(timeLeft);
        timeEl.style.color = timeLeft < 10 ? '#ef4444' : '';
    }
    if (livesEl) livesEl.textContent = lives;
    if (comboEl) {
        comboEl.style.display = combo > 1 ? 'block' : 'none';
        if (comboValEl) comboValEl.textContent = combo;
    }
    if (menuOverlay) menuOverlay.style.display = gameState === "menu" ? "block" : "none";
    if (gameOverOverlay) gameOverOverlay.style.display = gameState === "gameOver" ? "block" : "none";
    if (hud) hud.style.visibility = gameState === "playing" ? "visible" : "hidden";
    if (gameState === "gameOver") {
        const titleEl = document.getElementById('whackGameOverTitle');
        const finalScoreEl = document.getElementById('whackFinalScore');
        const newBestEl = document.getElementById('whackNewBest');
        const bestScoreEl = document.getElementById('whackBestScore');
        const playBtn = document.getElementById('whackPlayAgainBtn');
        const countdownEl = document.getElementById('whackCountdown');
        if (titleEl) titleEl.textContent = timeLeft <= 0 ? "Time's Up!" : "Game Over!";
        if (finalScoreEl) finalScoreEl.textContent = score;
        const isNewBest = score > bestScore && score > 0;
        if (isNewBest) {
            bestScore = score;
            try { localStorage.setItem("whackBestScore", score.toString()); } catch (e) {}
        }
        const displayBest = Math.max(score, bestScore);
        if (bestScoreEl) bestScoreEl.textContent = displayBest;
        if (newBestEl) newBestEl.style.display = isNewBest ? "block" : "none";
        const timeSinceGameOver = (Date.now() - gameOverTime) / 1000;
        const timeRemaining = Math.max(0, GAME_OVER_DELAY - timeSinceGameOver);
        if (playBtn) {
            playBtn.style.display = timeRemaining <= 0 ? "block" : "none";
        }
        if (countdownEl) {
            countdownEl.textContent = timeRemaining > 0 ? `Wait ${Math.ceil(timeRemaining)}s to play again` : "";
        }
    }
}

function drawHUD() {
    updateUI();
}

// Helper function to adjust brightness of a color
function adjustBrightness(color, amount) {
    const num = parseInt(color.replace("#", ""), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function drawOverlay() {
    // UI is in HTML; updateUI() updates the overlay (called from drawHUD)
}

// ===== LOOP =====
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    // Update animation time for UI effects
    animationTime += dt;

    update(dt);

    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    
    // Apply screen shake
    ctx.save();
    if (screenShake > 0) {
        const shakeAmount = screenShake * 10;
        ctx.translate(
            (Math.random() - 0.5) * shakeAmount,
            (Math.random() - 0.5) * shakeAmount
        );
    }
    
    drawBackground();
    drawHoles();
    // Draw mole with clipping (mole will be masked by hole shape)
    drawMole();
    // Draw hole rim/edge again on top to cover mole edges and ensure proper masking
    drawHoleRims();
    drawParticles();
    ctx.restore();
    
    drawHUD();
    drawOverlay();

    requestAnimationFrame(gameLoop);
}

// ===== INIT =====
setupHoles();

function tryStartOrRestart() {
    if (gameState === "menu") {
        startGame();
    } else if (gameState === "gameOver") {
        const timeSinceGameOver = (Date.now() - gameOverTime) / 1000;
        if (timeSinceGameOver >= GAME_OVER_DELAY) {
            startGame();
        }
    }
}

canvas.addEventListener("mousedown", tryStartOrRestart);
canvas.addEventListener("touchstart", (e) => {
    tryStartOrRestart();
}, { passive: false });

// Wire HTML buttons
(function() {
    const startBtn = document.getElementById('whackStartBtn');
    if (startBtn) startBtn.addEventListener('click', startGame);
    const playAgainBtn = document.getElementById('whackPlayAgainBtn');
    if (playAgainBtn) playAgainBtn.addEventListener('click', function() {
        const timeSinceGameOver = (Date.now() - gameOverTime) / 1000;
        if (timeSinceGameOver >= GAME_OVER_DELAY) {
            startGame();
        }
    });
})();

requestAnimationFrame(gameLoop);
