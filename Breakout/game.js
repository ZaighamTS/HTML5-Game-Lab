const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical game dimensions (used for game logic, not actual canvas pixels)
// After DPR scaling, canvas.width/height will be these * devicePixelRatio
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Canvas at fixed resolution; UI is in HTML for crisp text
function applyDPRScaling() {
    if (ctx.imageSmoothingEnabled !== undefined) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    }
}
applyDPRScaling();
window.refreshGameContext = function() { applyDPRScaling(); };

// Expose for HTML buttons
window.startBreakoutLevel = function(n) {
    selectedLevel = n;
    var container = document.getElementById("breakoutGameContainer");
    if (container) container.classList.remove("title-card-active");
    startNewGame();
};
window.goToBreakoutLevelSelect = function() {
    gameState = "levelSelect";
    paused = false;
};

// ====== SETTINGS ======
const PADDLE_WIDTH = 120;
const PADDLE_WIDTH_WIDE = 180; // Power-up width
const PADDLE_HEIGHT = 16;
const PADDLE_SPEED = 8;

const BALL_RADIUS = 8;
const BALL_BASE_SPEED = 5;

const BRICK_WIDTH = 64;
const BRICK_HEIGHT = 20;
const BRICK_PADDING = 8;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = 32;

const TRIANGLE_SIZE = 50; // Size of triangle side
const CIRCLE_RADIUS = 18; // Radius of circular bricks

const START_LIVES = 3;

// ====== GAME STATE ======
let paddleX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
let targetPaddleX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2; // Smooth follow for touch/mouse
let paddleY = GAME_HEIGHT - 50;
let currentPaddleWidth = PADDLE_WIDTH;
let targetPaddleWidth = PADDLE_WIDTH;   // Lerp toward this for smooth expand/contract
let widePaddleEndTime = 0;              // When wide-paddle power-up expires (animationTime)
let slowBallEndTime = 0;               // When slow-ball power-up expires (animationTime)

let ballX = GAME_WIDTH / 2;
let ballY = GAME_HEIGHT / 2;
let prevBallX = ballX;
let prevBallY = ballY;
let ballVelX = BALL_BASE_SPEED;
let ballVelY = -BALL_BASE_SPEED;
let currentBallSpeed = BALL_BASE_SPEED;

let rightPressed = false;
let leftPressed = false;

let score = 0;
let highScore = 0;
if (typeof window !== 'undefined' && window.GameUtils) {
    highScore = parseInt(window.GameUtils.SafeStorage.get("breakoutHighScore", "0"), 10);
} else {
    try {
        highScore = parseInt(localStorage.getItem("breakoutHighScore") || "0", 10);
    } catch (e) {
        highScore = 0;
    }
}
let lives = START_LIVES;
let selectedLevel = 1; // 1, 2, or 3
let bricksDestroyed = 0;

let bricks = [];
let particles = [];
let powerUps = [];
let balls = []; // For multi-ball power-up
let dividers = []; // Level 3 only: vertical walls between 2-3-2 sections

let gameState = "levelSelect"; // "levelSelect" | "menu" | "playing" | "paused" | "gameEnd"
let paused = false;
let selectedLevelIndex = 0; // For level selection menu
let mouseX = 0;
let mouseY = 0;
let animationTime = 0;
let gameEndWon = false; // Track if game ended with win (true) or loss (false)

// ====== POWER-UP TYPES ======
const POWERUP_TYPES = {
    MULTI_BALL: "multiBall",
    WIDE_PADDLE: "widePaddle",
    SLOW_BALL: "slowBall"
};

// ====== SOUNDS ======
const breakSound = new Audio("../Sounds/break.wav");
const loseSound = new Audio("../Sounds/lose.wav");
const paddleSound = new Audio("../Sounds/paddle.wav");
const powerUpSound = new Audio("../Sounds/powerup.wav");
const levelCompleteSound = new Audio("../Sounds/levelcomplete.wav");
const gameStartSound = new Audio("../Sounds/gamestart.wav");
const gameOverSound = new Audio("../Sounds/gameover.wav");

// ====== INPUT: KEYBOARD ======
document.addEventListener("keydown", (e) => {
    if (gameState === "levelSelect") {
        if (e.key === "ArrowUp") {
            selectedLevelIndex = Math.max(0, selectedLevelIndex - 1);
        } else if (e.key === "ArrowDown") {
            selectedLevelIndex = Math.min(2, selectedLevelIndex + 1);
        } else if (e.code === "Space" || e.key === "Enter") {
            selectedLevel = selectedLevelIndex + 1;
            startNewGame();
        }
        return;
    }

    if (e.key === "ArrowRight") rightPressed = true;
    if (e.key === "ArrowLeft") leftPressed = true;

    if (e.code === "Space") {
        if (gameState === "menu" || gameState === "gameEnd") {
            gameState = "levelSelect";
        } else if (gameState === "playing" || gameState === "paused") {
            togglePause();
        }
    }

    // Level selection shortcuts
    if (e.key === "1" || e.key === "2" || e.key === "3") {
        if (gameState === "gameEnd" || gameState === "menu") {
            selectedLevel = parseInt(e.key);
            startNewGame();
        }
    }

    if (e.key === "p" || e.key === "P") {
        if (gameState === "playing" || gameState === "paused") {
            togglePause();
        }
    }
});

document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowRight") rightPressed = false;
    if (e.key === "ArrowLeft") leftPressed = false;
});

// ====== INPUT: MOUSE ======
// Helper function to convert screen coordinates to canvas coordinates
function getCanvasCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// Helper function to check if point is within button (accounts for scaling)
function isPointInButton(px, py, btnX, btnY, btnWidth, btnHeight) {
    // Account for maximum possible scale (1.05 * 1.02 ≈ 1.07) and add small padding
    // Buttons scale from left edge, with small Y offset (max -2px)
    const maxScale = 1.1;
    const maxOffsetY = 2; // Maximum offsetY is -2, so we check a bit above
    const scaledWidth = btnWidth * maxScale;
    
    // Check if point is within scaled button bounds
    // Account for offsetY by checking a slightly larger Y range
    return px >= btnX && 
           px < btnX + scaledWidth &&
           py >= btnY - maxOffsetY && 
           py < btnY + btnHeight;
}

canvas.addEventListener("mousemove", (e) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    mouseX = coords.x;
    mouseY = coords.y;
    
    if (gameState === "playing" && !paused) {
        targetPaddleX = mouseX - currentPaddleWidth / 2;
        if (targetPaddleX < 0) targetPaddleX = 0;
        if (targetPaddleX + currentPaddleWidth > GAME_WIDTH) targetPaddleX = GAME_WIDTH - currentPaddleWidth;
    }
});

// Touch support for paddle movement
canvas.addEventListener("touchmove", (e) => {
    if (gameState === "playing" && !paused && e.touches.length > 0) {
        e.preventDefault(); // Prevent scrolling
        const touch = e.touches[0];
        const coords = getCanvasCoordinates(touch.clientX, touch.clientY);
        mouseX = coords.x;
        mouseY = coords.y;
        
        targetPaddleX = mouseX - currentPaddleWidth / 2;
        if (targetPaddleX < 0) targetPaddleX = 0;
        if (targetPaddleX + currentPaddleWidth > GAME_WIDTH) targetPaddleX = GAME_WIDTH - currentPaddleWidth;
    }
}, { passive: false });

canvas.addEventListener("click", (e) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    const mouseX = coords.x;
    const mouseY = coords.y;
    
    if (gameState === "levelSelect") {
        const buttonWidth = 400;
        const buttonHeight = 60;
        const buttonSpacing = 25;
        const totalHeight = (buttonHeight * 3) + (buttonSpacing * 2);
        const startY = (GAME_HEIGHT - totalHeight) / 2;
        const startX = (GAME_WIDTH - buttonWidth) / 2;
        
        // Level 1 button
        if (mouseX >= startX && mouseX < startX + buttonWidth &&
            mouseY >= startY && mouseY < startY + buttonHeight) {
            selectedLevel = 1;
            startNewGame();
        }
        // Level 2 button
        else if (mouseX >= startX && mouseX < startX + buttonWidth &&
                 mouseY >= startY + buttonHeight + buttonSpacing && 
                 mouseY < startY + buttonHeight + buttonSpacing + buttonHeight) {
            selectedLevel = 2;
            startNewGame();
        }
        // Level 3 button
        else if (mouseX >= startX && mouseX < startX + buttonWidth &&
                 mouseY >= startY + (buttonHeight + buttonSpacing) * 2 && 
                 mouseY < startY + (buttonHeight + buttonSpacing) * 2 + buttonHeight) {
            selectedLevel = 3;
            startNewGame();
        }
    } else if (gameState === "gameEnd") {
        // Button areas for level selection (must match draw function positions)
        const buttonWidth = 200;
        const buttonHeight = 45;
        const buttonSpacing = 20;
        const totalWidth = (buttonWidth * 3) + (buttonSpacing * 2);
        const startX = (GAME_WIDTH - totalWidth) / 2;
        const buttonY = GAME_HEIGHT / 2 + 30;
        
        // Level 1 button
        if (mouseX >= startX && mouseX < startX + buttonWidth &&
            mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 1;
            startNewGame();
        }
        // Level 2 button
        else if (mouseX >= startX + buttonWidth + buttonSpacing && 
                 mouseX < startX + buttonWidth * 2 + buttonSpacing &&
                 mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 2;
            startNewGame();
        }
        // Level 3 button
        else if (mouseX >= startX + (buttonWidth + buttonSpacing) * 2 && 
                 mouseX < startX + buttonWidth * 3 + buttonSpacing * 2 &&
                 mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 3;
            startNewGame();
        }
        // Return to menu button
        else if (mouseX >= GAME_WIDTH / 2 - 100 && mouseX < GAME_WIDTH / 2 + 100 &&
                 mouseY >= buttonY + buttonHeight + buttonSpacing && 
                 mouseY < buttonY + buttonHeight * 2 + buttonSpacing) {
            gameState = "levelSelect";
        }
    }
});

// Touch support for buttons and paddle
canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch.clientX, touch.clientY);
    const mouseX = coords.x;
    const mouseY = coords.y;
    
    // Handle paddle movement if touching during gameplay
    if (gameState === "playing" && !paused) {
        e.preventDefault();
        targetPaddleX = mouseX - currentPaddleWidth / 2;
        if (targetPaddleX < 0) targetPaddleX = 0;
        if (targetPaddleX + currentPaddleWidth > GAME_WIDTH) targetPaddleX = GAME_WIDTH - currentPaddleWidth;
        return; // Don't process button clicks if in gameplay
    }
    
    // Handle button clicks
    e.preventDefault();
    if (gameState === "levelSelect") {
        const buttonWidth = 400;
        const buttonHeight = 60;
        const buttonSpacing = 25;
        const totalHeight = (buttonHeight * 3) + (buttonSpacing * 2);
        const startY = (GAME_HEIGHT - totalHeight) / 2;
        const startX = (GAME_WIDTH - buttonWidth) / 2;
        
        // Level 1 button
        if (mouseX >= startX && mouseX < startX + buttonWidth &&
            mouseY >= startY && mouseY < startY + buttonHeight) {
            selectedLevel = 1;
            startNewGame();
        }
        // Level 2 button
        else if (mouseX >= startX && mouseX < startX + buttonWidth &&
                 mouseY >= startY + buttonHeight + buttonSpacing && 
                 mouseY < startY + buttonHeight + buttonSpacing + buttonHeight) {
            selectedLevel = 2;
            startNewGame();
        }
        // Level 3 button
        else if (mouseX >= startX && mouseX < startX + buttonWidth &&
                 mouseY >= startY + (buttonHeight + buttonSpacing) * 2 && 
                 mouseY < startY + (buttonHeight + buttonSpacing) * 2 + buttonHeight) {
            selectedLevel = 3;
            startNewGame();
        }
    } else if (gameState === "gameEnd") {
        // Button areas for level selection (must match draw function positions)
        const buttonWidth = 200;
        const buttonHeight = 45;
        const buttonSpacing = 20;
        const totalWidth = (buttonWidth * 3) + (buttonSpacing * 2);
        const startX = (GAME_WIDTH - totalWidth) / 2;
        const buttonY = GAME_HEIGHT / 2 + 30;
        
        // Level 1 button
        if (mouseX >= startX && mouseX < startX + buttonWidth &&
            mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 1;
            startNewGame();
        }
        // Level 2 button
        else if (mouseX >= startX + buttonWidth + buttonSpacing && 
                 mouseX < startX + buttonWidth * 2 + buttonSpacing &&
                 mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 2;
            startNewGame();
        }
        // Level 3 button
        else if (mouseX >= startX + (buttonWidth + buttonSpacing) * 2 && 
                 mouseX < startX + buttonWidth * 3 + buttonSpacing * 2 &&
                 mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 3;
            startNewGame();
        }
        // Return to menu button
        else if (mouseX >= GAME_WIDTH / 2 - 100 && mouseX < GAME_WIDTH / 2 + 100 &&
                 mouseY >= buttonY + buttonHeight + buttonSpacing && 
                 mouseY < buttonY + buttonHeight * 2 + buttonSpacing) {
            gameState = "levelSelect";
        }
    }
}, { passive: false });

// ====== BRICK CREATION FUNCTIONS ======
const DIVIDER_WIDTH = 12;
const DIVIDER_TOP = BRICK_OFFSET_TOP;

function createBricks() {
    bricks = [];
    dividers = [];

    if (selectedLevel === 1) {
        // Easy: 4 rows × 10 columns
        const BRICK_ROWS = 4;
        const BRICK_COLS = 10;
        for (let row = 0; row < BRICK_ROWS; row++) {
            bricks[row] = [];
            for (let col = 0; col < BRICK_COLS; col++) {
                const x = BRICK_OFFSET_LEFT + col * (BRICK_WIDTH + BRICK_PADDING);
                const y = BRICK_OFFSET_TOP + row * (BRICK_HEIGHT + BRICK_PADDING);
                bricks[row][col] = {
                    type: "rect",
                    x,
                    y,
                    width: BRICK_WIDTH,
                    height: BRICK_HEIGHT,
                    alive: true,
                    color: getBrickColor(row)
                };
            }
        }
    } else if (selectedLevel === 2) {
        // Medium: 8 rows × 10 columns
        const BRICK_ROWS = 8;
        const BRICK_COLS = 10;
        for (let row = 0; row < BRICK_ROWS; row++) {
            bricks[row] = [];
            for (let col = 0; col < BRICK_COLS; col++) {
                const x = BRICK_OFFSET_LEFT + col * (BRICK_WIDTH + BRICK_PADDING);
                const y = BRICK_OFFSET_TOP + row * (BRICK_HEIGHT + BRICK_PADDING);
                bricks[row][col] = {
                    type: "rect",
                    x,
                    y,
                    width: BRICK_WIDTH,
                    height: BRICK_HEIGHT,
                    alive: true,
                    color: getBrickColor(row)
                };
            }
        }
    } else {
        // Hard: same vertical size as level 2 (8 rows), 7 columns in 2-3-2 sections with vertical dividers (brick-area height only)
        const BRICK_COLS = 7;
        const BRICK_ROWS = 8;  // match level 2 row count
        const colStep = BRICK_WIDTH + BRICK_PADDING;
        const rowStep = BRICK_HEIGHT + BRICK_PADDING;  // same as level 1/2
        const GAP_BETWEEN_SECTIONS = 20;
        const DIVIDER_MARGIN = 8;  // Space beside divider (right of vertical)
        const totalWidth = 2 * colStep + GAP_BETWEEN_SECTIONS + 3 * colStep + GAP_BETWEEN_SECTIONS + 2 * colStep;
        const startX = (GAME_WIDTH - totalWidth) / 2;
        const sectionStartX = [
            startX,
            startX + 2 * colStep + GAP_BETWEEN_SECTIONS,
            startX + 2 * colStep + GAP_BETWEEN_SECTIONS + 3 * colStep + GAP_BETWEEN_SECTIONS
        ];
        const sectionStartCol = [0, 2, 5];
        const sectionNumCols = [2, 3, 2];
        for (let row = 0; row < BRICK_ROWS; row++) {
            bricks[row] = [];
        }
        for (let section = 0; section < 3; section++) {
            const numCols = sectionNumCols[section];
            const sectionX = sectionStartX[section];
            for (let row = 0; row < BRICK_ROWS; row++) {
                const y = BRICK_OFFSET_TOP + row * rowStep;
                for (let c = 0; c < numCols; c++) {
                    const col = sectionStartCol[section] + c;
                    const x = sectionX + c * colStep;
                    bricks[row][col] = {
                        type: "rect",
                        x,
                        y,
                        width: BRICK_WIDTH,
                        height: BRICK_HEIGHT,
                        alive: true,
                        color: getBrickColor(row)
                    };
                }
            }
        }
        // Vertical dividers: only as tall as the brick area (not full screen)
        const divY = BRICK_OFFSET_TOP;
        const brickAreaHeight = BRICK_ROWS * rowStep;
        const divH = brickAreaHeight;
        const div1RightEdge = sectionStartX[1] - DIVIDER_MARGIN;
        const div2RightEdge = sectionStartX[2] - DIVIDER_MARGIN;
        const vert1 = { x: div1RightEdge - DIVIDER_WIDTH, y: divY, w: DIVIDER_WIDTH, h: divH };
        const vert2 = { x: div2RightEdge - DIVIDER_WIDTH, y: divY, w: DIVIDER_WIDTH, h: divH };
        dividers = [vert1, vert2];
    }
}

function getBrickColor(index) {
    const colors = ["#38bdf8", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7"];
    return colors[index % colors.length];
}

// ====== PARTICLE SYSTEM ======
function createParticles(x, y, color) {
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: x,
            y: y,
            velX: (Math.random() - 0.5) * 6,
            velY: (Math.random() - 0.5) * 6,
            life: 30,
            maxLife: 30,
            color: color,
            size: Math.random() * 4 + 2
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.velX;
        p.y += p.velY;
        p.life--;
        p.velY += 0.2; // gravity

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// ====== POWER-UP SYSTEM ======
function createPowerUp(x, y) {
    // Random chance to drop power-up (15%, reduced by 50% from 30%)
    if (Math.random() < 0.15) {
        const types = Object.values(POWERUP_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];
        powerUps.push({
            x: x,
            y: y,
            velY: 2,
            type: type,
            width: 30,
            height: 20,
            spawnTime: animationTime // Track when this power-up was created for animation
        });
    }
}

function updatePowerUps() {
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        pu.y += pu.velY;

        // Check collision with paddle
        if (
            pu.x + pu.width / 2 > paddleX &&
            pu.x - pu.width / 2 < paddleX + currentPaddleWidth &&
            pu.y + pu.height / 2 > paddleY &&
            pu.y - pu.height / 2 < paddleY + PADDLE_HEIGHT
        ) {
            activatePowerUp(pu.type);
            // Play power-up sound
            powerUpSound.currentTime = 0;
            powerUpSound.play();
            powerUps.splice(i, 1);
            continue;
        }

        // Remove if off screen
        if (pu.y > GAME_HEIGHT) {
            powerUps.splice(i, 1);
        }
    }
}

function activatePowerUp(type) {
    if (type === POWERUP_TYPES.WIDE_PADDLE) {
        targetPaddleWidth = PADDLE_WIDTH_WIDE;
        widePaddleEndTime = animationTime + 10; // 10 seconds from now
    } else if (type === POWERUP_TYPES.MULTI_BALL) {
        // Spawn one new ball from the paddle (random upward angle)
        const spawnX = paddleX + currentPaddleWidth / 2;
        const spawnY = paddleY - BALL_RADIUS - 10;
        const angle = (Math.random() * 90 - 45) * (Math.PI / 180);
        balls.push({
            x: spawnX,
            y: spawnY,
            prevX: spawnX,
            prevY: spawnY,
            velX: currentBallSpeed * Math.sin(angle),
            velY: -currentBallSpeed * Math.cos(angle)
        });
    } else if (type === POWERUP_TYPES.SLOW_BALL) {
        // Slow down all balls for 10 seconds
        const speedMultiplier = 0.6;
        ballVelX *= speedMultiplier;
        ballVelY *= speedMultiplier;
        for (const ball of balls) {
            ball.velX *= speedMultiplier;
            ball.velY *= speedMultiplier;
        }
        slowBallEndTime = animationTime + 10;
    }
}

function drawPowerUps() {
    for (const pu of powerUps) {
        // Calculate animation time since spawn (for pulsing animation)
        const timeSinceSpawn = animationTime - (pu.spawnTime || animationTime);
        // Create a smooth ease-in-out pulse animation (expands and contracts from center)
        // Using sine wave for smooth oscillation, with ease-in-out feel
        const pulsePhase = timeSinceSpawn * 4; // Speed of animation
        const pulseScale = 1 + Math.sin(pulsePhase) * 0.15; // Scale between 0.85 and 1.15
        
        // Calculate animated dimensions (expand/contract from center)
        const animatedWidth = pu.width * pulseScale;
        const animatedHeight = pu.height * pulseScale;
        
        // Draw powerup box with crisp rendering - centered expansion
        const x = Math.round(pu.x - animatedWidth / 2);
        const y = Math.round(pu.y - animatedHeight / 2);
        const width = Math.round(animatedWidth);
        const height = Math.round(animatedHeight);
        
        ctx.fillStyle = "#8b5cf6"; // Purple
        ctx.fillRect(x, y, width, height);
        
        // Draw border with slight glow effect based on pulse
        const glowIntensity = (pulseScale - 1) * 2; // Normalize to 0-0.3
        ctx.strokeStyle = `rgba(167, 139, 250, ${0.8 + glowIntensity})`;
        ctx.lineWidth = 1 + glowIntensity;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        
        // Draw text - crisp rendering (text stays same size, box animates around it)
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let symbol = "?";
        if (pu.type === POWERUP_TYPES.WIDE_PADDLE) symbol = "W";
        else if (pu.type === POWERUP_TYPES.MULTI_BALL) symbol = "M";
        else if (pu.type === POWERUP_TYPES.SLOW_BALL) symbol = "S";
        ctx.fillText(symbol, Math.round(pu.x), Math.round(pu.y));
    }
}

// ====== MULTI-BALL SYSTEM ======
function updateMultiBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        // Store previous position
        if (!ball.prevX) ball.prevX = ball.x;
        if (!ball.prevY) ball.prevY = ball.y;
        ball.prevX = ball.x;
        ball.prevY = ball.y;
        
        ball.x += ball.velX;
        ball.y += ball.velY;

        // Wall collisions
        if (ball.x - BALL_RADIUS < 0 && ball.velX < 0) {
            ball.x = BALL_RADIUS;
            ball.velX = -ball.velX;
        }
        if (ball.x + BALL_RADIUS > GAME_WIDTH && ball.velX > 0) {
            ball.x = GAME_WIDTH - BALL_RADIUS;
            ball.velX = -ball.velX;
        }
        if (ball.y - BALL_RADIUS < 0 && ball.velY < 0) {
            ball.y = BALL_RADIUS;
            ball.velY = -ball.velY;
        }

        // Divider collisions (level 3)
        for (const div of dividers) {
            if (circleRectCollide(ball.x, ball.y, BALL_RADIUS, div.x, div.y, div.w, div.h)) {
                const isHorizontal = div.w > div.h;
                if (isHorizontal) {
                    ball.velY = -ball.velY;
                    if (ball.y < div.y + div.h / 2) ball.y = div.y - BALL_RADIUS - 1;
                    else ball.y = div.y + div.h + BALL_RADIUS + 1;
                } else {
                    ball.velX = -ball.velX;
                    if (ball.x < div.x + div.w / 2) ball.x = div.x - BALL_RADIUS - 1;
                    else ball.x = div.x + div.w + BALL_RADIUS + 1;
                }
            }
        }

        // Bottom - remove ball
        if (ball.y - BALL_RADIUS > GAME_HEIGHT) {
            balls.splice(i, 1);
            // Check if all balls are now gone
            checkAllBallsLost();
            continue;
        }

        // Paddle collision
        if (
            circleRectCollide(ball.x, ball.y, BALL_RADIUS, paddleX, paddleY, currentPaddleWidth, PADDLE_HEIGHT) &&
            ball.velY > 0
        ) {
            ball.y = paddleY - BALL_RADIUS;
            const hitPos = (ball.x - (paddleX + currentPaddleWidth / 2)) / (currentPaddleWidth / 2);
            const maxBounceAngle = (75 * Math.PI) / 180;
            const bounceAngle = hitPos * maxBounceAngle;
            const speed = Math.sqrt(ball.velX * ball.velX + ball.velY * ball.velY);
            ball.velX = speed * Math.sin(bounceAngle);
            ball.velY = -speed * Math.cos(bounceAngle);
            
            paddleSound.currentTime = 0;
            paddleSound.play();
        }

        // Brick collisions
        for (let row = 0; row < bricks.length; row++) {
            for (let col = 0; col < bricks[row]?.length; col++) {
                const brick = bricks[row]?.[col];
                if (!brick || !brick.alive) continue;

                const collision = detectBrickCollision(ball.x, ball.y, BALL_RADIUS, brick, ball.prevX, ball.prevY, ball.velX, ball.velY);
                if (collision.hit) {
                    brick.alive = false;
                    score += 10;
                    bricksDestroyed++;
                    const px = collision.impactX != null ? collision.impactX : brick.x;
                    const py = collision.impactY != null ? collision.impactY : brick.y;
                    createParticles(px, py, brick.color);
                    createPowerUp(brick.x, brick.y);
                    breakSound.currentTime = 0;
                    breakSound.play();

                    // Apply collision response
                    // Special handling for flipped triangles' flat top
                    if (brick.type === "triangle" && !brick.upright && collision.side === "top" && ball.velY > 0) {
                        // Flipped triangle's flat top hit from above - bounce downward (keep velY positive)
                        ball.velY = Math.abs(ball.velY); // Ensure positive (downward)
                    } else if (collision.side === "top" || collision.side === "bottom") {
                        ball.velY = -ball.velY;
                    } else if (collision.side === "left" || collision.side === "right") {
                        ball.velX = -ball.velX;
                    }
                    break; // Only one brick per ball per frame
                }
            }
        }
    }
}

function drawMultiBalls() {
    for (const ball of balls) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();
    }
}

// ====== HELPER FUNCTIONS ======
// Check if main ball is off-screen (lost)
function isMainBallLost() {
    return ballY - BALL_RADIUS > GAME_HEIGHT;
}

// Check if all balls are gone and handle life loss
function checkAllBallsLost() {
    const mainBallLost = isMainBallLost();
    const noMultiBalls = balls.length === 0;
    
    if (mainBallLost && noMultiBalls) {
        lives--;
        loseSound.currentTime = 0;
        loseSound.play();
        if (lives <= 0) {
            // Update high score
            if (score > highScore) {
                highScore = score;
                if (typeof window !== 'undefined' && window.GameUtils) {
                    window.GameUtils.SafeStorage.set("breakoutHighScore", highScore.toString());
                } else {
                    try {
                        localStorage.setItem("breakoutHighScore", highScore.toString());
                    } catch (e) {
                        console.warn('Failed to save high score:', e);
                    }
                }
            }
            gameEndWon = false;
            gameState = "gameEnd";
            // Play game over sound
            gameOverSound.currentTime = 0;
            gameOverSound.play();
        } else {
            resetBall();
        }
        return true;
    }
    return false;
}

// ====== GAME CONTROL ======
function startNewGame() {
    score = 0;
    lives = START_LIVES;
    bricksDestroyed = 0;
    currentBallSpeed = BALL_BASE_SPEED;
    currentPaddleWidth = PADDLE_WIDTH;
    targetPaddleWidth = PADDLE_WIDTH;
    widePaddleEndTime = 0;
    slowBallEndTime = 0;
    balls = [];
    powerUps = [];
    particles = [];
    dividers = [];
    paddleX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
    targetPaddleX = paddleX;
    paddleY = GAME_HEIGHT - 50;
    resetBall();
    createBricks();
    gameState = "playing";
    paused = false;
    // Play game start sound
    gameStartSound.currentTime = 0;
    gameStartSound.play();
}

function resetBall() {
    ballX = GAME_WIDTH / 2;
    ballY = paddleY - BALL_RADIUS - 10; // Position above paddle
    prevBallX = ballX;
    prevBallY = ballY;
    const angle = (Math.random() * 90 - 45) * (Math.PI / 180);
    ballVelX = currentBallSpeed * Math.sin(angle);
    ballVelY = -currentBallSpeed * Math.cos(angle);
}

function clampPaddle() {
    if (paddleX < 0) paddleX = 0;
    if (paddleX + currentPaddleWidth > GAME_WIDTH) {
        paddleX = GAME_WIDTH - currentPaddleWidth;
    }
}

function togglePause() {
    paused = !paused;
    gameState = paused ? "paused" : "playing";
}

// ====== COLLISION DETECTION ======
function circleRectCollide(cx, cy, radius, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= radius * radius;
}

function circleCircleCollide(cx1, cy1, r1, cx2, cy2, r2) {
    const dx = cx1 - cx2;
    const dy = cy1 - cy2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < r1 + r2;
}

function pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
    const d1 = sign(px, py, x1, y1, x2, y2);
    const d2 = sign(px, py, x2, y2, x3, y3);
    const d3 = sign(px, py, x3, y3, x1, y1);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
}

function sign(p1x, p1y, p2x, p2y, p3x, p3y) {
    return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
}

function circleTriangleCollide(cx, cy, radius, tx, ty, size, upright) {
    const height = size * Math.sqrt(3) / 2;
    let x1, y1, x2, y2, x3, y3;
    
    if (upright) {
        // Upright triangle: point at top
        x1 = tx + size / 2;
        y1 = ty;
        x2 = tx;
        y2 = ty + height;
        x3 = tx + size;
        y3 = ty + height;
    } else {
        // Upside down triangle: point at bottom
        x1 = tx;
        y1 = ty;
        x2 = tx + size / 2;
        y2 = ty + height;
        x3 = tx + size;
        y3 = ty;
    }
    
    // Check if circle center is inside triangle
    if (pointInTriangle(cx, cy, x1, y1, x2, y2, x3, y3)) {
        return true;
    }
    
    // Check distance to edges
    const edges = [
        [x1, y1, x2, y2],
        [x2, y2, x3, y3],
        [x3, y3, x1, y1]
    ];
    
    for (const edge of edges) {
        const dist = pointToLineSegmentDistance(cx, cy, edge[0], edge[1], edge[2], edge[3]);
        if (dist < radius) {
            return true;
        }
    }
    
    return false;
}

function pointToLineSegmentDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function detectBrickCollision(cx, cy, radius, brick, prevX, prevY, velX, velY) {
    if (brick.type === "rect") {
        return detectRectCollision(cx, cy, radius, brick, prevX, prevY, velX, velY);
    } else if (brick.type === "triangle") {
        return detectTriangleCollision(cx, cy, radius, brick, prevX, prevY, velX, velY);
    } else if (brick.type === "circle") {
        return detectCircleCollision(cx, cy, radius, brick, prevX, prevY, velX, velY);
    }
    return { hit: false };
}

function detectRectCollision(cx, cy, radius, brick, prevX, prevY, velX, velY) {
    const rx = brick.x;
    const ry = brick.y;
    const rw = brick.width;
    const rh = brick.height;

    // Find closest point on rectangle
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared > radius * radius) {
        return { hit: false };
    }

    // Use previous position to determine which edge was crossed
    const prevBallLeft = prevX - radius;
    const prevBallRight = prevX + radius;
    const prevBallTop = prevY - radius;
    const prevBallBottom = prevY + radius;

    const ballLeft = cx - radius;
    const ballRight = cx + radius;
    const ballTop = cy - radius;
    const ballBottom = cy + radius;

    const brickLeft = rx;
    const brickRight = rx + rw;
    const brickTop = ry;
    const brickBottom = ry + rh;

    let side = null;

    // Check if ball was above brick and now inside (hit top)
    if (prevBallBottom <= brickTop && ballBottom > brickTop && velY > 0) {
        side = "top";
    }
    // Check if ball was below brick and now inside (hit bottom)
    else if (prevBallTop >= brickBottom && ballTop < brickBottom && velY < 0) {
        side = "bottom";
    }
    // Check if ball was left of brick and now inside (hit left)
    else if (prevBallRight <= brickLeft && ballRight > brickLeft && velX > 0) {
        side = "left";
    }
    // Check if ball was right of brick and now inside (hit right)
    else if (prevBallLeft >= brickRight && ballLeft < brickRight && velX < 0) {
        side = "right";
    }
    // Fallback: determine by velocity direction
    else {
        const absVelX = Math.abs(velX);
        const absVelY = Math.abs(velY);
        
        if (absVelY > absVelX) {
            side = velY > 0 ? "top" : "bottom";
        } else {
            side = velX > 0 ? "left" : "right";
        }
    }

    return { hit: true, side: side, impactX: closestX, impactY: closestY };
}

function detectTriangleCollision(cx, cy, radius, brick, prevX, prevY, velX, velY) {
    if (!circleTriangleCollide(cx, cy, radius, brick.x, brick.y, brick.size, brick.upright)) {
        return { hit: false };
    }
    
    const height = brick.size * Math.sqrt(3) / 2;
    let x1, y1, x2, y2, x3, y3;
    
    if (brick.upright) {
        // Upright triangle: point at top, flat base at bottom
        x1 = brick.x + brick.size / 2;  // Point at top
        y1 = brick.y;
        x2 = brick.x;                   // Left bottom
        y2 = brick.y + height;
        x3 = brick.x + brick.size;      // Right bottom
        y3 = brick.y + height;
    } else {
        // Flipped triangle: point at bottom, flat top
        x1 = brick.x;                   // Left top
        y1 = brick.y;
        x2 = brick.x + brick.size / 2;  // Point at bottom
        y2 = brick.y + height;
        x3 = brick.x + brick.size;      // Right top
        y3 = brick.y;
    }
    
    // Define edges - match the drawing order
    let edges;
    if (brick.upright) {
        // Upright triangle edges (as drawn):
        // 1. Point to left bottom (diagonal)
        // 2. Left bottom to right bottom (flat bottom)
        // 3. Right bottom to point (diagonal)
        edges = [
            { x1, y1, x2, y2, isFlat: false, flatSide: null },           // Diagonal left
            { x1: x2, y1: y2, x2: x3, y2: y3, isFlat: true, flatSide: "bottom" },  // Flat bottom
            { x1: x3, y1: y3, x2, y2: y1, isFlat: false, flatSide: null }         // Diagonal right
        ];
    } else {
        // Flipped triangle edges (as drawn):
        // 1. Left top to point (diagonal)
        // 2. Point to right top (diagonal)
        // 3. Right top to left top (flat top)
        edges = [
            { x1, y1, x2, y2, isFlat: false, flatSide: null },           // Diagonal left
            { x1: x2, y1: y2, x2: x3, y2: y3, isFlat: false, flatSide: null },    // Diagonal right
            { x1: x3, y1: y3, x2, y2: y1, isFlat: true, flatSide: "top" }         // Flat top
        ];
    }
    
    // Find closest edge
    let closestEdge = null;
    let minDist = Infinity;
    
    for (const edge of edges) {
        const dist = pointToLineSegmentDistance(cx, cy, edge.x1, edge.y1, edge.x2, edge.y2);
        if (dist < minDist) {
            minDist = dist;
            closestEdge = edge;
        }
    }
    
    // Determine collision side based on edge type and ball movement
    let side = "top";
    if (closestEdge) {
        if (closestEdge.isFlat) {
            // Flat edge - use the flatSide directly
            // Special handling for flipped triangles is done in collision response
            side = closestEdge.flatSide;
        } else {
            // Diagonal edge - determine based on velocity and edge angle
            const edgeAngle = Math.atan2(closestEdge.y2 - closestEdge.y1, closestEdge.x2 - closestEdge.x1);
            const ballAngle = Math.atan2(velY, velX);
            
            // Calculate normal to the edge (perpendicular, pointing outward)
            const edgeLength = Math.sqrt(
                Math.pow(closestEdge.x2 - closestEdge.x1, 2) + 
                Math.pow(closestEdge.y2 - closestEdge.y1, 2)
            );
            const nx = -(closestEdge.y2 - closestEdge.y1) / edgeLength;
            const ny = (closestEdge.x2 - closestEdge.x1) / edgeLength;
            
            // Determine which side based on normal and velocity
            const dotProduct = velX * nx + velY * ny;
            
            if (Math.abs(nx) > Math.abs(ny)) {
                // More horizontal edge
                side = nx > 0 ? "right" : "left";
            } else {
                // More vertical edge
                side = ny > 0 ? "bottom" : "top";
            }
        }
    }
    
    return { hit: true, side: side };
}

function detectCircleCollision(cx, cy, radius, brick, prevX, prevY, velX, velY) {
    if (!circleCircleCollide(cx, cy, radius, brick.x, brick.y, brick.radius)) {
        return { hit: false };
    }
    
    // Calculate collision normal (from brick center to ball center)
    const dx = cx - brick.x;
    const dy = cy - brick.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return { hit: true, side: "top" };
    
    const nx = dx / distance;
    const ny = dy / distance;
    
    // Determine side based on normal
    let side = "top";
    if (Math.abs(nx) > Math.abs(ny)) {
        side = nx > 0 ? "right" : "left";
    } else {
        side = ny > 0 ? "bottom" : "top";
    }
    
    return { hit: true, side: side };
}

// ====== UPDATE ======
const PADDLE_WIDTH_LERP_SPEED = 8; // How fast paddle width lerps toward target (per second)

function update() {
    if (gameState !== "playing" || paused) return;

    // Wide-paddle power-up expiry
    if (animationTime >= widePaddleEndTime && widePaddleEndTime > 0) {
        targetPaddleWidth = PADDLE_WIDTH;
        widePaddleEndTime = 0;
    }

    // Slow-ball power-up expiry (restore normal speed after 10 seconds)
    if (animationTime >= slowBallEndTime && slowBallEndTime > 0) {
        const restoreMultiplier = 1 / 0.6; // Undo the 0.6 slow
        ballVelX *= restoreMultiplier;
        ballVelY *= restoreMultiplier;
        for (const ball of balls) {
            ball.velX *= restoreMultiplier;
            ball.velY *= restoreMultiplier;
        }
        slowBallEndTime = 0;
    }

    // Smoothly lerp paddle width toward target (expand/contract from center)
    const dt = typeof lastDeltaTime !== "undefined" ? lastDeltaTime : 1/60;
    if (Math.abs(currentPaddleWidth - targetPaddleWidth) > 0.5) {
        const paddleCenter = paddleX + currentPaddleWidth / 2;
        const delta = (targetPaddleWidth - currentPaddleWidth) * Math.min(1, dt * PADDLE_WIDTH_LERP_SPEED);
        currentPaddleWidth += delta;
        currentPaddleWidth = Math.max(PADDLE_WIDTH, Math.min(PADDLE_WIDTH_WIDE, currentPaddleWidth));
        paddleX = paddleCenter - currentPaddleWidth / 2;
        clampPaddle();
    }

    // Paddle movement: keyboard updates target, then lerp toward target (smooth on touch/mouse)
    if (rightPressed) targetPaddleX += PADDLE_SPEED;
    if (leftPressed) targetPaddleX -= PADDLE_SPEED;
    if (targetPaddleX < 0) targetPaddleX = 0;
    if (targetPaddleX + currentPaddleWidth > GAME_WIDTH) targetPaddleX = GAME_WIDTH - currentPaddleWidth;

    const PADDLE_LERP = 0.18;
    paddleX += (targetPaddleX - paddleX) * PADDLE_LERP;
    clampPaddle();

    // Update particles
    updateParticles();

    // Update power-ups
    updatePowerUps();

    // Update multi-balls
    updateMultiBalls();

    // Count bricks remaining (needed for level complete check)
    let bricksRemaining = 0;
    for (let row = 0; row < bricks.length; row++) {
        for (let col = 0; col < bricks[row]?.length; col++) {
            const brick = bricks[row]?.[col];
            if (brick && brick.alive) {
                bricksRemaining++;
            }
        }
    }

    // Only update main ball if it's not lost (off-screen)
    if (!isMainBallLost()) {
        // Store previous position for collision detection
        prevBallX = ballX;
        prevBallY = ballY;

        // Move main ball
        ballX += ballVelX;
        ballY += ballVelY;

        // Wall collisions (left/right)
        if (ballX - BALL_RADIUS < 0 && ballVelX < 0) {
            ballX = BALL_RADIUS;
            ballVelX = -ballVelX;
        }
        if (ballX + BALL_RADIUS > GAME_WIDTH && ballVelX > 0) {
            ballX = GAME_WIDTH - BALL_RADIUS;
            ballVelX = -ballVelX;
        }

        // Divider collisions (level 3)
        for (const div of dividers) {
            if (circleRectCollide(ballX, ballY, BALL_RADIUS, div.x, div.y, div.w, div.h)) {
                const isHorizontal = div.w > div.h;
                if (isHorizontal) {
                    ballVelY = -ballVelY;
                    if (ballY < div.y + div.h / 2) ballY = div.y - BALL_RADIUS - 1;
                    else ballY = div.y + div.h + BALL_RADIUS + 1;
                } else {
                    ballVelX = -ballVelX;
                    if (ballX < div.x + div.w / 2) ballX = div.x - BALL_RADIUS - 1;
                    else ballX = div.x + div.w + BALL_RADIUS + 1;
                }
            }
        }

        // Top wall
        if (ballY - BALL_RADIUS < 0 && ballVelY < 0) {
            ballY = BALL_RADIUS;
            ballVelY = -ballVelY;
        }

        // Bottom - check if main ball is lost
        if (ballY - BALL_RADIUS > GAME_HEIGHT) {
            // Main ball is lost - check if all balls are gone
            if (!checkAllBallsLost()) {
                // Main ball is lost but multi-balls remain - keep it off-screen
                ballX = GAME_WIDTH / 2;
                ballY = GAME_HEIGHT + 100; // Keep it off-screen
                ballVelX = 0;
                ballVelY = 0;
            }
        }

        // Paddle collision
        if (
            circleRectCollide(ballX, ballY, BALL_RADIUS, paddleX, paddleY, currentPaddleWidth, PADDLE_HEIGHT) &&
            ballVelY > 0
        ) {
            ballY = paddleY - BALL_RADIUS;

            const hitPos = (ballX - (paddleX + currentPaddleWidth / 2)) / (currentPaddleWidth / 2);
            const maxBounceAngle = (75 * Math.PI) / 180;
            const bounceAngle = hitPos * maxBounceAngle;

            const speed = Math.sqrt(ballVelX * ballVelX + ballVelY * ballVelY);
            ballVelX = speed * Math.sin(bounceAngle);
            ballVelY = -speed * Math.cos(bounceAngle);
            
            paddleSound.currentTime = 0;
            paddleSound.play();
        }

        // Brick collisions (main ball)
        for (let row = 0; row < bricks.length; row++) {
            for (let col = 0; col < bricks[row]?.length; col++) {
                const brick = bricks[row]?.[col];
                if (!brick || !brick.alive) continue;

                const collision = detectBrickCollision(ballX, ballY, BALL_RADIUS, brick, prevBallX, prevBallY, ballVelX, ballVelY);
                if (collision.hit) {
                    brick.alive = false;
                    score += 10;
                    bricksRemaining--;
                    bricksDestroyed++;
                    const px = collision.impactX != null ? collision.impactX : brick.x;
                    const py = collision.impactY != null ? collision.impactY : brick.y;
                    createParticles(px, py, brick.color);
                    createPowerUp(brick.x, brick.y);
                    breakSound.currentTime = 0;
                    breakSound.play();

                    // Apply collision response based on side
                    // Special handling for flipped triangles' flat top
                    if (brick.type === "triangle" && !brick.upright && collision.side === "top" && ballVelY > 0) {
                        // Flipped triangle's flat top hit from above - bounce downward (keep velY positive)
                        ballVelY = Math.abs(ballVelY); // Ensure positive (downward)
                    } else if (collision.side === "top" || collision.side === "bottom") {
                        ballVelY = -ballVelY;
                    } else if (collision.side === "left" || collision.side === "right") {
                        ballVelX = -ballVelX;
                    }
                    break; // Only one brick per frame
                }
            }
        }
    }

    // Check level complete
    if (bricksRemaining === 0) {
        gameEndWon = true;
        gameState = "gameEnd";
        // Play level complete sound
        levelCompleteSound.currentTime = 0;
        levelCompleteSound.play();
    }
}

// ====== DRAW ======
function drawDividers() {
    if (dividers.length === 0) return;
    ctx.fillStyle = "#64748b";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    for (const div of dividers) {
        ctx.fillRect(div.x, div.y, div.w, div.h);
        ctx.strokeRect(div.x, div.y, div.w, div.h);
    }
}

function drawBricks() {
    for (let row = 0; row < bricks.length; row++) {
        for (let col = 0; col < bricks[row]?.length; col++) {
            const brick = bricks[row]?.[col];
            if (!brick || !brick.alive) continue;

            ctx.fillStyle = brick.color;
            
            if (brick.type === "rect") {
                ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
            } else if (brick.type === "triangle") {
                const height = brick.size * Math.sqrt(3) / 2;
                ctx.beginPath();
                if (brick.upright) {
                    // Upright triangle
                    ctx.moveTo(brick.x + brick.size / 2, brick.y);
                    ctx.lineTo(brick.x, brick.y + height);
                    ctx.lineTo(brick.x + brick.size, brick.y + height);
                } else {
                    // Upside down triangle
                    ctx.moveTo(brick.x, brick.y);
                    ctx.lineTo(brick.x + brick.size / 2, brick.y + height);
                    ctx.lineTo(brick.x + brick.size, brick.y);
                }
                ctx.closePath();
                ctx.fill();
            } else if (brick.type === "circle") {
                ctx.beginPath();
                ctx.arc(brick.x, brick.y, brick.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function updateUI() {
    const hud = document.getElementById('breakoutHud');
    const levelSelect = document.getElementById('levelSelectOverlay');
    const menuOverlay = document.getElementById('breakoutMenuOverlay');
    const pausedOverlay = document.getElementById('breakoutPausedOverlay');
    const gameEndOverlay = document.getElementById('breakoutGameEndOverlay');
    if (!levelSelect) return;
    
    document.getElementById('breakoutScore').textContent = score;
    document.getElementById('breakoutLevel').textContent = selectedLevel;
    document.getElementById('breakoutLives').textContent = lives;
    document.getElementById('breakoutHighScore').textContent = highScore;
    
    levelSelect.style.display = gameState === "levelSelect" ? "block" : "none";
    menuOverlay.style.display = gameState === "menu" ? "block" : "none";
    pausedOverlay.style.display = gameState === "paused" ? "block" : "none";
    gameEndOverlay.style.display = gameState === "gameEnd" ? "block" : "none";
    if (hud) hud.style.visibility = (gameState === "playing" || gameState === "paused") ? "visible" : "hidden";
    const levelSelectBtnWrap = document.getElementById('breakoutLevelSelectBtnWrap');
    if (levelSelectBtnWrap) levelSelectBtnWrap.style.visibility = (gameState === "playing" || gameState === "paused") ? "visible" : "hidden";

    if (gameState === "gameEnd") {
        const titleEl = document.getElementById('breakoutGameEndTitle');
        const scoreEl = document.getElementById('breakoutGameEndScore');
        const newHighEl = document.getElementById('breakoutNewHighScore');
        if (titleEl) titleEl.textContent = gameEndWon ? `Level ${selectedLevel} Complete!` : "Game Over";
        if (titleEl) titleEl.style.color = gameEndWon ? "#22c55e" : "#ef4444";
        if (scoreEl) scoreEl.textContent = `Score: ${score}`;
        if (newHighEl) newHighEl.style.display = (score === highScore && score > 0) ? "block" : "none";
    }
}

function draw() {
    applyDPRScaling();
    
    // Background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    if (gameState === "levelSelect") {
        updateUI();
        return;
    }

    // Bricks
    drawBricks();

    // Dividers (level 3 hard borders)
    drawDividers();

    // Particles
    drawParticles();

    // Power-ups
    drawPowerUps();

    // Paddle
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(paddleX, paddleY, currentPaddleWidth, PADDLE_HEIGHT);

    // Multi-balls
    drawMultiBalls();

    // Main ball
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();

    updateUI();
}

// ====== HELPER FUNCTIONS ======
function adjustBrightness(color, amount) {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Adjust brightness
    const newR = Math.max(0, Math.min(255, r + amount));
    const newG = Math.max(0, Math.min(255, g + amount));
    const newB = Math.max(0, Math.min(255, b + amount));
    
    // Convert back to hex
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

function drawAnimatedButton(ctx, x, y, width, height, text, color, isSelected, isHovered, animationTime) {
    const glowIntensity = isSelected ? 0.8 : (isHovered ? 0.5 : 0.2);
    const scale = isSelected ? 1.05 : (isHovered ? 1.02 : 1.0);
    const offsetY = isSelected ? -2 : (isHovered ? -1 : 0);
    const pulse = Math.sin(animationTime * 3) * 0.02 + 1;
    
    // Draw glow shadow
    ctx.shadowBlur = 20 + glowIntensity * 15;
    ctx.shadowColor = color;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw button with gradient
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    if (isSelected || isHovered) {
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, adjustBrightness(color, -20));
    } else {
        gradient.addColorStop(0, adjustBrightness(color, -40));
        gradient.addColorStop(1, adjustBrightness(color, -60));
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y + offsetY, width * scale * pulse, height);
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Draw border
    ctx.strokeStyle = isSelected || isHovered ? color : "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x, y + offsetY, width * scale * pulse, height);
    
    // Draw text
    ctx.fillStyle = "#fff";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, x + width / 2, y + offsetY + 28);
}

// ====== LOOP (Throttled to 60 FPS) ======
let lastUpdateTime = 0;
let lastDeltaTime = 1/60;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS; // ~16.67ms per frame at 60 FPS

function gameLoop(timestamp) {
    // Always render for smooth visuals
    draw();
    
    // Only update game logic at 60 FPS
    const elapsed = timestamp - lastUpdateTime;
    if (elapsed >= frameInterval) {
        lastDeltaTime = elapsed / 1000;
        animationTime += lastDeltaTime;
        update();
        lastUpdateTime = timestamp - (elapsed % frameInterval); // Account for frame time drift
    }
    
    requestAnimationFrame(gameLoop);
}

// Initialize
requestAnimationFrame(gameLoop);
