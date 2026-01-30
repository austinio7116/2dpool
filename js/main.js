// Main game loop - initializes and coordinates all game systems

import { Table } from './table.js';
import { PlanckPhysics as Physics } from './planck-physics.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Cue } from './cue.js';
import { Game, GameMode, GameState } from './game.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Vec2 } from './utils.js';

class PoolGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.loadingScreen = document.getElementById('loading-screen');

        // Initialize game systems
        this.table = new Table();
        this.physics = new Physics(this.table);
        this.renderer = new Renderer(this.canvas, this.table);
        this.input = new Input(this.canvas);
        this.cue = new Cue();
        this.game = new Game(this.table);
        this.ui = new UI();
        this.audio = new Audio();

        // Set canvas size for input positioning
        this.input.setCanvasSize(this.table.canvasWidth, this.table.canvasHeight);

        // Trajectory prediction cache
        this.trajectory = null;

        // Bind callbacks
        this.bindCallbacks();

        // Wait for assets to load before showing the game
        this.waitForAssets();
    }

    waitForAssets() {
        if (this.renderer.allAssetsLoaded) {
            this.onAssetsReady();
        } else {
            this.renderer.onAssetsLoaded = () => this.onAssetsReady();
        }
    }

    onAssetsReady() {
        // Hide loading screen with fade
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                if (this.loadingScreen.parentNode) {
                    this.loadingScreen.parentNode.removeChild(this.loadingScreen);
                }
            }, 500);
        }

        // Show main menu
        this.ui.showMainMenu();

        // Start game loop
        this.lastTime = 0;
        this.running = true;
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    bindCallbacks() {
        // UI callbacks
        this.ui.onGameStart = (mode, options) => this.startGame(mode, options);
        this.ui.onPlayAgain = () => this.playAgain();
        this.ui.onMainMenu = () => this.returnToMenu();
        this.ui.onRerack = () => this.game.rerack();
        this.ui.onSoundToggle = (enabled) => this.audio.setEnabled(enabled);
        this.ui.onSpeedChange = (speed) => this.physics.setSpeedMultiplier(speed);
        this.ui.onTableChange = (tableNum) => {
            // 1. Update the visual style (Renderer)
            this.renderer.setTableStyle(tableNum);

            // 2. Update the audio context (Audio)
            // If tableNum is 8, set to snooker, otherwise default to pool
            if (tableNum === 8) {
                this.audio.setTableType('snooker');
            } else {
                this.audio.setTableType('pool');
            }
        };

        // Input callbacks - now includes spin
        this.input.onShot = (direction, power, spin) => this.executeShot(direction, power, spin);
        this.input.onAimUpdate = (direction, power) => this.updateAim(direction, power);
        this.input.onBallPlaced = (position) => this.placeCueBall(position);

        // Game callbacks
        this.game.onStateChange = (state) => this.handleStateChange(state);
        this.game.onFoul = (reason) => this.handleFoul(reason);
        this.game.onGameOver = (winner, reason) => this.handleGameOver(winner, reason);
        this.game.onBallPocketed = (ball) => this.handleBallPocketed(ball);
    }

    startGame(mode, options = {}) {
        this.audio.init();
        this.physics.reset();  // Clear old ball bodies before creating new game
        this.game.startGame(mode, options);
        this.lastGameOptions = options;  // Store for play again

        this.input.setCueBall(this.game.cueBall);
        this.input.setCanShoot(true);
        this.input.resetSpin();

        this.ui.showGameHUD(mode);
    }

    playAgain() {
        this.startGame(this.game.mode, this.lastGameOptions || {});
    }

    returnToMenu() {
        this.game.state = GameState.MENU;
        this.ui.showMainMenu();
        this.input.setCanShoot(false);
    }

    executeShot(direction, power, spin) {
        if (this.game.state !== GameState.PLAYING) return;
        if (!this.game.cueBall || this.game.cueBall.pocketed) return;

        const cueBall = this.game.cueBall;

        // 1. Calculate Linear Velocity (Shot Power)
        // power is roughly 0-20. 
        const velocity = Vec2.multiply(direction, power);
        cueBall.velocity.x = velocity.x;
        cueBall.velocity.y = velocity.y;
        
        // 2. Calculate "Natural Roll" spin rate for this speed
        // Omega = V / R
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const R = cueBall.radius; // Game units (pixels)
        const naturalOmega = speed / R; // radians/frame (approx)

        // 3. Apply Spin based on Hit Position (UI Spin Vector)
        // spin.x = Left/Right (English) -> Z Axis
        // spin.y = Down/Up (Draw/Follow) -> X/Y Axis
        
        // Z-Axis (English): 
        // Max english is usually defined by tip offset. 
        // 2.5 rad/unit is a tuning constant for how much english the cue imparts.
        // We set this directly on the ball, it gets synced to Planck body next frame.
        // Note: Planck uses Units/Sec. Our Physics class handles the conversion from pixels.
        // We store "radians per second" type values in spinZ for consistency with Planck.
        // VELOCITY_SCALE (60) converts per-frame to per-second.
        cueBall.spinZ = -spin.x * naturalOmega * 2.0 * 60; // Negative because left-english (negative x) is positive rotation

        // X/Y Axis (Follow/Draw/Masse):
        // We are constructing the spin vector parallel to the table.
        // First, find the axis of rotation for pure topspin (Perpendicular to velocity).
        // If moving along (1,0), pure topspin axis is (0, 1).
        const perpX = -direction.y;
        const perpY = direction.x;
        
        // Base spin (pure rolling)
        const rollingSpinX = perpX * naturalOmega * 60;
        const rollingSpinY = perpY * naturalOmega * 60;

        // Adjust based on vertical hit position (spin.y)
        // spin.y = 1.0 (Top) -> Increases rotation (Follow)
        // spin.y = -1.0 (Bottom) -> Reverses rotation (Draw)
        // spin.y = 0.0 (Center) -> Stun shot (No rotation initially)
        // Note: Realistically, a center hit is a "Stun", so spin is 0. 
        // A top hit creates rolling spin.
        
        // Let's model it as: Center hit = Sliding (0 spin). Top hit = Rolling. Bottom = Backspin.
        // Range -1 to 1.
        // The factor 2.5 determines max draw/follow speed relative to ball speed.
        const spinFactor = spin.y * 10; 

        cueBall.spin.x = rollingSpinX * spinFactor;
        cueBall.spin.y = rollingSpinY * spinFactor;

        // Add Masse (Side spin on the horizontal axis)
        // If we have spin.x (English), and we elevate the cue (not simulated explicitly yet),
        // we get swerve. For now, we mix a little spin.x into the roll axis to simulate
        // imperfect cues or slight squirt, or simply let the physics engine handle throw.
        // But for pure Swerve, we would need an "elevation" variable.
        // For now, simple draw/follow is sufficient.

        cueBall.forceSync = true; // Tell physics to overwrite Body state
        cueBall.isSliding = true;

        this.audio.playCueStrike(power / 20);

        this.game.onShotTaken();
        this.input.setCanShoot(false);
        this.trajectory = null;
    }

    updateAim(direction, power) {
        if (!direction || power === 0) {
            this.trajectory = null;
            return;
        }

        if (this.game.cueBall && !this.game.cueBall.pocketed) {
            this.trajectory = this.physics.predictTrajectory(
                this.game.cueBall,
                direction,
                power,
                this.game.balls
            );
        }
    }

    placeCueBall(position) {
        // Break shot: always kitchen only (behind the baulk line)
        // UK 8-ball fouls: kitchen only
        // Other fouls: ball in hand anywhere
        const kitchenOnly = this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL;

        if (this.game.canPlaceCueBall(position, kitchenOnly)) {
            this.game.placeCueBall(position, kitchenOnly);
            this.input.exitBallInHandMode();
            this.input.setCanShoot(true);
            this.input.resetSpin();
        }
    }

    handleStateChange(state) {
        this.ui.updateFromGameInfo(this.game.getGameInfo());

        if (state === GameState.BALL_IN_HAND) {
            // Break shot: always kitchen only (behind the baulk line)
            // UK 8-ball fouls: kitchen only
            // Other fouls: ball in hand anywhere
            const kitchenOnly = this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL;
            this.input.enterBallInHandMode(this.game.cueBall, (pos) => {
                return this.game.canPlaceCueBall(pos, kitchenOnly);
            });

            const validPos = kitchenOnly
                ? this.table.findValidKitchenPosition(this.game.balls, this.table.center.y)
                : this.table.findValidCueBallPosition(this.game.balls, this.table.center.y);
            this.game.cueBall.setPosition(validPos.x, validPos.y);
            this.game.cueBall.pocketed = false;
        } else if (state === GameState.PLAYING) {
            this.input.setCanShoot(true);
            this.input.exitBallInHandMode();
        }
    }

    handleFoul(reason) {
        this.ui.showFoul(reason);
        this.audio.playScratch();
    }

    handleGameOver(winner, reason) {
        this.ui.showGameOver(winner, reason);
        this.input.setCanShoot(false);

        if (winner) {
            this.audio.playWin();
        }
    }

    handleBallPocketed(ball) {
        // Additional handling if needed
    }

    gameLoop(currentTime) {
        if (!this.running) return;

        // Calculate delta time, capping to avoid large jumps on first frame or after pause
        let deltaTime = currentTime - this.lastTime;
        if (this.lastTime === 0 || deltaTime > 100) {
            deltaTime = 16.67; // Default to 60fps
        }
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(deltaTime) {
        this.cue.update();

        if (this.game.state === GameState.BALLS_MOVING) {
            // Physics simulation - pass deltaTime for frame-rate independence
            const events = this.physics.update(this.game.balls, deltaTime);

            this.audio.handleCollisionEvents(events);

            for (const event of events) {
                if (event.type === 'ball') {
                    this.game.onBallCollision(event.ballA, event.ballB);
                } else if (event.type === 'pocket') {
                    this.game.onBallPocket(event.ball);
                }
            }

            if (!this.physics.areBallsMoving(this.game.balls)) {
                this.game.onBallsStopped();
                this.input.resetSpin();
            }
        }

        if (this.game.state !== GameState.MENU && this.game.state !== GameState.GAME_OVER) {
            this.ui.updateFromGameInfo(this.game.getGameInfo());
        }

        // Update visual rotation for all balls (rolling animation + return to upright)
        for (const ball of this.game.balls) {
            if (!ball.pocketed) {
                ball.updateVisualRotation(deltaTime/1000);
            }
        }
    }

    render() {
        const aimState = this.input.getAimState();
        const canShoot = this.game.state === GameState.PLAYING && !this.input.isPlacingBall();

        const renderState = {
            balls: this.game.balls,
            cueBall: this.game.cueBall,
            aiming: aimState.aiming && this.game.state === GameState.PLAYING,
            aimDirection: aimState.direction,
            power: aimState.power,
            pullBack: aimState.pullBack,
            trajectory: this.trajectory,
            spin: aimState.spin,
            spinIndicator: aimState.spinIndicator,
            showSpinIndicator: canShoot
        };

        this.renderer.render(renderState);

        if (this.game.state === GameState.BALL_IN_HAND && this.game.cueBall) {
            this.drawPlacementIndicator();
        }
    }

    drawPlacementIndicator() {
        const ctx = this.renderer.ctx;
        const cueBall = this.game.cueBall;
        const mousePos = this.input.mousePos;

        // International rules: ball in hand anywhere after foul
        const isValid = this.game.canPlaceCueBall(mousePos, false);

        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, cueBall.radius, 0, Math.PI * 2);
        ctx.fillStyle = isValid ? '#90EE90' : '#FF6B6B';
        ctx.fill();
        ctx.strokeStyle = isValid ? '#228B22' : '#8B0000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.poolGame = new PoolGame();

    // Keyboard shortcut to toggle 3D ball rendering (press '3')
    document.addEventListener('keydown', (e) => {
        if (e.key === '3') {
            const renderer = window.poolGame.renderer;
            renderer.use3DBalls = !renderer.use3DBalls;
            console.log(`3D ball rendering: ${renderer.use3DBalls ? 'ON' : 'OFF'}`);
        }
    });
});
