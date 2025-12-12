const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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
let paddleX = canvas.width / 2 - PADDLE_WIDTH / 2;
let paddleY = canvas.height - 50;
let currentPaddleWidth = PADDLE_WIDTH;

let ballX = canvas.width / 2;
let ballY = canvas.height / 2;
let prevBallX = ballX;
let prevBallY = ballY;
let ballVelX = BALL_BASE_SPEED;
let ballVelY = -BALL_BASE_SPEED;
let currentBallSpeed = BALL_BASE_SPEED;

let rightPressed = false;
let leftPressed = false;

let score = 0;
let highScore = parseInt(localStorage.getItem("breakoutHighScore") || "0");
let lives = START_LIVES;
let selectedLevel = 1; // 1, 2, or 3
let bricksDestroyed = 0;

let bricks = [];
let particles = [];
let powerUps = [];
let balls = []; // For multi-ball power-up

let gameState = "levelSelect"; // "levelSelect" | "menu" | "playing" | "paused" | "gameOver" | "win"
let paused = false;
let selectedLevelIndex = 0; // For level selection menu
let mouseX = 0;
let mouseY = 0;
let animationTime = 0;

// ====== POWER-UP TYPES ======
const POWERUP_TYPES = {
    MULTI_BALL: "multiBall",
    WIDE_PADDLE: "widePaddle",
    SLOW_BALL: "slowBall"
};

// ====== SOUNDS ======
const breakSound = new Audio("Sounds/break.wav");
const loseSound = new Audio("Sounds/lose.wav");
const paddleSound = new Audio("Sounds/paddle.wav");

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
        if (gameState === "menu" || gameState === "gameOver" || gameState === "win") {
            gameState = "levelSelect";
        } else if (gameState === "playing" || gameState === "paused") {
            togglePause();
        }
    }

    // Level selection shortcuts
    if (e.key === "1" || e.key === "2" || e.key === "3") {
        if (gameState === "gameOver" || gameState === "win" || gameState === "menu") {
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
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    
    if (gameState === "playing" && !paused) {
        paddleX = mouseX - currentPaddleWidth / 2;
        clampPaddle();
    }
});

canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (gameState === "levelSelect") {
        const centerY = canvas.height / 2;
        const buttonWidth = 300;
        const buttonHeight = 50;
        const buttonSpacing = 20;
        const startX = canvas.width / 2 - buttonWidth / 2;
        
        // Level 1 button
        if (mouseX >= startX && mouseX < startX + buttonWidth &&
            mouseY >= centerY - 60 && mouseY < centerY - 60 + buttonHeight) {
            selectedLevel = 1;
            startNewGame();
        }
        // Level 2 button
        else if (mouseX >= startX && mouseX < startX + buttonWidth &&
                 mouseY >= centerY + buttonSpacing && mouseY < centerY + buttonSpacing + buttonHeight) {
            selectedLevel = 2;
            startNewGame();
        }
        // Level 3 button
        else if (mouseX >= startX && mouseX < startX + buttonWidth &&
                 mouseY >= centerY + (buttonHeight + buttonSpacing) * 2 && mouseY < centerY + (buttonHeight + buttonSpacing) * 2 + buttonHeight) {
            selectedLevel = 3;
            startNewGame();
        }
    } else if (gameState === "gameOver" || gameState === "win") {
        // Button areas for level selection (must match draw function positions)
        const buttonY = canvas.height / 2 + 20;
        const buttonWidth = 200;
        const buttonHeight = 40;
        const buttonSpacing = 50;
        const startX = canvas.width / 2 - (buttonWidth * 1.5 + buttonSpacing);
        
        // Level 1 button
        if (mouseX >= startX && mouseX < startX + buttonWidth &&
            mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 1;
            startNewGame();
        }
        // Level 2 button
        else if (mouseX >= startX + buttonWidth + buttonSpacing && mouseX < startX + buttonWidth * 2 + buttonSpacing &&
                 mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 2;
            startNewGame();
        }
        // Level 3 button
        else if (mouseX >= startX + (buttonWidth + buttonSpacing) * 2 && mouseX < startX + buttonWidth * 3 + buttonSpacing * 2 &&
                 mouseY >= buttonY && mouseY < buttonY + buttonHeight) {
            selectedLevel = 3;
            startNewGame();
        }
        // Return to menu button
        else if (mouseX >= canvas.width / 2 - 100 && mouseX < canvas.width / 2 + 100 &&
                 mouseY >= buttonY + buttonHeight + 20 && mouseY < buttonY + buttonHeight * 2 + 20) {
            gameState = "levelSelect";
        }
    }
});

// ====== BRICK CREATION FUNCTIONS ======
function createBricks() {
    bricks = [];
    
    if (selectedLevel === 1) {
        // Level 1: Rectangular bricks (5 rows x 10 columns)
        const BRICK_ROWS = 5;
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
        // Level 2: Triangular bricks in triangle pattern
        const TRIANGLE_ROWS = 7;
        const centerX = canvas.width / 2;
        const startY = BRICK_OFFSET_TOP;
        
        for (let row = 0; row < TRIANGLE_ROWS; row++) {
            const numTriangles = row + 1;
            const isUpright = row % 2 === 0; // Even rows are upright, odd rows are upside down
            const triangleWidth = TRIANGLE_SIZE;
            const triangleHeight = TRIANGLE_SIZE * Math.sqrt(3) / 2;
            const totalWidth = numTriangles * triangleWidth;
            const startX = centerX - totalWidth / 2;
            
            bricks[row] = [];
            for (let col = 0; col < numTriangles; col++) {
                const x = startX + col * triangleWidth;
                let y = startY + row * triangleHeight;
                // Move upright triangles upward a bit
                if (isUpright) {
                    y -= 15; // Adjust this value to move more/less
                }
                bricks[row][col] = {
                    type: "triangle",
                    x,
                    y,
                    size: TRIANGLE_SIZE,
                    upright: isUpright,
                    alive: true,
                    color: getBrickColor(row)
                };
            }
        }
    } else if (selectedLevel === 3) {
        // Level 3: Circular bricks in circular layers
        const CIRCLE_LAYERS = 5;
        const centerX = canvas.width / 2;
        const centerY = BRICK_OFFSET_TOP + 150;
        const layerSpacing = CIRCLE_RADIUS * 2.5;
        
        for (let layer = 0; layer < CIRCLE_LAYERS; layer++) {
            const radius = layer * layerSpacing;
            const numCircles = layer === 0 ? 1 : Math.max(6, layer * 6);
            const angleStep = (Math.PI * 2) / numCircles;
            
            if (!bricks[layer]) bricks[layer] = [];
            
            for (let i = 0; i < numCircles; i++) {
                const angle = i * angleStep;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                
                bricks[layer][i] = {
                    type: "circle",
                    x,
                    y,
                    radius: CIRCLE_RADIUS,
                    alive: true,
                    color: getBrickColor(layer)
                };
            }
        }
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
    // Random chance to drop power-up (30%)
    if (Math.random() < 0.3) {
        const types = Object.values(POWERUP_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];
        powerUps.push({
            x: x,
            y: y,
            velY: 2,
            type: type,
            width: 30,
            height: 20
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
            powerUps.splice(i, 1);
            continue;
        }

        // Remove if off screen
        if (pu.y > canvas.height) {
            powerUps.splice(i, 1);
        }
    }
}

function activatePowerUp(type) {
    if (type === POWERUP_TYPES.WIDE_PADDLE) {
        currentPaddleWidth = PADDLE_WIDTH_WIDE;
        setTimeout(() => {
            currentPaddleWidth = PADDLE_WIDTH;
        }, 10000); // 10 seconds
    } else if (type === POWERUP_TYPES.MULTI_BALL) {
        // Create 2 additional balls
        for (let i = 0; i < 2; i++) {
            const angle = (Math.random() * 90 - 45) * (Math.PI / 180);
            balls.push({
                x: ballX,
                y: ballY,
                prevX: ballX,
                prevY: ballY,
                velX: currentBallSpeed * Math.sin(angle),
                velY: -currentBallSpeed * Math.cos(angle)
            });
        }
    } else if (type === POWERUP_TYPES.SLOW_BALL) {
        // Slow down all balls temporarily
        const speedMultiplier = 0.6;
        ballVelX *= speedMultiplier;
        ballVelY *= speedMultiplier;
        for (const ball of balls) {
            ball.velX *= speedMultiplier;
            ball.velY *= speedMultiplier;
        }
    }
}

function drawPowerUps() {
    for (const pu of powerUps) {
        ctx.fillStyle = "#8b5cf6"; // Purple
        ctx.fillRect(pu.x - pu.width / 2, pu.y - pu.height / 2, pu.width, pu.height);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        let symbol = "?";
        if (pu.type === POWERUP_TYPES.WIDE_PADDLE) symbol = "W";
        else if (pu.type === POWERUP_TYPES.MULTI_BALL) symbol = "M";
        else if (pu.type === POWERUP_TYPES.SLOW_BALL) symbol = "S";
        ctx.fillText(symbol, pu.x, pu.y + 4);
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
        if (ball.x + BALL_RADIUS > canvas.width && ball.velX > 0) {
            ball.x = canvas.width - BALL_RADIUS;
            ball.velX = -ball.velX;
        }
        if (ball.y - BALL_RADIUS < 0 && ball.velY < 0) {
            ball.y = BALL_RADIUS;
            ball.velY = -ball.velY;
        }

        // Bottom - remove ball
        if (ball.y - BALL_RADIUS > canvas.height) {
            balls.splice(i, 1);
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
                    createParticles(brick.x, brick.y, brick.color);
                    createPowerUp(brick.x, brick.y);
                    breakSound.currentTime = 0;
                    breakSound.play();

                    // Apply collision response
                    if (collision.side === "top" || collision.side === "bottom") {
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

// ====== GAME CONTROL ======
function startNewGame() {
    score = 0;
    lives = START_LIVES;
    bricksDestroyed = 0;
    currentBallSpeed = BALL_BASE_SPEED;
    currentPaddleWidth = PADDLE_WIDTH;
    balls = [];
    powerUps = [];
    particles = [];
    paddleX = canvas.width / 2 - PADDLE_WIDTH / 2;
    paddleY = canvas.height - 50;
    resetBall();
    createBricks();
    gameState = "playing";
    paused = false;
}

function resetBall() {
    ballX = canvas.width / 2;
    ballY = paddleY - BALL_RADIUS - 10; // Position above paddle
    prevBallX = ballX;
    prevBallY = ballY;
    const angle = (Math.random() * 90 - 45) * (Math.PI / 180);
    ballVelX = currentBallSpeed * Math.sin(angle);
    ballVelY = -currentBallSpeed * Math.cos(angle);
}

function clampPaddle() {
    if (paddleX < 0) paddleX = 0;
    if (paddleX + currentPaddleWidth > canvas.width) {
        paddleX = canvas.width - currentPaddleWidth;
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

    return { hit: true, side: side };
}

function detectTriangleCollision(cx, cy, radius, brick, prevX, prevY, velX, velY) {
    if (!circleTriangleCollide(cx, cy, radius, brick.x, brick.y, brick.size, brick.upright)) {
        return { hit: false };
    }
    
    const height = brick.size * Math.sqrt(3) / 2;
    let x1, y1, x2, y2, x3, y3;
    
    if (brick.upright) {
        x1 = brick.x + brick.size / 2;
        y1 = brick.y;
        x2 = brick.x;
        y2 = brick.y + height;
        x3 = brick.x + brick.size;
        y3 = brick.y + height;
    } else {
        x1 = brick.x;
        y1 = brick.y;
        x2 = brick.x + brick.size / 2;
        y2 = brick.y + height;
        x3 = brick.x + brick.size;
        y3 = brick.y;
    }
    
    // Determine which edge was hit based on velocity and position
    const edges = [
        { x1, y1, x2, y2, side: brick.upright ? "top" : "left" },
        { x1: x2, y1: y2, x2: x3, y2: y3, side: brick.upright ? "right" : "bottom" },
        { x1: x3, y1: y3, x2, y2: y1, side: brick.upright ? "left" : "right" }
    ];
    
    let closestEdge = null;
    let minDist = Infinity;
    
    for (const edge of edges) {
        const dist = pointToLineSegmentDistance(cx, cy, edge.x1, edge.y1, edge.x2, edge.y2);
        if (dist < minDist) {
            minDist = dist;
            closestEdge = edge;
        }
    }
    
    // Determine bounce direction
    let side = "top";
    if (closestEdge) {
        const edgeAngle = Math.atan2(closestEdge.y2 - closestEdge.y1, closestEdge.x2 - closestEdge.x1);
        const ballAngle = Math.atan2(velY, velX);
        const diff = Math.abs(edgeAngle - ballAngle);
        
        if (diff < Math.PI / 3 || diff > 2 * Math.PI / 3) {
            // Hit edge perpendicularly
            side = Math.abs(velY) > Math.abs(velX) ? "top" : "left";
        } else {
            side = closestEdge.side;
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
function update() {
    if (gameState !== "playing" || paused) return;

    // Paddle movement (keyboard)
    if (rightPressed) paddleX += PADDLE_SPEED;
    if (leftPressed) paddleX -= PADDLE_SPEED;
    clampPaddle();

    // Update particles
    updateParticles();

    // Update power-ups
    updatePowerUps();

    // Update multi-balls
    updateMultiBalls();

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
    if (ballX + BALL_RADIUS > canvas.width && ballVelX > 0) {
        ballX = canvas.width - BALL_RADIUS;
        ballVelX = -ballVelX;
    }

    // Top wall
    if (ballY - BALL_RADIUS < 0 && ballVelY < 0) {
        ballY = BALL_RADIUS;
        ballVelY = -ballVelY;
    }

    // Bottom (lose life)
    if (ballY - BALL_RADIUS > canvas.height) {
        lives--;
        loseSound.currentTime = 0;
        loseSound.play();
        if (lives <= 0) {
            // Update high score
            if (score > highScore) {
                highScore = score;
                localStorage.setItem("breakoutHighScore", highScore.toString());
            }
            gameState = "gameOver";
        } else {
            resetBall();
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
    let bricksRemaining = 0;
    for (let row = 0; row < bricks.length; row++) {
        for (let col = 0; col < bricks[row]?.length; col++) {
            const brick = bricks[row]?.[col];
            if (!brick || !brick.alive) continue;
            bricksRemaining++;

            const collision = detectBrickCollision(ballX, ballY, BALL_RADIUS, brick, prevBallX, prevBallY, ballVelX, ballVelY);
            if (collision.hit) {
                brick.alive = false;
                score += 10;
                bricksRemaining--;
                bricksDestroyed++;
                createParticles(brick.x, brick.y, brick.color);
                createPowerUp(brick.x, brick.y);
                breakSound.currentTime = 0;
                breakSound.play();

                // Apply collision response based on side
                if (collision.side === "top" || collision.side === "bottom") {
                    ballVelY = -ballVelY;
                } else if (collision.side === "left" || collision.side === "right") {
                    ballVelX = -ballVelX;
                }
                break; // Only one brick per frame
            }
        }
    }

    // Check level complete
    if (bricksRemaining === 0) {
        gameState = "win";
    }
}

// ====== DRAW ======
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

function draw() {
    // Background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Level selection menu
    if (gameState === "levelSelect") {
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.fillText("SELECT LEVEL", canvas.width / 2, 100);
        
        const centerY = canvas.height / 2;
        const buttonWidth = 300;
        const buttonHeight = 50;
        const buttonSpacing = 20;
        const startX = canvas.width / 2 - buttonWidth / 2;
        
        // Pulse animation
        const pulse = Math.sin(animationTime * 3) * 0.05 + 1;
        
        // Draw buttons with hover effects
        const buttons = [
            { y: centerY - 60, text: "1. Rectangular Bricks (5x10)", color: "#38bdf8", index: 0 },
            { y: centerY + buttonSpacing, text: "2. Triangular Bricks", color: "#22c55e", index: 1 },
            { y: centerY + (buttonHeight + buttonSpacing) * 2, text: "3. Circular Bricks", color: "#eab308", index: 2 }
        ];
        
        buttons.forEach((btn, idx) => {
            const isSelected = selectedLevelIndex === idx;
            const isHovered = mouseX >= startX && mouseX < startX + buttonWidth &&
                             mouseY >= btn.y && mouseY < btn.y + buttonHeight;
            
            // Calculate glow intensity
            const glowIntensity = isSelected ? 0.8 : (isHovered ? 0.5 : 0.2);
            const scale = isSelected ? 1.05 : (isHovered ? 1.02 : 1.0);
            const offsetY = isSelected ? -2 : (isHovered ? -1 : 0);
            
            // Draw glow shadow
            const shadowBlur = 20 + glowIntensity * 15;
            ctx.shadowBlur = shadowBlur;
            ctx.shadowColor = btn.color;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Draw button with gradient
            const gradient = ctx.createLinearGradient(startX, btn.y, startX + buttonWidth, btn.y + buttonHeight);
            if (isSelected || isHovered) {
                gradient.addColorStop(0, btn.color);
                gradient.addColorStop(1, adjustBrightness(btn.color, -20));
            } else {
                gradient.addColorStop(0, adjustBrightness(btn.color, -40));
                gradient.addColorStop(1, adjustBrightness(btn.color, -60));
            }
            
            ctx.fillStyle = gradient;
            ctx.fillRect(startX, btn.y + offsetY, buttonWidth * scale, buttonHeight);
            
            // Reset shadow
            ctx.shadowBlur = 0;
            
            // Draw border
            ctx.strokeStyle = isSelected || isHovered ? btn.color : "rgba(148, 163, 184, 0.3)";
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(startX, btn.y + offsetY, buttonWidth * scale, buttonHeight);
            
            // Draw text
            ctx.fillStyle = "#fff";
            ctx.font = "24px Arial";
            ctx.fillText(btn.text, canvas.width / 2, btn.y + offsetY + 35);
        });
        
        ctx.fillStyle = "#888";
        ctx.font = "18px Arial";
        ctx.fillText("Use Arrow Keys to select, SPACE/ENTER to start", canvas.width / 2, canvas.height - 50);
        ctx.fillText("Or click on a level", canvas.width / 2, canvas.height - 25);
        return;
    }

    // Bricks
    drawBricks();

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

    // HUD: score, lives, level, high score
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "18px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 20, 24);
    ctx.fillText(`Level: ${selectedLevel}`, 20, 48);
    ctx.textAlign = "right";
    ctx.fillText(`Lives: ${lives}`, canvas.width - 20, 24);
    ctx.fillText(`High Score: ${highScore}`, canvas.width - 20, 48);

    // State overlays
    ctx.textAlign = "center";
    if (gameState === "menu") {
        ctx.font = "40px Arial";
        ctx.fillText("BREAKOUT", canvas.width / 2, canvas.height / 2 - 40);
        ctx.font = "22px Arial";
        ctx.fillText("Arrow keys or mouse to move", canvas.width / 2, canvas.height / 2 + 5);
        ctx.fillText("Press SPACE to Start", canvas.width / 2, canvas.height / 2 + 35);
        ctx.fillText("Press P to Pause", canvas.width / 2, canvas.height / 2 + 65);
    } else if (gameState === "paused") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "36px Arial";
        ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = "22px Arial";
        ctx.fillText("Press SPACE or P to Resume", canvas.width / 2, canvas.height / 2 + 25);
    } else if (gameState === "gameOver") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "36px Arial";
        ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 80);
        ctx.font = "22px Arial";
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 - 40);
        
        // Level selection buttons
        const buttonY = canvas.height / 2 + 20;
        const buttonWidth = 200;
        const buttonHeight = 40;
        const buttonSpacing = 50;
        const startX = canvas.width / 2 - (buttonWidth * 1.5 + buttonSpacing);
        
        // Check hover states
        const level1Hovered = mouseX >= startX && mouseX < startX + buttonWidth &&
                              mouseY >= buttonY && mouseY < buttonY + buttonHeight;
        const level2Hovered = mouseX >= startX + buttonWidth + buttonSpacing && mouseX < startX + buttonWidth * 2 + buttonSpacing &&
                              mouseY >= buttonY && mouseY < buttonY + buttonHeight;
        const level3Hovered = mouseX >= startX + (buttonWidth + buttonSpacing) * 2 && mouseX < startX + buttonWidth * 3 + buttonSpacing * 2 &&
                              mouseY >= buttonY && mouseY < buttonY + buttonHeight;
        const menuHovered = mouseX >= canvas.width / 2 - 100 && mouseX < canvas.width / 2 + 100 &&
                            mouseY >= buttonY + buttonHeight + 20 && mouseY < buttonY + buttonHeight * 2 + 20;
        
        // Level 1 button
        drawAnimatedButton(ctx, startX, buttonY, buttonWidth, buttonHeight, "Level 1", "#38bdf8", false, level1Hovered, animationTime);
        
        // Level 2 button
        drawAnimatedButton(ctx, startX + buttonWidth + buttonSpacing, buttonY, buttonWidth, buttonHeight, "Level 2", "#22c55e", false, level2Hovered, animationTime);
        
        // Level 3 button
        drawAnimatedButton(ctx, startX + (buttonWidth + buttonSpacing) * 2, buttonY, buttonWidth, buttonHeight, "Level 3", "#eab308", false, level3Hovered, animationTime);
        
        // Return to menu button
        drawAnimatedButton(ctx, canvas.width / 2 - 100, buttonY + buttonHeight + 20, 200, buttonHeight, "Menu", "#666", false, menuHovered, animationTime);
        
        ctx.fillStyle = "#888";
        ctx.font = "16px Arial";
        ctx.fillText("Press 1, 2, or 3 to select level", canvas.width / 2, canvas.height - 30);
    } else if (gameState === "win") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "36px Arial";
        ctx.fillText(`Level ${selectedLevel} Complete!`, canvas.width / 2, canvas.height / 2 - 80);
        ctx.font = "22px Arial";
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 - 40);
        
        // Level selection buttons
        const buttonY = canvas.height / 2 + 20;
        const buttonWidth = 200;
        const buttonHeight = 40;
        const buttonSpacing = 50;
        const startX = canvas.width / 2 - (buttonWidth * 1.5 + buttonSpacing);
        
        // Check hover states
        const level1Hovered = mouseX >= startX && mouseX < startX + buttonWidth &&
                              mouseY >= buttonY && mouseY < buttonY + buttonHeight;
        const level2Hovered = mouseX >= startX + buttonWidth + buttonSpacing && mouseX < startX + buttonWidth * 2 + buttonSpacing &&
                              mouseY >= buttonY && mouseY < buttonY + buttonHeight;
        const level3Hovered = mouseX >= startX + (buttonWidth + buttonSpacing) * 2 && mouseX < startX + buttonWidth * 3 + buttonSpacing * 2 &&
                              mouseY >= buttonY && mouseY < buttonY + buttonHeight;
        const menuHovered = mouseX >= canvas.width / 2 - 100 && mouseX < canvas.width / 2 + 100 &&
                            mouseY >= buttonY + buttonHeight + 20 && mouseY < buttonY + buttonHeight * 2 + 20;
        
        // Level 1 button
        drawAnimatedButton(ctx, startX, buttonY, buttonWidth, buttonHeight, "Level 1", "#38bdf8", false, level1Hovered, animationTime);
        
        // Level 2 button
        drawAnimatedButton(ctx, startX + buttonWidth + buttonSpacing, buttonY, buttonWidth, buttonHeight, "Level 2", "#22c55e", false, level2Hovered, animationTime);
        
        // Level 3 button
        drawAnimatedButton(ctx, startX + (buttonWidth + buttonSpacing) * 2, buttonY, buttonWidth, buttonHeight, "Level 3", "#eab308", false, level3Hovered, animationTime);
        
        // Return to menu button
        drawAnimatedButton(ctx, canvas.width / 2 - 100, buttonY + buttonHeight + 20, 200, buttonHeight, "Menu", "#666", false, menuHovered, animationTime);
        
        ctx.fillStyle = "#888";
        ctx.font = "16px Arial";
        ctx.fillText("Press 1, 2, or 3 to select level", canvas.width / 2, canvas.height - 30);
    }
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
const targetFPS = 60;
const frameInterval = 1000 / targetFPS; // ~16.67ms per frame at 60 FPS

function gameLoop(timestamp) {
    // Always render for smooth visuals
    draw();
    
    // Only update game logic at 60 FPS
    const elapsed = timestamp - lastUpdateTime;
    if (elapsed >= frameInterval) {
        const deltaTime = elapsed / 1000; // Convert to seconds for animationTime
        animationTime += deltaTime;
        update();
        lastUpdateTime = timestamp - (elapsed % frameInterval); // Account for frame time drift
    }
    
    requestAnimationFrame(gameLoop);
}

// Initialize
requestAnimationFrame(gameLoop);
