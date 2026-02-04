// Main game loop - initializes and coordinates all game systems

import { Table } from './table.js';
import { PlanckPhysics as Physics } from './planck-physics.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Cue } from './cue.js';
import { Game, GameMode, GameState } from './game.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { AI } from './ai.js';
import { Vec2 } from './utils.js';

class PoolGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.loadingScreen = document.getElementById('loading-screen');

        // Initialize game systems
        this.table = new Table();
        this.physics = new Physics(this.table);
        this.renderer = new Renderer(this.canvas, this.table);
        this.renderer.setPhysics(this.physics);
        this.input = new Input(this.canvas);
        this.cue = new Cue();
        this.game = new Game(this.table);
        this.ui = new UI();
        this.audio = new Audio();
        this.ai = new AI();

        this.ai.setGameReferences(this.game, this.table);
        this.ai.setPhysics(this.physics);
        this.ai.initializePocketGeometry(this.physics);


        // Set canvas size for input positioning
        this.input.setCanvasSize(this.table.canvasWidth, this.table.canvasHeight);

        // Trajectory prediction cache
        this.trajectory = null;

        // Match persistence
        this.STORAGE_KEY = 'poolGame_savedMatch';

        // Bind callbacks
        this.bindCallbacks();

        // Apply the saved table selection
        const savedTable = this.ui.getSelectedTable();
        if (savedTable !== 1) {
            this.ui.onTableChange(savedTable);
        }

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
        this.ui.onTableChange = (tableId) => {
            // Get the actual table number for rendering (resolves custom tables to base table)
            const tableNum = this.ui.getTableNumberForRendering(tableId);

            // Get HSB adjustments if this is a custom table
            const hsbAdjustments = this.ui.getTableHSBAdjustments(tableId);

            // 1. Update table dimensions first (for tighter snooker pockets and wider tables)
            this.table.setTableStyle(tableNum);

            // 2. Update the visual style (Renderer) with HSB adjustments - also resizes canvas if needed
            this.renderer.setTableStyle(tableNum, hsbAdjustments);

            // 3. Update input canvas size to match new table dimensions
            this.input.setCanvasSize(this.table.canvasWidth, this.table.canvasHeight);

            // 4. Update the physics collision shapes (for curved vs straight pockets)
            this.physics.setTableStyle(tableNum);

            // 5. Update game and AI
            this.game.setTableStyle(tableNum);
            
            // ---------------------------------------------------------------
            // FIX: Re-scan geometry because physics.setTableStyle just changed the rails
            // ---------------------------------------------------------------
            this.ai.setPhysics(this.physics);
            this.ai.initializePocketGeometry(this.physics);
            // ---------------------------------------------------------------

            // 6. Update the audio context (Audio)
            // If tableNum is 8 or 9, set to snooker, otherwise default to pool
            if (tableNum === 8 || tableNum === 9) {
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
        this.game.onFoul = (reason, isMiss) => this.handleFoul(reason, isMiss);
        this.game.onGameOver = (winner, reason, match) => this.handleGameOver(winner, reason, match);
        this.game.onBallPocketed = (ball) => this.handleBallPocketed(ball);

        // Match callbacks
        this.ui.onNextFrame = () => this.startNextFrame();
        this.ui.onResumeMatch = () => this.resumeMatch();

        // Menu callbacks
        this.ui.onBallsUpright = () => this.animateBallsUpright();
        this.ui.onConcedeFrame = () => this.concedeFrame();

        // AI callbacks
        this.ai.onShot = (direction, power, spin) => this.executeShot(direction, power, spin);
        this.ai.onBallPlacement = (position) => this.placeCueBall(position);
        this.ai.onThinkingStart = () => this.ui.showAIThinking();
        this.ai.onThinkingEnd = () => this.ui.hideAIThinking();

        // Snooker WPBSA rules callbacks
        this.game.onFoulDecision = (foulInfo) => this.handleSnookerFoulDecision(foulInfo);
        this.game.onNominationRequired = () => this.handleNominationRequired();
        this.game.onNominationChange = (colorName) => this.ui.updateNominatedColor(colorName);
        this.game.onFreeBallAwarded = () => this.handleFreeBallAwarded();
        this.game.onFreeBallNominated = (ball) => this.handleFreeBallNominated(ball);
        this.game.onMissWarning = (player) => this.handleMissWarning(player);

        // UI snooker callbacks
        this.ui.onSnookerDecision = (decision) => this.applySnookerDecision(decision);
        this.ui.onColorNomination = (colorName) => this.handleColorNomination(colorName);
        this.ui.onFreeBallNomination = (ball) => this.handleFreeBallNomination(ball);
    }

    async startGame(mode, options = {}) {
        // Show loading spinner
        const loadingOverlay = document.getElementById('loading-overlay');
        const progressBar = document.getElementById('loading-progress-bar');
        const progressText = document.getElementById('loading-progress-text');

        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';

        // Yield to browser to show spinner before starting work
        await new Promise(resolve => setTimeout(resolve, 0));

        this.audio.init();
        this.physics.reset();  // Clear old ball bodies before creating new game

        this.ai.setGameReferences(this.game, this.table);
        this.ai.initializePocketGeometry(this.physics);

        // Get the selected ball set from UI
        const selectedBallSet = this.ui.getSelectedBallSet();

        // Get match format from UI (unless resuming or already specified)
        if (options.bestOf === undefined && !options.resumeMatch) {
            options.bestOf = this.ui.getMatchFormat();
        }

        // Clear any saved match when starting a new game (not resuming)
        if (!options.resumeMatch) {
            this.clearSavedMatch();
        }

        // For snooker mode, force snooker ball set
        if (mode === GameMode.SNOOKER) {
            // Snooker uses its own ball configuration
        } else if (selectedBallSet) {
            // Apply the selected ball set regardless of game mode
            options.customBallSet = selectedBallSet;
        }

        // Store ball set ID for save/resume
        options.ballSetId = selectedBallSet?.id || 'american';

        // Setup AI if enabled (not for Free Play mode) - BEFORE starting game
        const aiEnabled = this.ui.getAIEnabled() && mode !== GameMode.FREE_PLAY;
        this.ai.setEnabled(aiEnabled);
        this.ai.setDifficulty(this.ui.getAIDifficulty());
        this.ai.setGameReferences(this.game, this.table);  // Set references BEFORE startGame

        // Randomize who breaks when AI is enabled - BEFORE starting game
        // so handleStateChange knows if it's AI's turn
        if (aiEnabled && !options.resumeMatch) {
            options.startingPlayer = AI.randomizeBreak();
        }

        this.game.startGame(mode, options);
        this.lastGameOptions = options;  // Store for play again
        this.lastGameMode = mode; // Store mode for play again

        // Apply selected ball set appearance (works for both custom and predefined sets)
        if (selectedBallSet && mode !== GameMode.SNOOKER) {
            await this.applyCustomBallSet(selectedBallSet);
        }

        this.input.setCueBall(this.game.cueBall);
        // Note: canShoot is set by handleStateChange based on game state
        this.input.resetSpin();

        this.ui.showGameHUD(mode, this.game.getMatchInfo());

        // Hide loading spinner after everything is ready
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    async applyCustomBallSet(ballSet) {
        if (!ballSet || !this.game.balls) return;

        const ballSetManager = this.ui.ballSetManager;

        for (const ball of this.game.balls) {
            if (ball.isSnookerBall) continue; // Don't modify snooker balls

            const config = ballSetManager.getBallConfig(ballSet, ball.number);
            if (!config) continue;

            ball.color = config.color;
            ball.isStripe = config.isStripe;
            ball.isUKBall = config.isUKBall && !ball.isEightBall;
            ball.showNumber = config.showNumber;

            // Apply stripe and number styling options
            ball.stripeBackgroundColor = config.stripeBackgroundColor || null;
            ball.numberCircleColor = config.numberCircleColor || null;
            ball.numberTextColor = config.numberTextColor || null;
            ball.numberBorder = config.numberBorder || false;
            ball.numberBorderColor = config.numberBorderColor || null;
            ball.numberCircleRadialLines = config.numberCircleRadialLines || 0;
            ball.stripeThickness = config.stripeThickness ?? 0.55;
            ball.numberCircleRadius = config.numberCircleRadius ?? 0.66;
        }

        // Progress callback for loading bar
        const progressBar = document.getElementById('loading-progress-bar');
        const progressText = document.getElementById('loading-progress-text');
        const progressCallback = (progress) => {
            if (progressBar) progressBar.style.width = `${progress}%`;
            if (progressText) progressText.textContent = `${Math.round(progress)}%`;
        };

        // Pre-generate frames for custom ball set (do NOT clear cache - reuse cached frames when possible)
        await this.renderer.ballRenderer3D.precacheBallSet(this.game.balls, progressCallback);
    }

    playAgain() {
        // Clear saved match since we're starting fresh
        this.clearSavedMatch();

        // Use stored mode (which may have been modified from original selection)
        const mode = this.lastGameMode || this.game.mode;

        // Reset match scores for a new match
        const options = { ...(this.lastGameOptions || {}) };
        delete options.resumeMatch; // Ensure we're not resuming

        this.startGame(mode, options);
    }

    returnToMenu() {
        // Save match if it's a multi-frame match in progress
        if (this.game.match.bestOf > 1 &&
            this.game.state !== GameState.GAME_OVER &&
            this.game.mode !== GameMode.FREE_PLAY) {
            this.saveMatch();
        }

        this.game.state = GameState.MENU;
        this.ui.showMainMenu();
        this.input.setCanShoot(false);
    }

    animateBallsUpright() {
        // Animate all balls to face up (travelAngle = 0)
        if (this.game.state === GameState.GAME_OVER) return;

        for (const ball of this.game.balls) {
            if (!ball.pocketed) {
                ball.resetRotation();
            }
        }
    }

    concedeFrame() {
        // Concede the current frame in snooker
        if (this.game.mode !== GameMode.SNOOKER) return;
        if (this.game.state === GameState.GAME_OVER) return;

        // Set winner to the other player
        this.game.winner = this.game.currentPlayer === 1 ? 2 : 1;
        this.game.gameOverReason = 'Frame conceded';
        this.game.endGame();
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
        const spinFactor = spin.y * 5; 

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

            // Dynamic nomination for snooker when targeting a color
            if (this.game.mode === GameMode.SNOOKER &&
                this.game.snookerTarget === 'color' &&
                this.trajectory && this.trajectory.firstHit) {
                // Find the ball that would be hit first
                const hitBallNum = this.trajectory.firstHit.targetBallNumber;
                const hitBall = this.game.balls.find(b => b.number === hitBallNum);

                if (hitBall && hitBall.isColor && hitBall.colorName) {
                    // Automatically nominate the color we're aiming at
                    this.game.setNominatedColor(hitBall.colorName);
                }
            }
        }
    }

    placeCueBall(position) {
        // Determine placement mode based on game type
        let placementMode = 'anywhere';
        if (this.game.mode === GameMode.SNOOKER) {
            placementMode = 'dzone';
        } else if (this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL) {
            placementMode = 'kitchen';
        }

        if (this.game.canPlaceCueBall(position, placementMode)) {
            this.game.placeCueBall(position, placementMode);
            this.input.exitBallInHandMode();
            this.input.setCanShoot(true);
            this.input.resetSpin();
        }
    }

    handleStateChange(state) {
        this.ui.updateFromGameInfo(this.game.getGameInfo());

        // Check if it's AI's turn
        const isAITurn = this.ai.enabled && this.game.currentPlayer === 2;

        if (state === GameState.BALL_IN_HAND) {
            // Determine placement mode based on game type
            // - Snooker: always D-zone
            // - UK 8-ball: always kitchen
            // - US 8-ball break: kitchen
            // - US 8-ball foul: anywhere
            // - 9-ball: anywhere
            let placementMode = 'anywhere';
            if (this.game.mode === GameMode.SNOOKER) {
                placementMode = 'dzone';
            } else if (this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL) {
                placementMode = 'kitchen';
            }

            // Find valid position based on mode
            let validPos;
            if (placementMode === 'dzone') {
                validPos = this.table.findValidDPosition(this.game.balls, this.table.center.y);
            } else if (placementMode === 'kitchen') {
                validPos = this.table.findValidKitchenPosition(this.game.balls, this.table.center.y);
            } else {
                validPos = this.table.findValidCueBallPosition(this.game.balls, this.table.center.y);
            }

            this.game.cueBall.setPosition(validPos.x, validPos.y);
            this.game.cueBall.pocketed = false;
            this.game.cueBall.sinking = false;
            this.game.cueBall.velocity.x = 0;
            this.game.cueBall.velocity.y = 0;

            // Disable shooting during ball placement (for both AI and human)
            this.input.setCanShoot(false);

            if (isAITurn) {
                // AI handles ball placement
                setTimeout(() => this.ai.takeTurn(), 300);
            } else {
                // Human player places ball
                this.input.enterBallInHandMode(this.game.cueBall, (pos) => {
                    return this.game.canPlaceCueBall(pos, placementMode);
                });
            }
        } else if (state === GameState.PLAYING) {
            this.input.exitBallInHandMode();

            // Auto-save match after each turn
            if (this.game.mode !== GameMode.FREE_PLAY) {
                this.saveMatch();
            }

            if (isAITurn) {
                // AI's turn to shoot
                this.input.setCanShoot(false);
                setTimeout(() => this.ai.takeTurn(), 300);
            } else {
                // Human player's turn
                this.input.setCanShoot(true);
            }
        } else if (state === GameState.AWAITING_DECISION) {
            // Snooker: waiting for opponent's decision after foul
            this.input.setCanShoot(false);

            // The decision callback will be triggered from game.js via onFoulDecision
            // which shows the UI panel (human) or auto-decides (AI)
        }
    }

    handleFoul(reason, isMiss = false) {
        this.ui.showFoul(reason, isMiss);
        this.audio.playScratch();
    }

    handleGameOver(winner, reason, match) {
        this.ui.showGameOverWithMatch(winner, reason, match);
        this.input.setCanShoot(false);

        // Clear saved match if match is complete or single frame
        if (!match || match.matchComplete || match.bestOf === 1) {
            this.clearSavedMatch();
        }

        if (winner) {
            this.audio.playWin();
        }
    }

    handleBallPocketed(_ball) {
        // Additional handling if needed
    }

    // Handle snooker foul decision request
    handleSnookerFoulDecision(foulInfo) {
        // The decision maker is the OPPONENT of the player who fouled
        // At this point, currentPlayer is still the fouling player
        const foulingPlayer = this.game.currentPlayer;
        const decisionMaker = foulingPlayer === 1 ? 2 : 1;
        const isAIDecision = this.ai.enabled && decisionMaker === 2;

        if (isAIDecision) {
            // AI makes the decision
            setTimeout(() => {
                const decision = this.ai.makeSnookerFoulDecision(foulInfo);
                // Show what the AI decided
                const decisionText = this.getDecisionText(decision);
                this.ui.showMessage(`Decision: ${decisionText}`, 3000);
                this.applySnookerDecision(decision);
            }, 500);
        } else {
            // Human player makes the decision via UI
            this.ui.showDecisionPanel(foulInfo);
        }
    }

    // Get readable text for a snooker foul decision
    getDecisionText(decision) {
        switch (decision) {
            case 'play':
                return 'Play on';
            case 'free_ball':
                return 'Free ball';
            case 'replay':
                return 'Pass turn';
            case 'restore':
                return 'Pass and replace';
            default:
                return decision;
        }
    }

    // Apply the chosen snooker foul decision
    applySnookerDecision(decision) {
        this.ui.hideDecisionPanel();
        this.game.applySnookerDecision(decision);
    }

    // Handle request for color nomination (when shooting without aiming at a color)
    handleNominationRequired() {
        const isAITurn = this.ai.enabled && this.game.currentPlayer === 2;

        if (isAITurn) {
            // AI nominates a color (default to highest available)
            const nomination = this.ai.chooseColorNomination(this.game.balls);
            this.handleColorNomination(nomination);
        } else {
            // Human player nominates via modal
            this.ui.showNominationModal();
        }
    }

    // Handle color nomination from UI or AI
    handleColorNomination(colorName) {
        this.ui.hideNominationModal();
        this.game.setNominatedColor(colorName);
    }

    // Handle free ball awarded (after foul leaves player snookered)
    handleFreeBallAwarded() {
        const isAITurn = this.ai.enabled && this.game.currentPlayer === 2;

        if (isAITurn) {
            // AI nominates the best free ball
            this.ai.nominateFreeBall();
        } else {
            // Human player selects via modal
            this.ui.showFreeBallNominationModal(this.game.balls);
        }
    }

    // Handle free ball nomination from UI
    handleFreeBallNomination(ball) {
        this.ui.hideFreeBallNominationModal();
        this.game.setFreeBallNomination(ball);
    }

    // Handle free ball nominated (callback from game)
    handleFreeBallNominated(ball) {
        // Update UI to show which ball was nominated as free ball
        if (ball && ball.colorName) {
            this.ui.updateNominatedColor(ball.colorName);
        }
    }

    // Handle miss warning (2 consecutive misses - 3rd will forfeit frame)
    handleMissWarning(player) {
        this.ui.showMessage(`Warning: Player ${player} has 2 consecutive misses. One more will forfeit the frame!`, 5000);
    }

    // Start the next frame in a match
    startNextFrame() {
        // Reset physics for new frame
        this.physics.reset();

        // Get the selected ball set
        const selectedBallSet = this.ui.getSelectedBallSet();
        const mode = this.game.mode;

        // Randomize who breaks for new frame when AI is enabled - BEFORE starting frame
        const options = {};
        if (this.ai.enabled) {
            options.startingPlayer = AI.randomizeBreak();
        }

        // Create new balls in game
        this.game.startNextFrame(options);

        // Re-apply custom ball set if needed
        if (selectedBallSet && !selectedBallSet.isPredefined && mode !== GameMode.SNOOKER) {
            this.applyCustomBallSet(selectedBallSet);
        }

        // Sync new balls to physics
        this.physics.syncBallsToPlanck(this.game.balls);

        this.input.setCueBall(this.game.cueBall);
        this.input.resetSpin();

        // Hide game over screen and show HUD
        this.ui.gameOverScreen.classList.add('hidden');
        this.ui.gameHud.classList.remove('hidden');

        // Update HUD with new frame info
        this.ui.updateFromGameInfo(this.game.getGameInfo());

        // Save match state
        if (this.game.match.bestOf > 1) {
            this.saveMatch();
        }

        // AI turn is handled by handleStateChange callback from game.startNextFrame
    }

    // Save match state to localStorage
    saveMatch() {
        try {
            const data = this.game.serializeState();
            // Add ball set and table info
            data.ballSetId = this.lastGameOptions?.ballSetId || 'american';
            data.tableStyle = this.ui.getSelectedTable();

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save match:', e);
        }
    }

    // Load saved match from localStorage
    loadSavedMatch() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load saved match:', e);
        }
        return null;
    }

    // Clear saved match from localStorage
    clearSavedMatch() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn('Failed to clear saved match:', e);
        }
    }

    // Resume a saved match
    resumeMatch() {
        const savedData = this.loadSavedMatch();
        if (!savedData) {
            console.warn('No saved match to resume');
            return;
        }

        this.audio.init();
        this.physics.reset();

        // Restore table style
        if (savedData.tableStyle) {
            this.ui.selectTable(savedData.tableStyle);
        }

        // Get ball set (try to find saved one, fall back to selected)
        let ballSet = this.ui.getSelectedBallSet();
        if (savedData.ballSetId) {
            const savedSet = this.ui.ballSetManager.getSet(savedData.ballSetId);
            if (savedSet) {
                ballSet = savedSet;
                this.ui.selectedBallSet = savedSet;
            }
        }

        // Start game with resume flag
        const options = {
            resumeMatch: true,
            colorScheme: savedData.ukColorScheme || 'red-yellow',
            ballSetId: savedData.ballSetId
        };

        // Start game to create balls
        this.game.startGame(savedData.gameMode, options);

        // Restore full state from saved data
        this.game.restoreState(savedData);

        // Apply custom ball colors
        if (ballSet && !ballSet.isPredefined && savedData.gameMode !== GameMode.SNOOKER) {
            this.applyCustomBallSet(ballSet);
        }

        // Sync physics with restored ball positions
        this.physics.syncBallsToPlanck(this.game.balls);

        this.lastGameOptions = options;
        this.lastGameMode = savedData.gameMode;

        // Setup AI if enabled (not for Free Play mode)
        const aiEnabled = this.ui.getAIEnabled() && savedData.gameMode !== GameMode.FREE_PLAY;
        this.ai.setEnabled(aiEnabled);
        this.ai.setDifficulty(this.ui.getAIDifficulty());
        this.ai.setGameReferences(this.game, this.table);

        this.input.setCueBall(this.game.cueBall);
        this.input.resetSpin();

        // Check if it's AI's turn after resume
        if (aiEnabled && this.game.currentPlayer === 2) {
            this.input.setCanShoot(false);
        } else {
            this.input.setCanShoot(true);
        }

        this.ui.showGameHUD(savedData.gameMode, this.game.getMatchInfo());
        this.ui.updateFromGameInfo(this.game.getGameInfo());

        // Trigger AI turn if needed
        if (aiEnabled && this.game.currentPlayer === 2) {
            setTimeout(() => this.ai.takeTurn(), 500);
        }
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

            // Track balls hit by cue ball for AI shot tracking
            let cueBallHitTarget = null;

            for (const event of events) {
                if (event.type === 'ball') {
                    this.game.onBallCollision(event.ballA, event.ballB);

                    // Track for AI shot data collection
                    if (this.ai.pendingShot) {
                        if (event.ballA.isCueBall && !event.ballB.isCueBall) {
                            cueBallHitTarget = event.ballB;
                        } else if (event.ballB.isCueBall && !event.ballA.isCueBall) {
                            cueBallHitTarget = event.ballA;
                        }
                    }
                } else if (event.type === 'pocket') {
                    this.game.onBallPocket(event.ball);
                }
            }

            // Record AI shot collision data (after physics resolves velocities)
            if (cueBallHitTarget && this.ai.pendingShot) {
                const velocity = this.physics.getBallVelocity(cueBallHitTarget);
                if (velocity) {
                    this.ai.recordShotCollision(cueBallHitTarget, velocity);
                }
            }

            if (!this.physics.areBallsMoving(this.game.balls)) {
                this.game.onBallsStopped();
                this.input.resetSpin();
                this.ai.clearVisualization(); // Clear AI overlay when shot completes
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

        // Show D-zone for snooker ball-in-hand
        const showDZone = this.game.state === GameState.BALL_IN_HAND &&
                          this.game.mode === GameMode.SNOOKER;

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
            showSpinIndicator: canShoot,
            aiVisualization: this.ai.getVisualization(),
            showDZone: showDZone
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

        // Determine placement mode for validation
        let placementMode = 'anywhere';
        if (this.game.mode === GameMode.SNOOKER) {
            placementMode = 'dzone';
        } else if (this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL) {
            placementMode = 'kitchen';
        }

        const isValid = this.game.canPlaceCueBall(mousePos, placementMode);

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

    // Expose AI shot tracking helpers on window for easy console access
    window.aiShotTracker = {
        getShotHistory: () => window.poolGame.ai.getShotHistory(),
        clearHistory: () => window.poolGame.ai.clearShotHistory(),
        downloadJSON: () => window.poolGame.ai.downloadShotData('json'),
        downloadCSV: () => window.poolGame.ai.downloadShotData('csv'),
        exportJSON: () => window.poolGame.ai.exportShotDataJSON(),
        exportCSV: () => window.poolGame.ai.exportShotDataCSV(),
        help: () => console.log(`
AI Shot Tracker Commands:
  aiShotTracker.getShotHistory()  - Get array of all recorded shots
  aiShotTracker.clearHistory()    - Clear all recorded data
  aiShotTracker.downloadJSON()    - Download data as JSON file
  aiShotTracker.downloadCSV()     - Download data as CSV file
  aiShotTracker.exportJSON()      - Get JSON string (for copy/paste)
  aiShotTracker.exportCSV()       - Get CSV string (for copy/paste)

Each shot record contains:
  - intendedAngle: angle from target ball to pocket aim point (degrees)
  - actualAngle: actual angle the ball traveled (degrees)
  - angleError: difference between intended and actual (degrees)
  - power: shot power used
  - spinY: vertical spin applied (positive = topspin, negative = backspin)
  - cutAngle: the cut angle of the shot (degrees)
  - cueBallToTargetDist: distance from cue ball to target ball (pixels)
  - difficulty: AI difficulty setting
  - targetBallVelocity: {x, y} velocity vector after collision
        `)
    };

    console.log('[AI Shot Tracker] Ready! Type aiShotTracker.help() for commands.');

    // Keyboard shortcut to toggle 3D ball rendering (press '3')
    document.addEventListener('keydown', (e) => {
        if (e.key === '3') {
            const renderer = window.poolGame.renderer;
            renderer.use3DBalls = !renderer.use3DBalls;
            console.log(`3D ball rendering: ${renderer.use3DBalls ? 'ON' : 'OFF'}`);
        }
    });
});
