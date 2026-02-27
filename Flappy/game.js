const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical game dimensions (used for game logic, not actual canvas pixels)
// After DPR scaling, canvas.width/height will be these * devicePixelRatio
const GAME_WIDTH = 480;
const GAME_HEIGHT = 720;

// Canvas at fixed resolution; UI is in HTML for crisp text
function applyDPRScaling() {
    if (ctx.imageSmoothingEnabled !== undefined) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    }
}
applyDPRScaling();
window.refreshGameContext = function() { applyDPRScaling(); };

// ====== SETTINGS ======
const GRAVITY = 1300;          // pixels per second^2
const FLAP_STRENGTH = -380;    // initial upward velocity on flap
const BIRD_SIZE = 26;

const PIPE_SPEED = 180;        // pixels per second
const PIPE_GAP = 180;          // vertical gap between top & bottom pipe
const PIPE_WIDTH = 70;
const PIPE_SPAWN_INTERVAL = 1.3; // seconds between pipes

const FLOOR_HEIGHT = 90;

// ====== BACKGROUND ======
const PARALLAX_SPEED_CLOUDS = 30;
const CLOUD_SPACING = 200;

// ====== GAME STATE ======
let birdX = GAME_WIDTH * 0.25;
let birdY = GAME_HEIGHT / 2;
let birdVelY = 0;

let pipes = []; // { x, gapY, passed }
let clouds = []; // { x, y, size, type }
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
let roadOffset = 0; // ground stripe scroll offset (only updates when playing)
let animationTime = 0; // for UI animations

// input flags
let flapQueued = false;

// mouse tracking for hover effects
let mouseX = 0;
let mouseY = 0;

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

// Track mouse position for hover effects
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX;
    mouseY = (e.clientY - rect.top) * scaleY;
});

// ====== GAME CONTROL ======
function startGame() {
    gameState = "playing";
    const container = document.getElementById("flappyGameContainer");
    if (container) container.classList.remove("title-card-active");
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
    roadOffset = 0;
    initializeParallaxLayers();
}

// ====== BACKGROUND INITIALIZATION ======
function initializeParallaxLayers() {
    clouds = [];
    for (let x = 0; x < GAME_WIDTH + CLOUD_SPACING * 3; x += CLOUD_SPACING) {
        clouds.push({
            x: x + Math.random() * 100,
            y: 50 + Math.random() * 200,
            size: 30 + Math.random() * 40,
            type: Math.floor(Math.random() * 3)
        });
    }
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
    
    // Update clouds (always move, even when gameOver)
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
    
    // Update ground stripe scroll (only when playing)
    if (gameState === "playing") {
        roadOffset += PIPE_SPEED * deltaTime;
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

function drawGround() {
    const floorY = GAME_HEIGHT - FLOOR_HEIGHT;
    const grassHeight = 22; // green upper crust

    // brown earth / dirt
    ctx.fillStyle = "#8B6914";
    ctx.fillRect(0, floorY + grassHeight, GAME_WIDTH, FLOOR_HEIGHT - grassHeight);

    // brown darker band at top of dirt (transition)
    ctx.fillStyle = "#6B4E0F";
    ctx.fillRect(0, floorY + grassHeight, GAME_WIDTH, 4);

    // green grass crust (top layer)
    ctx.fillStyle = "#5a9c3a";
    ctx.fillRect(0, floorY, GAME_WIDTH, grassHeight);

    // darker green scrolling bars on the grass
    ctx.fillStyle = "#3d6b29";
    const stripeWidth = 40;
    const stripeOffset = roadOffset % (stripeWidth * 2);
    for (let x = 0; x < GAME_WIDTH + stripeWidth; x += stripeWidth * 2) {
        ctx.fillRect(x - stripeOffset, floorY + 2, stripeWidth, grassHeight - 4);
    }
}

function drawBackground() {
    drawSkyGradient();
    drawClouds();
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

    const tilt = Math.max(-0.5, Math.min(0.5, birdVelY / 400));
    ctx.translate(birdX, birdY);
    ctx.rotate(tilt);

    const r = BIRD_SIZE * 0.5;  // main body radius (round like Flappy Bird)

    // --- Wing (behind body, flapping) ---
    const flap = Math.sin(wingTime * 1.5) * 0.85;
    ctx.save();
    ctx.rotate(flap - 0.9);
    ctx.fillStyle = "#d4a008";
    ctx.beginPath();
    ctx.ellipse(-r * 0.5, r * 0.25, r * 0.7, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Body (chunky circle, Flappy Bird style) ---
    const bodyGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 1.1);
    bodyGrad.addColorStop(0, "#ffeb3b");
    bodyGrad.addColorStop(0.6, "#fbc02d");
    bodyGrad.addColorStop(1, "#f9a825");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e65100";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- White belly (curved band at bottom) ---
    ctx.fillStyle = "#fffde7";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.35, r * 0.85, r * 0.5, 0, 0.25 * Math.PI, 1.75 * Math.PI);
    ctx.closePath();
    ctx.fill();

    // --- Eye (large white + black pupil, Flappy style) ---
    const eyeX = r * 0.5;
    const eyeY = -r * 0.25;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(eyeX + 1, eyeY, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // --- Beak (short orange triangle, pointed) ---
    ctx.fillStyle = "#ff8f00";
    ctx.beginPath();
    ctx.moveTo(r * 0.6, 0);
    ctx.lineTo(r + 6, -2);
    ctx.lineTo(r + 6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e65100";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}


function drawHUD() {
    // UI is in HTML; updateUI() updates the overlay
}

// Helper function to adjust brightness of a color
function adjustBrightness(color, amount) {
    const num = parseInt(color.replace("#", ""), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function updateUI() {
    const scoreEl = document.getElementById('flappyScore');
    const bestEl = document.getElementById('flappyBest');
    const menuOverlay = document.getElementById('flappyMenuOverlay');
    const gameOverOverlay = document.getElementById('flappyGameOverOverlay');
    const hud = document.getElementById('flappyHud');
    if (scoreEl) scoreEl.textContent = score;
    if (bestEl) bestEl.textContent = bestScore;
    if (menuOverlay) menuOverlay.style.display = gameState === "menu" ? "block" : "none";
    if (gameOverOverlay) gameOverOverlay.style.display = gameState === "gameOver" ? "block" : "none";
    if (hud) hud.style.visibility = (gameState === "playing") ? "visible" : "hidden";
    if (gameState === "gameOver") {
        const goScore = document.getElementById('flappyGameOverScore');
        const goBest = document.getElementById('flappyGameOverBest');
        const newBest = document.getElementById('flappyNewBest');
        if (goScore) goScore.textContent = score;
        if (goBest) goBest.textContent = bestScore;
        if (newBest) newBest.style.display = (score === bestScore && score > 0) ? "block" : "none";
    }
}

function drawOverlay() {
    // UI is in HTML; updateUI() updates the overlay
    updateUI();
}

function draw() {
    applyDPRScaling();
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    drawBackground();
    drawPipes();
    drawBird();
    drawHUD();
    drawOverlay();
}

// Wire HTML buttons
(function() {
    const startBtn = document.getElementById('flappyStartBtn');
    if (startBtn) startBtn.addEventListener('click', startGame);
    const playAgainBtn = document.getElementById('flappyPlayAgainBtn');
    if (playAgainBtn) playAgainBtn.addEventListener('click', function() { resetGame(); startGame(); });
})();

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
