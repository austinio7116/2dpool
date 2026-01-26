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
        this.ui.onTableChange = (tableNum) => this.renderer.setTableStyle(tableNum);

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

        // Apply linear velocity
        const velocity = Vec2.multiply(direction, power);
        cueBall.velocity.x = velocity.x;
        cueBall.velocity.y = velocity.y;

        // Calculate natural roll angular velocity for this shot speed
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const naturalRoll = speed / cueBall.radius;

        // Spin intensity is relative to natural roll - keeps spin proportional to shot power
        // Full backspin gives -2x natural roll, full topspin gives +4x natural roll
        // Moderate values for realistic spin without excessive sliding friction
        const spinIntensity = naturalRoll * 3;

        // Sidespin (english): spin.x is left (-1) to right (+1) offset on cue ball face
        cueBall.angularVel.x = spin.x * spinIntensity;

        // Top/backspin based on where cue hits the ball:
        // spin.y > 0 (click below center) = hit bottom of ball = BACKSPIN
        // spin.y < 0 (click above center) = hit top of ball = TOPSPIN
        // Subtract because: clicking below (spin.y > 0) should give backspin (less angular vel)
        cueBall.angularVel.y = naturalRoll - (spin.y * spinIntensity);

        // Mark ball as sliding if spin doesn't match natural roll
        cueBall.isSliding = Math.abs(spin.x) > 0.1 || Math.abs(spin.y) > 0.1;

        // Store direction for spin physics (needed if ball slows down quickly)
        cueBall.lastDirX = direction.x;
        cueBall.lastDirY = direction.y;

        this.audio.playCueStrike(power / 20);

        // Update game state
        this.game.onShotTaken();
        this.input.setCanShoot(false);

        // Clear trajectory
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
                ball.updateVisualRotation();
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
