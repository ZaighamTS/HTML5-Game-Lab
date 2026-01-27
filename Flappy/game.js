const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical game dimensions (used for game logic, not actual canvas pixels)
// After DPR scaling, canvas.width/height will be these * devicePixelRatio
const GAME_WIDTH = 480;
const GAME_HEIGHT = 720;

// Apply device pixel ratio scaling for crisp rendering on high-DPI displays
// This ensures text and graphics render sharply
function applyDPRScaling() {
    // Get the DPR that was set by resizeCanvas, or calculate it
    const dpr = canvas._dpr || window.devicePixelRatio || 1;
    
    // Always ensure the context is properly scaled
    // The canvas dimensions should be GAME_WIDTH * dpr x GAME_HEIGHT * dpr
    if (canvas.width === GAME_WIDTH * dpr && canvas.height === GAME_HEIGHT * dpr) {
        // Canvas is properly sized, ensure context is scaled
        // Check if scale is already applied (getTransform might not be available in all browsers)
        let needsScale = true;
        if (ctx.getTransform) {
            const currentTransform = ctx.getTransform();
            // Check if scale is already applied (within small tolerance)
            if (Math.abs(currentTransform.a - dpr) < 0.01 && Math.abs(currentTransform.d - dpr) < 0.01) {
                needsScale = false;
            }
        }
        if (needsScale) {
            // Scale not applied or incorrect, reapply it
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        }
    } else if (canvas.width !== GAME_WIDTH || canvas.height !== GAME_HEIGHT) {
        // Canvas has been resized but might not have DPR applied yet
        // Calculate the scale that was applied
        const scaleX = canvas.width / GAME_WIDTH;
        const scaleY = canvas.height / GAME_HEIGHT;
        // Reset transform and apply scale
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(scaleX, scaleY);
    }
    
    // Optimize text rendering for crisp text
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    
    // Enable better text rendering (but keep image smoothing for graphics)
    if (ctx.imageSmoothingEnabled !== undefined) {
        ctx.imageSmoothingEnabled = true;
    }
}

// Apply scaling immediately
applyDPRScaling();

// Expose refresh function for resizeCanvas to call
window.refreshGameContext = function() {
    applyDPRScaling();
};

// ====== SETTINGS ======
const GRAVITY = 1300;          // pixels per second^2
const FLAP_STRENGTH = -380;    // initial upward velocity on flap
const BIRD_SIZE = 26;

const PIPE_SPEED = 180;        // pixels per second
const PIPE_GAP = 180;          // vertical gap between top & bottom pipe
const PIPE_WIDTH = 70;
const PIPE_SPAWN_INTERVAL = 1.3; // seconds between pipes

const FLOOR_HEIGHT = 90;

// ====== PARALLAX SETTINGS ======
const PARALLAX_SPEED_CLOUDS = 30;      // slowest layer (furthest back)
const PARALLAX_SPEED_FAR_MOUNTAINS = 50; // middle layer
const PARALLAX_SPEED_NEAR_MOUNTAINS = 80; // faster layer (closer)
const CLOUD_SPACING = 200;
const MOUNTAIN_SPACING = 250;

// ====== GAME STATE ======
let birdX = GAME_WIDTH * 0.25;
let birdY = GAME_HEIGHT / 2;
let birdVelY = 0;

let pipes = []; // { x, gapY, passed }
let clouds = []; // { x, y, size, type }
let farMountains = []; // { x, baseY, height }
let nearMountains = []; // { x, baseY, height }
let score = 0;
let bestScore = 0;
if (typeof window !== 'undefined' && window.GameUtils) {
    bestScore = parseInt(window.GameUtils.SafeStorage.get("flappyBestScore", "0"), 10);
} else {
    try {
        bestScore = parseInt(localStorage.getItem("flappyBestScore") || "0", 10);
    } catch (e) {
        bestScore = 0;
    }
}

let gameState = "menu"; // "menu" | "playing" | "gameOver"

let wingTime = 0;   // used for wing flapping animation

// timing
let lastTime = 0;
let spawnTimer = 0;
let parallaxOffset = 0; // global parallax scroll offset

// input flags
let flapQueued = false;

// ====== SOUNDS ======
const flapSound = new Audio("../Sounds/flap.wav");
const scoreSound = new Audio("../Sounds/score.wav");
const hitSound = new Audio("../Sounds/hit.wav");
const gameOverSound = new Audio("../Sounds/gameover.wav");
const gameStartSound = new Audio("../Sounds/gamestart.wav");

// ====== INPUT HANDLERS ======
function queueFlap() {
    if (gameState === "menu") {
        startGame();
    } else if (gameState === "gameOver") {
        resetGame();
        startGame();
    } else if (gameState === "playing") {
        flapQueued = true;
    }
}

document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        queueFlap();
    }
});

canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    queueFlap();
});

canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    queueFlap();
}, { passive: false });

// ====== GAME CONTROL ======
function startGame() {
    gameState = "playing";
    // Play game start sound
    gameStartSound.currentTime = 0;
    gameStartSound.play();
}

function resetGame() {
    birdX = GAME_WIDTH * 0.25;
    birdY = GAME_HEIGHT / 2;
    birdVelY = 0;
    pipes = [];
    score = 0;
    spawnTimer = 0;
    parallaxOffset = 0;
    initializeParallaxLayers();
}

// ====== PARALLAX LAYER INITIALIZATION ======
function initializeParallaxLayers() {
    const floorY = GAME_HEIGHT - FLOOR_HEIGHT;
    
    // Initialize clouds
    clouds = [];
    for (let x = 0; x < GAME_WIDTH + CLOUD_SPACING * 3; x += CLOUD_SPACING) {
        clouds.push({
            x: x + Math.random() * 100,
            y: 50 + Math.random() * 200,
            size: 30 + Math.random() * 40,
            type: Math.floor(Math.random() * 3) // 0, 1, or 2 for variety
        });
    }
    
    // Initialize far mountains (taller, extending to ground)
    farMountains = [];
    for (let x = -100; x < GAME_WIDTH + MOUNTAIN_SPACING * 2; x += MOUNTAIN_SPACING) {
        const height = 180 + Math.random() * 120; // Increased height
        const baseY = floorY; // Mountains touch the ground
        farMountains.push({
            x: x,
            baseY: baseY,
            height: height,
            peaks: generateMountainPeaks(2 + Math.floor(Math.random() * 2), 80 + Math.random() * 60, height)
        });
    }
    
    // Initialize near mountains (taller, extending to ground)
    nearMountains = [];
    for (let x = -100; x < GAME_WIDTH + MOUNTAIN_SPACING * 2; x += MOUNTAIN_SPACING) {
        const height = 220 + Math.random() * 150; // Increased height
        const baseY = floorY; // Mountains touch the ground
        nearMountains.push({
            x: x,
            baseY: baseY,
            height: height,
            peaks: generateMountainPeaks(1 + Math.floor(Math.random() * 3), 60 + Math.random() * 80, height, true)
        });
    }
}

// Helper function to generate mountain peak data
function generateMountainPeaks(numPeaks, peakWidth, mountainHeight, isVaried = false) {
    const peaks = [];
    for (let i = 0; i <= numPeaks; i++) {
        peaks.push({
            x: peakWidth * i + (isVaried ? (Math.random() - 0.5) * 20 : 0),
            height: mountainHeight * (isVaried ? 0.6 + Math.random() * 0.4 : 0.7 + Math.random() * 0.3)
        });
    }
    return { peaks: peaks, peakWidth: peakWidth };
}

function gameOver() {
    gameState = "gameOver";
    if (score > bestScore) {
        bestScore = score;
        if (typeof window !== 'undefined' && window.GameUtils) {
            window.GameUtils.SafeStorage.set("flappyBestScore", bestScore.toString());
        } else {
            try {
                localStorage.setItem("flappyBestScore", bestScore.toString());
            } catch (e) {
                console.warn('Failed to save best score:', e);
            }
        }
    }
    // Play game over sound
    gameOverSound.currentTime = 0;
    gameOverSound.play();
}

// ====== PIPE SPAWNING ======
function spawnPipe() {
    const margin = 80;
    const availableHeight = GAME_HEIGHT - FLOOR_HEIGHT - PIPE_GAP - margin * 2;
    const gapTop = margin + Math.random() * availableHeight;
    const gapY = gapTop + PIPE_GAP / 2;

    pipes.push({
        x: GAME_WIDTH + PIPE_WIDTH,
        gapY,
        passed: false
    });
}

// ====== UPDATE ======
function update(deltaTime) {
    if (gameState !== "playing") return;

    // Bird physics
    if (flapQueued) {
        birdVelY = FLAP_STRENGTH;
        flapQueued = false;
        // Play flap sound
        flapSound.currentTime = 0;
        flapSound.play();
    } else {
        birdVelY += GRAVITY * deltaTime;
    }

    birdY += birdVelY * deltaTime;
    wingTime += deltaTime * 12;  // speed of wing flapping

    // Floor & ceiling
    const ceiling = 0;
    const floorY = GAME_HEIGHT - FLOOR_HEIGHT;
    if (birdY - BIRD_SIZE / 2 < ceiling) {
        birdY = ceiling + BIRD_SIZE / 2;
        birdVelY = 0;
    }
    if (birdY + BIRD_SIZE / 2 > floorY) {
        birdY = floorY - BIRD_SIZE / 2;
        // Play hit sound for ground collision
        hitSound.currentTime = 0;
        hitSound.play();
        gameOver();
    }

    // Pipes movement
    const moveAmount = PIPE_SPEED * deltaTime;
    pipes.forEach(pipe => {
        pipe.x -= moveAmount;
    });

    // Remove off-screen pipes
    pipes = pipes.filter(pipe => pipe.x + PIPE_WIDTH > -100);
    
    // Update parallax layers
    if (gameState === "playing") {
        parallaxOffset += PIPE_SPEED * deltaTime;
        
        // Update clouds (slowest)
        const cloudMove = PARALLAX_SPEED_CLOUDS * deltaTime;
        clouds.forEach(cloud => {
            cloud.x -= cloudMove;
        });
        // Remove off-screen clouds and add new ones
        clouds = clouds.filter(cloud => cloud.x > -200);
        // Find rightmost cloud position
        let maxCloudX = clouds.length > 0 ? Math.max(...clouds.map(c => c.x)) : GAME_WIDTH - 100;
        // Add new clouds as needed
        while (maxCloudX < GAME_WIDTH + 300) {
            const newCloud = {
                x: maxCloudX + CLOUD_SPACING + Math.random() * 100,
                y: 50 + Math.random() * 200,
                size: 30 + Math.random() * 40,
                type: Math.floor(Math.random() * 3)
            };
            clouds.push(newCloud);
            maxCloudX = newCloud.x;
        }
        
        // Update far mountains
        const farMountainMove = PARALLAX_SPEED_FAR_MOUNTAINS * deltaTime;
        farMountains.forEach(mountain => {
            mountain.x -= farMountainMove;
        });
        farMountains = farMountains.filter(m => m.x > -MOUNTAIN_SPACING);
        let maxFarMountainX = farMountains.length > 0 ? Math.max(...farMountains.map(m => m.x)) : GAME_WIDTH - 100;
        const floorY = GAME_HEIGHT - FLOOR_HEIGHT;
        while (maxFarMountainX < GAME_WIDTH + MOUNTAIN_SPACING * 2) {
            const height = 180 + Math.random() * 120; // Increased height
            const newMountain = {
                x: maxFarMountainX + MOUNTAIN_SPACING,
                baseY: floorY, // Mountains touch the ground
                height: height,
                peaks: generateMountainPeaks(2 + Math.floor(Math.random() * 2), 80 + Math.random() * 60, height)
            };
            farMountains.push(newMountain);
            maxFarMountainX = newMountain.x;
        }
        
        // Update near mountains
        const nearMountainMove = PARALLAX_SPEED_NEAR_MOUNTAINS * deltaTime;
        nearMountains.forEach(mountain => {
            mountain.x -= nearMountainMove;
        });
        nearMountains = nearMountains.filter(m => m.x > -MOUNTAIN_SPACING);
        let maxNearMountainX = nearMountains.length > 0 ? Math.max(...nearMountains.map(m => m.x)) : GAME_WIDTH - 100;
        while (maxNearMountainX < GAME_WIDTH + MOUNTAIN_SPACING * 2) {
            const height = 220 + Math.random() * 150; // Increased height
            const newMountain = {
                x: maxNearMountainX + MOUNTAIN_SPACING,
                baseY: floorY, // Mountains touch the ground
                height: height,
                peaks: generateMountainPeaks(1 + Math.floor(Math.random() * 3), 60 + Math.random() * 80, height, true)
            };
            nearMountains.push(newMountain);
            maxNearMountainX = newMountain.x;
        }
    }

    // Spawn new pipes
    spawnTimer += deltaTime;
    if (spawnTimer >= PIPE_SPAWN_INTERVAL) {
        spawnPipe();
        spawnTimer = 0;
    }

    // Collision with pipes + scoring
    pipes.forEach(pipe => {
        const topPipeBottom = pipe.gapY - PIPE_GAP / 2;
        const bottomPipeTop = pipe.gapY + PIPE_GAP / 2;

        const birdLeft = birdX - BIRD_SIZE / 2;
        const birdRight = birdX + BIRD_SIZE / 2;
        const birdTop = birdY - BIRD_SIZE / 2;
        const birdBottom = birdY + BIRD_SIZE / 2;

        const pipeLeft = pipe.x;
        const pipeRight = pipe.x + PIPE_WIDTH;

        // Within pipe's x-range?
        const inPipeX = birdRight > pipeLeft && birdLeft < pipeRight;
        if (inPipeX) {
            const hitTopPipe = birdTop < topPipeBottom;
            const hitBottomPipe = birdBottom > bottomPipeTop;
            if (hitTopPipe || hitBottomPipe) {
                // Play hit sound
                hitSound.currentTime = 0;
                hitSound.play();
                gameOver();
            }
        }

        // Scoring: when bird passes pipe center
        if (!pipe.passed && pipe.x + PIPE_WIDTH < birdX) {
            pipe.passed = true;
            score++;
            // Play score sound
            scoreSound.currentTime = 0;
            scoreSound.play();
        }
    });
}

// ====== DRAW ======
function drawSkyGradient() {
    // Sky gradient from light blue to dark
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT - FLOOR_HEIGHT);
    gradient.addColorStop(0, "#87ceeb");  // Light sky blue
    gradient.addColorStop(0.5, "#4682b4"); // Steel blue
    gradient.addColorStop(1, "#2c3e50");   // Dark blue-gray
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT - FLOOR_HEIGHT);
}

function drawClouds() {
    clouds.forEach(cloud => {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        
        const size = cloud.size;
        const x = cloud.x;
        const y = cloud.y;
        
        // Draw cloud shape (multiple circles)
        if (cloud.type === 0) {
            // Simple cloud
            ctx.beginPath();
            ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
            ctx.arc(x + size * 0.5, y, size * 0.7, 0, Math.PI * 2);
            ctx.arc(x + size, y, size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else if (cloud.type === 1) {
            // Medium cloud
            ctx.beginPath();
            ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
            ctx.arc(x + size * 0.4, y - size * 0.2, size * 0.6, 0, Math.PI * 2);
            ctx.arc(x + size * 0.8, y, size * 0.5, 0, Math.PI * 2);
            ctx.arc(x + size * 0.6, y + size * 0.2, size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Large cloud
            ctx.beginPath();
            ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
            ctx.arc(x + size * 0.5, y - size * 0.15, size * 0.7, 0, Math.PI * 2);
            ctx.arc(x + size, y, size * 0.6, 0, Math.PI * 2);
            ctx.arc(x + size * 0.25, y + size * 0.15, size * 0.45, 0, Math.PI * 2);
            ctx.arc(x + size * 0.75, y + size * 0.15, size * 0.45, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    });
}

function drawFarMountains() {
    farMountains.forEach(mountain => {
        const x = mountain.x;
        const topY = mountain.baseY - mountain.height;
        
        // Create gradient for far mountains (lighter, more faded)
        const gradient = ctx.createLinearGradient(x, topY, x, mountain.baseY);
        gradient.addColorStop(0, "#4a5568");  // Lighter gray
        gradient.addColorStop(1, "#2d3748");  // Darker gray
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x, mountain.baseY);
        
        // Draw mountain peaks using stored peak data
        const peakData = mountain.peaks || generateMountainPeaks(2, 80, mountain.height);
        peakData.peaks.forEach(peak => {
            ctx.lineTo(x + peak.x, mountain.baseY - peak.height);
        });
        
        ctx.lineTo(x + peakData.peakWidth * (peakData.peaks.length), mountain.baseY);
        ctx.closePath();
        ctx.fill();
        
        // Add subtle outline
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

function drawNearMountains() {
    nearMountains.forEach(mountain => {
        const x = mountain.x;
        const topY = mountain.baseY - mountain.height;
        
        // Create gradient for near mountains (darker, more prominent)
        const gradient = ctx.createLinearGradient(x, topY, x, mountain.baseY);
        gradient.addColorStop(0, "#374151");  // Medium gray
        gradient.addColorStop(0.5, "#1f2937"); // Dark gray
        gradient.addColorStop(1, "#111827");   // Very dark gray
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x, mountain.baseY);
        
        // Draw mountain peaks using stored peak data
        const peakData = mountain.peaks || generateMountainPeaks(2, 70, mountain.height, true);
        peakData.peaks.forEach(peak => {
            ctx.lineTo(x + peak.x, mountain.baseY - peak.height);
        });
        
        ctx.lineTo(x + peakData.peakWidth * (peakData.peaks.length), mountain.baseY);
        ctx.closePath();
        ctx.fill();
        
        // Add darker outline for depth
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Add some texture with darker patches
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.fillRect(x + mountain.height * 0.2, mountain.baseY - mountain.height * 0.5, 20, mountain.height * 0.6);
    });
}

function drawGround() {
    const floorY = GAME_HEIGHT - FLOOR_HEIGHT;

    // ground
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, floorY, GAME_WIDTH, FLOOR_HEIGHT);

    // scrolling stripes
    ctx.fillStyle = "#1e293b";
    const stripeWidth = 40;
    for (let x = 0; x < GAME_WIDTH + stripeWidth; x += stripeWidth * 2) {
        ctx.fillRect(x - (Date.now() / 20 % (stripeWidth * 2)), floorY + 10, stripeWidth, 10);
    }
}

function drawBackground() {
    // Draw all background layers in order (back to front)
    drawSkyGradient();
    drawClouds();
    drawFarMountains();
    drawNearMountains();
    drawGround();
}

function drawPipes() {
    pipes.forEach(pipe => {
        const topPipeBottom = pipe.gapY - PIPE_GAP / 2;
        const bottomPipeTop = pipe.gapY + PIPE_GAP / 2;
        const playHeight = GAME_HEIGHT - FLOOR_HEIGHT;

        // Top pipe (hanging down from top)
        drawPipeSegment(pipe.x, 0, PIPE_WIDTH, topPipeBottom, true);

        // Bottom pipe (rising from ground)
        drawPipeSegment(
            pipe.x,
            bottomPipeTop,
            PIPE_WIDTH,
            playHeight - bottomPipeTop,
            false
        );
    });
}

function drawPipeSegment(x, y, w, h, isTop) {
    if (h <= 0) return;

    // === MAIN PIPE CYLINDER ===
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0.0, "#14532d");  // dark edge
    grad.addColorStop(0.22, "#16a34a"); // mid-dark
    grad.addColorStop(0.5, "#22c55e");  // bright center
    grad.addColorStop(0.78, "#4ade80"); // highlight
    grad.addColorStop(1.0, "#14532d");  // dark edge

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Side inner shadows (cylindrical feel)
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(x, y, 4, h);
    ctx.fillRect(x + w - 4, y, 4, h);

    // Vertical highlight stripe
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(x + w * 0.25, y, 3, h);

    // Outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // === RIM NEAR THE GAP (pipe “lip”) ===
    const rimHeight = 18;
    if (isTop) {
        const rimY = y + h - rimHeight;
        drawPipeRim(x - 4, rimY, w + 8, rimHeight);
    } else {
        const rimY = y;
        drawPipeRim(x - 4, rimY, w + 8, rimHeight);
    }
}

function drawPipeRim(x, y, w, h) {
    // Slightly brighter + thicker than main pipe
    const rimGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    rimGrad.addColorStop(0.0, "#166534");
    rimGrad.addColorStop(0.3, "#22c55e");
    rimGrad.addColorStop(0.7, "#bbf7d0");
    rimGrad.addColorStop(1.0, "#166534");

    ctx.fillStyle = rimGrad;
    ctx.fillRect(x, y, w, h);

    // Top & bottom border to make it feel like a ring
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 1);
    ctx.lineTo(x + w - 1, y + 1);
    ctx.moveTo(x + 1, y + h - 1);
    ctx.lineTo(x + w - 1, y + h - 1);
    ctx.stroke();
}


function drawBird() {
    ctx.save();

    // angle tilt based on velocity
    const tilt = Math.max(-0.6, Math.min(0.6, birdVelY / 350));

    ctx.translate(birdX, birdY);
    ctx.rotate(tilt);

    // === BODY ===
    const bodyRadius = BIRD_SIZE * 0.55;

    // body gradient (more realistic lighting)
    const bodyGrad = ctx.createRadialGradient(
        -4, -4, 2,  
        0, 0, bodyRadius
    );
    bodyGrad.addColorStop(0, "#fdf4b2");   // highlight
    bodyGrad.addColorStop(1, "#e8b400");   // yellow-orange shadow

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyRadius + 2, bodyRadius, 0, 0, Math.PI * 2);
    ctx.fill();


    // === BELLY ===
    ctx.fillStyle = "#fff7d1";
    ctx.beginPath();
    ctx.ellipse(0, 6, bodyRadius * 0.7, bodyRadius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();


    // === WING (flapping animation) ===
    const flap = Math.sin(wingTime * 1.4) * 0.9;

    ctx.save();
    ctx.rotate(flap - 1.2);  // angle depends on flap
    ctx.fillStyle = "#facc15";

    ctx.beginPath();
    ctx.ellipse(-6, 6, bodyRadius * 0.55, bodyRadius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();


    // SECOND WING (behind body; darker & smaller)
    ctx.save();
    ctx.rotate(flap - 1.0);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ca9c00";
    ctx.beginPath();
    ctx.ellipse(-8, 5, bodyRadius * 0.45, bodyRadius * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();


    // === EYE ===
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(10, -6, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(11, -6, 3, 0, Math.PI * 2);
    ctx.fill();


    // === EYEBROW (adds personality) ===
    ctx.strokeStyle = "#3c3c3c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(5, -13);
    ctx.lineTo(14, -10);
    ctx.stroke();


    // === BEAK ===
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(bodyRadius - 6, -1);
    ctx.lineTo(bodyRadius + 10, -4 + tilt * 10);
    ctx.lineTo(bodyRadius - 6, 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}


function drawHUD() {
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "28px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 20, 40);

    ctx.font = "18px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Best: ${bestScore}`, Math.round(GAME_WIDTH - 20), 34);
}

function drawOverlay() {
    ctx.textAlign = "center";

    if (gameState === "menu") {
        ctx.fillStyle = "#0f172a88";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.fillStyle = "#e5e7eb";
        ctx.font = "40px Arial";
        ctx.fillText("FLAPPY CLONE", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 - 40));

        ctx.font = "22px Arial";
        ctx.fillText("Tap / Click / Space / ↑ to flap", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2));
        ctx.fillText("Press to start", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 + 40));
    }

    if (gameState === "gameOver") {
        ctx.fillStyle = "#0f172acc";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.fillStyle = "#e5e7eb";
        ctx.font = "40px Arial";
        ctx.fillText("Game Over", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 - 40));

        ctx.font = "24px Arial";
        ctx.fillText(`Score: ${score}`, Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2));
        ctx.fillText(`Best: ${bestScore}`, Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 + 34));
        ctx.fillText("Press or tap to play again", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 + 70));
    }
}

function draw() {
    // Ensure context scaling is always applied (safeguard)
    applyDPRScaling();
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    drawBackground();
    drawPipes();
    drawBird();
    drawHUD();
    drawOverlay();
}

// ====== MAIN LOOP ======
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

resetGame();
requestAnimationFrame(gameLoop);
