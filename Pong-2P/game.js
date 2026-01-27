const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical game dimensions (used for game logic, not actual canvas pixels)
// After DPR scaling, canvas.width/height will be these * devicePixelRatio
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

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
    ctx.textAlign = 'center';
    
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

// Input flags
let wPressed = false;
let sPressed = false;
let upPressed = false;
let downPressed = false;

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

// === Input Handling ===
document.addEventListener("keydown", (e) => {
    if (e.key === "w" || e.key === "W") wPressed = true;
    if (e.key === "s" || e.key === "S") sPressed = true;
    if (e.key === "ArrowUp") upPressed = true;
    if (e.key === "ArrowDown") downPressed = true;

    if (e.code === "Space") {
        if (gameState === "menu" || gameState === "gameOver") {
            startNewGame();
        }
    }
});

document.addEventListener("keyup", (e) => {
    if (e.key === "w" || e.key === "W") wPressed = false;
    if (e.key === "s" || e.key === "S") sPressed = false;
    if (e.key === "ArrowUp") upPressed = false;
    if (e.key === "ArrowDown") downPressed = false;
});

// === Touch Button Controls ===
const p1UpBtn = document.getElementById("p1Up");
const p1DownBtn = document.getElementById("p1Down");
const p2UpBtn = document.getElementById("p2Up");
const p2DownBtn = document.getElementById("p2Down");

// Player 1 controls (left side)
p1UpBtn.addEventListener("mousedown", () => wPressed = true);
p1UpBtn.addEventListener("mouseup", () => wPressed = false);
p1UpBtn.addEventListener("mouseleave", () => wPressed = false);
p1UpBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    wPressed = true;
});
p1UpBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    wPressed = false;
});
p1UpBtn.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    wPressed = false;
});

p1DownBtn.addEventListener("mousedown", () => sPressed = true);
p1DownBtn.addEventListener("mouseup", () => sPressed = false);
p1DownBtn.addEventListener("mouseleave", () => sPressed = false);
p1DownBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    sPressed = true;
});
p1DownBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    sPressed = false;
});
p1DownBtn.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    sPressed = false;
});

// Player 2 controls (right side)
p2UpBtn.addEventListener("mousedown", () => upPressed = true);
p2UpBtn.addEventListener("mouseup", () => upPressed = false);
p2UpBtn.addEventListener("mouseleave", () => upPressed = false);
p2UpBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    upPressed = true;
});
p2UpBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    upPressed = false;
});
p2UpBtn.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    upPressed = false;
});

p2DownBtn.addEventListener("mousedown", () => downPressed = true);
p2DownBtn.addEventListener("mouseup", () => downPressed = false);
p2DownBtn.addEventListener("mouseleave", () => downPressed = false);
p2DownBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    downPressed = true;
});
p2DownBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    downPressed = false;
});
p2DownBtn.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    downPressed = false;
});

// === Start Game with Touch/Click ===
// Canvas click to start game
canvas.addEventListener("click", (e) => {
    if (gameState === "menu" || gameState === "gameOver") {
        startNewGame();
    }
});

// Canvas touch to start game
canvas.addEventListener("touchstart", (e) => {
    if (gameState === "menu" || gameState === "gameOver") {
        e.preventDefault();
        startNewGame();
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

    ballVelX = BALL_BASE_SPEED * direction;
    ballVelY = BALL_BASE_SPEED * (Math.random() * 0.6 - 0.3);
}

// === Main Update ===
function update() {
    if (gameState !== "playing") return;

    // --- Move left paddle (Player 1: W/S) ---
    if (wPressed) leftPaddleY -= PADDLE_SPEED;
    if (sPressed) leftPaddleY += PADDLE_SPEED;

    // Clamp left paddle
    if (leftPaddleY < 0) leftPaddleY = 0;
    if (leftPaddleY + PADDLE_HEIGHT > GAME_HEIGHT)
        leftPaddleY = GAME_HEIGHT - PADDLE_HEIGHT;

    // --- Move right paddle (Player 2: Up/Down arrows) ---
    if (upPressed) rightPaddleY -= PADDLE_SPEED;
    if (downPressed) rightPaddleY += PADDLE_SPEED;

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
        ballVelX = -ballVelX * 1.05;
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
        ballVelX = -ballVelX * 1.05;
        const hitPos =
            (ballY - (rightPaddleY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        ballVelY = BALL_BASE_SPEED * hitPos + (Math.random() * 1 - 0.5);

        paddleSound.currentTime = 0;
        paddleSound.play();
    }

    // --- Scoring ---
    if (ballX < 0) {
        rightScore++;
        scoreSound.currentTime = 0;
        scoreSound.play();
        checkWinOrReset(1);
    }
    if (ballX > GAME_WIDTH) {
        leftScore++;
        scoreSound.currentTime = 0;
        scoreSound.play();
        checkWinOrReset(-1);
    }
}

function checkWinOrReset(direction) {
    if (leftScore >= WIN_SCORE || rightScore >= WIN_SCORE) {
        gameState = "gameOver";
        winnerText = leftScore >= WIN_SCORE ? "Player 1 Wins!" : "Player 2 Wins!";
        resetBall(0);
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
    // Ensure context scaling is always applied (safeguard)
    applyDPRScaling();
    
    // Background
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Net
    drawNet();

    // Paddles
    ctx.fillStyle = "white";
    ctx.fillRect(0, leftPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
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

    // Scores
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(leftScore, Math.round(GAME_WIDTH / 4), 50);
    ctx.fillText(rightScore, Math.round((GAME_WIDTH * 3) / 4), 50);

    // State overlays
    if (gameState === "menu") {
        ctx.font = "50px Arial";
        ctx.textBaseline = "middle";
        ctx.fillText("PONG 2-PLAYER", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 - 40));

        ctx.font = "22px Arial";
        ctx.fillText("Player 1: W / S or Left Buttons", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 + 5));
        ctx.fillText("Player 2: ↑ / ↓ or Right Buttons", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 + 35));
        ctx.fillText("Press SPACE to Start", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 + 75));
    } else if (gameState === "gameOver") {
        ctx.font = "40px Arial";
        ctx.textBaseline = "middle";
        ctx.fillText(winnerText, Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 - 10));

        ctx.font = "24px Arial";
        ctx.fillText("Press SPACE to Play Again", Math.round(GAME_WIDTH / 2), Math.round(GAME_HEIGHT / 2 + 30));
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

resetBall(0);
requestAnimationFrame(gameLoop);
