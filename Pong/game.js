const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical game dimensions (used for game logic, not actual canvas pixels)
// After DPR scaling, canvas.width/height will be these * devicePixelRatio
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Canvas is now at fixed resolution - no scaling needed
// UI elements are rendered in HTML for crisp text
// This function is kept for compatibility but does minimal setup
function applyDPRScaling() {
    // Ensure image smoothing is enabled for better graphics quality
    if (ctx.imageSmoothingEnabled !== undefined) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    }
}

// Apply immediately
applyDPRScaling();

// Expose refresh function for resizeCanvas to call
window.refreshGameContext = function() {
    applyDPRScaling();
};

// === Game Settings ===
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 18; // Increased by 50% (was 12)
const PADDLE_SPEED = 7;
const BALL_BASE_SPEED = 6;
const WIN_SCORE = 7;

// Positions
let leftPaddleY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
let rightPaddleY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
let ballX = GAME_WIDTH / 2;
let ballY = GAME_HEIGHT / 2;
let ballVelX = BALL_BASE_SPEED;
let ballVelY = BALL_BASE_SPEED * 0.5;

// Ball trail for visual effect
const BALL_TRAIL_LENGTH = 8;
let ballTrail = []; // Array of {x, y} positions

// Input flags (keyboard)
let wPressed = false;
let sPressed = false;

// Scores
let leftScore = 0;
let rightScore = 0;

// === Game State ===
let gameState = "menu"; // "menu" | "playing" | "gameOver"
let winnerText = "";

// === Sounds ===
const paddleSound = new Audio("../Sounds/paddle.wav");
const wallSound   = new Audio("../Sounds/wall.wav");
const scoreSound  = new Audio("../Sounds/score.wav");
const gameStartSound = new Audio("../Sounds/gamestart.wav");
const winSound = new Audio("../Sounds/win.wav");

// === INPUT HANDLING (KEYBOARD) ===
document.addEventListener("keydown", (e) => {
    if (e.key === "w" || e.key === "W") wPressed = true;
    if (e.key === "s" || e.key === "S") sPressed = true;

    if (e.code === "Space") {
        if (gameState === "menu" || gameState === "gameOver") {
            startNewGame();
        }
    }
});

document.addEventListener("keyup", (e) => {
    if (e.key === "w" || e.key === "W") wPressed = false;
    if (e.key === "s" || e.key === "S") sPressed = false;
});

// === INPUT HANDLING (MOUSE + TOUCH) ===

// Helper to convert screen Y to canvas Y and move paddle
function moveLeftPaddleToClientY(clientY) {
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scaling factors (canvas internal size vs displayed size)
    // Use logical game dimensions for coordinate conversion
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    
    // Convert client coordinates to canvas coordinates
    const canvasY = (clientY - rect.top) * scaleY;
    
    // Center paddle on pointer
    leftPaddleY = canvasY - PADDLE_HEIGHT / 2;

    // Clamp
    if (leftPaddleY < 0) leftPaddleY = 0;
    if (leftPaddleY + PADDLE_HEIGHT > GAME_HEIGHT) {
        leftPaddleY = GAME_HEIGHT - PADDLE_HEIGHT;
    }
}

// Mouse click on canvas to start game
canvas.addEventListener("click", (e) => {
    if (gameState === "menu" || gameState === "gameOver") {
        startNewGame();
    }
});

// Mouse move on canvas
canvas.addEventListener("mousemove", (e) => {
    // Only affect paddle while playing
    if (gameState !== "playing") return;
    moveLeftPaddleToClientY(e.clientY);
});

// Touch controls on canvas
canvas.addEventListener("touchstart", (e) => {
    if (gameState === "menu" || gameState === "gameOver") {
        // Tap on screen to start/restart game
        e.preventDefault();
        startNewGame();
        return;
    }
    if (gameState !== "playing") return;

    if (e.touches.length > 0) {
        e.preventDefault();
        moveLeftPaddleToClientY(e.touches[0].clientY);
    }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    if (gameState !== "playing") return;

    if (e.touches.length > 0) {
        e.preventDefault();
        moveLeftPaddleToClientY(e.touches[0].clientY);
    }
}, { passive: false });

// === Helper Functions ===
function startNewGame() {
    leftScore = 0;
    rightScore = 0;
    resetPositions();
    resetBall(Math.random() < 0.5 ? 1 : -1);
    gameState = "playing";
    winnerText = "";
    // Play game start sound
    gameStartSound.currentTime = 0;
    gameStartSound.play();
}

function resetPositions() {
    leftPaddleY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
    rightPaddleY = GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2;
}

function resetBall(direction = 1) {
    ballX = GAME_WIDTH / 2;
    ballY = GAME_HEIGHT / 2;
    
    // Clear trail when ball resets
    ballTrail = [];

    if (direction === 0) {
        ballVelX = 0;
        ballVelY = 0;
        return;
    }

    // Random slight angle
    ballVelX = BALL_BASE_SPEED * direction;
    ballVelY = BALL_BASE_SPEED * (Math.random() * 0.6 - 0.3);
}

// === Main Update ===
function update() {
    if (gameState !== "playing") return;

    // --- Move left paddle (Keyboard only) ---
    // Mouse/touch already directly set leftPaddleY
    if (wPressed) leftPaddleY -= PADDLE_SPEED;
    if (sPressed) leftPaddleY += PADDLE_SPEED;

    // Clamp left paddle
    if (leftPaddleY < 0) leftPaddleY = 0;
    if (leftPaddleY + PADDLE_HEIGHT > GAME_HEIGHT)
        leftPaddleY = GAME_HEIGHT - PADDLE_HEIGHT;

    // --- Move right paddle (Smooth AI with Linear Interpolation) ---
    const rightPaddleCenter = rightPaddleY + PADDLE_HEIGHT / 2;
    const targetY = ballY;
    const distance = targetY - rightPaddleCenter;
    
    // Tolerance zone - don't move if very close (reduces micro-jitter)
    const tolerance = 1;
    
    if (Math.abs(distance) > tolerance) {
        // Use linear interpolation (lerp) for smooth movement
        // Lerp factor: smaller = smoother but slower, larger = faster but still smooth
        // Adaptive lerp: faster when far away, slower when close
        const maxLerp = 0.25;  // Maximum interpolation factor (when far)
        const minLerp = 0.08;  // Minimum interpolation factor (when close)
        
        // Scale lerp factor based on distance for adaptive smoothness
        // When far (>50px), use max lerp. When close (<10px), use min lerp
        const distanceFactor = Math.min(Math.abs(distance) / 50, 1);
        const lerpFactor = minLerp + (maxLerp - minLerp) * distanceFactor;
        
        // Smoothly interpolate towards target position
        rightPaddleY += (targetY - rightPaddleCenter) * lerpFactor;
    }

    // Clamp right paddle
    if (rightPaddleY < 0) rightPaddleY = 0;
    if (rightPaddleY + PADDLE_HEIGHT > GAME_HEIGHT)
        rightPaddleY = GAME_HEIGHT - PADDLE_HEIGHT;

    // --- Move ball ---
    ballX += ballVelX;
    ballY += ballVelY;
    
    // Update ball trail
    ballTrail.push({ x: ballX, y: ballY });
    if (ballTrail.length > BALL_TRAIL_LENGTH) {
        ballTrail.shift(); // Remove oldest position
    }

    // Top / bottom collision
    if (ballY - BALL_SIZE / 2 < 0 && ballVelY < 0) {
        ballVelY = -ballVelY;
        wallSound.currentTime = 0;
        wallSound.play();
    }
    if (ballY + BALL_SIZE / 2 > GAME_HEIGHT && ballVelY > 0) {
        ballVelY = -ballVelY;
        wallSound.currentTime = 0;
        wallSound.play();
    }

    // --- Paddle collisions ---

    // Left paddle collision
    if (
        ballX - BALL_SIZE / 2 <= PADDLE_WIDTH &&
        ballY > leftPaddleY &&
        ballY < leftPaddleY + PADDLE_HEIGHT &&
        ballVelX < 0
    ) {
        ballVelX = -ballVelX * 1.05; // increase speed a bit
        const hitPos =
            (ballY - (leftPaddleY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        ballVelY = BALL_BASE_SPEED * hitPos + (Math.random() * 1 - 0.5);

        paddleSound.currentTime = 0;
        paddleSound.play();
    }

    // Right paddle collision
    if (
        ballX + BALL_SIZE / 2 >= GAME_WIDTH - PADDLE_WIDTH &&
        ballY > rightPaddleY &&
        ballY < rightPaddleY + PADDLE_HEIGHT &&
        ballVelX > 0
    ) {
        ballVelX = -ballVelX * 1.05; // increase speed
        const hitPos =
            (ballY - (rightPaddleY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        ballVelY = BALL_BASE_SPEED * hitPos + (Math.random() * 1 - 0.5);

        paddleSound.currentTime = 0;
        paddleSound.play();
    }

    // --- Scoring ---
    if (ballX < 0) {
        // Right player scores
        rightScore++;
        scoreSound.currentTime = 0;
        scoreSound.play();
        checkWinOrReset(1);
    }
    if (ballX > GAME_WIDTH) {
        // Left player scores
        leftScore++;
        scoreSound.currentTime = 0;
        scoreSound.play();
        checkWinOrReset(-1);
    }
}

function checkWinOrReset(direction) {
    if (leftScore >= WIN_SCORE || rightScore >= WIN_SCORE) {
        gameState = "gameOver";
        winnerText = leftScore >= WIN_SCORE ? "Left Player Wins!" : "Right Player Wins!";
        resetBall(0); // stop the ball
        // Play win sound
        winSound.currentTime = 0;
        winSound.play();
    } else {
        resetBall(direction);
    }
}

// === Drawing ===
function drawNet() {
    const segmentHeight = 20;
    const segmentGap = 15;
    const x = GAME_WIDTH / 2 - 2;

    ctx.fillStyle = "white";
    for (let y = 0; y < GAME_HEIGHT; y += segmentHeight + segmentGap) {
        ctx.fillRect(x, y, 4, segmentHeight);
    }
}

function draw() {
    // Ensure context is properly set up
    applyDPRScaling();
    
    // Background
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Net
    drawNet();

    // Paddles
    ctx.fillStyle = "white";
    // Left paddle
    ctx.fillRect(0, leftPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
    // Right paddle
    ctx.fillRect(GAME_WIDTH - PADDLE_WIDTH, rightPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Ball trail (draw before ball for depth effect)
    if (ballTrail.length > 1) {
        for (let i = 0; i < ballTrail.length - 1; i++) {
            const trailPos = ballTrail[i];
            const alpha = (i + 1) / ballTrail.length * 0.4; // Fade from 40% to 0%
            const size = (BALL_SIZE / 2) * (i + 1) / ballTrail.length; // Smaller trail circles
            
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "white";
            ctx.beginPath();
            ctx.arc(trailPos.x, trailPos.y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0; // Reset alpha
    }

    // Ball
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();

    // UI elements are now rendered in HTML, update them here
    updateUI();
}

// Update HTML UI elements (called from draw function)
function updateUI() {
    // Update scores
    const leftScoreEl = document.getElementById('leftScore');
    const rightScoreEl = document.getElementById('rightScore');
    const menuOverlay = document.getElementById('menuOverlay');
    const gameOverOverlay = document.getElementById('gameOverOverlay');
    const winnerTextEl = document.getElementById('winnerText');
    
    if (leftScoreEl) leftScoreEl.textContent = leftScore;
    if (rightScoreEl) rightScoreEl.textContent = rightScore;
    
    // Show/hide overlays based on game state
    if (gameState === "menu") {
        if (menuOverlay) menuOverlay.style.display = "block";
        if (gameOverOverlay) gameOverOverlay.style.display = "none";
    } else if (gameState === "gameOver") {
        if (menuOverlay) menuOverlay.style.display = "none";
        if (gameOverOverlay) {
            gameOverOverlay.style.display = "block";
            if (winnerTextEl) winnerTextEl.textContent = winnerText;
        }
    } else {
        // Playing state - hide all overlays
        if (menuOverlay) menuOverlay.style.display = "none";
        if (gameOverOverlay) gameOverOverlay.style.display = "none";
    }
}

// === Main Loop (Throttled to 60 FPS) ===
let lastUpdateTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS; // ~16.67ms per frame at 60 FPS

function gameLoop(timestamp) {
    // Always render for smooth visuals
    draw();
    
    // Only update game logic at 60 FPS
    const elapsed = timestamp - lastUpdateTime;
    if (elapsed >= frameInterval) {
        update();
        lastUpdateTime = timestamp - (elapsed % frameInterval); // Account for frame time drift
    }
    
    requestAnimationFrame(gameLoop);
}

// Start in menu state with ball stopped
resetBall(0);
requestAnimationFrame(gameLoop);
