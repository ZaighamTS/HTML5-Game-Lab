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
const paddleSound = new Audio("Sounds/paddle.wav");
const wallSound   = new Audio("Sounds/wall.wav");
const scoreSound  = new Audio("Sounds/score.wav");

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
    const y = clientY - rect.top; // Y inside canvas

    // Center paddle on pointer
    leftPaddleY = y - PADDLE_HEIGHT / 2;

    // Clamp
    if (leftPaddleY < 0) leftPaddleY = 0;
    if (leftPaddleY + PADDLE_HEIGHT > canvas.height) {
        leftPaddleY = canvas.height - PADDLE_HEIGHT;
    }
}

// Mouse move on canvas
canvas.addEventListener("mousemove", (e) => {
    // Only affect paddle while playing
    if (gameState !== "playing") return;
    moveLeftPaddleToClientY(e.clientY);
});

// Touch controls on canvas
canvas.addEventListener("touchstart", (e) => {
    if (gameState === "menu") {
        // Tap on screen can also start game (optional)
        startNewGame();
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
    if (leftPaddleY + PADDLE_HEIGHT > canvas.height)
        leftPaddleY = canvas.height - PADDLE_HEIGHT;

    // --- Move right paddle (Simple AI) ---
    const rightPaddleCenter = rightPaddleY + PADDLE_HEIGHT / 2;
    if (rightPaddleCenter < ballY - 10) {
        rightPaddleY += PADDLE_SPEED * 0.8;
    } else if (rightPaddleCenter > ballY + 10) {
        rightPaddleY -= PADDLE_SPEED * 0.8;
    }

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
        ballVelX = -ballVelX * 1.05; // increase speed a bit
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
    if (ballX > canvas.width) {
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
    // Left paddle
    ctx.fillRect(0, leftPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
    // Right paddle
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

    // Overlays for states
    if (gameState === "menu") {
        ctx.font = "60px Arial";
        ctx.fillText("PONG", canvas.width / 2, canvas.height / 2 - 40);

        ctx.font = "28px Arial";
        ctx.fillText("Press SPACE or Tap to Start", canvas.width / 2, canvas.height / 2 + 20);
    } else if (gameState === "gameOver") {
        ctx.font = "40px Arial";
        ctx.fillText(winnerText, canvas.width / 2, canvas.height / 2 - 20);

        ctx.font = "28px Arial";
        ctx.fillText(
            "Press SPACE or Tap to Play Again",
            canvas.width / 2,
            canvas.height / 2 + 30
        );
    }
}

// === Main Loop ===
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start in menu state with ball stopped
resetBall(0);
gameLoop();
