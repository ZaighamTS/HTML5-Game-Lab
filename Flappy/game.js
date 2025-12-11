const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ====== SETTINGS ======
const GRAVITY = 1300;          // pixels per second^2
const FLAP_STRENGTH = -380;    // initial upward velocity on flap
const BIRD_SIZE = 26;

const PIPE_SPEED = 180;        // pixels per second
const PIPE_GAP = 180;          // vertical gap between top & bottom pipe
const PIPE_WIDTH = 70;
const PIPE_SPAWN_INTERVAL = 1.3; // seconds between pipes

const FLOOR_HEIGHT = 90;

// ====== GAME STATE ======
let birdX = canvas.width * 0.25;
let birdY = canvas.height / 2;
let birdVelY = 0;

let pipes = []; // { x, gapY, passed }
let score = 0;
let bestScore = parseInt(localStorage.getItem("flappyBestScore") || "0", 10);

let gameState = "menu"; // "menu" | "playing" | "gameOver"

let wingTime = 0;   // used for wing flapping animation

// timing
let lastTime = 0;
let spawnTimer = 0;

// input flags
let flapQueued = false;

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
}

function resetGame() {
    birdX = canvas.width * 0.25;
    birdY = canvas.height / 2;
    birdVelY = 0;
    pipes = [];
    score = 0;
    spawnTimer = 0;
}

function gameOver() {
    gameState = "gameOver";
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("flappyBestScore", bestScore.toString());
    }
}

// ====== PIPE SPAWNING ======
function spawnPipe() {
    const margin = 80;
    const availableHeight = canvas.height - FLOOR_HEIGHT - PIPE_GAP - margin * 2;
    const gapTop = margin + Math.random() * availableHeight;
    const gapY = gapTop + PIPE_GAP / 2;

    pipes.push({
        x: canvas.width + PIPE_WIDTH,
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
    } else {
        birdVelY += GRAVITY * deltaTime;
    }

    birdY += birdVelY * deltaTime;
    wingTime += deltaTime * 12;  // speed of wing flapping

    // Floor & ceiling
    const ceiling = 0;
    const floorY = canvas.height - FLOOR_HEIGHT;
    if (birdY - BIRD_SIZE / 2 < ceiling) {
        birdY = ceiling + BIRD_SIZE / 2;
        birdVelY = 0;
    }
    if (birdY + BIRD_SIZE / 2 > floorY) {
        birdY = floorY - BIRD_SIZE / 2;
        gameOver();
    }

    // Pipes movement
    const moveAmount = PIPE_SPEED * deltaTime;
    pipes.forEach(pipe => {
        pipe.x -= moveAmount;
    });

    // Remove off-screen pipes
    pipes = pipes.filter(pipe => pipe.x + PIPE_WIDTH > -100);

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
                gameOver();
            }
        }

        // Scoring: when bird passes pipe center
        if (!pipe.passed && pipe.x + PIPE_WIDTH < birdX) {
            pipe.passed = true;
            score++;
        }
    });
}

// ====== DRAW ======
function drawBackground() {
    // simple sky gradient already via CSS; add ground
    const floorY = canvas.height - FLOOR_HEIGHT;

    // ground
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, floorY, canvas.width, FLOOR_HEIGHT);

    // scrolling stripes
    ctx.fillStyle = "#1e293b";
    const stripeWidth = 40;
    for (let x = 0; x < canvas.width + stripeWidth; x += stripeWidth * 2) {
        ctx.fillRect(x - (Date.now() / 20 % (stripeWidth * 2)), floorY + 10, stripeWidth, 10);
    }
}

function drawPipes() {
    pipes.forEach(pipe => {
        const topPipeBottom = pipe.gapY - PIPE_GAP / 2;
        const bottomPipeTop = pipe.gapY + PIPE_GAP / 2;
        const playHeight = canvas.height - FLOOR_HEIGHT;

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
    ctx.fillText(`Best: ${bestScore}`, canvas.width - 20, 34);
}

function drawOverlay() {
    ctx.textAlign = "center";

    if (gameState === "menu") {
        ctx.fillStyle = "#0f172a88";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#e5e7eb";
        ctx.font = "40px Arial";
        ctx.fillText("FLAPPY CLONE", canvas.width / 2, canvas.height / 2 - 40);

        ctx.font = "22px Arial";
        ctx.fillText("Tap / Click / Space / ↑ to flap", canvas.width / 2, canvas.height / 2);
        ctx.fillText("Press to start", canvas.width / 2, canvas.height / 2 + 40);
    }

    if (gameState === "gameOver") {
        ctx.fillStyle = "#0f172acc";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#e5e7eb";
        ctx.font = "40px Arial";
        ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 40);

        ctx.font = "24px Arial";
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2);
        ctx.fillText(`Best: ${bestScore}`, canvas.width / 2, canvas.height / 2 + 34);
        ctx.fillText("Press or tap to play again", canvas.width / 2, canvas.height / 2 + 70);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
