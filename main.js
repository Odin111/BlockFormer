const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1000,
    height: 600,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    // backgroundColor is handled dynamically in updateBackground
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1200 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    input: {
        activePointers: 3, // Allow for multiple touch inputs
    }
};

const game = new Phaser.Game(config);

let player;
let platforms;
let traps;
let enemies;
let powerups;
let door;
let keys;
let currentLevel = -1; // -1 for Main Menu, 0 for Tutorial, 1-20 for Game
const maxLevels = 20;
let levelText;
let pauseText;
let timerText;
let dashIcon;
let wingIcon;
let tutorialTexts = [];
let skipText;
let restartBtnHUD;
let menuUI = [];
let pauseUI = [];
let mobileControlsUI = [];
let touchState = { left: false, right: false, up: false, jump: false, dash: false };
let bgGraphics; // For background gradient
let starfield; // For space levels
let timeLeft = 600; // 10 minutes in seconds
let timerEvent; // Added back timerEvent
let isGameOver = false;
let isPaused = false;
let canDash = true;
let hasUpwardPowerup = false;
let isDashing = false;
let dashTime = 0;
let wingUsedOnTouch = false;
const dashDuration = 150;
const dashSpeed = 600;

function preload() {
    // Assets are generated dynamically in refreshTextures to support dynamic outlines
}

function create() {
    bgGraphics = this.add.graphics().setScrollFactor(0);
    
    isGameOver = false;
    isPaused = false;
    canDash = true;
    hasUpwardPowerup = false;
    isDashing = false;
    timeLeft = 600; // Reset timer on restart

    platforms = this.physics.add.staticGroup();
    traps = this.physics.add.staticGroup();
    enemies = this.physics.add.group();
    powerups = this.physics.add.group();

    // Timer setup
    if (timerEvent) timerEvent.destroy();
    timerEvent = this.time.addEvent({
        delay: 1000,
        callback: () => {
            if (!isPaused && !isGameOver && currentLevel > 0) { // No timer in tutorial
                timeLeft--;
                updateTimerDisplay();
                if (timeLeft <= 0) die(this, "TIME'S UP!");
            }
        },
        loop: true
    });

    // Input setup
    keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
        dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        pause: Phaser.Input.Keyboard.KeyCodes.P,
        skip: Phaser.Input.Keyboard.KeyCodes.K,
        restart: Phaser.Input.Keyboard.KeyCodes.R
    });

    // Restart functionality
    this.input.keyboard.on('keydown-R', () => {
        if (currentLevel >= 0) {
            isGameOver = false;
            isPaused = false;
            this.scene.restart();
        }
    });

    // Skip Tutorial functionality
    this.input.keyboard.on('keydown-K', () => {
        if (currentLevel === 0) {
            currentLevel = 1;
            generateLevel(this, currentLevel);
        }
    });

    // Pause functionality
    this.input.keyboard.on('keydown-P', () => {
        if (isGameOver || currentLevel === -1) return;
        togglePause(this);
    });

    // UI
    levelText = this.add.text(20, 20, currentLevel === 0 ? 'Tutorial' : `Level: ${currentLevel}/${maxLevels}`, { fontSize: '24px', fill: '#fff' }).setScrollFactor(0);
    timerText = this.add.text(980, 20, '10:00', { fontSize: '24px', fill: '#fff' }).setOrigin(1, 0).setScrollFactor(0);
    if (currentLevel === 0) timerText.setVisible(false);

    // Ability Icons
    this.add.text(20, 550, 'Dash:', { fontSize: '18px', fill: '#fff' }).setScrollFactor(0);
    dashIcon = this.add.image(100, 560, 'dashIcon').setScrollFactor(0);
    
    this.add.text(150, 550, 'Wing:', { fontSize: '18px', fill: '#fff' }).setScrollFactor(0);
    wingIcon = this.add.image(220, 560, 'powerup').setScale(0.8).setScrollFactor(0).setTint(0x00ffff);

    skipText = this.add.text(500, 570, 'Press K to Skip Tutorial', { fontSize: '18px', fill: '#aaa' }).setOrigin(0.5).setScrollFactor(0);
    
    // HUD Restart Button
    restartBtnHUD = this.add.text(980, 50, 'RESTART (R)', { fontSize: '18px', fill: '#aaa' }).setOrigin(1, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    restartBtnHUD.on('pointerdown', () => {
        if (currentLevel >= 0) {
            isGameOver = false;
            isPaused = false;
            this.scene.restart();
        }
    });
    restartBtnHUD.on('pointerover', () => restartBtnHUD.setStyle({ fill: '#fff' }));
    restartBtnHUD.on('pointerout', () => restartBtnHUD.setStyle({ fill: '#aaa' }));

    // Pause UI Setup
    createPauseMenu(this);

    // Mobile Controls Setup
    createMobileControls(this);

    generateLevel(this, currentLevel);
    
    if (player) {
        this.cameras.main.startFollow(player, true, 0.1, 0.1);
    }
}

function update(time, delta) {
    if (currentLevel === -1 || isGameOver || isPaused) return;

    // UI Update for Ability Icons
    if (dashIcon) dashIcon.setAlpha(canDash ? 1 : 0.2);
    if (wingIcon) wingIcon.setAlpha(hasUpwardPowerup ? 1 : 0.2);

    // Enemy AI - Turn around at edges
    enemies.getChildren().forEach(enemy => {
        if (enemy.minX && enemy.maxX) {
            if (enemy.x <= enemy.minX && enemy.body.velocity.x < 0) {
                enemy.setVelocityX(Math.abs(enemy.body.velocity.x));
            } else if (enemy.x >= enemy.maxX && enemy.body.velocity.x > 0) {
                enemy.setVelocityX(-Math.abs(enemy.body.velocity.x));
            }
        }
    });

    // Movement
    const speed = 300;
    const jumpForce = -500;

    if (isDashing) {
        player.setTint(0x00ffff); // Dash color
        if (time > dashTime + dashDuration) {
            isDashing = false;
            player.body.allowGravity = true;
            player.clearTint();
        }
        return; // No other movement during dash
    }

    // Reset dash when touching ground
    if (player.body.touching.down) {
        canDash = true;
        player.clearTint();
        wingUsedOnTouch = false;
    }

    // Left/Right
    if (keys.left.isDown || touchState.left) {
        player.setVelocityX(-speed);
    } else if (keys.right.isDown || touchState.right) {
        player.setVelocityX(speed);
    } else {
        player.setVelocityX(0);
    }

    // Jump
    if ((Phaser.Input.Keyboard.JustDown(keys.jump) || touchState.jump) && player.body.touching.down) {
        player.setVelocityY(jumpForce);
        touchState.jump = false; // Reset touch jump after use
    }

    // Upward Dash (Wing)
    if ((Phaser.Input.Keyboard.JustDown(keys.up) || (touchState.up && !wingUsedOnTouch)) && hasUpwardPowerup) {
        hasUpwardPowerup = false;
        isDashing = true;
        dashTime = time;
        player.body.allowGravity = false;
        player.setVelocity(0, -dashSpeed);
        if (touchState.up) wingUsedOnTouch = true;
    }

    // Dash
    if ((Phaser.Input.Keyboard.JustDown(keys.dash) || touchState.dash) && canDash) {
        isDashing = true;
        canDash = false; // Only one use before hitting ground
        dashTime = time;
        player.body.allowGravity = false;
        
        // Determine dash direction
        if (keys.left.isDown || touchState.left) {
            player.setVelocity(-dashSpeed, 0);
        } else if (keys.right.isDown || touchState.right) {
            player.setVelocity(dashSpeed, 0);
        } else {
            // Default to current horizontal facing or right
            const dirX = player.body.velocity.x >= 0 ? dashSpeed : -dashSpeed;
            player.setVelocity(dirX, 0);
        }
        touchState.dash = false; // Reset touch dash after use
    }

    // Door check
    if (player && door && Phaser.Math.Distance.Between(player.x, player.y, door.x, door.y) < 40) {
        nextLevel(this);
    }

    // Pit check
    if (player && player.y > 650) {
        die(this);
    }
}

function generateLevel(scene, level) {
    // Determine outline color based on background darkness
    const outlineColor = (level > 10 || level === -1) ? 0xffffff : 0x000000;
    refreshTextures(scene, outlineColor);

    updateBackground(scene, level);

    // Clear old objects
    platforms.clear(true, true);
    traps.clear(true, true);
    enemies.clear(true, true);
    powerups.clear(true, true);
    tutorialTexts.forEach(t => t.destroy());
    tutorialTexts = [];
    menuUI.forEach(m => m.destroy());
    menuUI = [];

    // Reset player state
    canDash = true;
    hasUpwardPowerup = false;
    isDashing = false;

    if (door) door.destroy();
    if (player) player.destroy();

    // Reset UI visibility
    if (levelText) {
        levelText.setText(level === 0 ? 'Tutorial' : `Level: ${level}/${maxLevels}`);
        levelText.setVisible(level >= 0);
    }
    if (timerText) timerText.setVisible(level > 0);
    if (skipText) skipText.setVisible(level === 0);
    if (dashIcon) dashIcon.setVisible(level >= 0);
    if (wingIcon) wingIcon.setVisible(level >= 0);
    if (restartBtnHUD) restartBtnHUD.setVisible(level >= 0);
    mobileControlsUI.forEach(btn => btn.setVisible(level >= 0));

    if (level === -1) {
        // --- MAIN MENU ---
        const centerX = 500;
        const centerY = 300;

        menuUI.push(scene.add.text(centerX, centerY - 150, 'BLOCKFORMER', { 
            fontSize: '80px', 
            fill: '#fff', 
            fontStyle: 'bold' 
        }).setOrigin(0.5).setScrollFactor(0));

        const startBtn = scene.add.text(centerX, centerY + 20, 'START GAME', {
            fontSize: '40px',
            fill: '#0f0',
            backgroundColor: '#222',
            padding: { x: 30, y: 15 }
        }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

        const tutorialBtn = scene.add.text(centerX, centerY + 120, 'TUTORIAL', {
            fontSize: '40px',
            fill: '#0ff',
            backgroundColor: '#222',
            padding: { x: 30, y: 15 }
        }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

        startBtn.on('pointerdown', () => {
            currentLevel = 1;
            generateLevel(scene, currentLevel);
        });

        tutorialBtn.on('pointerdown', () => {
            currentLevel = 0;
            generateLevel(scene, currentLevel);
        });

        // Hover effects
        startBtn.on('pointerover', () => startBtn.setStyle({ fill: '#fff', backgroundColor: '#0a0' }));
        startBtn.on('pointerout', () => startBtn.setStyle({ fill: '#0f0', backgroundColor: '#222' }));
        tutorialBtn.on('pointerover', () => tutorialBtn.setStyle({ fill: '#fff', backgroundColor: '#088' }));
        tutorialBtn.on('pointerout', () => tutorialBtn.setStyle({ fill: '#0ff', backgroundColor: '#222' }));

        const madeByText = scene.add.text(980, 580, 'Made By Odin111', {
            fontSize: '16px',
            fill: '#888',
            fontStyle: 'italic'
        }).setOrigin(1, 1).setScrollFactor(0);

        menuUI.push(startBtn, tutorialBtn, madeByText);

        // Minimal setup to prevent errors
        scene.physics.world.setBounds(0, 0, 1000, 600);
        scene.cameras.main.setBounds(0, 0, 1000, 600);
    } else if (level === 0) {
        // --- TUTORIAL LEVEL ---
        const groundY = 500;
        platforms.create(0, groundY, 'platform').setScale(10, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(50, 400, 'A/D to Move\nSPACE to Jump', { fontSize: '18px', fill: '#fff' }).setDepth(10));

        platforms.create(500, groundY, 'platform').setScale(10, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(550, 400, 'SHIFT to Dash\n(One use in air)', { fontSize: '18px', fill: '#fff' }).setDepth(10));

        platforms.create(1000, groundY, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        const p = powerups.create(1150, 450, 'powerup');
        p.body.setAllowGravity(false);
        p.respawnPos = { x: 1150, y: 450 };
        tutorialTexts.push(scene.add.text(1050, 350, 'Pick up Wing\nPress W to fly up\n(Respawns in 1 sec)', { fontSize: '18px', fill: '#0ff' }).setDepth(10));

        platforms.create(1300, 300, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(1350, 200, 'Dashing does NOT make\nyou invincible!', { fontSize: '18px', fill: '#f88' }).setDepth(10));
        traps.create(1400, 276, 'trap').setOrigin(0, 0); // Spikes on platform

        platforms.create(1600, 300, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(1650, 200, 'Avoid Enemies!', { fontSize: '18px', fill: '#ff0' }).setDepth(10));
        const enemy = enemies.create(1750, 260, 'enemy');
        enemy.minX = 1600;
        enemy.maxX = 1600 + (5 * 32);
        enemy.setVelocityX(100);
        enemy.setBounce(1);
        enemy.setCollideWorldBounds(false);

        platforms.create(1900, 300, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(1950, 200, 'Reach the door!', { fontSize: '18px', fill: '#fff' }).setDepth(10));
        door = scene.physics.add.staticSprite(2050, 260, 'door');

        player = scene.physics.add.sprite(50, 450, 'player');
        player.setCollideWorldBounds(true);
        scene.cameras.main.startFollow(player, true, 0.1, 0.1);
        scene.cameras.main.scrollX = 0;
        scene.physics.world.setBounds(0, 0, 2300, 1000, true, true, true, false);
        scene.cameras.main.setBounds(0, 0, 2300, 600);
    } else {
        // --- NORMAL PROCEDURAL LEVELS ---
        // Start platform (safe zone)
        let lastX = 50;
        let lastY = 500;
        let lastPlatWidth = 4;
        platforms.create(lastX, lastY, 'platform').setScale(lastPlatWidth, 1).refreshBody();
        
        // AGGRESSIVE DIFFICULTY SCALING
        const levelWidth = 1500 + (level * 500); // Levels get significantly longer
        const trapChance = 0.35 + (level * 0.04); // More spikes
        const enemyChance = 0.25 + (level * 0.04); // More robots
        
        // Jump limits that scale with level
        const maxJumpUp = Math.min(100, 90 + (level * 0.5)); 
        const powerupJumpUp = 180 + (level * 2); 
        const maxFallDown = 150 + (level * 5); 
        const minGap = 130 + (level * 3); 
        const maxGap = 250 + (level * 8); // Pushes the limits of Dash usage

        while (lastX < levelWidth - 300) {
            // Randomly decide if this is a "Powerup Jump" (very high)
            const isHighJump = Phaser.Math.Between(0, 10) > (8 - (level / 5));
            let heightChange;
            
            if (isHighJump) {
                heightChange = Phaser.Math.Between(-powerupJumpUp, -maxJumpUp - 30);
            } else {
                heightChange = Phaser.Math.Between(-maxJumpUp, maxFallDown);
            }

            let gap = Phaser.Math.Between(minGap, maxGap);
            
            const gapTightness = Math.max(20, 50 - level);
            if (heightChange < -50) { 
                gap = Phaser.Math.Between(minGap, minGap + gapTightness);
            } else if (heightChange > 100) { 
                gap = Phaser.Math.Between(minGap + gapTightness, maxGap);
            }
            
            // Calculate new position based on gap between platform edges
            // But we use centers for creation, so gap is distance between centers
            const oldX = lastX;
            const oldY = lastY;
            const oldPlatWidth = lastPlatWidth;
            
            lastX += gap;
            lastY = Phaser.Math.Clamp(lastY + heightChange, 100, 550);
            
            lastPlatWidth = 4;
            if (level > 2) lastPlatWidth = Phaser.Math.Between(2, 4);
            if (level > 7) lastPlatWidth = Phaser.Math.Between(1, 3);
            if (level > 12) lastPlatWidth = Phaser.Math.Between(1, 2); 
            if (level > 17) lastPlatWidth = 1;

            const p = platforms.create(lastX, lastY, 'platform').setScale(lastPlatWidth, 1).refreshBody();

            if (isHighJump) {
                // Place wing EXACTLY in the center of the gap to avoid platform overlap/spikes
                const prevRightEdge = oldX + (oldPlatWidth * 16);
                const currLeftEdge = lastX - (lastPlatWidth * 16);
                const wingX = (prevRightEdge + currLeftEdge) / 2;
                const wingY = (oldY + lastY) / 2;
                
                const powerup = powerups.create(wingX, wingY, 'powerup');
                powerup.body.setAllowGravity(false);
                powerup.respawnPos = { x: wingX, y: wingY };
            }

            if (level > 3 && Phaser.Math.Between(0, 10) > (9 - (level / 4))) {
                const wallHeight = 4 + Math.floor(level / 4);
                platforms.create(lastX + (lastPlatWidth * 16), lastY - 200, 'platform').setScale(1, wallHeight).refreshBody();
            }

            // HAZARDS - Avoid spikes on platforms reached by high jump powerups
            if (!isHighJump && Math.random() < trapChance) {
                const trapIdx = Phaser.Math.Between(0, lastPlatWidth - 1);
                const trapX = lastX - (lastPlatWidth * 16) + (trapIdx * 32);
                const trap = traps.create(trapX, lastY - 24, 'trap').setOrigin(0, 0);
                trap.body.setSize(32, 32);
            }

            if (lastPlatWidth > 1 && Math.random() < enemyChance) {
                const enemy = enemies.create(lastX, lastY - 40, 'enemy');
                const enemySpeed = 150 + (level * 15);
                enemy.minX = lastX - (lastPlatWidth * 16);
                enemy.maxX = lastX + (lastPlatWidth * 16);
                enemy.setVelocityX(Math.random() < 0.5 ? enemySpeed : -enemySpeed);
                enemy.setBounce(1);
                enemy.setCollideWorldBounds(false);
            }
        }

        door = scene.physics.add.staticSprite(lastX + 150, lastY - 40, 'door');
        player = scene.physics.add.sprite(50, 450, 'player');
        player.setCollideWorldBounds(true);
        scene.cameras.main.startFollow(player, true, 0.1, 0.1);
        scene.cameras.main.scrollX = 0;
        scene.physics.world.setBounds(0, 0, lastX + 500, 1000, true, true, true, false);
        scene.cameras.main.setBounds(0, 0, lastX + 500, 600);
    }

    // Physics interactions
    if (player && currentLevel >= 0) {
        scene.physics.add.collider(player, platforms);
        scene.physics.add.collider(enemies, platforms);
        scene.physics.add.collider(enemies, enemies);
        
        scene.physics.add.overlap(player, powerups, (p, powerup) => {
            const respawnPos = powerup.respawnPos;
            powerup.destroy();
            hasUpwardPowerup = true;
            player.setTint(0x00ffff);
            scene.time.delayedCall(1000, () => {
                if (respawnPos) {
                    const newPowerup = powerups.create(respawnPos.x, respawnPos.y, 'powerup');
                    newPowerup.body.setAllowGravity(false);
                    newPowerup.respawnPos = respawnPos; // Ensure the new one also knows where to respawn
                }
            });
        }, null, scene);
        
        scene.physics.add.overlap(player, traps, (p, t) => die(scene), (p, t) => {
            // Precise triangle hitbox check
            // Points: Bottom-Left, Top-Middle, Bottom-Right
            const triangle = new Phaser.Geom.Triangle(
                t.x, t.y + 32,
                t.x + 16, t.y,
                t.x + 32, t.y + 32
            );
            
            // Use full player bounds for exact accuracy as requested
            return Phaser.Geom.Intersects.RectangleToTriangle(p.getBounds(), triangle);
        }, scene);

        scene.physics.add.overlap(player, enemies, (p, e) => {
            if (!isDashing) die(scene);
        }, null, scene);
    }
}

function die(scene, reason = "GAME OVER") {
    if (isGameOver) return;
    isGameOver = true;
    scene.physics.pause();
    if (player) {
        player.setTint(0xff0000);
        player.setVelocity(0, 0);
    }
    isDashing = false;
    const centerX = 500;
    const centerY = 300;
    scene.add.rectangle(centerX, centerY, 1000, 600, 0x000000, 0.8).setScrollFactor(0);
    scene.add.text(centerX, centerY - 100, reason, { fontSize: '64px', fill: '#f00', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0);
    scene.add.text(centerX, centerY - 20, 'You lost your only life.', { fontSize: '24px', fill: '#fff' }).setOrigin(0.5).setScrollFactor(0);
    const restartBtn = scene.add.text(centerX, centerY + 60, 'RESTART', { fontSize: '32px', fill: '#0f0', backgroundColor: '#222', padding: { x: 20, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const menuBtn = scene.add.text(centerX, centerY + 140, 'MAIN MENU', { fontSize: '32px', fill: '#0ff', backgroundColor: '#222', padding: { x: 20, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    restartBtn.on('pointerdown', () => {
        if (currentLevel === 0) { isGameOver = false; scene.scene.restart(); }
        else { currentLevel = 1; isGameOver = false; scene.scene.restart(); }
    });
    menuBtn.on('pointerdown', () => { currentLevel = -1; isGameOver = false; scene.scene.restart(); });
    restartBtn.on('pointerover', () => restartBtn.setStyle({ fill: '#fff', backgroundColor: '#0a0' }));
    restartBtn.on('pointerout', () => restartBtn.setStyle({ fill: '#0f0', backgroundColor: '#222' }));
    menuBtn.on('pointerover', () => menuBtn.setStyle({ fill: '#fff', backgroundColor: '#088' }));
    menuBtn.on('pointerout', () => menuBtn.setStyle({ fill: '#0ff', backgroundColor: '#222' }));
}

function nextLevel(scene) {
    if (currentLevel >= maxLevels) {
        scene.add.text(500, 300, 'YOU WIN!', { fontSize: '64px', fill: '#0f0' }).setOrigin(0.5).setScrollFactor(0);
        scene.physics.pause();
        return;
    }
    currentLevel++;
    generateLevel(scene, currentLevel);
}

function togglePause(scene) {
    isPaused = !isPaused;
    if (isPaused) {
        scene.physics.pause();
        pauseUI.forEach(el => el.setVisible(true));
    } else {
        scene.physics.resume();
        pauseUI.forEach(el => el.setVisible(false));
    }
}

function createPauseMenu(scene) {
    const centerX = 500;
    const centerY = 300;
    const overlay = scene.add.rectangle(centerX, centerY, 1000, 600, 0x000000, 0.7).setScrollFactor(0).setVisible(false).setDepth(100);
    const pText = scene.add.text(centerX, centerY - 100, 'PAUSED', { fontSize: '64px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setVisible(false).setDepth(101);
    const resumeBtn = scene.add.text(centerX, centerY + 20, 'RESUME', { fontSize: '32px', fill: '#0f0', backgroundColor: '#222', padding: { x: 20, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true }).setVisible(false).setDepth(101);
    const menuBtn = scene.add.text(centerX, centerY + 100, 'MAIN MENU', { fontSize: '32px', fill: '#0ff', backgroundColor: '#222', padding: { x: 20, y: 10 } }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true }).setVisible(false).setDepth(101);
    resumeBtn.on('pointerdown', () => togglePause(scene));
    menuBtn.on('pointerdown', () => { isPaused = false; currentLevel = -1; scene.scene.restart(); });
    resumeBtn.on('pointerover', () => resumeBtn.setStyle({ fill: '#fff', backgroundColor: '#0a0' }));
    resumeBtn.on('pointerout', () => resumeBtn.setStyle({ fill: '#0f0', backgroundColor: '#222' }));
    menuBtn.on('pointerover', () => menuBtn.setStyle({ fill: '#fff', backgroundColor: '#088' }));
    menuBtn.on('pointerout', () => menuBtn.setStyle({ fill: '#0ff', backgroundColor: '#222' }));
    pauseUI = [overlay, pText, resumeBtn, menuBtn];
}

function createMobileControls(scene) {
    // Show on touch devices
    const isTouch = scene.sys.game.device.input.touch;
    if (!isTouch) return;

    const size = 70;
    const padding = 40;
    
    // D-PAD (Left Side)
    const dpadX = padding + size * 1.5;
    const dpadY = 600 - padding - size * 1.5;

    // Up (W)
    const upBtn = scene.add.rectangle(dpadX, dpadY - size, size, size, 0xaaaaaa, 0.3).setScrollFactor(0).setInteractive().setDepth(50);
    const upText = scene.add.text(dpadX, dpadY - size, 'W', { fontSize: '32px' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

    // Left (A)
    const leftBtn = scene.add.rectangle(dpadX - size, dpadY, size, size, 0xaaaaaa, 0.3).setScrollFactor(0).setInteractive().setDepth(50);
    const leftText = scene.add.text(dpadX - size, dpadY, '←', { fontSize: '32px' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

    // Right (D)
    const rightBtn = scene.add.rectangle(dpadX + size, dpadY, size, size, 0xaaaaaa, 0.3).setScrollFactor(0).setInteractive().setDepth(50);
    const rightText = scene.add.text(dpadX + size, dpadY, '→', { fontSize: '32px' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

    // ACTION BUTTONS (Right Side)
    const jumpX = 1000 - padding - size/2;
    const jumpY = 600 - padding - size/2;
    const dashX = 1000 - padding - size * 2;
    const dashY = 600 - padding - size * 2;

    const jumpBtn = scene.add.circle(jumpX, jumpY, size * 0.6, 0xaaaaaa, 0.4).setScrollFactor(0).setInteractive().setDepth(50);
    const jumpText = scene.add.text(jumpX, jumpY, 'JUMP', { fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

    const dashBtn = scene.add.circle(dashX, dashY, size * 0.5, 0xaaaaaa, 0.4).setScrollFactor(0).setInteractive().setDepth(50);
    const dashText = scene.add.text(dashX, dashY, '⚡', { fontSize: '32px' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

    // Input events
    leftBtn.on('pointerdown', () => touchState.left = true);
    leftBtn.on('pointerup', () => touchState.left = false);
    leftBtn.on('pointerout', () => touchState.left = false);

    rightBtn.on('pointerdown', () => touchState.right = true);
    rightBtn.on('pointerup', () => touchState.right = false);
    rightBtn.on('pointerout', () => touchState.right = false);

    upBtn.on('pointerdown', () => touchState.up = true);
    upBtn.on('pointerup', () => touchState.up = false);
    upBtn.on('pointerout', () => touchState.up = false);

    jumpBtn.on('pointerdown', () => touchState.jump = true);
    jumpBtn.on('pointerup', () => touchState.jump = false);

    dashBtn.on('pointerdown', () => touchState.dash = true);
    dashBtn.on('pointerup', () => touchState.dash = false);

    mobileControlsUI = [leftBtn, leftText, rightBtn, rightText, upBtn, upText, jumpBtn, jumpText, dashBtn, dashText];
}

function refreshTextures(scene, outlineColor) {
    const graphics = scene.make.graphics();
    const lineThickness = 2;

    // Player
    graphics.clear();
    graphics.fillStyle(0x3498db, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(lineThickness, outlineColor, 1);
    graphics.strokeRect(0, 0, 32, 32);
    graphics.generateTexture('player', 32, 32);
    
    // Platform
    graphics.clear();
    graphics.fillStyle(0x2ecc71, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(lineThickness, outlineColor, 1);
    graphics.strokeRect(0, 0, 32, 32);
    graphics.generateTexture('platform', 32, 32);

    // Trap (Spikes)
    graphics.clear();
    graphics.fillStyle(0xe74c3c, 1);
    graphics.fillTriangle(0, 32, 16, 0, 32, 32);
    graphics.lineStyle(lineThickness, outlineColor, 1);
    graphics.strokeTriangle(0, 32, 16, 0, 32, 32);
    graphics.generateTexture('trap', 32, 32);

    // Enemy
    graphics.clear();
    graphics.fillStyle(0xf1c40f, 1);
    graphics.fillCircle(16, 16, 16);
    graphics.lineStyle(lineThickness, outlineColor, 1);
    graphics.strokeCircle(16, 16, 16);
    graphics.generateTexture('enemy', 32, 32);

    // Door
    graphics.clear();
    graphics.fillStyle(0x8B4513, 1); // Brown
    graphics.fillRect(0, 0, 32, 48);
    graphics.lineStyle(lineThickness, outlineColor, 1);
    graphics.strokeRect(0, 0, 32, 48);
    graphics.fillStyle(0xFFD700, 1); // Gold knob
    graphics.fillCircle(26, 24, 4);
    graphics.generateTexture('door', 32, 48);

    // Powerup (Wing)
    graphics.clear();
    graphics.fillStyle(0x00ffff, 1);
    graphics.lineStyle(lineThickness, outlineColor, 1);
    // Draw a "wing" shape (two triangles/arcs)
    // Left wing
    graphics.beginPath();
    graphics.moveTo(16, 16);
    graphics.lineTo(0, 8);
    graphics.lineTo(8, 24);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    // Right wing
    graphics.beginPath();
    graphics.moveTo(16, 16);
    graphics.lineTo(32, 8);
    graphics.lineTo(24, 24);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    graphics.generateTexture('powerup', 32, 32);

    // Dash Icon
    graphics.clear();
    graphics.fillStyle(0xffffff, 0.3);
    graphics.fillRect(0, 0, 32, 10);
    graphics.lineStyle(lineThickness, outlineColor, 1);
    graphics.strokeRect(0, 0, 32, 10);
    graphics.generateTexture('dashIcon', 32, 10);
}

function updateTimerDisplay() {
    if (!timerText) return;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerText.setText(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
    if (timeLeft < 60) timerText.setFill('#f00');
    else timerText.setFill('#fff');
}

function updateBackground(scene, level) {
    if (!bgGraphics) return;
    bgGraphics.clear();
    if (starfield) { starfield.stop(); starfield.setVisible(false); }
    let topColor, bottomColor;
    if (level === -1) { topColor = 0x111111; bottomColor = 0x111111; }
    else if (level === 0) { topColor = 0x000000; bottomColor = 0x000000; }
    else if (level <= 5) { topColor = 0x87CEEB; bottomColor = 0xADD8E6; }
    else if (level <= 10) { topColor = 0xFF7F50; bottomColor = 0x4B0082; }
    else if (level <= 15) { topColor = 0x00008B; bottomColor = 0x000000; }
    else {
        topColor = 0x000000; bottomColor = 0x000000;
        if (!starfield) {
            const particles = scene.add.particles('player');
            starfield = particles.createEmitter({
                x: { min: 0, max: 1000 }, y: { min: 0, max: 600 },
                lifespan: 2000, speed: { min: 5, max: 15 },
                scale: { start: 0.1, end: 0 }, quantity: 1, alpha: { start: 0.5, end: 0 }
            });
        }
        starfield.start(); starfield.setVisible(true);
    }
    bgGraphics.fillGradientStyle(topColor, topColor, bottomColor, bottomColor, 1);
    bgGraphics.fillRect(0, 0, 1000, 600);
    scene.children.sendToBack(bgGraphics);
    if (starfield) scene.children.sendToBack(starfield.manager);
}