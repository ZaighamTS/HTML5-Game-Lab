const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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

// ===== SETUP =====
function setupHoles() {
    holes = [];
    const offsetX = (canvas.width - GRID_COLS * HOLE_SIZE) / 2;
    const offsetY = (canvas.height - GRID_ROWS * HOLE_SIZE) / 2 - 20; // Center vertically

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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
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
                
                // Create red particle effects
                createBadMoleParticles(mole.x, moleDrawY);
                screenShake = 0.2;
                
                if (lives <= 0) {
                    gameState = "gameOver";
                    if (gameOverTime === 0) {
                        gameOverTime = Date.now();
                    }
                    return; // Exit function immediately when game ends
                }
                break; // Only process one mole per click (exit loop)
            } else if (mole.type === "golden") {
                // Golden mole clicked - normal mole behavior + add time
                score += 10 + combo * 2;
                combo++;
                timeLeft += 10; // Add 10 seconds
                updateDifficulty();
                mole.hit = true;
                mole.hitTimer = 0;
                mole.retreating = true;
                
                // Create golden particle effects
                createGoldenMoleParticles(mole.x, moleDrawY);
                screenShake = 0.15;
            } else {
                // Normal mole clicked
                score += 10 + combo * 2;
                combo++;
                updateDifficulty();
                mole.hit = true;
                mole.hitTimer = 0;
                mole.retreating = true;
                
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
        
        if (timeLeft <= 0) {
            gameState = "gameOver";
            if (gameOverTime === 0) {
                gameOverTime = Date.now();
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
    const groundStartY = holes.length > 0 ? Math.max(holes[0].y - 80, 100) : canvas.height * 0.4;
    
    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#87ceeb");
    gradient.addColorStop(0.6, "#90EE90");
    gradient.addColorStop(1, "#8B4513");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Ground/dirt area
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(0, groundStartY, canvas.width, canvas.height - groundStartY);
    
    // Grass texture (simple pattern)
    ctx.fillStyle = "#7cb342";
    for (let i = 0; i < canvas.width; i += 4) {
        const grassHeight = 3 + Math.sin(i * 0.1) * 2;
        ctx.fillRect(i, groundStartY, 3, grassHeight);
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
    // Draw hole rims/edges on top (after mole) to create proper masking effect
    holes.forEach((h, index) => {
        const centerX = h.x + HOLE_SIZE / 2;
        const centerY = h.y + HOLE_SIZE / 2;
        
        // Hole rim (edge highlight) - drawn on top
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

    // Body shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, MOLE_SIZE / 2 + 5, MOLE_SIZE / 2 * 0.9, MOLE_SIZE / 2 * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body gradient - different colors based on mole type
    let bodyGradient;
    if (activeMole.type === "bad") {
        // Bad mole: red/purple colors
        bodyGradient = ctx.createRadialGradient(-10, -15, 0, 0, 0, MOLE_SIZE / 2);
        bodyGradient.addColorStop(0, "#dc2626");
        bodyGradient.addColorStop(0.5, "#991b1b");
        bodyGradient.addColorStop(1, "#7f1d1d");
    } else if (activeMole.type === "golden") {
        // Golden mole: bright gold/yellow colors
        bodyGradient = ctx.createRadialGradient(-10, -15, 0, 0, 0, MOLE_SIZE / 2);
        bodyGradient.addColorStop(0, "#fbbf24");
        bodyGradient.addColorStop(0.5, "#f59e0b");
        bodyGradient.addColorStop(1, "#d97706");
    } else {
        // Normal mole: brown colors
        bodyGradient = ctx.createRadialGradient(-10, -15, 0, 0, 0, MOLE_SIZE / 2);
        bodyGradient.addColorStop(0, "#d97706");
        bodyGradient.addColorStop(0.5, "#92400e");
        bodyGradient.addColorStop(1, "#78350f");
    }
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(0, 0, MOLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();

    // Body highlight
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(-12, -15, MOLE_SIZE / 3, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 5, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose highlight
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.ellipse(-2, 4, 2, 1.5, 0, 0, Math.PI * 2);
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

    // Ears
    const earSize = 12;
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.arc(-25, -20, earSize, 0, Math.PI * 2);
    ctx.arc(25, -20, earSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Ear insides
    ctx.fillStyle = "#92400e";
    ctx.beginPath();
    ctx.arc(-25, -20, earSize * 0.6, 0, Math.PI * 2);
    ctx.arc(25, -20, earSize * 0.6, 0, Math.PI * 2);
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

function drawHUD() {
    // HUD background (semi-transparent)
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, canvas.width, 100);
    
    // Score
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 20, 35);

    // Time
    ctx.textAlign = "right";
    const timeColor = timeLeft < 10 ? "#ef4444" : "#fff";
    ctx.fillStyle = timeColor;
    ctx.fillText(`Time: ${Math.ceil(timeLeft)}`, canvas.width - 20, 35);

    // Draw heart icons for lives (hearts only, no text)
    function drawHeart(x, y, size, filled, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(size / 20, size / 20); // Normalize to size 20
        
        ctx.beginPath();
        
        // Heart shape using bezier curves for smooth heart shape
        // Top left curve
        ctx.moveTo(0, 5);
        ctx.bezierCurveTo(-5, -5, -10, -5, -10, 0);
        ctx.bezierCurveTo(-10, 5, 0, 12, 0, 12);
        
        // Top right curve
        ctx.bezierCurveTo(0, 12, 10, 5, 10, 0);
        ctx.bezierCurveTo(10, -5, 5, -5, 0, 5);
        
        ctx.closePath();
        
        if (filled) {
            // Fill the heart
            ctx.fillStyle = color;
            ctx.fill();
            
            // Add highlight for depth
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.beginPath();
            ctx.arc(-3, -2, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Draw outline only
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = color + "40"; // Add transparency
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    const heartStartX = canvas.width / 2 - (START_LIVES * 28) / 2; // Center the hearts
    const heartY = 30;
    const heartSize = 18;
    
    for (let i = 0; i < START_LIVES; i++) {
        const heartX = heartStartX + i * 32;
        const hasLife = i < lives;
        
        if (hasLife) {
            // Draw full red heart for remaining lives
            drawHeart(heartX, heartY, heartSize, true, "#ef4444");
        } else {
            // Draw empty/gray heart outline for lost lives
            drawHeart(heartX, heartY, heartSize, false, "#666666");
            
            // Draw X mark for lost lives
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(heartX - heartSize * 0.5, heartY - heartSize * 0.4);
            ctx.lineTo(heartX + heartSize * 0.5, heartY + heartSize * 0.4);
            ctx.moveTo(heartX + heartSize * 0.5, heartY - heartSize * 0.4);
            ctx.lineTo(heartX - heartSize * 0.5, heartY + heartSize * 0.4);
            ctx.stroke();
        }
    }

    // Combo display with animation
    if (combo > 1) {
        ctx.textAlign = "center";
        const comboScale = 1 + Math.sin(Date.now() * 0.01) * 0.1;
        ctx.save();
        ctx.translate(canvas.width / 2, 75);
        ctx.scale(comboScale, comboScale);
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 26px Arial";
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.strokeText(`Combo x${combo}`, 0, 0);
        ctx.fillText(`Combo x${combo}`, 0, 0);
        ctx.restore();
    }
}

function drawOverlay() {
    ctx.textAlign = "center";

    if (gameState === "menu") {
        ctx.fillStyle = "#020617cc";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#e5e7eb";
        ctx.font = "40px Arial";
        ctx.fillText("WHACK-A-MOLE", canvas.width / 2, 200);
        ctx.font = "22px Arial";
        ctx.fillText("Click / Tap the mole!", canvas.width / 2, 250);
        ctx.fillText("Press to start", canvas.width / 2, 300);
    }

    if (gameState === "gameOver") {
        ctx.fillStyle = "#020617dd";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#e5e7eb";
        ctx.font = "38px Arial";
        
        // Show different message based on how game ended
        if (timeLeft <= 0) {
            ctx.fillText("Time's Up!", canvas.width / 2, 240);
        } else {
            ctx.fillText("Game Over!", canvas.width / 2, 240);
        }
        
        ctx.font = "22px Arial";
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 280);
        
        // Show countdown or ready message
        const timeSinceGameOver = (Date.now() - gameOverTime) / 1000;
        const timeRemaining = Math.max(0, GAME_OVER_DELAY - timeSinceGameOver);
        
        if (timeRemaining > 0) {
            ctx.fillStyle = "#9ca3af";
            ctx.fillText(`Wait ${Math.ceil(timeRemaining)}s to play again`, canvas.width / 2, 330);
        } else {
            ctx.fillStyle = "#e5e7eb";
            ctx.fillText("Click / Tap to play again", canvas.width / 2, 330);
        }
    }
}

// ===== LOOP =====
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(dt);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
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
    // Draw hole rim/edge again on top to cover mole edges
    //drawHoleRims();
    drawParticles();
    ctx.restore();
    
    drawHUD();
    drawOverlay();

    requestAnimationFrame(gameLoop);
}

// ===== INIT =====
setupHoles();
canvas.addEventListener("mousedown", () => {
    if (gameState === "menu") {
        startGame();
    } else if (gameState === "gameOver") {
        // Check if 3 seconds have passed since game over
        const timeSinceGameOver = (Date.now() - gameOverTime) / 1000;
        if (timeSinceGameOver >= GAME_OVER_DELAY) {
            startGame();
        }
    }
});
canvas.addEventListener("touchstart", () => {
    if (gameState === "menu") {
        startGame();
    } else if (gameState === "gameOver") {
        // Check if 3 seconds have passed since game over
        const timeSinceGameOver = (Date.now() - gameOverTime) / 1000;
        if (timeSinceGameOver >= GAME_OVER_DELAY) {
            startGame();
        }
    }
}, { passive: false });

requestAnimationFrame(gameLoop);
