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
const GROUND_TOP = 90; // Y where playfield ground starts (holes are main focus, all on screen)

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
    const groundHeight = GAME_HEIGHT - GROUND_TOP;
    const gridHeight = GRID_ROWS * HOLE_SIZE;
    const gridTop = GROUND_TOP + (groundHeight - gridHeight) / 2;
    const offsetY = gridTop;

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
    const colors = ['#facc15', '#fbbf24', '#f59e0b', '#92400e', '#b45309'];
    const count = 16;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speed = 90 + Math.random() * 80;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 40,
            life: 0.5,
            maxLife: 0.5,
            size: 5 + Math.random() * 8,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

function createBadMoleParticles(x, y) {
    const colors = ['#dc2626', '#b91c1c', '#7f1d1d', '#991b1b', '#450a0a'];
    const count = 14;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 70 + Math.random() * 70;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 35,
            life: 0.45,
            maxLife: 0.45,
            size: 4 + Math.random() * 7,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

function createGoldenMoleParticles(x, y) {
    const colors = ['#fef08a', '#fde047', '#facc15', '#fbbf24', '#eab308', '#fef9c3'];
    const count = 18;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 100 + Math.random() * 90;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 50,
            life: 0.55,
            maxLife: 0.55,
            size: 6 + Math.random() * 9,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

// ===== GAME CONTROL =====
function startGame() {
    const container = document.getElementById("whackGameContainer");
    if (container) container.classList.remove("title-card-active");
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

// ===== DRAW (layered: sky, hills, ground, grass) - fluid & animated =====
function drawBackground() {
    const skyTop = 0;
    const skyBottom = Math.min(GROUND_TOP + 80, GAME_HEIGHT);
    const t = animationTime;

    // --- Layer 1: Sky gradient (subtle slow pulse) ---
    const skyGrad = ctx.createLinearGradient(0, skyTop, 0, skyBottom);
    skyGrad.addColorStop(0, "#4a90d9");
    skyGrad.addColorStop(0.2 + Math.sin(t * 0.2) * 0.02, "#7eb8e8");
    skyGrad.addColorStop(0.55 + Math.cos(t * 0.15) * 0.03, "#a8d4f0");
    skyGrad.addColorStop(0.82 + Math.sin(t * 0.18) * 0.02, "#c5e0b0");
    skyGrad.addColorStop(1, "#8fbc7a");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, GAME_WIDTH, skyBottom);

    // Soft moving highlight overlay (sun glow)
    ctx.save();
    const glowY = 60 + Math.sin(t * 0.2) * 15;
    const glowGrad = ctx.createRadialGradient(GAME_WIDTH * 0.7, glowY, 0, GAME_WIDTH * 0.5, glowY, 280);
    glowGrad.addColorStop(0, "rgba(255,255,255,0.06)");
    glowGrad.addColorStop(0.6, "rgba(255,255,255,0.02)");
    glowGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, GAME_WIDTH, skyBottom);
    ctx.restore();

    // --- Layer 2: Distant hills (gentle parallax drift & breathe) ---
    const hillPhase = t * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.5;
    const hillY = GROUND_TOP + 30;
    ctx.fillStyle = "#5a7a4a";
    ctx.beginPath();
    ctx.moveTo(0, GAME_HEIGHT);
    ctx.lineTo(0, hillY + 80);
    for (let x = 0; x <= GAME_WIDTH + 200; x += 100) {
        const y = hillY + 40
            + Math.sin(x * 0.02 + hillPhase) * 28
            + Math.cos(x * 0.015 + hillPhase * 0.7) * 18;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(GAME_WIDTH + 200, GAME_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#4a6a3a";
    ctx.beginPath();
    ctx.moveTo(0, GAME_HEIGHT);
    ctx.lineTo(0, hillY + 120);
    for (let x = 0; x <= GAME_WIDTH + 200; x += 70) {
        const y = hillY + 70 + Math.sin(x * 0.03 + hillPhase * 1.2) * 32;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(GAME_WIDTH + 200, GAME_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- Layer 3: Clouds (drift across sky, loop) ---
    ctx.save();
    const cloudW = 220;
    const wrap = GAME_WIDTH + cloudW * 2;
    ctx.globalAlpha = 0.52 + Math.sin(t * 0.3) * 0.04;
    ctx.fillStyle = "#fff";
    [
        { baseX: 80, baseY: 50, speed: 12, r: [35, 45, 38], spacing: 32 },
        { baseX: 380, baseY: 88, speed: 18, r: [30, 40, 32], spacing: 32 },
        { baseX: 680, baseY: 42, speed: 10, r: [40, 50, 42], spacing: 32 },
        { baseX: 200, baseY: 105, speed: 15, r: [28, 38, 30], spacing: 28 },
        { baseX: 520, baseY: 70, speed: 14, r: [32, 42, 35], spacing: 30 }
    ].forEach(function (c, idx) {
        const drift = (c.baseX + t * c.speed) % wrap;
        const x = drift - cloudW;
        const y = c.baseY + Math.sin(t * 0.4 + idx) * 6;
        ctx.beginPath();
        c.r.forEach(function (r, i) {
            ctx.arc(x + i * c.spacing, y, r, 0, Math.PI * 2);
        });
        ctx.fill();
    });
    ctx.restore();

    // --- Layer 4: Ground (dirt) with depth gradient ---
    const groundGrad = ctx.createLinearGradient(0, GROUND_TOP, 0, GAME_HEIGHT);
    groundGrad.addColorStop(0, "#6b4423");
    groundGrad.addColorStop(0.15, "#5c3d1f");
    groundGrad.addColorStop(0.5, "#4a3219");
    groundGrad.addColorStop(1, "#3d2a14");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, GROUND_TOP, GAME_WIDTH, GAME_HEIGHT - GROUND_TOP);

    // --- Layer 5: Foreground grass (swaying blades) ---
    const grassY = GROUND_TOP;
    const sway = Math.sin(t * 1.8) * 5;
    const sway2 = Math.sin(t * 1.4 + 1) * 4;
    const bladeH = 14;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < GAME_WIDTH; i += 3) {
        const phase = i * 0.08 + t * 1.2;
        const lean = Math.sin(phase) * sway + Math.cos(phase * 0.7) * sway2;
        const h = bladeH + Math.sin(i * 0.1 + t * 0.5) * 4 + Math.cos(i * 0.07) * 3;
        ctx.strokeStyle = (i % 6 < 3) ? "#558b2f" : "#5a9540";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(i, grassY);
        ctx.lineTo(i + lean, grassY - h);
        ctx.stroke();
    }
    for (let i = 0; i < GAME_WIDTH; i += 5) {
        const phase = i * 0.12 + t * 1.0;
        const lean = Math.sin(phase) * (sway * 0.8) + Math.cos(phase * 0.6) * (sway2 * 0.8);
        const h = bladeH * 0.75 + Math.sin(i * 0.12 + t * 0.4) * 3;
        ctx.strokeStyle = "#7cb342";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(i + 1, grassY);
        ctx.lineTo(i + 1 + lean, grassY - h);
        ctx.stroke();
    }
    for (let i = 0; i < GAME_WIDTH; i += 6) {
        const phase = i * 0.1 + t * 1.35;
        const lean = Math.sin(phase + 0.5) * (sway * 0.6);
        const h = bladeH * 0.6 + Math.cos(i * 0.09 + t * 0.3) * 2;
        ctx.strokeStyle = "#689f38";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(i + 2, grassY);
        ctx.lineTo(i + 2 + lean, grassY - h);
        ctx.stroke();
    }
    ctx.restore();
}

function drawHoles() {
    const rx = HOLE_RADIUS;
    const ry = HOLE_RADIUS * 0.65;

    holes.forEach((h, index) => {
        const cx = h.x + HOLE_SIZE / 2;
        const cy = h.y + HOLE_SIZE / 2;

        // 1) Outer rim shadow (dark ring under grass)
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(cx, cy + 4, rx + 8, ry + 6, 0, 0, Math.PI * 2);
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill("evenodd");
        ctx.restore();

        // 2) Grass blades around rim (overlap into hole for natural look)
        ctx.save();
        const bladeCount = 24;
        for (let i = 0; i < bladeCount; i++) {
            const angle = (Math.PI * 2 * i) / bladeCount + (index * 0.1);
            const dist = rx + (Math.sin(index * 7 + angle * 2) * 3);
            const px = cx + Math.cos(angle) * dist;
            const py = cy + Math.sin(angle) * (ry * (dist / rx));
            const bladeLen = 8 + Math.sin(angle * 3) * 4;
            ctx.strokeStyle = i % 3 === 0 ? "#689f38" : "#7cb342";
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.sin(angle) * bladeLen, py - Math.cos(angle) * bladeLen);
            ctx.stroke();
        }
        ctx.restore();

        // 3) Hole interior - deep pit gradient (top darker = depth)
        const pitGrad = ctx.createRadialGradient(cx, cy - ry * 0.3, 0, cx, cy, rx * 1.2);
        pitGrad.addColorStop(0, "#1a1510");
        pitGrad.addColorStop(0.4, "#252015");
        pitGrad.addColorStop(0.75, "#2d281a");
        pitGrad.addColorStop(1, "#3a3525");
        ctx.fillStyle = pitGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // 4) Inner top shadow (overhang)
        const topShadow = ctx.createRadialGradient(cx, cy - ry * 0.8, 0, cx, cy + ry * 0.2, rx);
        topShadow.addColorStop(0, "rgba(0,0,0,0.55)");
        topShadow.addColorStop(0.6, "rgba(0,0,0,0.2)");
        topShadow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = topShadow;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();

        // 5) Rim highlight (top edge of hole)
        ctx.strokeStyle = "#5a4a32";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(120,100,70,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 1, rx - 1, ry - 1, 0, 0, Math.PI * 2);
        ctx.stroke();
    });
}

function drawMoleShadows() {
    activeMoles.forEach(function (mole) {
        const moleY = mole.holeY + mole.yOffset;
        if (mole.yOffset > 10) return;
        const shadowY = mole.holeY + 18;
        const stretch = 1 + (mole.yOffset > 0 ? 0.2 : 0.4);
        const alpha = mole.yOffset <= 0 ? 0.4 : 0.25 * (1 - mole.yOffset / 10);
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0," + alpha + ")";
        ctx.beginPath();
        ctx.ellipse(mole.x, shadowY, (MOLE_SIZE / 2) * 0.95 * stretch, (MOLE_SIZE / 2) * 0.25 * stretch, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function drawHoleRims() {
    holes.forEach((h, index) => {
        const hasActiveMole = activeMoles.some(mole => mole.holeIndex === index);
        if (hasActiveMole) return;

        const centerX = h.x + HOLE_SIZE / 2;
        const centerY = h.y + HOLE_SIZE / 2;
        const rx = HOLE_RADIUS;
        const ry = HOLE_RADIUS * 0.65;

        ctx.strokeStyle = "#4a3d28";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(90,75,50,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY - 1, rx - 2, ry - 2, 0, 0, Math.PI * 2);
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
    ctx.globalAlpha = 1.0;

    const moleY = activeMole.holeY + activeMole.yOffset;

    if (activeMole.yOffset > 0) {
        const holeCenterY = activeMole.holeY;
        ctx.beginPath();
        ctx.ellipse(activeMole.x, holeCenterY, HOLE_RADIUS, HOLE_RADIUS * 0.6, 0, 0, Math.PI * 2);
        ctx.clip();
    }

    if (activeMole.hit) {
        ctx.translate(activeMole.x, moleY);
        ctx.rotate(Math.sin(activeMole.hitTimer * 30) * 0.2);
        ctx.translate(-activeMole.x, -moleY);
    }

    ctx.translate(activeMole.x, moleY);

    // Ground shadow under mole (soft oval)
    for (let i = 0; i < 3; i++) {
        const shadowAlpha = (0.35 - i * 0.08) / (i + 1);
        const s = 2 + i * 2;
        ctx.fillStyle = "rgba(0,0,0," + shadowAlpha + ")";
        ctx.beginPath();
        ctx.ellipse(0, MOLE_SIZE / 2 + 6 + i, (MOLE_SIZE / 2) * 0.85 + s, (MOLE_SIZE / 2) * 0.22 + s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- Realistic mole colors (velvety fur) ---
    let furDark, furMid, furLight, snoutColor, noseColor;
    if (activeMole.type === "bad") {
        furDark = "#5c1010";
        furMid = "#8b2020";
        furLight = "#a82a2a";
        snoutColor = "#6b1a1a";
        noseColor = "#2d0a0a";
    } else if (activeMole.type === "golden") {
        furDark = "#b8860b";
        furMid = "#daa520";
        furLight = "#f0d878";
        snoutColor = "#c9a227";
        noseColor = "#3d2a00";
    } else {
        furDark = "#3d2914";
        furMid = "#5c4033";
        furLight = "#7d6e5c";
        snoutColor = "#4a3728";
        noseColor = "#1a1210";
    }

    const R = MOLE_SIZE / 2;

    // Body: oval head (wider than tall, mole-like barrel shape)
    ctx.globalCompositeOperation = "source-over";
    const bodyGrad = ctx.createRadialGradient(-10, -12, 2, 0, 2, R * 1.1);
    bodyGrad.addColorStop(0, furLight);
    bodyGrad.addColorStop(0.4, furMid);
    bodyGrad.addColorStop(0.85, furDark);
    bodyGrad.addColorStop(1, furDark);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.95, R * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Side shadow (velvety depth)
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(R * 0.35, R * 0.2, R * 0.5, R * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Top highlight (velvet sheen)
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.ellipse(-R * 0.35, -R * 0.4, R * 0.4, R * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // --- Pointed snout (elongated, mole-like) ---
    ctx.fillStyle = snoutColor;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.5, R * 0.32, R * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const snoutGrad = ctx.createLinearGradient(0, -R * 0.2, 0, R * 0.7);
    snoutGrad.addColorStop(0, furLight || furMid);
    snoutGrad.addColorStop(0.6, snoutColor);
    snoutGrad.addColorStop(1, furDark);
    ctx.fillStyle = snoutGrad;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.5, R * 0.28, R * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose (leathery, at tip of snout)
    const noseY = R * 0.88;
    const noseGrad = ctx.createRadialGradient(0, noseY - 2, 0, 0, noseY, R * 0.2);
    noseGrad.addColorStop(0, noseColor);
    noseGrad.addColorStop(0.6, "#1a0f0a");
    noseGrad.addColorStop(1, "#0d0806");
    ctx.fillStyle = noseGrad;
    ctx.beginPath();
    ctx.ellipse(0, noseY, R * 0.18, R * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    if (activeMole.type === "golden") {
        ctx.fillStyle = "rgba(255,235,180,0.4)";
        ctx.beginPath();
        ctx.ellipse(-R * 0.04, noseY - R * 0.04, R * 0.06, R * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Nostrils (tiny)
    ctx.fillStyle = "#0a0604";
    ctx.beginPath();
    ctx.ellipse(-R * 0.06, noseY + R * 0.02, R * 0.04, R * 0.03, 0, 0, Math.PI * 2);
    ctx.ellipse(R * 0.06, noseY + R * 0.02, R * 0.04, R * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- Eyes: tiny and dark (moles are nearly blind) ---
    const eyeY = -R * 0.15;
    const eyeX = R * 0.38;
    if (activeMole.type === "bad") {
        ctx.fillStyle = "#8b0000";
        ctx.beginPath();
        ctx.arc(-eyeX, eyeY, R * 0.08, 0, Math.PI * 2);
        ctx.arc(eyeX, eyeY, R * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#2d0000";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-eyeX - R * 0.06, eyeY - R * 0.06);
        ctx.lineTo(-eyeX + R * 0.06, eyeY + R * 0.06);
        ctx.moveTo(-eyeX + R * 0.06, eyeY - R * 0.06);
        ctx.lineTo(-eyeX - R * 0.06, eyeY + R * 0.06);
        ctx.moveTo(eyeX - R * 0.06, eyeY - R * 0.06);
        ctx.lineTo(eyeX + R * 0.06, eyeY + R * 0.06);
        ctx.moveTo(eyeX + R * 0.06, eyeY - R * 0.06);
        ctx.lineTo(eyeX - R * 0.06, eyeY + R * 0.06);
        ctx.stroke();
    } else if (activeMole.type === "golden") {
        ctx.fillStyle = "#2d2500";
        ctx.beginPath();
        ctx.arc(-eyeX, eyeY, R * 0.07, 0, Math.PI * 2);
        ctx.arc(eyeX, eyeY, R * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,250,200,0.6)";
        ctx.beginPath();
        ctx.arc(-eyeX - R * 0.02, eyeY - R * 0.02, R * 0.025, 0, Math.PI * 2);
        ctx.arc(eyeX - R * 0.02, eyeY - R * 0.02, R * 0.025, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.arc(-eyeX, eyeY, R * 0.07, 0, Math.PI * 2);
        ctx.arc(eyeX, eyeY, R * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(80,70,60,0.5)";
        ctx.beginPath();
        ctx.arc(-eyeX - R * 0.02, eyeY - R * 0.02, R * 0.02, 0, Math.PI * 2);
        ctx.arc(eyeX - R * 0.02, eyeY - R * 0.02, R * 0.02, 0, Math.PI * 2);
        ctx.fill();
    }

    // Small rounded ears (set back, often buried in fur)
    const earY = -R * 0.5;
    const earX = R * 0.52;
    const earR = R * 0.2;
    ctx.fillStyle = furDark;
    ctx.beginPath();
    ctx.arc(-earX, earY, earR, 0, Math.PI * 2);
    ctx.arc(earX, earY, earR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = furMid;
    ctx.beginPath();
    ctx.arc(-earX, earY, earR * 0.7, 0, Math.PI * 2);
    ctx.arc(earX, earY, earR * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Subtle mouth line (moles have a small mouth)
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, R * 0.35, R * 0.12, 0.15 * Math.PI, Math.PI * 0.85);
    ctx.stroke();

    // Light fur texture (fine lines suggestion)
    ctx.strokeStyle = furLight;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 0.6 - Math.PI * 0.3;
        const len = R * (0.3 + Math.sin(i * 1.3) * 0.15);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
        ctx.lineTo(Math.cos(a) * (R * 0.3 + len), Math.sin(a) * (R * 0.3 + len));
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    ctx.restore();
}

function drawParticles() {
    particles.forEach(p => {
        const t = p.life / p.maxLife;
        const alpha = t;
        const size = p.size * (0.3 + 0.7 * t);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = size * 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
    });
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
        timeEl.classList.toggle('time-low', timeLeft < 10);
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
    drawMoleShadows();
    drawMole();
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
