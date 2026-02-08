// Game logic - manages game state, rules, turns, and win conditions

import { Vec2, Constants } from './utils.js';
import { Ball, createBallSet, createSnookerBallSet, createFullSnookerBallSet, rackBalls, positionSnookerBalls, positionFullSnookerBalls, RackPatterns } from './ball.js';

export const GameMode = {
    EIGHT_BALL: '8ball',
    NINE_BALL: '9ball',
    UK_EIGHT_BALL: 'uk8ball',
    FREE_PLAY: 'freeplay',
    SNOOKER: 'snooker'
};

export const GameState = {
    MENU: 'menu',
    PLAYING: 'playing',
    BALLS_MOVING: 'balls_moving',
    BALL_IN_HAND: 'ball_in_hand',
    AWAITING_DECISION: 'awaiting_decision',  // Snooker: waiting for opponent's decision after foul
    GAME_OVER: 'game_over'
};

export class Game {
    constructor(table) {
        this.table = table;

        // Game mode and state
        this.mode = null;
        this.state = GameState.MENU;
        this.tableStyle = 1; // Track current table style for full snooker detection

        // Players
        this.currentPlayer = 1;
        this.player1Group = null;  // 'solid' or 'stripe'
        this.player2Group = null;

        // Balls
        this.balls = [];
        this.cueBall = null;

        // Turn tracking
        this.isBreakShot = true;
        this.firstBallHit = null;
        this.ballsPocketed = [];
        this.foul = false;
        this.foulReason = '';
        this.turnContinues = false;

        // Cushion contact tracking (for US 8-ball and 9-ball rules)
        this.railContactAfterHit = false;
        this.ballPottedThisShot = false;

        // 9-ball specific
        this.lowestBall = 1;
        this.pushOutAvailable = false;
        this.isPushOut = false;
        this.pushOutPending = null;  // 'offer' or 'response'
        this.consecutiveFouls = { 1: 0, 2: 0 };

        // UK 8-ball specific
        this.ukColorScheme = 'red-yellow';  // 'red-yellow' or 'blue-yellow'
        this.twoShotRule = false;           // Whether opponent gets two shots
        this.shotsRemaining = 1;            // Shots remaining in current turn
        this.isFreeShot = false;            // First shot after foul is "free"

        // Snooker specific
        this.player1Score = 0;
        this.player2Score = 0;
        this.currentBreak = 0;
        this.highestBreak = 0;
        this.snookerTarget = 'red';         // 'red', 'color', or specific color name
        this.colorsPhase = false;           // True when potting colors in order
        this.nextColorInSequence = 'yellow';
        this.colorSequence = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];

        // Snooker WPBSA rules - Foul and a Miss
        this.preShotState = null;           // Serialized state before shot for Miss rule restoration
        this.foulPenalty = 0;               // Points awarded to opponent on foul
        this.missRuleApplies = false;       // True if "Miss" can be called (didn't hit ball on)
        this.nominatedColor = null;         // Currently nominated color when target is 'color'
        this.consecutiveMisses = 0;         // Track consecutive misses (3 = frame forfeit)
        this.wasSnookeredBeforeShot = false; // Track if player was snookered before taking shot
        this.pendingFoulDecision = null;    // Stores foul info while awaiting decision

        // Free ball rule
        this.isFreeBall = false;            // True when free ball is in effect
        this.freeBallNomination = null;     // The ball nominated as free ball

        // Snooker match stats (persist across frames)
        this.snookerStats = this.createEmptyStats();

        // Match state (frame scoring)
        this.match = {
            bestOf: 1,
            player1Frames: 0,
            player2Frames: 0,
            currentFrame: 1,
            matchWinner: null,
            matchComplete: false
        };

        // Game over
        this.winner = null;
        this.gameOverReason = '';

        // Callbacks
        this.onStateChange = null;
        this.onTurnChange = null;
        this.onFoul = null;
        this.onGameOver = null;
        this.onBallPocketed = null;
        this.onFrameWon = null;
        this.onMatchWon = null;
        this.onFoulDecision = null;         // Snooker: callback for foul decision UI
        this.onNominationRequired = null;   // Snooker: callback when nomination is needed
        this.onNominationChange = null;     // Snooker: callback when nominated color changes
        this.onFreeBallAwarded = null;      // Snooker: callback when free ball is awarded
        this.onFreeBallNominated = null;    // Snooker: callback when free ball nomination is made
        this.onMissWarning = null;          // Snooker: callback when player has 2 consecutive misses (warning before frame forfeit)
        this.onPushOutOffer = null;         // 9-ball: callback when push-out is available after break
        this.onPushOutResponse = null;      // 9-ball: callback when opponent decides after push-out
    }

    // Initialize match with bestOf format
    initMatch(bestOf = 1, firstFrameBreaker = 1) {
        this.match = {
            bestOf: bestOf,
            player1Frames: 0,
            player2Frames: 0,
            currentFrame: 1,
            matchWinner: null,
            matchComplete: false,
            firstFrameBreaker: firstFrameBreaker  // Track who broke frame 1 for alternation
        };
    }

    // Start a new game
    startGame(mode, options = {}) {
        this.mode = mode;
        this.state = GameState.BALL_IN_HAND;  // Start with cue ball placement for break
        this.currentPlayer = options.startingPlayer || 1;
        this.player1Group = null;
        this.player2Group = null;
        this.isBreakShot = true;
        this.foul = false;
        this.winner = null;
        this.lowestBall = 1;
        this.pushOutAvailable = false;
        this.isPushOut = false;
        this.pushOutPending = null;
        this.consecutiveFouls = { 1: 0, 2: 0 };

        // UK 8-ball options
        this.ukColorScheme = options.colorScheme || 'red-yellow';
        this.twoShotRule = false;
        this.shotsRemaining = 1;
        this.isFreeShot = false;

        // Snooker state reset
        this.player1Score = 0;
        this.player2Score = 0;
        this.currentBreak = 0;
        this.highestBreak = 0;
        this.snookerTarget = 'red';
        this.colorsPhase = false;
        this.nextColorInSequence = 'yellow';
        this.consecutiveMisses = 0;
        this.wasSnookeredBeforeShot = false;

        // Reset match stats for new match
        this.snookerStats = this.createEmptyStats();

        // Initialize match if bestOf provided in options
        if (options.bestOf !== undefined) {
            // Track who breaks the first frame for alternation in subsequent frames
            this.initMatch(options.bestOf, options.startingPlayer || 1);
        } else if (options.resumeMatch) {
            // Match state will be restored from saved data
        } else {
            // Single frame game
            this.initMatch(1, options.startingPlayer || 1);
        }

        // Create balls based on game mode
        const tableConfig = Constants.TABLE_CONFIGS ? Constants.TABLE_CONFIGS[this.tableStyle] : null;
        const tableBallRadius = (tableConfig && tableConfig.ballRadius) ? tableConfig.ballRadius : null;

        if (mode === GameMode.SNOOKER) {
            // Check if using full-size snooker table (table style 9)
            if (tableConfig && tableConfig.isSnooker && tableConfig.redCount === 15) {
                this.balls = createFullSnookerBallSet(tableConfig.ballRadius);
            } else {
                this.balls = createSnookerBallSet();
            }
        } else {
            // All 8-ball and 9-ball modes use standard ball set
            // (custom ball sets are applied later in main.js)
            this.balls = createBallSet();
        }

        // Apply table-specific ball radius to all balls (for tables like full-size snooker)
        if (tableBallRadius) {
            for (const ball of this.balls) {
                ball.radius = tableBallRadius;
            }
        }

        this.cueBall = this.balls.find(b => b.number === 0);

        // Rack balls based on game mode
        this.rackBalls();

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Set the table style (called before startGame to configure ball/pocket sizes)
    setTableStyle(tableStyle) {
        this.tableStyle = tableStyle;
    }

    rackBalls() {
        const center = this.table.center;
        // Use table-specific ball radius if available
        const tableConfig = Constants.TABLE_CONFIGS[this.tableStyle];
        const ballRadius = tableConfig?.ballRadius || Constants.BALL_RADIUS;

        if (this.mode === GameMode.EIGHT_BALL) {
            rackBalls(this.balls, RackPatterns.eightBall, center, ballRadius);
        } else if (this.mode === GameMode.NINE_BALL) {
            // For 9-ball, only use balls 1-9
            this.balls = this.balls.filter(b => b.number <= 9);
            this.cueBall = this.balls.find(b => b.number === 0);
            rackBalls(this.balls, RackPatterns.nineBall, center, ballRadius);
        } else if (this.mode === GameMode.UK_EIGHT_BALL) {
            rackBalls(this.balls, RackPatterns.ukEightBall, center, ballRadius);
        } else if (this.mode === GameMode.SNOOKER) {
            // Use full snooker positioning for table 9
            if (tableConfig && tableConfig.isSnooker && tableConfig.redCount === 15) {
                positionFullSnookerBalls(this.balls, center, ballRadius, tableConfig.spotlocations);
            } else {
                positionSnookerBalls(this.balls, center, ballRadius, tableConfig.spotlocations);
            }
        } else {
            // Free play - standard 8-ball rack
            rackBalls(this.balls, RackPatterns.eightBall, center, ballRadius);
        }
    }

    // Re-rack for free play
    rerack() {
        if (this.mode !== GameMode.FREE_PLAY) return;

        // Put game back in a ready-to-shoot state
        this.state = GameState.PLAYING;
        this.isBreakShot = false;

        // Clear shot bookkeeping (prevents any "stuck" shot logic elsewhere)
        this.firstBallHit = null;
        this.ballsPocketed = [];
        this.foul = false;
        this.foulReason = '';
        this.turnContinues = false;

        // Hard reset all balls (visual + pocketing + motion + physics sync)
        for (const ball of this.balls) {
            ball.pocketed = false;
            ball.sinking = false;
            ball.sinkProgress = 0;
            ball.sinkPocket = null;

            // stop motion
            ball.velocity = Vec2.create(0, 0);

            // reset spin / sliding / visuals that can make it look "not stopped"
            ball.spin = { x: 0, y: 0 };
            ball.spinZ = 0;
            ball.isSliding = false;

            ball.rotation = 0;
            ball.rollAngle = 0;
            ball.travelAngle = 0;
            ball.displayRoll = 0;
            ball.isRolling = false;
            ball.shouldResetRotation = false;

            // IMPORTANT: tell physics layer to accept new state immediately
            ball.forceSync = true;
        }

        // Reposition balls into the rack (this also sets pocketed/sinking false)
        this.rackBalls();

        // After repositioning, force sync again because positions changed
        for (const ball of this.balls) {
            ball.velocity = Vec2.create(0, 0);
            ball.forceSync = true;
        }

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Process a shot
    onShotTaken() {
        // Capture state BEFORE shot for Miss rule (snooker only)
        if (this.mode === GameMode.SNOOKER) {
            this.preShotState = this.serializeState();
            // Track if player was snookered before shot (for 3 miss rule)
            // Miss rule only applies if player had a clear shot available
            this.wasSnookeredBeforeShot = this.isPlayerSnookered();

            // Track shot count for stats
            const playerKey = this.currentPlayer === 1 ? 'player1' : 'player2';
            this.snookerStats[playerKey].totalShots++;
        }

        this.state = GameState.BALLS_MOVING;
        this.firstBallHit = null;
        this.ballsPocketed = [];
        this.foul = false;
        this.foulReason = '';
        this.turnContinues = false;
        this.railContactAfterHit = false;
        this.ballPottedThisShot = false;
    }

    // Called when a ball collision occurs
    onBallCollision(ballA, ballB) {
        // Track first ball hit by cue ball
        if (this.firstBallHit === null) {
            if (ballA.isCueBall && !ballB.isCueBall) {
                this.firstBallHit = ballB;
            } else if (ballB.isCueBall && !ballA.isCueBall) {
                this.firstBallHit = ballA;
            }
        }
    }

    // Called when a ball hits a rail cushion
    onRailContact(ball) {
        // Only counts after cue ball has hit an object ball
        if (this.firstBallHit !== null) {
            this.railContactAfterHit = true;
        }
    }

    // Called when a ball is pocketed
    onBallPocket(ball) {
        this.ballsPocketed.push(ball);
        this.ballPottedThisShot = true;

        if (this.onBallPocketed) {
            this.onBallPocketed(ball);
        }
    }

    // Called when all balls stop moving
    onBallsStopped() {
        // Trigger face-up animation for all balls at turn end
        for (const ball of this.balls) {
            //ball.resetRotation();
        }

        if (this.mode === GameMode.FREE_PLAY) {
            this.state = GameState.PLAYING;
            if (this.onStateChange) {
                this.onStateChange(this.state);
            }
            return;
        }

        // Check for cue ball scratch
        this.wasScratched = false;
        if (this.cueBall.pocketed) {
            this.foul = true;
            this.wasScratched = true;
            this.foulReason = 'Scratch - Cue ball pocketed';
            this.cueBall.pocketed = false;
            this.cueBall.sinking = false;
        }

        // Evaluate the shot based on game mode
        if (this.mode === GameMode.EIGHT_BALL) {
            this.evaluateEightBallShot();
        } else if (this.mode === GameMode.NINE_BALL) {
            this.evaluateNineBallShot();
        } else if (this.mode === GameMode.UK_EIGHT_BALL) {
            this.evaluateUKEightBallShot();
        } else if (this.mode === GameMode.SNOOKER) {
            this.evaluateSnookerShot();
            return; // Snooker handles its own state changes
        }

        // 9-ball push-out: if a push-out response is pending, pause for decision
        if (this.pushOutPending === 'response') {
            // Switch to opponent for their decision
            this.switchPlayer();
            this.state = GameState.AWAITING_DECISION;
            this.isBreakShot = false;
            if (this.onPushOutResponse) {
                this.onPushOutResponse();
            }
            if (this.onStateChange) {
                this.onStateChange(this.state);
            }
            return;
        }

        // 9-ball push-out offer: after break, offer push-out to incoming player
        if (this.mode === GameMode.NINE_BALL && this.pushOutAvailable && this.isBreakShot) {
            // The push-out offer happens after the normal turn change flow below
            this.pushOutPending = 'offer';
        }

        // 9-ball: Track consecutive fouls (3 = loss)
        if (this.mode === GameMode.NINE_BALL) {
            if (this.foul) {
                this.consecutiveFouls[this.currentPlayer]++;
                if (this.consecutiveFouls[this.currentPlayer] >= 3) {
                    this.winner = this.currentPlayer === 1 ? 2 : 1;
                    this.gameOverReason = 'Three consecutive fouls';
                    if (this.onFoul) {
                        this.onFoul(this.foulReason);
                    }
                    this.endGame();
                    return;
                }
            } else {
                this.consecutiveFouls[this.currentPlayer] = 0;
            }
        }

        // Handle foul - UK 8-ball uses two-shot rule
        if (this.foul) {
            if (this.mode === GameMode.UK_EIGHT_BALL) {
                this.switchPlayer();
                this.twoShotRule = true;
                this.shotsRemaining = 2;
                this.isFreeShot = true;  // First shot is free (can't lose turn)

                // UK rules: only ball in hand (behind the line) for scratch
                if (this.wasScratched) {
                    this.state = GameState.BALL_IN_HAND;
                } else {
                    // Non-scratch foul: ball stays where it is
                    this.state = GameState.PLAYING;
                }
            } else {
                this.switchPlayer();  // Opponent gets ball in hand
                this.state = GameState.BALL_IN_HAND;
            }
            if (this.onFoul) {
                let foulMsg = this.foulReason;
                if (this.mode === GameMode.UK_EIGHT_BALL) {
                    foulMsg += ' - 2 shots';
                } else if (this.mode === GameMode.NINE_BALL) {
                    // After switchPlayer, the fouling player is the OTHER player
                    const foulingPlayer = this.currentPlayer === 1 ? 2 : 1;
                    if (this.consecutiveFouls[foulingPlayer] === 2) {
                        foulMsg += ' - WARNING: 3rd foul loses the game!';
                    }
                }
                this.onFoul(foulMsg);
            }
        } else if (!this.turnContinues) {
            // UK 8-ball: check if we have shots remaining from two-shot rule
            if (this.mode === GameMode.UK_EIGHT_BALL && this.shotsRemaining > 1) {
                this.shotsRemaining--;
                this.isFreeShot = false;
                this.state = GameState.PLAYING;
            } else {
                this.switchPlayer();
                this.twoShotRule = false;
                this.shotsRemaining = 1;
                this.isFreeShot = false;
                this.state = GameState.PLAYING;
            }
        } else {
            // Turn continues - player potted their ball
            // In UK 8-ball, potting resets the two-shot advantage
            if (this.mode === GameMode.UK_EIGHT_BALL) {
                this.twoShotRule = false;
                this.shotsRemaining = 1;
                this.isFreeShot = false;
            }
            this.state = GameState.PLAYING;
        }

        this.isBreakShot = false;

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }

        // 9-ball: Trigger push-out offer after break settles
        if (this.pushOutPending === 'offer') {
            // Pause for push-out decision before the incoming player shoots
            this.state = GameState.AWAITING_DECISION;
            if (this.onPushOutOffer) {
                this.onPushOutOffer();
            }
            if (this.onStateChange) {
                this.onStateChange(this.state);
            }
        }
    }

    // 8-Ball shot evaluation - UPDATED to use Numbers (1-7 vs 9-15) instead of Visuals
    evaluateEightBallShot() {
        const cueBallPocketed = this.ballsPocketed.includes(this.cueBall);

        // Filter pocketed balls by Number Range (Generic for Spots/Stripes AND Reds/Yellows)
        // Group 1 (Solids/Reds) = 1-7
        // Group 2 (Stripes/Yellows) = 9-15
        const lowGroupPocketed = this.ballsPocketed.filter(b => b.number >= 1 && b.number <= 7);
        const highGroupPocketed = this.ballsPocketed.filter(b => b.number >= 9 && b.number <= 15);
        const eightBallPocketed = this.ballsPocketed.some(b => b.isEightBall);

        // Check for first ball hit foul
        if (!this.firstBallHit && !cueBallPocketed) {
            this.foul = true;
            this.foulReason = 'No ball hit';
        } else if (this.firstBallHit && this.player1Group) {
            // Groups assigned - check if correct ball was hit first
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            // Check if group was cleared BEFORE this shot (exclude balls just pocketed)
            const needsEightBall = this.isGroupCleared(currentGroup, true);

            if (needsEightBall) {
                // Must hit 8-ball first
                if (!this.firstBallHit.isEightBall) {
                    this.foul = true;
                    this.foulReason = 'Must hit 8-ball first';
                }
            } else {
                // Must hit own group first - hitting 8-ball or opponent's ball is a foul
                
                // Helper checks based on numbers
                const hitLow = this.firstBallHit.number >= 1 && this.firstBallHit.number <= 7;
                const hitHigh = this.firstBallHit.number >= 9 && this.firstBallHit.number <= 15;

                // 'solid' string maps to Low (1-7), 'stripe' string maps to High (9-15)
                const hitOwnGroup = (currentGroup === 'solid' && hitLow) ||
                                   (currentGroup === 'stripe' && hitHigh);
                                   
                if (!hitOwnGroup) {
                    this.foul = true;
                    if (this.firstBallHit.isEightBall) {
                        this.foulReason = 'Hit 8-ball before clearing group';
                    } else {
                        this.foulReason = 'Hit opponent\'s ball first';
                    }
                }
            }
        }

        // Cushion contact rule: after hitting a legal ball, at least one ball must
        // be potted or reach a cushion. Skip on break shots.
        if (!this.foul && !this.isBreakShot && this.firstBallHit &&
            !this.ballPottedThisShot && !this.railContactAfterHit) {
            this.foul = true;
            this.foulReason = 'No ball potted or reached a cushion';
        }

        // Handle 8-ball pocketed
        if (eightBallPocketed) {
            const eightBall = this.balls.find(b => b.isEightBall);
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            const groupCleared = currentGroup ? this.isGroupCleared(currentGroup) : false;

            if (this.isBreakShot) {
                // 8-ball on break - re-spot
                eightBall.pocketed = false;
                eightBall.setPosition(this.table.footSpot.x, this.table.footSpot.y);
            } else if (this.foul || cueBallPocketed || !groupCleared) {
                // Lose: pocketed 8-ball illegally
                this.winner = this.currentPlayer === 1 ? 2 : 1;
                this.gameOverReason = 'Pocketed 8-ball illegally';
                this.endGame();
                return;
            } else {
                // Win: pocketed 8-ball legally
                this.winner = this.currentPlayer;
                this.gameOverReason = 'Pocketed 8-ball!';
                this.endGame();
                return;
            }
        }

        // Assign groups if not yet assigned
        if (!this.player1Group && !this.isBreakShot) {
            // Logic: If Low (1-7) potted and High (9-15) NOT potted
            if (lowGroupPocketed.length > 0 && highGroupPocketed.length === 0) {
                const p1Group = this.currentPlayer === 1 ? 'solid' : 'stripe';
                this.assignGroups(p1Group);
                this.turnContinues = true;
            }
            // Logic: If High (9-15) potted and Low (1-7) NOT potted
            else if (highGroupPocketed.length > 0 && lowGroupPocketed.length === 0) {
                const p1Group = this.currentPlayer === 1 ? 'stripe' : 'solid';
                this.assignGroups(p1Group);
                this.turnContinues = true;
            }
            // Both groups potted (international rules)
            else if (lowGroupPocketed.length > 0 && highGroupPocketed.length > 0) {
                if (!this.foul && this.firstBallHit) {
                    // Assign group based on first ball hit
                    if (this.firstBallHit.number >= 1 && this.firstBallHit.number <= 7) {
                        const p1Group = this.currentPlayer === 1 ? 'solid' : 'stripe';
                        this.assignGroups(p1Group);
                    } else if (this.firstBallHit.number >= 9 && this.firstBallHit.number <= 15) {
                        const p1Group = this.currentPlayer === 1 ? 'stripe' : 'solid';
                        this.assignGroups(p1Group);
                    }
                    this.turnContinues = true;
                }
                // If foul: table remains open, no assignment
            }
        } else if (this.player1Group) {
            // Check if player pocketed their own ball
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            
            const pocketedOwn = (currentGroup === 'solid' && lowGroupPocketed.length > 0) ||
                               (currentGroup === 'stripe' && highGroupPocketed.length > 0);

            if (pocketedOwn && !this.foul) {
                this.turnContinues = true;
            }
        }

        // Legal break requirement: at least 3 object balls must be pocketed or
        // end up past the center line (kitchen side)
        if (this.isBreakShot && !this.foul) {
            const centerX = this.table.center.x;
            let count = 0;
            for (const ball of this.balls) {
                if (ball.isCueBall || ball.isEightBall) continue;
                if (ball.pocketed || ball.position.x < centerX) {
                    count++;
                }
            }
            if (count < 3) {
                this.foul = true;
                this.foulReason = 'Illegal break - fewer than 3 balls past center';
            }
        }

        // On break, continue if any ball pocketed (except cue ball)
        if (this.isBreakShot && this.ballsPocketed.length > 0 && !cueBallPocketed && !this.foul) {
            this.turnContinues = true;
        }
    }

    // 9-Ball shot evaluation
    evaluateNineBallShot() {
        const cueBallPocketed = this.ballsPocketed.includes(this.cueBall);
        const nineBall = this.balls.find(b => b.number === 9);
        const nineBallPocketed = this.ballsPocketed.includes(nineBall);

        // Push-out: skip all foul rules, no turn continuation
        if (this.isPushOut) {
            this.isPushOut = false;
            this.pushOutAvailable = false;

            // If cue ball was pocketed during push-out, respot it
            if (cueBallPocketed) {
                this.cueBall.pocketed = false;
                this.cueBall.sinking = false;
            }

            // If 9-ball was pocketed during push-out, respot it
            if (nineBallPocketed) {
                nineBall.pocketed = false;
                nineBall.sinking = false;
                nineBall.setPosition(this.table.footSpot.x, this.table.footSpot.y);
            }

            this.updateLowestBall();
            // Opponent decides: play from here or pass back
            this.pushOutPending = 'response';
            return; // onBallsStopped will handle the decision flow
        }

        // Check for first ball hit foul (before updating lowest ball)
        if (!this.firstBallHit && !cueBallPocketed) {
            this.foul = true;
            this.foulReason = 'No ball hit';
        } else if (this.firstBallHit && this.firstBallHit.number !== this.lowestBall) {
            // Must hit lowest numbered ball first
            this.foul = true;
            this.foulReason = `Must hit ${this.lowestBall}-ball first`;
        }

        // Cushion contact rule: after hitting lowest ball, at least one ball must
        // be potted or reach a cushion. Skip on break shots.
        if (!this.foul && !this.isBreakShot && this.firstBallHit &&
            !this.ballPottedThisShot && !this.railContactAfterHit) {
            this.foul = true;
            this.foulReason = 'No ball potted or reached a cushion';
        }

        // 9-ball pocketed legally - win condition
        if (nineBallPocketed && !this.foul && !cueBallPocketed) {
            this.winner = this.currentPlayer;
            this.gameOverReason = 'Pocketed the 9-ball!';
            this.endGame();
            return;
        }

        // 9-ball pocketed on foul - re-spot it
        if (nineBallPocketed && (this.foul || cueBallPocketed)) {
            nineBall.pocketed = false;
            nineBall.sinking = false;
            nineBall.setPosition(this.table.footSpot.x, this.table.footSpot.y);
        }

        // Update lowest ball after handling 9-ball respot
        this.updateLowestBall();

        // Continue turn if any ball pocketed legally
        if (this.ballsPocketed.length > 0 && !this.foul && !cueBallPocketed) {
            this.turnContinues = true;
        }

        // Push out available after break (for the incoming player's next shot)
        if (this.isBreakShot) {
            this.pushOutAvailable = true;
        }
    }

    // Apply push-out choice from the player whose turn it is
    applyPushOutChoice(choice) {
        this.pushOutPending = null;

        if (choice === 'pushout') {
            // Player chose to push out - mark next shot as push-out
            this.isPushOut = true;
            this.state = GameState.PLAYING;
            if (this.onStateChange) {
                this.onStateChange(this.state);
            }
        } else {
            // Player chose to play normal shot
            this.pushOutAvailable = false;
            this.state = GameState.PLAYING;
            if (this.onStateChange) {
                this.onStateChange(this.state);
            }
        }
    }

    // Apply push-out response (opponent decides after push-out was played)
    applyPushOutResponse(choice) {
        this.pushOutPending = null;

        if (choice === 'pass') {
            // Pass back to the player who pushed out
            this.switchPlayer();
        }
        // 'play' = current player plays from this position (no switch needed)

        this.state = GameState.PLAYING;
        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // UK 8-Ball shot evaluation
    evaluateUKEightBallShot() {
        const cueBallPocketed = this.ballsPocketed.includes(this.cueBall);

        // Filter pocketed balls by group
        const group1Pocketed = this.ballsPocketed.filter(b => b.isGroup1);
        const group2Pocketed = this.ballsPocketed.filter(b => b.isGroup2);
        const blackBallPocketed = this.ballsPocketed.some(b => b.isEightBall);

        // Check for first ball hit foul
        if (!this.firstBallHit && !cueBallPocketed) {
            this.foul = true;
            this.foulReason = 'No ball hit';
        } else if (this.firstBallHit && this.player1Group) {
            // Groups assigned - check if correct ball was hit first
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            // Check if group was cleared BEFORE this shot (exclude balls just pocketed)
            const needsBlackBall = this.isUKGroupCleared(currentGroup, true);

            if (needsBlackBall) {
                // Must hit black ball first
                if (!this.firstBallHit.isEightBall) {
                    this.foul = true;
                    this.foulReason = 'Must hit black ball first';
                }
            } else {
                // Must hit own group first - hitting black or opponent's ball is a foul
                const hitOwnGroup = (currentGroup === 'group1' && this.firstBallHit.isGroup1) ||
                                   (currentGroup === 'group2' && this.firstBallHit.isGroup2);
                if (!hitOwnGroup) {
                    this.foul = true;
                    if (this.firstBallHit.isEightBall) {
                        this.foulReason = 'Hit black before clearing group';
                    } else {
                        this.foulReason = 'Hit opponent\'s ball first';
                    }
                }
            }
        }

        // Handle black ball pocketed
        if (blackBallPocketed) {
            const blackBall = this.balls.find(b => b.isEightBall);
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            // UK rules: group must be cleared BEFORE this shot (can't pot last color and black together)
            const groupCleared = currentGroup ? this.isUKGroupCleared(currentGroup, true) : false;

            if (this.isBreakShot) {
                // Black on break - re-spot
                blackBall.pocketed = false;
                blackBall.setPosition(this.table.footSpot.x, this.table.footSpot.y);
            } else if (this.foul || cueBallPocketed || !groupCleared) {
                // Lose: pocketed black illegally
                this.winner = this.currentPlayer === 1 ? 2 : 1;
                this.gameOverReason = 'Pocketed black ball illegally';
                this.endGame();
                return;
            } else {
                // Win: pocketed black legally
                this.winner = this.currentPlayer;
                this.gameOverReason = 'Pocketed the black!';
                this.endGame();
                return;
            }
        }

        // Assign groups if not yet assigned
        if (!this.player1Group && !this.isBreakShot) {
            if (group1Pocketed.length > 0 && group2Pocketed.length === 0) {
                // If current player potted Group 1...
                // Player 1 gets Group 1 if they are playing, otherwise they get Group 2
                const p1Group = this.currentPlayer === 1 ? 'group1' : 'group2';
                this.assignUKGroups(p1Group);
                this.turnContinues = true;
            } else if (group2Pocketed.length > 0 && group1Pocketed.length === 0) {
                 // If current player potted Group 2...
                const p1Group = this.currentPlayer === 1 ? 'group2' : 'group1';
                this.assignUKGroups(p1Group);
                this.turnContinues = true;
            }
        } else if (this.player1Group) {
            // Check if player pocketed their own ball
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            const pocketedOwn = (currentGroup === 'group1' && group1Pocketed.length > 0) ||
                               (currentGroup === 'group2' && group2Pocketed.length > 0);

            if (pocketedOwn && !this.foul) {
                this.turnContinues = true;
            }
        }

        // On break, continue if any ball pocketed (except cue ball)
        if (this.isBreakShot && this.ballsPocketed.length > 0 && !cueBallPocketed) {
            this.turnContinues = true;
        }
    }

    // Assign groups for UK 8-ball
    assignUKGroups(player1Group) {
        this.player1Group = player1Group;
        this.player2Group = player1Group === 'group1' ? 'group2' : 'group1';

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Check if a UK group is cleared
    // If excludeJustPocketed is true, balls pocketed this turn are considered "not yet pocketed"
    // This is used to determine if the group was cleared BEFORE this shot
    isUKGroupCleared(group, excludeJustPocketed = false) {
        for (const ball of this.balls) {
            // Skip balls that were pocketed in previous turns
            if (ball.pocketed && !(excludeJustPocketed && this.ballsPocketed.includes(ball))) continue;
            // If excludeJustPocketed, treat just-pocketed balls as still on table
            if (excludeJustPocketed && this.ballsPocketed.includes(ball)) {
                // Ball was just pocketed - count it as still on table for this check
                if (group === 'group1' && ball.isGroup1) return false;
                if (group === 'group2' && ball.isGroup2) return false;
                continue;
            }
            if (group === 'group1' && ball.isGroup1) return false;
            if (group === 'group2' && ball.isGroup2) return false;
        }
        return true;
    }

    // Update the lowest remaining ball (9-ball)
    updateLowestBall() {
        let lowest = 9;
        for (const ball of this.balls) {
            if (!ball.pocketed && !ball.isCueBall && ball.number < lowest) {
                lowest = ball.number;
            }
        }
        this.lowestBall = lowest;
    }

    // Assign ball groups (8-ball)
    assignGroups(player1Group) {
        this.player1Group = player1Group;
        this.player2Group = player1Group === 'solid' ? 'stripe' : 'solid';

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Check if a group is cleared (8-ball) - UPDATED to use Numbers
    isGroupCleared(group, excludeJustPocketed = false) {
        for (const ball of this.balls) {
            // Skip balls that were pocketed in previous turns
            if (ball.pocketed && !(excludeJustPocketed && this.ballsPocketed.includes(ball))) continue;
            
            // If excludeJustPocketed, treat just-pocketed balls as still on table
            if (excludeJustPocketed && this.ballsPocketed.includes(ball)) {
                // Check numbers instead of isSolid/isStripe
                if (group === 'solid' && (ball.number >= 1 && ball.number <= 7)) return false;
                if (group === 'stripe' && (ball.number >= 9 && ball.number <= 15)) return false;
                continue;
            }
            
            // Standard check using numbers
            if (group === 'solid' && (ball.number >= 1 && ball.number <= 7)) return false;
            if (group === 'stripe' && (ball.number >= 9 && ball.number <= 15)) return false;
        }
        return true;
    }

    // Switch to other player
    switchPlayer() {
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

        // Reset consecutive misses when player changes (3 miss rule is per-player)
        this.consecutiveMisses = 0;

        if (this.onTurnChange) {
            this.onTurnChange(this.currentPlayer);
        }
    }

    // Place cue ball after scratch
    // placementMode: 'anywhere', 'kitchen', or 'dzone'
    placeCueBall(position, placementMode = 'kitchen') {
        if (!this.cueBall) return false;

        // Handle legacy boolean parameter (true = kitchen, false = anywhere)
        if (typeof placementMode === 'boolean') {
            placementMode = placementMode ? 'kitchen' : 'anywhere';
        }

        // Validate position based on placement mode
        if (placementMode === 'kitchen' && !this.table.isInKitchen(position.x, position.y)) {
            return false;
        } else if (placementMode === 'dzone' && !this.table.isInD(position.x, position.y)) {
            return false;
        }

        // Check for overlapping balls - use actual ball radius
        const checkRadius = this.cueBall.radius || Constants.BALL_RADIUS;
        for (const ball of this.balls) {
            if (ball === this.cueBall || ball.pocketed) continue;
            const dist = Vec2.distance(position, ball.position);
            if (dist < checkRadius + ball.radius + 2) {
                return false;
            }
        }

        this.cueBall.setPosition(position.x, position.y);
        this.cueBall.pocketed = false;
        this.cueBall.sinking = false;
        this.state = GameState.PLAYING;
        this.foul = false;

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }

        return true;
    }

    // Award a frame to a player
    awardFrame(winner) {
        if (winner === 1) {
            this.match.player1Frames++;
        } else if (winner === 2) {
            this.match.player2Frames++;
        }

        // Check for match winner
        const framesToWin = Math.ceil(this.match.bestOf / 2);
        if (this.match.player1Frames >= framesToWin) {
            this.match.matchWinner = 1;
            this.match.matchComplete = true;
        } else if (this.match.player2Frames >= framesToWin) {
            this.match.matchWinner = 2;
            this.match.matchComplete = true;
        }

        if (this.onFrameWon) {
            this.onFrameWon(winner, this.match);
        }

        if (this.match.matchComplete && this.onMatchWon) {
            this.onMatchWon(this.match.matchWinner, this.match);
        }
    }

    // Get match information for display
    getMatchInfo() {
        return {
            bestOf: this.match.bestOf,
            player1Frames: this.match.player1Frames,
            player2Frames: this.match.player2Frames,
            currentFrame: this.match.currentFrame,
            matchWinner: this.match.matchWinner,
            matchComplete: this.match.matchComplete
        };
    }

    // Start the next frame in a match
    startNextFrame(options = {}) {
        if (this.match.matchComplete) return;

        this.match.currentFrame++;

        // Alternate who breaks: odd frames = firstFrameBreaker, even frames = other player
        const frameNum = this.match.currentFrame;
        const firstBreaker = this.match.firstFrameBreaker || 1;
        const alternatingBreaker = (frameNum % 2 === 1) ? firstBreaker : (firstBreaker === 1 ? 2 : 1);

        // Reset frame state but keep match scores
        this.state = GameState.BALL_IN_HAND;
        this.currentPlayer = alternatingBreaker;
        this.player1Group = null;
        this.player2Group = null;
        this.isBreakShot = true;
        this.foul = false;
        this.foulReason = '';
        this.winner = null;
        this.gameOverReason = '';
        this.lowestBall = 1;
        this.pushOutAvailable = false;
        this.isPushOut = false;
        this.pushOutPending = null;
        this.consecutiveFouls = { 1: 0, 2: 0 };
        this.twoShotRule = false;
        this.shotsRemaining = 1;
        this.isFreeShot = false;

        // Snooker reset
        this.player1Score = 0;
        this.player2Score = 0;
        this.currentBreak = 0;
        this.snookerTarget = 'red';
        this.colorsPhase = false;
        this.nextColorInSequence = 'yellow';

        // Recreate balls based on game mode
        const tableConfig = Constants.TABLE_CONFIGS ? Constants.TABLE_CONFIGS[this.tableStyle] : null;
        const tableBallRadius = (tableConfig && tableConfig.ballRadius) ? tableConfig.ballRadius : null;

        if (this.mode === GameMode.SNOOKER) {
            if (tableConfig && tableConfig.isSnooker && tableConfig.redCount === 15) {
                this.balls = createFullSnookerBallSet(tableConfig.ballRadius);
            } else {
                this.balls = createSnookerBallSet();
            }
        } else {
            // All 8-ball and 9-ball modes use standard ball set
            this.balls = createBallSet();
        }

        // Apply table-specific ball radius
        if (tableBallRadius) {
            for (const ball of this.balls) {
                ball.radius = tableBallRadius;
            }
        }

        this.cueBall = this.balls.find(b => b.number === 0);

        // Rack balls
        this.rackBalls();

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // End the game
    endGame() {
        this.state = GameState.GAME_OVER;

        // Award frame to winner in match play
        if (this.winner && this.match.bestOf > 1) {
            this.awardFrame(this.winner);
        }

        if (this.onGameOver) {
            this.onGameOver(this.winner, this.gameOverReason, this.match);
        }

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Get remaining balls count for each group - UPDATED to use Numbers
    getRemainingBalls() {
        let solids = 0; // Represents 1-7
        let stripes = 0; // Represents 9-15

        for (const ball of this.balls) {
            if (ball.pocketed) continue;
            if (ball.number >= 1 && ball.number <= 7) solids++;
            if (ball.number >= 9 && ball.number <= 15) stripes++;
        }

        return { solids, stripes };
    }

    // Get current player's target group
    getCurrentPlayerGroup() {
        if (!this.player1Group) return null;
        return this.currentPlayer === 1 ? this.player1Group : this.player2Group;
    }

    // Check if cue ball can be placed at position
    // placementMode: 'anywhere', 'kitchen', or 'dzone'
    canPlaceCueBall(position, placementMode = 'kitchen') {
        // Handle legacy boolean parameter (true = kitchen, false = anywhere)
        if (typeof placementMode === 'boolean') {
            placementMode = placementMode ? 'kitchen' : 'anywhere';
        }

        // Check bounds
        if (!this.table.isOnTable(position.x, position.y)) {
            return false;
        }

        // Check placement restriction based on mode
        if (placementMode === 'kitchen' && !this.table.isInKitchen(position.x, position.y)) {
            return false;
        } else if (placementMode === 'dzone' && !this.table.isInD(position.x, position.y)) {
            return false;
        }

        // Check ball overlap - use actual ball radius (which may differ for full snooker)
        const checkRadius = this.cueBall?.radius || Constants.BALL_RADIUS;
        for (const ball of this.balls) {
            if (ball === this.cueBall || ball.pocketed) continue;
            const dist = Vec2.distance(position, ball.position);
            if (dist < checkRadius + ball.radius + 2) {
                return false;
            }
        }

        return true;
    }

    // Get game state info for UI
    getGameInfo() {
        // Filter out pocketed balls and the cue ball (0), then sort by number
        const onTable = this.balls
            .filter(b => !b.pocketed && b.number !== 0)
            .map(b => b.number)
            .sort((a, b) => a - b);
        const info = {
            mode: this.mode,
            state: this.state,
            currentPlayer: this.currentPlayer,
            player1Group: this.player1Group,
            player2Group: this.player2Group,
            isBreakShot: this.isBreakShot,
            foul: this.foul,
            foulReason: this.foulReason,
            winner: this.winner,
            gameOverReason: this.gameOverReason,
            lowestBall: this.lowestBall,
            remaining: this.getRemainingBalls(),
            // NEW: Explicit array of ball numbers for the 9-Ball UI Rail
            remainingBalls: onTable,
            // UK 8-ball specific
            ukColorScheme: this.ukColorScheme,
            shotsRemaining: this.shotsRemaining,
            twoShotRule: this.twoShotRule,
            remainingUK: this.getRemainingUKBalls(),
            // 9-ball consecutive fouls
            consecutiveFouls: this.consecutiveFouls,
            // Match info
            match: this.getMatchInfo()
        };

        // Add snooker info if in snooker mode
        if (this.mode === GameMode.SNOOKER) {
            info.player1Score = this.player1Score;
            info.player2Score = this.player2Score;
            info.currentBreak = this.currentBreak;
            info.highestBreak = this.highestBreak;
            info.snookerTarget = this.snookerTarget;
            info.colorsPhase = this.colorsPhase;
            info.remainingPoints = this.getSnookerRemainingPoints();
            info.pointsDeficit = this.getSnookerPointsDeficit();
            info.nominatedColor = this.nominatedColor;
            info.pendingFoulDecision = this.pendingFoulDecision;
            info.isFreeBall = this.isFreeBall;
            info.freeBallNomination = this.freeBallNomination;
            info.snookerStats = this.snookerStats;
        }

        return info;
    }

    // Get remaining balls count for UK 8-ball
    getRemainingUKBalls() {
        let group1 = 0;
        let group2 = 0;

        for (const ball of this.balls) {
            if (ball.pocketed) continue;
            if (ball.isGroup1) group1++;
            if (ball.isGroup2) group2++;
        }

        return { group1, group2 };
    }

    // Snooker shot evaluation
    // ==========================================
    // SNOOKER LOGIC IMPLEMENTATION (WPBSA Rules)
    // ==========================================

    evaluateSnookerShot() {
        // 1. Snapshot State
        const pocketed = [...this.ballsPocketed]; // Copy array
        const cueBallPocketed = this.cueBall.pocketed || this.wasScratched;
        const firstHit = this.firstBallHit;

        // 2. Determine Validity & Foul Status
        let isFoul = false;
        let foulValue = 0;
        let turnScore = 0;
        let isMiss = false;  // Track if "Miss" rule applies

        // -- Check A: Scratch (Cue Ball Potted) --
        if (cueBallPocketed) {
            isFoul = true;
            this.foulReason = 'Scratch - Cue ball pocketed';
        }

        // -- Check B: Air Shot (Miss) --
        else if (!firstHit) {
            isFoul = true;
            isMiss = true;
            this.foulReason = 'Foul - Miss (No ball hit)';
        }

        // -- Check C: Wrong First Ball Hit --
        else if (!this.isValidSnookerHit(firstHit)) {
            isFoul = true;
            isMiss = true;  // Hit wrong ball = Miss
            this.foulReason = `Foul - Hit wrong ball first (${firstHit.colorName || 'Red'})`;
        }

        // -- Check D: Illegal Pot (Check all potted balls) --
        if (!isFoul) {
            for (const b of pocketed) {
                if (b.isCueBall) continue;

                if (!this.isValidSnookerPot(b)) {
                    isFoul = true;
                    this.foulReason = `Foul - Potted wrong ball (${b.colorName || 'Red'})`;
                    break;
                }
            }
        }

        // 3. Calculate Foul Penalty (If any foul occurred)
        if (isFoul) {
            this.foul = true;
            // Penalty is Max(4, Value of Target, Value of First Hit, Value of any Potted Ball)
            let penalty = 4;

            // Target value (use nominated color if target is 'color')
            if (this.snookerTarget === 'color' && this.nominatedColor) {
                const values = { 'yellow': 2, 'green': 3, 'brown': 4, 'blue': 5, 'pink': 6, 'black': 7 };
                penalty = Math.max(penalty, values[this.nominatedColor] || 4);
            } else {
                penalty = Math.max(penalty, this.getCurrentTargetValue());
            }

            // First hit value (if exists)
            if (firstHit) penalty = Math.max(penalty, this.getSnookerBallValue(firstHit));

            // Potted balls value
            for (const b of pocketed) {
                penalty = Math.max(penalty, this.getSnookerBallValue(b));
            }

            foulValue = penalty;
        }

        // 4. Calculate Score (Only if NO foul)
        // Track if the free ball was potted (need to check before clearing state)
        const freeBallWasPotted = this.isFreeBall && this.freeBallNomination &&
            pocketed.includes(this.freeBallNomination);
        const pottedFreeBall = freeBallWasPotted ? this.freeBallNomination : null;

        if (!isFoul) {
            for (const b of pocketed) {
                if (b.isCueBall) continue;
                turnScore += this.getSnookerPotValue(b);  // Uses free ball scoring if applicable
            }
        }

        // Clear free ball state after shot (whether valid or foul)
        this.isFreeBall = false;
        this.freeBallNomination = null;

        // 5. Detect long pot attempt (before branching on foul/pot/safety)
        // A long pot attempt = first ball hit was far from cue ball at shot time
        let isLongPotAttempt = false;
        if (firstHit && this.preShotState) {
            const tableWidth = this.table.bounds.right - this.table.bounds.left;
            const longPotThreshold = tableWidth * 0.35;
            const cueBallPreShot = this.preShotState.balls.find(b => b.isCueBall);
            const hitBallPreShot = this.preShotState.balls.find(b => b.number === firstHit.number);
            if (cueBallPreShot && hitBallPreShot) {
                const dist = Vec2.distance(
                    { x: cueBallPreShot.x, y: cueBallPreShot.y },
                    { x: hitBallPreShot.x, y: hitBallPreShot.y }
                );
                isLongPotAttempt = dist > longPotThreshold;
            }
        }

        // Track long pot attempt for current player
        if (isLongPotAttempt) {
            const playerKey = this.currentPlayer === 1 ? 'player1' : 'player2';
            this.snookerStats[playerKey].longPotAttempts++;
        }

        // 6. Execute Game Logic

        // Handle Foul Scenario - WPBSA rules: opponent decides
        if (isFoul) {
            // Track foul stats
            const foulPlayerKey = this.currentPlayer === 1 ? 'player1' : 'player2';
            this.snookerStats[foulPlayerKey].fouls++;

            this.finalizeCurrentBreak();
            this.currentBreak = 0; // Reset break

            // Respot colors that were pocketed on foul
            this.respotSnookerBalls(pocketed, true);

            // Check if incoming player is snookered (for free ball)
            // Note: We need to temporarily switch perspective to check from incoming player's view
            // The cue ball position after foul determines if free ball applies
            const isSnookeredAfterFoul = this.isPlayerSnookered();

            // Store foul info for decision
            this.pendingFoulDecision = {
                penalty: foulValue,
                isMiss: isMiss,
                wasScratched: cueBallPocketed,
                foulReason: this.foulReason,
                offendingPlayer: this.currentPlayer,
                canRestore: isMiss && this.preShotState !== null,
                isFreeBall: isSnookeredAfterFoul && !cueBallPocketed  // Free ball if snookered (not on scratch)
            };

            // Award penalty points to opponent
            this.awardSnookerPoints(this.currentPlayer === 1 ? 2 : 1, foulValue);

            // Track consecutive misses (3 miss rule)
            // Only count misses when player was NOT snookered (had a clear shot available)
            if (isMiss && !this.wasSnookeredBeforeShot) {
                this.consecutiveMisses++;

                // Check for 3 miss rule - frame forfeit
                if (this.consecutiveMisses >= 3) {
                    // Player forfeits the frame after 3 consecutive misses
                    this.winner = this.currentPlayer === 1 ? 2 : 1;
                    this.gameOverReason = `Player ${this.currentPlayer} forfeits frame (3 consecutive misses)`;

                    if (this.onFoul) {
                        this.onFoul(this.foulReason + ` (${foulValue} points)`, isMiss);
                    }

                    this.endGame();
                    return;
                }

                // Warning after 2 consecutive misses
                if (this.consecutiveMisses === 2 && this.onMissWarning) {
                    this.onMissWarning(this.currentPlayer);
                }
            } else if (!isMiss) {
                // Reset on non-miss foul (e.g., potting wrong ball is still a foul but not a miss)
                this.consecutiveMisses = 0;
            }
            // Note: If player was snookered, miss count is not affected

            if (this.onFoul) {
                this.onFoul(this.foulReason + ` (${foulValue} points)`, isMiss);
            }

            // Set state to await decision from opponent
            this.state = GameState.AWAITING_DECISION;

            if (this.onFoulDecision) {
                this.onFoulDecision(this.pendingFoulDecision);
            }

            if (this.onStateChange) {
                this.onStateChange(this.state);
            }
        }
        // Handle Valid Score Scenario
        else if (turnScore > 0) {
            this.consecutiveMisses = 0;  // Reset miss counter
            this.awardSnookerPoints(this.currentPlayer, turnScore);
            this.currentBreak += turnScore;
            this.highestBreak = Math.max(this.highestBreak, this.currentBreak);

            // Track pot stats
            const potPlayerKey = this.currentPlayer === 1 ? 'player1' : 'player2';
            this.snookerStats[potPlayerKey].potShots++;
            this.snookerStats[potPlayerKey].totalPoints += turnScore;

            // Track successful long pot (attempt already counted above)
            if (isLongPotAttempt) {
                this.snookerStats[potPlayerKey].longPots++;
            }

            // Respotting on Valid Pot:
            // Free ball colour must ALWAYS be respotted, even in colors phase
            if (pottedFreeBall && pottedFreeBall.isColor) {
                this.respotSingleBall(pottedFreeBall);
            }
            // Normal respotting: colors respot during reds phase, not during clearance
            const isClearance = this.colorsPhase;
            const ballsToRespot = pottedFreeBall
                ? pocketed.filter(b => b !== pottedFreeBall)  // Exclude already-respotted free ball
                : pocketed;
            this.respotSnookerBalls(ballsToRespot, !isClearance);

            // Determine Next Target
            // Pass free ball info so it's treated as if the ball-on was potted
            this.advanceSnookerTargetState(pocketed, pottedFreeBall);

            // Clear nomination after potting a color
            if (this.snookerTarget === 'red') {
                this.nominatedColor = null;
            }

            this.turnContinues = true;

            // 6. Check Game Over
            if (this.checkSnookerGameOver()) {
                this.endSnookerGame();
            } else {
                this.isBreakShot = false;
                this.ballsPocketed = [];
                this.state = GameState.PLAYING;
                if (this.onStateChange) this.onStateChange(this.state);
            }
        }
        // Handle Valid Safety (No Pot, No Foul)
        else {
            this.consecutiveMisses = 0;  // Reset miss counter (good safety)
            this.finalizeCurrentBreak();
            this.currentBreak = 0;
            this.nominatedColor = null;  // Clear nomination on turn change
            this.handleSnookerTurnChange(false);

            // 6. Check Game Over
            if (this.checkSnookerGameOver()) {
                this.endSnookerGame();
            } else {
                this.isBreakShot = false;
                this.ballsPocketed = [];
                this.state = GameState.PLAYING;
                if (this.onStateChange) this.onStateChange(this.state);
            }
        }
    }

    // Apply the opponent's decision after a snooker foul
    applySnookerDecision(decision) {
        if (!this.pendingFoulDecision) return;

        const { wasScratched, offendingPlayer, canRestore, isFreeBall, penalty } = this.pendingFoulDecision;

        // Clear nomination on any decision
        this.nominatedColor = null;
        this.isFreeBall = false;
        this.freeBallNomination = null;

        switch (decision) {
            case 'play':
                // Opponent plays from current position
                this.switchPlayer();
                this.handleSnookerTargetAfterFoul();

                if (wasScratched) {
                    // Ball in hand in the D
                    this.state = GameState.BALL_IN_HAND;
                } else {
                    this.state = GameState.PLAYING;
                }
                break;

            case 'free_ball':
                // Opponent plays with free ball advantage
                if (isFreeBall) {
                    this.isFreeBall = true;
                    this.switchPlayer();
                    this.handleSnookerTargetAfterFoul();

                    if (wasScratched) {
                        this.state = GameState.BALL_IN_HAND;
                    } else {
                        this.state = GameState.PLAYING;
                    }

                    // Notify UI that free ball nomination is needed
                    if (this.onFreeBallAwarded) {
                        this.onFreeBallAwarded();
                    }
                }
                break;

            case 'replay':
                // Offending player plays again from current position
                // (no player switch)
                this.handleSnookerTargetAfterFoul();

                if (wasScratched) {
                    this.state = GameState.BALL_IN_HAND;
                } else {
                    this.state = GameState.PLAYING;
                }
                break;

            case 'restore':
                // Restore pre-shot state, offending player plays again
                if (canRestore && this.preShotState) {
                    this.restoreState(this.preShotState);
                    // After restore, maintain the offending player's turn
                    this.currentPlayer = offendingPlayer;
                    // Re-apply foul penalty (restoreState reverts scores to pre-shot values)
                    const opponent = offendingPlayer === 1 ? 2 : 1;
                    this.awardSnookerPoints(opponent, penalty);
                }
                this.state = GameState.PLAYING;
                break;
        }

        this.pendingFoulDecision = null;
        this.isBreakShot = false;
        this.ballsPocketed = [];

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Set the free ball nomination
    setFreeBallNomination(ball) {
        if (this.isFreeBall && ball && !ball.pocketed && !ball.isCueBall) {
            this.freeBallNomination = ball;
            if (this.onFreeBallNominated) {
                this.onFreeBallNominated(ball);
            }
        }
    }

    // Handle target state after a foul (reset to red or current sequence color)
    handleSnookerTargetAfterFoul() {
        if (this.colorsPhase) {
            // Keep targeting current color in sequence
        } else {
            const reds = this.getActualRedsRemaining();
            if (reds > 0) {
                this.snookerTarget = 'red';
            } else {
                // No reds left, start colors phase
                this.colorsPhase = true;
                this.snookerTarget = 'yellow';
            }
        }
    }

    // Set nominated color (called from input when aiming at colors)
    setNominatedColor(colorName) {
        if (this.snookerTarget === 'color' && colorName !== this.nominatedColor) {
            this.nominatedColor = colorName;
            if (this.onNominationChange) {
                this.onNominationChange(colorName);
            }
        }
    }

    // Check if a shot can be taken (nomination required check)
    canTakeShot() {
        // In snooker, if target is 'color' and no nomination, require nomination
        if (this.mode === GameMode.SNOOKER && this.snookerTarget === 'color') {
            // Allow shot if aiming at a color (nomination is implicit)
            // The nomination should be set by input.js based on aim
            return true;  // Let input.js handle the nomination requirement
        }
        return true;
    }

    // --- Helper: Validate Hit ---
    isValidSnookerHit(ball) {
        if (!ball) return false;

        // Free ball: nominated ball counts as ball on
        if (this.isFreeBall && this.freeBallNomination) {
            // Can hit either the nominated free ball OR any legal target
            if (ball === this.freeBallNomination) {
                return true;
            }
            // Also valid to hit actual ball on (gives up free ball advantage)
        }

        // 1. Target is Red
        if (this.snookerTarget === 'red') {
            return ball.isRed;
        }

        // 2. Target is "Any Color" (Nomination phase after a red)
        if (this.snookerTarget === 'color') {
            return ball.isColor; // Any color is valid to HIT in this phase
        }

        // 3. Target is Specific Color (Clearance phase)
        return ball.colorName === this.snookerTarget;
    }

    // --- Helper: Validate Pot ---
    isValidSnookerPot(ball) {
        if (ball.isCueBall) return false;

        // Free ball: nominated ball can be potted (scores as ball on)
        if (this.isFreeBall && this.freeBallNomination && ball === this.freeBallNomination) {
            return true; // Free ball pot is always valid
        }

        // 1. Target Red
        if (this.snookerTarget === 'red') {
            return ball.isRed;
        }

        // 2. Target "Any Color" (After Red)
        if (this.snookerTarget === 'color') {
            // If we hit a color, we must pot THAT color.
            // If we hit multiple colors (rare/lucky), it's complex,
            // but standard rule: You can only pot the nominated (first hit) color.
            if (!this.firstBallHit) return false;
            return ball.isColor && ball.colorName === this.firstBallHit.colorName;
        }

        // 3. Target Specific Color
        return ball.colorName === this.snookerTarget;
    }

    // Get the value of a potted ball (handles free ball scoring)
    getSnookerPotValue(ball) {
        // Free ball: scores as the ball on (not its actual value)
        if (this.isFreeBall && this.freeBallNomination && ball === this.freeBallNomination) {
            // Free ball scores as the ball on
            if (this.snookerTarget === 'red') return 1;
            if (this.snookerTarget === 'color') {
                // When on colors after red, free ball = lowest available = 1
                // (Actually per WPBSA rules, free ball when on "any color" = 1)
                return 1;
            }
            // When on specific color in sequence, free ball = that color's value
            const values = { 'yellow': 2, 'green': 3, 'brown': 4, 'blue': 5, 'pink': 6, 'black': 7 };
            return values[this.snookerTarget] || 1;
        }

        // Normal ball value
        return this.getSnookerBallValue(ball);
    }

    getActualRedsRemaining() {
        return this.balls.filter(b => b.isRed && !b.pocketed).length;
    }

    // --- Helper: Award Points ---
    awardSnookerPoints(player, points) {
        if (player === 1) {
            this.player1Score += points;
        } else {
            this.player2Score += points;
        }
    }

    // --- Helper: Get Point Value ---
    getSnookerBallValue(ball) {
        if (ball.isRed) return 1;
        // Mapping for colors
        const values = { 'yellow': 2, 'green': 3, 'brown': 4, 'blue': 5, 'pink': 6, 'black': 7 };
        return values[ball.colorName] || 4;
    }

    // --- Helper: Get Value of Current Target (for fouls) ---
    getCurrentTargetValue() {
        if (this.snookerTarget === 'red') return 1; // Foul on red is min 4 anyway
        if (this.snookerTarget === 'color') return 7; // Technically unknown, but standard logic maxes penalty

        const values = { 'yellow': 2, 'green': 3, 'brown': 4, 'blue': 5, 'pink': 6, 'black': 7 };
        return values[this.snookerTarget] || 4;
    }

    // --- Helper: Check if player is snookered on all valid target balls ---
    // Used to determine if free ball should be awarded after a foul
    isPlayerSnookered() {
        if (!this.cueBall || this.cueBall.pocketed) return false;

        const cueBallPos = this.cueBall.position;
        const cueBallRadius = this.cueBall.radius;

        // Get all valid target balls based on current target
        const targetBalls = this.getValidTargetBalls();
        if (targetBalls.length === 0) return false;

        // Get all potential blocking balls (everything except cue ball and target balls)
        const blockerBalls = this.balls.filter(b =>
            !b.pocketed && !b.isCueBall && !targetBalls.includes(b)
        );

        // Check each target ball - if ANY has a clear path, not snookered
        for (const target of targetBalls) {
            if (this.hasClearPath(cueBallPos, target.position, cueBallRadius, target.radius, blockerBalls)) {
                return false; // At least one target is reachable
            }
        }

        return true; // All targets are blocked - snookered
    }

    // Get the balls that are valid targets for the current snookerTarget
    getValidTargetBalls() {
        if (this.snookerTarget === 'red') {
            return this.balls.filter(b => b.isRed && !b.pocketed);
        } else if (this.snookerTarget === 'color') {
            return this.balls.filter(b => b.isColor && !b.pocketed);
        } else {
            // Specific color in sequence
            return this.balls.filter(b => b.colorName === this.snookerTarget && !b.pocketed);
        }
    }

    // Check if there's a clear straight-line path between cue ball and target
    // Must be able to hit BOTH extreme edges of the target ball
    hasClearPath(cueBallPos, targetPos, cueBallRadius, targetRadius, blockerBalls) {
        const direction = Vec2.subtract(targetPos, cueBallPos);
        const distance = Vec2.length(direction);
        if (distance < 1) return true;

        const normalized = Vec2.normalize(direction);

        // Check if any blocker ball is in the path
        for (const blocker of blockerBalls) {
            const blockerRadius = blocker.radius;
            const toBall = Vec2.subtract(blocker.position, cueBallPos);
            const projection = Vec2.dot(toBall, normalized);

            // Blocker is behind cue ball or beyond target
            if (projection < 0 || projection > distance - targetRadius) continue;

            // Calculate perpendicular distance to path
            const closestPoint = Vec2.add(cueBallPos, Vec2.multiply(normalized, projection));
            const perpDist = Vec2.distance(blocker.position, closestPoint);

            // Check if blocker is in the way (cue ball would collide)
            const clearance = blockerRadius + cueBallRadius;
            if (perpDist < clearance) {
                return false; // Path is blocked
            }
        }

        return true;
    }

    // --- Helper: Respotting Logic ---
    respotSnookerBalls(pocketedBalls, shouldRespotColors) {
        for (const ball of pocketedBalls) {
            if (ball.isCueBall) continue;

            // Reds never respot (unless specific foul scenarios not covered here)
            if (ball.isRed) continue;

            // Colors
            if (ball.isColor && shouldRespotColors) {
                this.respotSingleBall(ball);
            }
        }
    }

    respotSingleBall(ball) {
        ball.pocketed = false;
        ball.sinking = false;
        ball.velocity = Vec2.create(0, 0); // Stop movement

        // 1. Try Own Spot
        if (this.isSpotAvailable(ball.spotPosition)) {
            ball.setPosition(ball.spotPosition.x, ball.spotPosition.y);
            return;
        }

        // 2. Try Highest Value Spots (Black -> Pink -> ... -> Yellow)
        // If own spot taken, place on highest value available spot
        const snookerSpots = this.table.spots;
        const tableCenter = this.table.center;

        // Spots in order from highest to lowest value
        const spotNames = ['black', 'pink', 'blue', 'brown', 'green', 'yellow'];

        for (const name of spotNames) {
            const relativeSpot = snookerSpots[name];
            if (relativeSpot) {
                const absoluteSpot = {
                    x: tableCenter.x + relativeSpot.x,
                    y: tableCenter.y + relativeSpot.y
                };
                if (this.isSpotAvailable(absoluteSpot)) {
                    ball.setPosition(absoluteSpot.x, absoluteSpot.y);
                    return;
                }
            }
        }

        // 3. If ALL spots occupied (Very rare)
        // Place as close as possible to own spot, on the Long String (vertical line), towards Top Cushion
        this.placeNearSpotTowardsTop(ball);
    }

    isSpotAvailable(pos) {
        if (!pos) return false;
        const margin = Constants.BALL_RADIUS * 2 + 0.01; // Slight buffer
        for (const b of this.balls) {
            if (!b.pocketed && Vec2.distance(pos, b.position) < margin) {
                return false;
            }
        }
        return true;
    }

    placeNearSpotTowardsTop(ball) {
        const startX = ball.spotPosition.x;
        const y = ball.spotPosition.y; // Center line Y (constant)
        
        // Use a small step for "As near as possible" accuracy
        const step = Math.max(1, Constants.BALL_RADIUS * 0.1); 
        const r = Constants.BALL_RADIUS;

        // Boundaries from Table class
        const rightLimit = this.table.bounds.right - r; // Top Cushion end
        const leftLimit = this.table.bounds.left + r;   // Baulk Cushion end

        // PHASE 1: Primary Direction - Towards Top Cushion (RIGHT)
        let x = startX;
        while (x <= rightLimit) {
            // Pass 'ball' to ignore itself in the check
            if (this.isSpotAvailable({x, y}, ball)) {
                ball.setPosition(x, y);
                return;
            }
            x += step;
        }

        // PHASE 2: Secondary Direction - Towards Baulk Cushion (LEFT)
        // Only happens if the path to the right is completely blocked
        x = startX;
        while (x >= leftLimit) {
            if (this.isSpotAvailable({x, y}, ball)) {
                ball.setPosition(x, y);
                return;
            }
            x -= step;
        }

        console.warn("Could not respot ball - center line full!");
    }

    // --- Helper: State Machine for Targets ---
    advanceSnookerTargetState(pocketedBalls, pottedFreeBall = null) {
        const redsRemaining = this.getActualRedsRemaining();

        // If we are in Clearance Phase (no reds left, potting colors in order)
        if (this.colorsPhase) {
            // If we potted the actual target colour, move to next in sequence
            // Note: a potted free ball gets respotted, so it does NOT advance the sequence
            // (the real target ball is still on the table)
            const pottedTarget = pocketedBalls.find(b => b.colorName === this.snookerTarget);
            if (pottedTarget) {
                this.advanceSequence();
            }
            return;
        }

        // Standard Phase (Red -> Color -> Red)
        // Free ball during reds phase: treat as if a red was potted
        const pottedRed = pocketedBalls.some(b => b.isRed) || pottedFreeBall;

        if (pottedRed) {
            // Potted a Red (or free ball acting as red)? Next target is Any Color
            this.snookerTarget = 'color';
        } else {
            // Potted a Color?
            // If Reds remain -> Back to Red
            if (redsRemaining > 0) {
                this.snookerTarget = 'red';
            } else {
                // Potted last Color after last Red? Begin Clearance
                this.colorsPhase = true;
                this.snookerTarget = 'yellow';
            }
        }
    }

    // --- Helper: Turn Change ---
    handleSnookerTurnChange() {
        this.switchPlayer();
        this.turnContinues = false;
        this.nominatedColor = null;  // Clear nomination on turn change

        // Reset target based on game state
        if (this.colorsPhase) {
            // Target remains specific color in sequence
        } else {
            const reds = this.getActualRedsRemaining();
            if (reds > 0) {
                this.snookerTarget = 'red';
            } else {
                // No reds left - start clearance phase
                this.colorsPhase = true;
                this.snookerTarget = 'yellow';
            }
        }
    }

    advanceSequence() {
        const sequence = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
        const idx = sequence.indexOf(this.snookerTarget);
        if (idx !== -1 && idx < sequence.length - 1) {
            this.snookerTarget = sequence[idx + 1];
        } else if (this.snookerTarget === 'black') {
            // Handled in CheckSnookerGameOver
        }
    }

    checkSnookerGameOver() {
        // End frame if Black is potted in Clearance phase
        if (this.colorsPhase && this.snookerTarget === 'black') {
            const black = this.balls.find(b => b.colorName === 'black');
            if (black && black.pocketed) return true;
        }
        
        // Optional: End if only Black remains and score difference > 7
        // (Simplified for this implementation, usually keep playing until conceded)
        
        return false;
    }

    // End the snooker game
    endSnookerGame() {
        this.finalizeCurrentBreak();

        if (this.player1Score > this.player2Score) {
            this.winner = 1;
            this.gameOverReason = `Player 1 wins ${this.player1Score}-${this.player2Score}`;
        } else if (this.player2Score > this.player1Score) {
            this.winner = 2;
            this.gameOverReason = `Player 2 wins ${this.player2Score}-${this.player1Score}`;
        } else {
            // Tie - re-spot black (WPBSA rules)
            this.setupReSpottedBlack();
            return;
        }

        this.endGame();
    }

    // Re-spot the black ball for a tied frame (WPBSA rules)
    setupReSpottedBlack() {
        // Re-spot the black ball on its spot
        const black = this.balls.find(b => b.colorName === 'black');
        if (black) {
            this.respotSingleBall(black);
        }

        // Ensure cue ball is available
        this.cueBall.pocketed = false;
        this.cueBall.sinking = false;

        // Set target to black only
        this.snookerTarget = 'black';
        this.colorsPhase = true;

        // Coin toss for who plays first
        this.currentPlayer = Math.random() < 0.5 ? 1 : 2;

        // Ball in hand from D
        this.state = GameState.BALL_IN_HAND;
        this.isBreakShot = false;
        this.currentBreak = 0;

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Calculate remaining points on the table
    getSnookerRemainingPoints() {
        const redsLeft = this.getActualRedsRemaining();

        if (!this.colorsPhase && redsLeft > 0) {
            // Reds phase: each red can be followed by black (max)
            let points = redsLeft * 8; // reds + blacks

            // Always include all 6 colors during reds phase (they get respotted)
            // yellow(2) + green(3) + brown(4) + blue(5) + pink(6) + black(7) = 27
            points += 27;

            return points;
        } else {
            // Colors phase: only sum remaining unpocketed colors
            let points = 0;
            const colorValues = { 'yellow': 2, 'green': 3, 'brown': 4, 'blue': 5, 'pink': 6, 'black': 7 };

            for (const ball of this.balls) {
                if (ball.isColor && !ball.pocketed && colorValues[ball.colorName]) {
                    points += colorValues[ball.colorName];
                }
            }

            return points;
        }
    }

    // Get points deficit for current player
    getSnookerPointsDeficit() {
        const p1Score = this.player1Score;
        const p2Score = this.player2Score;

        if (this.currentPlayer === 1) {
            return Math.max(0, p2Score - p1Score);
        } else {
            return Math.max(0, p1Score - p2Score);
        }
    }

    // Get snooker game info for UI
    getSnookerInfo() {
        return {
            player1Score: this.player1Score,
            player2Score: this.player2Score,
            currentBreak: this.currentBreak,
            highestBreak: this.highestBreak,
            snookerTarget: this.snookerTarget,
            redsRemaining: this.getActualRedsRemaining(),
            colorsPhase: this.colorsPhase,
            remainingPoints: this.getSnookerRemainingPoints(),
            pointsDeficit: this.getSnookerPointsDeficit()
        };
    }

    // Create empty stats object for snooker match tracking
    createEmptyStats() {
        return {
            player1: {
                totalShots: 0,
                potShots: 0,        // shots where at least one ball was validly potted
                longPots: 0,        // successful long distance pots
                longPotAttempts: 0,  // shots where first ball hit was far away
                fouls: 0,
                highBreak: 0,
                totalPoints: 0
            },
            player2: {
                totalShots: 0,
                potShots: 0,
                longPots: 0,
                longPotAttempts: 0,
                fouls: 0,
                highBreak: 0,
                totalPoints: 0
            }
        };
    }

    // Finalize the current break into per-player stats
    finalizeCurrentBreak() {
        if (this.currentBreak > 0) {
            const playerKey = this.currentPlayer === 1 ? 'player1' : 'player2';
            this.snookerStats[playerKey].highBreak = Math.max(
                this.snookerStats[playerKey].highBreak,
                this.currentBreak
            );
        }
    }

    // Serialize game state for saving
    serializeState() {
        const ballsData = this.balls.map(ball => ({
            number: ball.number,
            x: ball.position.x,
            y: ball.position.y,
            pocketed: ball.pocketed,
            color: ball.color,
            isStripe: ball.isStripe,
            isGroup1: ball.isGroup1,
            isGroup2: ball.isGroup2,
            isSolid: ball.isSolid,
            isEightBall: ball.isEightBall,
            isCueBall: ball.isCueBall,
            colorName: ball.colorName,
            isRed: ball.isRed,
            isColor: ball.isColor
        }));

        return {
            version: 1,
            savedAt: Date.now(),
            gameMode: this.mode,
            tableStyle: this.tableStyle,

            // Match progress
            bestOf: this.match.bestOf,
            player1Frames: this.match.player1Frames,
            player2Frames: this.match.player2Frames,
            currentFrame: this.match.currentFrame,
            firstFrameBreaker: this.match.firstFrameBreaker,

            // Current frame state
            currentPlayer: this.currentPlayer,
            player1Group: this.player1Group,
            player2Group: this.player2Group,
            isBreakShot: this.isBreakShot,

            // Ball positions
            balls: ballsData,

            // Mode-specific state
            ukColorScheme: this.ukColorScheme,
            shotsRemaining: this.shotsRemaining,
            twoShotRule: this.twoShotRule,
            lowestBall: this.lowestBall,

            // Snooker specific
            player1Score: this.player1Score,
            player2Score: this.player2Score,
            snookerTarget: this.snookerTarget,
            colorsPhase: this.colorsPhase,
            nextColorInSequence: this.nextColorInSequence,
            currentBreak: this.currentBreak,
            highestBreak: this.highestBreak,
            snookerStats: this.snookerStats
        };
    }

    // Restore game state from saved data
    restoreState(data) {
        if (!data || data.version !== 1) return false;

        this.mode = data.gameMode;
        this.tableStyle = data.tableStyle;

        // Restore match state
        this.match = {
            bestOf: data.bestOf,
            player1Frames: data.player1Frames,
            player2Frames: data.player2Frames,
            currentFrame: data.currentFrame,
            matchWinner: null,
            matchComplete: false,
            firstFrameBreaker: data.firstFrameBreaker || 1
        };

        // Restore frame state
        this.currentPlayer = data.currentPlayer;
        this.player1Group = data.player1Group;
        this.player2Group = data.player2Group;
        this.isBreakShot = data.isBreakShot;

        // Mode-specific state
        this.ukColorScheme = data.ukColorScheme;
        this.shotsRemaining = data.shotsRemaining || 1;
        this.twoShotRule = data.twoShotRule || false;
        this.lowestBall = data.lowestBall || 1;

        // Snooker specific
        this.player1Score = data.player1Score || 0;
        this.player2Score = data.player2Score || 0;
        this.snookerTarget = data.snookerTarget || 'red';
        this.colorsPhase = data.colorsPhase || false;
        this.nextColorInSequence = data.nextColorInSequence || 'yellow';
        this.currentBreak = data.currentBreak || 0;
        this.highestBreak = data.highestBreak || 0;
        this.snookerStats = data.snookerStats || this.createEmptyStats();

        // Restore ball positions - must be done after balls are created
        if (data.balls && this.balls.length > 0) {
            for (const savedBall of data.balls) {
                const ball = this.balls.find(b => b.number === savedBall.number);
                if (ball) {
                    ball.setPosition(savedBall.x, savedBall.y);
                    ball.pocketed = savedBall.pocketed;
                    ball.sinking = false;
                    ball.velocity = Vec2.create(0, 0);
                    ball.forceSync = true;
                }
            }
            this.cueBall = this.balls.find(b => b.number === 0);
        }

        // Reset transient state
        this.foul = false;
        this.foulReason = '';
        this.winner = null;
        this.gameOverReason = '';
        this.state = GameState.PLAYING;

        return true;
    }
}
