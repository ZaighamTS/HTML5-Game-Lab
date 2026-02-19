/**
 * Memory Match Game - Phaser.js Implementation
 * Week 5 Training: Phaser Scenes, Sprites, Input Handling
 * 
 * Features:
 * - Card flipping with animations
 * - Matching logic (two cards → check match or reset)
 * - Score and turn counter
 * - Win condition (all pairs matched)
 * - Mobile and desktop support
 */

// Game Configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'phaser-game',
    backgroundColor: '#0f172a',
    scene: GameScene,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

// Main Game Scene Class
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }
    
    preload() {
        // Card symbols (emojis for easy display) - defined early for texture creation
        this.cardSymbols = ['🍎', '🍌', '🍇', '🍊', '🍓', '🥝', '🍑', '🍒'];
        
        // Create card textures programmatically
        this.createCardTextures();
    }
    
    create() {
        // Initialize game state
        this.cards = [];
        this.selectedCards = [];
        this.matchedPairs = 0;
        this.totalPairs = 8; // 4x4 grid = 16 cards = 8 pairs
        this.canFlip = true;
        this.score = 0;
        this.turns = 0;
        
        // Create card grid
        this.createCardGrid();
        
        // Update UI
        this.updateUI();
    }
    
    update() {
        // Update logic can go here if needed
    }
    
    /**
     * Create card textures programmatically
     * This avoids needing external image files
     */
    createCardTextures() {
        // Card back texture (blue with border)
        this.add.graphics()
            .fillStyle(0x38bdf8)
            .fillRoundedRect(0, 0, 100, 130, 10)
            .lineStyle(3, 0x0ea5e9)
            .strokeRoundedRect(0, 0, 100, 130, 10)
            .generateTexture('cardBack', 100, 130);
        
        // Card front textures for each symbol
        this.cardSymbols.forEach((symbol, index) => {
            const graphics = this.add.graphics();
            graphics.fillStyle(0x1e293b);
            graphics.fillRoundedRect(0, 0, 100, 130, 10);
            graphics.lineStyle(2, 0x475569);
            graphics.strokeRoundedRect(0, 0, 100, 130, 10);
            
            // Add symbol text
            const text = this.add.text(50, 65, symbol, {
                fontSize: '48px',
                fontFamily: 'Arial'
            });
            text.setOrigin(0.5);
            
            // Render to texture
            graphics.generateTexture(`cardFront${index}`, 100, 130);
            
            // Cleanup
            text.destroy();
            graphics.destroy();
        });
    }
    
    /**
     * Create the card grid (4x4 = 16 cards)
     */
    createCardGrid() {
        const cols = 4;
        const rows = 4;
        const cardWidth = 100;
        const cardHeight = 130;
        const spacing = 20;
        const startX = (config.width - (cols * (cardWidth + spacing) - spacing)) / 2;
        const startY = 80;
        
        // Create pairs array (each symbol appears twice)
        const pairs = [];
        for (let i = 0; i < this.totalPairs; i++) {
            pairs.push(i, i); // Each symbol twice
        }
        
        // Shuffle pairs for random placement
        this.shuffleArray(pairs);
        
        // Create cards
        let pairIndex = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = startX + col * (cardWidth + spacing);
                const y = startY + row * (cardHeight + spacing);
                const symbolIndex = pairs[pairIndex];
                
                // Create individual card
                const card = this.createCard(x, y, symbolIndex);
                this.cards.push(card);
                pairIndex++;
            }
        }
    }
    
    /**
     * Create an individual card with back and front sprites
     */
    createCard(x, y, symbolIndex) {
        // Card back (visible initially)
        const cardBack = this.add.image(x, y, 'cardBack')
            .setInteractive({ useHandCursor: true })
            .setData('symbolIndex', symbolIndex)
            .setData('flipped', false)
            .setData('matched', false);
        
        // Card front (hidden initially)
        const cardFront = this.add.image(x, y, `cardFront${symbolIndex}`)
            .setVisible(false)
            .setAlpha(0);
        
        // Hover effect (only if card can be flipped)
        cardBack.on('pointerover', () => {
            if (!cardBack.getData('flipped') && 
                !cardBack.getData('matched') && 
                this.canFlip && 
                this.selectedCards.length < 2) {
                cardBack.setTint(0xffffff);
                cardBack.setScale(1.05);
            }
        });
        
        cardBack.on('pointerout', () => {
            cardBack.clearTint();
            cardBack.setScale(1);
        });
        
        // Click/tap handler - flip the card
        cardBack.on('pointerdown', () => {
            const cardIndex = this.cards.length - 1;
            this.flipCard(cardIndex);
        });
        
        return {
            back: cardBack,
            front: cardFront,
            symbolIndex: symbolIndex,
            flipped: false,
            matched: false
        };
    }
    
    /**
     * Flip a card to show its front
     */
    flipCard(cardIndex) {
        const card = this.cards[cardIndex];
        
        // Prevent flipping if:
        // - Card already flipped
        // - Card already matched
        // - Two cards already selected
        // - Can't flip (waiting for reset)
        if (card.flipped || card.matched || this.selectedCards.length >= 2 || !this.canFlip) {
            return;
        }
        
        // Mark as flipped
        card.flipped = true;
        card.back.setVisible(false);
        card.front.setVisible(true);
        
        // Flip animation with scale effect
        this.tweens.add({
            targets: card.front,
            alpha: 1,
            scaleX: { from: 0, to: 1 },
            duration: 300,
            ease: 'Back.easeOut'
        });
        
        // Add to selected cards
        this.selectedCards.push(cardIndex);
        
        // Check for match when two cards are selected
        if (this.selectedCards.length === 2) {
            this.canFlip = false;
            this.turns++;
            this.updateUI();
            
            // Wait 1 second before checking match (gives player time to see both cards)
            this.time.delayedCall(1000, () => {
                this.checkMatch();
            });
        }
    }
    
    /**
     * Check if the two selected cards match
     */
    checkMatch() {
        const card1 = this.cards[this.selectedCards[0]];
        const card2 = this.cards[this.selectedCards[1]];
        
        if (card1.symbolIndex === card2.symbolIndex) {
            // Match found!
            this.handleMatch(card1, card2);
        } else {
            // No match - flip back
            this.handleNoMatch(card1, card2);
        }
        
        // Reset selection
        this.selectedCards = [];
        this.canFlip = true;
    }
    
    /**
     * Handle when cards match
     */
    handleMatch(card1, card2) {
        card1.matched = true;
        card2.matched = true;
        this.matchedPairs++;
        this.score += 10;
        
        // Success animation - cards pulse
        this.tweens.add({
            targets: [card1.front, card2.front],
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 200,
            yoyo: true,
            ease: 'Power2'
        });
        
        // Check win condition
        if (this.matchedPairs === this.totalPairs) {
            this.time.delayedCall(500, () => {
                this.showWinScreen();
            });
        }
        
        this.updateUI();
    }
    
    /**
     * Handle when cards don't match - flip them back
     */
    handleNoMatch(card1, card2) {
        // Flip back animation
        this.tweens.add({
            targets: [card1.front, card2.front],
            alpha: 0,
            scaleX: 0,
            duration: 300,
            ease: 'Back.easeIn',
            onComplete: () => {
                // Reset card state
                card1.flipped = false;
                card2.flipped = false;
                card1.back.setVisible(true);
                card2.back.setVisible(true);
                card1.front.setVisible(false);
                card2.front.setVisible(false);
                card1.front.setScale(1);
                card2.front.setScale(1);
            }
        });
    }
    
    /**
     * Show win screen when all pairs are matched
     */
    showWinScreen() {
        // Create overlay
        const overlay = this.add.rectangle(
            config.width / 2,
            config.height / 2,
            config.width,
            config.height,
            0x000000,
            0.9
        );
        
        // Win text
        const winText = this.add.text(
            config.width / 2,
            config.height / 2 - 80,
            '🎉 You Win! 🎉',
            {
                fontSize: '72px',
                fontFamily: 'Arial',
                color: '#22c55e',
                fontWeight: 'bold',
                stroke: '#16a34a',
                strokeThickness: 4
            }
        ).setOrigin(0.5);
        
        // Stats text
        const statsText = this.add.text(
            config.width / 2,
            config.height / 2 + 20,
            `Final Score: ${this.score}\nTurns: ${this.turns}`,
            {
                fontSize: '36px',
                fontFamily: 'Arial',
                color: '#e5e7eb',
                align: 'center'
            }
        ).setOrigin(0.5);
        
        // Animate win text entrance
        this.tweens.add({
            targets: winText,
            scaleX: { from: 0, to: 1 },
            scaleY: { from: 0, to: 1 },
            duration: 500,
            ease: 'Back.easeOut'
        });
        
        // Show restart button
        document.getElementById('restart-btn').style.display = 'block';
    }
    
    /**
     * Update UI elements (score and turns)
     */
    updateUI() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('turns').textContent = this.turns;
    }
    
    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    
    /**
     * Restart the game
     */
    restart() {
        // Reset game state
        this.cards = [];
        this.selectedCards = [];
        this.matchedPairs = 0;
        this.canFlip = true;
        this.score = 0;
        this.turns = 0;
        
        // Hide restart button
        document.getElementById('restart-btn').style.display = 'none';
        
        // Restart the scene
        this.scene.restart();
    }
}

// Initialize Phaser game
const game = new Phaser.Game(config);

// Restart button handler
document.getElementById('restart-btn').addEventListener('click', () => {
    const scene = game.scene.getScene('GameScene');
    if (scene) {
        scene.restart();
    }
});
