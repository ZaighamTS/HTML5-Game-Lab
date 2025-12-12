const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// === Game Settings ===
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 12;
const PADDLE_SPEED = 7;
const BALL_BASE_SPEED = 6;
const WIN_SCORE = 7;

// Positions
let leftPaddleY = canvas.height / 2 - PADDLE_HEIGHT / 2;
let rightPaddleY = canvas.height / 2 - PADDLE_HEIGHT / 2;
let ballX = canvas.width / 2;
let ballY = canvas.height / 2;
let ballVelX = BALL_BASE_SPEED;
let ballVelY = BALL_BASE_SPEED * 0.5;

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
const paddleSound = new Audio("Sounds/paddle.wav");
const wallSound   = new Audio("Sounds/wall.wav");
const scoreSound  = new Audio("Sounds/score.wav");

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
}

function resetPositions() {
    leftPaddleY = canvas.height / 2 - PADDLE_HEIGHT / 2;
    rightPaddleY = canvas.height / 2 - PADDLE_HEIGHT / 2;
}

function resetBall(direction = 1) {
    ballX = canvas.width / 2;
    ballY = canvas.height / 2;

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
    if (leftPaddleY + PADDLE_HEIGHT > canvas.height)
        leftPaddleY = canvas.height - PADDLE_HEIGHT;

    // --- Move right paddle (Player 2: Up/Down arrows) ---
    if (upPressed) rightPaddleY -= PADDLE_SPEED;
    if (downPressed) rightPaddleY += PADDLE_SPEED;

    // Clamp right paddle
    if (rightPaddleY < 0) rightPaddleY = 0;
    if (rightPaddleY + PADDLE_HEIGHT > canvas.height)
        rightPaddleY = canvas.height - PADDLE_HEIGHT;

    // --- Move ball ---
    ballX += ballVelX;
    ballY += ballVelY;

    // Top / bottom collision
    if (ballY - BALL_SIZE / 2 < 0 && ballVelY < 0) {
        ballVelY = -ballVelY;
        wallSound.currentTime = 0;
        wallSound.play();
    }
    if (ballY + BALL_SIZE / 2 > canvas.height && ballVelY > 0) {
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
        ballX + BALL_SIZE / 2 >= canvas.width - PADDLE_WIDTH &&
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
    if (ballX > canvas.width) {
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
    } else {
        resetBall(direction);
    }
}

// === Drawing ===
function drawNet() {
    const segmentHeight = 20;
    const segmentGap = 15;
    const x = canvas.width / 2 - 2;

    ctx.fillStyle = "white";
    for (let y = 0; y < canvas.height; y += segmentHeight + segmentGap) {
        ctx.fillRect(x, y, 4, segmentHeight);
    }
}

function draw() {
    // Background
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Net
    drawNet();

    // Paddles
    ctx.fillStyle = "white";
    ctx.fillRect(0, leftPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillRect(canvas.width - PADDLE_WIDTH, rightPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Ball
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();

    // Scores
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.fillText(leftScore, canvas.width / 4, 50);
    ctx.fillText(rightScore, (canvas.width * 3) / 4, 50);

    // State overlays
    if (gameState === "menu") {
        ctx.font = "50px Arial";
        ctx.fillText("PONG 2-PLAYER", canvas.width / 2, canvas.height / 2 - 40);

        ctx.font = "22px Arial";
        ctx.fillText("Player 1: W / S or Left Buttons", canvas.width / 2, canvas.height / 2 + 5);
        ctx.fillText("Player 2: ↑ / ↓ or Right Buttons", canvas.width / 2, canvas.height / 2 + 35);
        ctx.fillText("Press SPACE to Start", canvas.width / 2, canvas.height / 2 + 75);
    } else if (gameState === "gameOver") {
        ctx.font = "40px Arial";
        ctx.fillText(winnerText, canvas.width / 2, canvas.height / 2 - 10);

        ctx.font = "24px Arial";
        ctx.fillText("Press SPACE to Play Again", canvas.width / 2, canvas.height / 2 + 30);
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
