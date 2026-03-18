const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1000,
    height: 600,
    backgroundColor: '#111',
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
let menuUI = [];
let pauseUI = [];
let timeLeft = 600; // 10 minutes in seconds
let timerEvent; // Added back timerEvent
let isGameOver = false;
let isPaused = false;
let canDash = true;
let hasUpwardPowerup = false;
let isDashing = false;
let dashTime = 0;
const dashDuration = 150;
const dashSpeed = 600;

function preload() {
    // Simple colored blocks for assets instead of external images to ensure they load
    const graphics = this.make.graphics();
    
    // Player
    graphics.fillStyle(0x3498db, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.generateTexture('player', 32, 32);
    graphics.clear();
    
    // Platform
    graphics.fillStyle(0x2ecc71, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.generateTexture('platform', 32, 32);
    graphics.clear();

    // Trap (Spikes)
    graphics.fillStyle(0xe74c3c, 1);
    graphics.fillTriangle(0, 32, 16, 0, 32, 32);
    graphics.generateTexture('trap', 32, 32);
    graphics.clear();

    // Enemy
    graphics.fillStyle(0xf1c40f, 1);
    graphics.fillCircle(16, 16, 16);
    graphics.generateTexture('enemy', 32, 32);
    graphics.clear();

    // Door
    graphics.fillStyle(0x9b59b6, 1);
    graphics.fillRect(0, 0, 32, 48);
    graphics.generateTexture('door', 32, 48);
    graphics.clear();

    // Powerup (Wing)
    graphics.fillStyle(0x00ffff, 1);
    graphics.fillTriangle(16, 0, 0, 32, 32, 32);
    graphics.generateTexture('powerup', 32, 32);
    graphics.clear();

    // Dash Icon
    graphics.fillStyle(0xffffff, 0.3);
    graphics.fillRect(0, 0, 32, 10);
    graphics.generateTexture('dashIcon', 32, 10);
}

function create() {
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
        skip: Phaser.Input.Keyboard.KeyCodes.K
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
        isPaused = !isPaused;
        if (isPaused) {
            this.physics.pause();
            pauseText.setVisible(true);
        } else {
            this.physics.resume();
            pauseText.setVisible(false);
        }
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
    
    // Pause UI Setup
    createPauseMenu(this);

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
    }

    // Left/Right
    if (keys.left.isDown) {
        player.setVelocityX(-speed);
    } else if (keys.right.isDown) {
        player.setVelocityX(speed);
    } else {
        player.setVelocityX(0);
    }

    // Jump
    if (Phaser.Input.Keyboard.JustDown(keys.jump) && player.body.touching.down) {
        player.setVelocityY(jumpForce);
    }

    // Dash
    if (Phaser.Input.Keyboard.JustDown(keys.dash) && canDash) {
        // Upward Dash requires a powerup
        if (keys.up.isDown) {
            if (!hasUpwardPowerup) return; // Can't dash up without powerup
            hasUpwardPowerup = false; // Consume powerup
            player.clearTint();
        }

        isDashing = true;
        canDash = false; // Only one use before hitting ground
        dashTime = time;
        player.body.allowGravity = false;
        
        // Determine dash direction
        if (keys.up.isDown) {
            // Upward Dash (W + Shift) - Powerup consumed above
            player.setVelocity(0, -dashSpeed);
        } else if (keys.left.isDown) {
            player.setVelocity(-dashSpeed, 0);
        } else if (keys.right.isDown) {
            player.setVelocity(dashSpeed, 0);
        } else {
            // Default to current horizontal facing or right
            const dirX = player.body.velocity.x >= 0 ? dashSpeed : -dashSpeed;
            player.setVelocity(dirX, 0);
        }
    }

    // Door check
    if (Phaser.Math.Distance.Between(player.x, player.y, door.x, door.y) < 40) {
        nextLevel(this);
    }

    // Pit check
    if (player.y > 650) {
        die(this);
    }
}

function generateLevel(scene, level) {
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
    if (levelText) levelText.setText(level === 0 ? 'Tutorial' : `Level: ${level}/${maxLevels}`);
    if (levelText) levelText.setVisible(level >= 0);
    if (timerText) timerText.setVisible(level > 0);
    if (skipText) skipText.setVisible(level === 0);
    if (dashIcon) dashIcon.setVisible(level >= 0);
    if (wingIcon) wingIcon.setVisible(level >= 0);

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
        tutorialTexts.push(scene.add.text(50, 400, 'A/D to Move\nSPACE to Jump', { fontSize: '18px', fill: '#fff' }));

        platforms.create(500, groundY, 'platform').setScale(10, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(550, 400, 'SHIFT to Dash\n(One use in air)', { fontSize: '18px', fill: '#fff' }));

        platforms.create(1000, groundY, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        const p = powerups.create(1150, 450, 'powerup');
        p.body.setAllowGravity(false);
        tutorialTexts.push(scene.add.text(1050, 350, 'Pick up Wing\nW + SHIFT to Dash Up', { fontSize: '18px', fill: '#0ff' }));

        platforms.create(1300, 300, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(1350, 200, 'Dashing does NOT make\nyou invincible!', { fontSize: '18px', fill: '#f88' }));
        traps.create(1400, 276, 'trap').setOrigin(0, 0); // Spikes on platform

        platforms.create(1600, 300, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(1650, 200, 'Avoid Enemies!', { fontSize: '18px', fill: '#ff0' }));
        const enemy = enemies.create(1750, 260, 'enemy');
        enemy.minX = 1600;
        enemy.maxX = 1600 + (5 * 32);
        enemy.setVelocityX(100);
        enemy.setBounce(1);
        enemy.setCollideWorldBounds(false);

        platforms.create(1900, 300, 'platform').setScale(5, 1).setOrigin(0).refreshBody();
        tutorialTexts.push(scene.add.text(1950, 200, 'Reach the door!', { fontSize: '18px', fill: '#fff' }));
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
        platforms.create(50, 500, 'platform').setScale(4, 1).refreshBody();

        let lastX = 200;
        let lastY = 500;
        
        // 📈 AGGRESSIVE DIFFICULTY SCALING
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
            // Chance of a high jump increases as you progress
            const isHighJump = Phaser.Math.Between(0, 10) > (8 - (level / 5));
            let heightChange;
            
            if (isHighJump) {
                heightChange = Phaser.Math.Between(-powerupJumpUp, -maxJumpUp - 30);
            } else {
                heightChange = Phaser.Math.Between(-maxJumpUp, maxFallDown);
            }

            let gap = Phaser.Math.Between(minGap, maxGap);
            
            // Adjust gap for verticality - gets tighter as levels go up
            const gapTightness = Math.max(20, 50 - level);
            if (heightChange < -50) { 
                gap = Phaser.Math.Between(minGap, minGap + gapTightness);
            } else if (heightChange > 100) { 
                gap = Phaser.Math.Between(minGap + gapTightness, maxGap);
            }
            
            lastX += gap;
            lastY = Phaser.Math.Clamp(lastY + heightChange, 100, 550);
            
            // Platform width shrinks aggressively
            let platWidth = 4;
            if (level > 2) platWidth = Phaser.Math.Between(2, 4);
            if (level > 7) platWidth = Phaser.Math.Between(1, 3);
            if (level > 12) platWidth = Phaser.Math.Between(1, 2); 
            if (level > 17) platWidth = 1; // Pure precision at the end

            const p = platforms.create(lastX, lastY, 'platform').setScale(platWidth, 1).refreshBody();

            // Spawn Powerup if it's a high jump
            if (isHighJump) {
                const powerup = powerups.create(lastX - (gap / 2), lastY + (Math.abs(heightChange) / 2) + 50, 'powerup');
                powerup.body.setAllowGravity(false);
            }

            // 🛡️ PARKOUR ELEMENTS - Walls become more frequent
            if (level > 3 && Phaser.Math.Between(0, 10) > (9 - (level / 4))) {
                const wallHeight = 4 + Math.floor(level / 4);
                platforms.create(lastX + (platWidth * 16), lastY - 200, 'platform').setScale(1, wallHeight).refreshBody();
            }

            // ⚠️ HAZARDS
            if (Math.random() < trapChance) {
                const trapX = lastX + (Phaser.Math.Between(0, platWidth - 1) * 32);
                const trap = traps.create(trapX, lastY - 24, 'trap').setOrigin(0, 0);
                trap.body.setSize(8, 8);
                trap.body.setOffset(12, 24);
            }

            if (Math.random() < enemyChance) {
                const enemy = enemies.create(lastX, lastY - 40, 'enemy');
                const enemySpeed = 150 + (level * 15); // Robots get faster
                enemy.minX = lastX - (platWidth * 16);
                enemy.maxX = lastX + (platWidth * 16);
                enemy.setVelocityX(Math.random() < 0.5 ? enemySpeed : -enemySpeed);
                enemy.setBounce(1);
                enemy.setCollideWorldBounds(false);
            }
        }

        // Door at the end
        door = scene.physics.add.staticSprite(lastX + 150, lastY - 40, 'door');

        // Player spawn
        player = scene.physics.add.sprite(50, 450, 'player');
        player.setCollideWorldBounds(true);
        
        // 📸 FIX CAMERA PANNING
        scene.cameras.main.startFollow(player, true, 0.1, 0.1);
        scene.cameras.main.scrollX = 0; // Explicitly reset scroll to start
        
        // Set world bounds (extended height to allow falling, disabled bottom collision)
        scene.physics.world.setBounds(0, 0, lastX + 500, 1000, true, true, true, false);
        scene.cameras.main.setBounds(0, 0, lastX + 500, 600);
    }

    // Physics interactions (Always apply these after player/platforms are created)
    if (player && currentLevel >= 0) {
        scene.physics.add.collider(player, platforms);
        scene.physics.add.collider(enemies, platforms);
        scene.physics.add.collider(enemies, enemies);
        
        scene.physics.add.overlap(player, powerups, (p, powerup) => {
            powerup.destroy();
            hasUpwardPowerup = true;
            player.setTint(0x00ffff); // Glow cyan to show powerup
        }, null, scene);
        
        scene.physics.add.overlap(player, traps, (p, t) => die(scene), null, scene);
        scene.physics.add.overlap(player, enemies, (p, e) => {
            if (!isDashing) { // Only die if NOT dashing
                die(scene);
            }
        }, null, scene);
    }
}

function die(scene, reason = "GAME OVER") {
    if (isGameOver) return;
    isGameOver = true;
    scene.physics.pause();
    player.setTint(0xff0000);
    player.setVelocity(0, 0); // Stop player
    
    // Stop dash state on death
    isDashing = false;
    player.body.allowGravity = true;
    
    const centerX = 500;
    const centerY = 300;

    // Dark overlay
    const overlay = scene.add.rectangle(centerX, centerY, 1000, 600, 0x000000, 0.8).setScrollFactor(0);

    // Death text
    scene.add.text(centerX, centerY - 100, reason, { 
        fontSize: '64px', 
        fill: '#f00', 
        fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0);

    scene.add.text(centerX, centerY - 20, 'You lost your only life.', { 
        fontSize: '24px', 
        fill: '#fff'
    }).setOrigin(0.5).setScrollFactor(0);

    // Restart Button
    const restartBtn = scene.add.text(centerX, centerY + 60, 'RESTART', {
        fontSize: '32px',
        fill: '#0f0',
        backgroundColor: '#222',
        padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    // Menu Button
    const menuBtn = scene.add.text(centerX, centerY + 140, 'MAIN MENU', {
        fontSize: '32px',
        fill: '#0ff',
        backgroundColor: '#222',
        padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    restartBtn.on('pointerdown', () => {
        if (currentLevel === 0) {
            // Keep at Level 0 if dying in tutorial
            isGameOver = false;
            scene.scene.restart();
        } else {
            currentLevel = 1;
            isGameOver = false;
            scene.scene.restart();
        }
    });

    menuBtn.on('pointerdown', () => {
        currentLevel = -1;
        isGameOver = false;
        scene.scene.restart();
    });

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
    levelText.setText(`Level: ${currentLevel}/${maxLevels}`);
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

    const overlay = scene.add.rectangle(centerX, centerY, 1000, 600, 0x000000, 0.7).setScrollFactor(0).setVisible(false);
    
    const pText = scene.add.text(centerX, centerY - 100, 'PAUSED', { 
        fontSize: '64px', 
        fill: '#fff',
        fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false);

    const resumeBtn = scene.add.text(centerX, centerY + 20, 'RESUME', {
        fontSize: '32px',
        fill: '#0f0',
        backgroundColor: '#222',
        padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true }).setVisible(false);

    const menuBtn = scene.add.text(centerX, centerY + 100, 'MAIN MENU', {
        fontSize: '32px',
        fill: '#0ff',
        backgroundColor: '#222',
        padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true }).setVisible(false);

    resumeBtn.on('pointerdown', () => togglePause(scene));
    menuBtn.on('pointerdown', () => {
        isPaused = false;
        currentLevel = -1;
        scene.scene.restart();
    });

    // Hover effects
    resumeBtn.on('pointerover', () => resumeBtn.setStyle({ fill: '#fff', backgroundColor: '#0a0' }));
    resumeBtn.on('pointerout', () => resumeBtn.setStyle({ fill: '#0f0', backgroundColor: '#222' }));
    menuBtn.on('pointerover', () => menuBtn.setStyle({ fill: '#fff', backgroundColor: '#088' }));
    menuBtn.on('pointerout', () => menuBtn.setStyle({ fill: '#0ff', backgroundColor: '#222' }));

    pauseUI = [overlay, pText, resumeBtn, menuBtn];
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerText.setText(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
    
    if (timeLeft < 60) {
        timerText.setFill('#f00'); // Turn red in last minute
    } else {
        timerText.setFill('#fff');
    }
}