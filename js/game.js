// Game logic - manages game state, rules, turns, and win conditions

import { Vec2, Constants } from './utils.js';
import { Ball, createBallSet, createUKBallSet, createSnookerBallSet, rackBalls, positionSnookerBalls, RackPatterns } from './ball.js';

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
    GAME_OVER: 'game_over'
};

export class Game {
    constructor(table) {
        this.table = table;

        // Game mode and state
        this.mode = null;
        this.state = GameState.MENU;

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

        // 9-ball specific
        this.lowestBall = 1;
        this.pushOutAvailable = false;

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
        this.redsRemaining = 6;
        this.colorsPhase = false;           // True when potting colors in order
        this.nextColorInSequence = 'yellow';
        this.colorSequence = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];

        // Game over
        this.winner = null;
        this.gameOverReason = '';

        // Callbacks
        this.onStateChange = null;
        this.onTurnChange = null;
        this.onFoul = null;
        this.onGameOver = null;
        this.onBallPocketed = null;
    }

    // Start a new game
    startGame(mode, options = {}) {
        this.mode = mode;
        this.state = GameState.BALL_IN_HAND;  // Start with cue ball placement for break
        this.currentPlayer = 1;
        this.player1Group = null;
        this.player2Group = null;
        this.isBreakShot = true;
        this.foul = false;
        this.winner = null;
        this.lowestBall = 1;
        this.pushOutAvailable = false;

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
        this.redsRemaining = 6;
        this.colorsPhase = false;
        this.nextColorInSequence = 'yellow';

        // Create balls based on game mode
        if (mode === GameMode.UK_EIGHT_BALL) {
            this.balls = createUKBallSet(this.ukColorScheme);
        } else if (mode === GameMode.SNOOKER) {
            this.balls = createSnookerBallSet();
        } else {
            this.balls = createBallSet();
        }
        this.cueBall = this.balls.find(b => b.number === 0);

        // Rack balls based on game mode
        this.rackBalls();

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    rackBalls() {
        const center = this.table.center;
        const ballRadius = Constants.BALL_RADIUS;

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
            positionSnookerBalls(this.balls, center, ballRadius);
        } else {
            // Free play - standard 8-ball rack
            rackBalls(this.balls, RackPatterns.eightBall, center, ballRadius);
        }
    }

    // Re-rack for free play
    rerack() {
        if (this.mode !== GameMode.FREE_PLAY) return;

        // Reset all balls
        for (const ball of this.balls) {
            ball.pocketed = false;
            ball.sinking = false;
            ball.velocity = Vec2.create(0, 0);
        }

        this.rackBalls();
    }

    // Process a shot
    onShotTaken() {
        this.state = GameState.BALLS_MOVING;
        this.firstBallHit = null;
        this.ballsPocketed = [];
        this.foul = false;
        this.foulReason = '';
        this.turnContinues = false;
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

    // Called when a ball is pocketed
    onBallPocket(ball) {
        this.ballsPocketed.push(ball);

        if (this.onBallPocketed) {
            this.onBallPocketed(ball);
        }
    }

    // Called when all balls stop moving
    onBallsStopped() {
        // Trigger face-up animation for all balls at turn end
        for (const ball of this.balls) {
            ball.resetRotation();
        }

        if (this.mode === GameMode.FREE_PLAY) {
            this.state = GameState.PLAYING;
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
                this.onFoul(this.foulReason + (this.mode === GameMode.UK_EIGHT_BALL ? ' - 2 shots' : ''));
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
    }

    // 8-Ball shot evaluation
    evaluateEightBallShot() {
        const cueBallPocketed = this.ballsPocketed.includes(this.cueBall);

        // Filter pocketed balls by type
        const solidsPocketed = this.ballsPocketed.filter(b => b.isSolid);
        const stripesPocketed = this.ballsPocketed.filter(b => b.isStripe);
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
                const hitOwnGroup = (currentGroup === 'solid' && this.firstBallHit.isSolid) ||
                                   (currentGroup === 'stripe' && this.firstBallHit.isStripe);
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

        // Handle 8-ball pocketed
        if (eightBallPocketed) {
            const eightBall = this.balls.find(b => b.isEightBall);
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            const groupCleared = currentGroup ? this.isGroupCleared(currentGroup) : false;

            if (this.isBreakShot) {
                // 8-ball on break - re-spot or re-rack (we'll re-spot)
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
            if (solidsPocketed.length > 0 && stripesPocketed.length === 0) {
                this.assignGroups('solid');
                this.turnContinues = true;
            } else if (stripesPocketed.length > 0 && solidsPocketed.length === 0) {
                this.assignGroups('stripe');
                this.turnContinues = true;
            }
        } else if (this.player1Group) {
            // Check if player pocketed their own ball
            const currentGroup = this.currentPlayer === 1 ? this.player1Group : this.player2Group;
            const pocketedOwn = (currentGroup === 'solid' && solidsPocketed.length > 0) ||
                               (currentGroup === 'stripe' && stripesPocketed.length > 0);

            if (pocketedOwn && !this.foul) {
                this.turnContinues = true;
            }
        }

        // On break, continue if any ball pocketed (except cue ball)
        if (this.isBreakShot && this.ballsPocketed.length > 0 && !cueBallPocketed) {
            this.turnContinues = true;
        }
    }

    // 9-Ball shot evaluation
    evaluateNineBallShot() {
        const cueBallPocketed = this.ballsPocketed.includes(this.cueBall);
        const nineBall = this.balls.find(b => b.number === 9);
        const nineBallPocketed = this.ballsPocketed.includes(nineBall);

        // Check for first ball hit foul (before updating lowest ball)
        if (!this.firstBallHit && !cueBallPocketed) {
            this.foul = true;
            this.foulReason = 'No ball hit';
        } else if (this.firstBallHit && this.firstBallHit.number !== this.lowestBall) {
            // Must hit lowest numbered ball first
            this.foul = true;
            this.foulReason = `Must hit ${this.lowestBall}-ball first`;
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

        // Push out available after break
        if (this.isBreakShot) {
            this.pushOutAvailable = true;
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
                this.assignUKGroups('group1');
                this.turnContinues = true;
            } else if (group2Pocketed.length > 0 && group1Pocketed.length === 0) {
                this.assignUKGroups('group2');
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

    // Check if a group is cleared (8-ball)
    // If excludeJustPocketed is true, balls pocketed this turn are considered "not yet pocketed"
    // This is used to determine if the group was cleared BEFORE this shot
    isGroupCleared(group, excludeJustPocketed = false) {
        for (const ball of this.balls) {
            // Skip balls that were pocketed in previous turns
            if (ball.pocketed && !(excludeJustPocketed && this.ballsPocketed.includes(ball))) continue;
            // If excludeJustPocketed, treat just-pocketed balls as still on table
            if (excludeJustPocketed && this.ballsPocketed.includes(ball)) {
                // Ball was just pocketed - count it as still on table for this check
                if (group === 'solid' && ball.isSolid) return false;
                if (group === 'stripe' && ball.isStripe) return false;
                continue;
            }
            if (group === 'solid' && ball.isSolid) return false;
            if (group === 'stripe' && ball.isStripe) return false;
        }
        return true;
    }

    // Switch to other player
    switchPlayer() {
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

        if (this.onTurnChange) {
            this.onTurnChange(this.currentPlayer);
        }
    }

    // Place cue ball after scratch
    placeCueBall(position, inKitchen = true) {
        if (!this.cueBall) return false;

        // Validate position
        if (inKitchen && !this.table.isInKitchen(position.x, position.y)) {
            return false;
        }

        // Check for overlapping balls
        for (const ball of this.balls) {
            if (ball === this.cueBall || ball.pocketed) continue;
            const dist = Vec2.distance(position, ball.position);
            if (dist < Constants.BALL_RADIUS * 2 + 2) {
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

    // End the game
    endGame() {
        this.state = GameState.GAME_OVER;

        if (this.onGameOver) {
            this.onGameOver(this.winner, this.gameOverReason);
        }

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Get remaining balls count for each group
    getRemainingBalls() {
        let solids = 0;
        let stripes = 0;

        for (const ball of this.balls) {
            if (ball.pocketed) continue;
            if (ball.isSolid) solids++;
            if (ball.isStripe) stripes++;
        }

        return { solids, stripes };
    }

    // Get current player's target group
    getCurrentPlayerGroup() {
        if (!this.player1Group) return null;
        return this.currentPlayer === 1 ? this.player1Group : this.player2Group;
    }

    // Check if cue ball can be placed at position
    canPlaceCueBall(position, kitchenOnly = true) {
        // Check bounds
        if (!this.table.isOnTable(position.x, position.y)) {
            return false;
        }

        // Check kitchen restriction
        if (kitchenOnly && !this.table.isInKitchen(position.x, position.y)) {
            return false;
        }

        // Check ball overlap
        for (const ball of this.balls) {
            if (ball === this.cueBall || ball.pocketed) continue;
            const dist = Vec2.distance(position, ball.position);
            if (dist < Constants.BALL_RADIUS * 2 + 2) {
                return false;
            }
        }

        return true;
    }

    // Get game state info for UI
    getGameInfo() {
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
            // UK 8-ball specific
            ukColorScheme: this.ukColorScheme,
            shotsRemaining: this.shotsRemaining,
            twoShotRule: this.twoShotRule,
            remainingUK: this.getRemainingUKBalls()
        };

        // Add snooker info if in snooker mode
        if (this.mode === GameMode.SNOOKER) {
            info.player1Score = this.player1Score;
            info.player2Score = this.player2Score;
            info.currentBreak = this.currentBreak;
            info.highestBreak = this.highestBreak;
            info.snookerTarget = this.snookerTarget;
            info.redsRemaining = this.redsRemaining;
            info.colorsPhase = this.colorsPhase;
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
    evaluateSnookerShot() {
        const pocketed = this.ballsPocketed.filter(b => !b.isCueBall);
        const cueBallPocketed = this.cueBall.pocketed || this.wasScratched;
        let foulPoints = 0;
        let scoredPoints = 0;
        this.redsRemaining = this.getActualRedsRemaining();

        // Check for fouls
        if (cueBallPocketed) {
            foulPoints = Math.max(4, this.getSnookerFoulValue());
            this.foul = true;
            this.foulReason = 'Cue ball pocketed';
        } else if (!this.firstBallHit) {
            foulPoints = Math.max(4, this.getTargetBallValue());
            this.foul = true;
            this.foulReason = 'No ball hit';
        } else if (!this.isValidSnookerHit(this.firstBallHit)) {
            foulPoints = Math.max(4, this.getSnookerFoulValue());
            this.foul = true;
            this.foulReason = 'Wrong ball hit first';
        }

        // Check for illegally pocketed balls
        for (const ball of pocketed) {
            if (!this.isValidSnookerPot(ball)) {
                foulPoints = Math.max(foulPoints, 4, ball.pointValue || 4);
                this.foul = true;
                this.foulReason = 'Wrong ball pocketed';
            }
        }

        if (this.foul) {
            // Award foul points to opponent
            this.awardSnookerPoints(this.currentPlayer === 1 ? 2 : 1, foulPoints);
            this.currentBreak = 0;
            this.respotSnookerColors(pocketed);
            this.handleSnookerFoul();
            return;
        }

        // Process legally pocketed balls
        for (const ball of pocketed) {
            if (ball.isRed) {
                scoredPoints += 1;
                this.redsRemaining--;
                // After potting a red, target becomes any color
                this.snookerTarget = 'color';
            } else if (ball.isColor) {
                scoredPoints += ball.pointValue;
                if (!this.colorsPhase) {
                    // Re-spot the color during red phase
                    this.respotBall(ball);
                    // After potting a color, target goes back to red (if reds remain)
                    if (this.redsRemaining > 0) {
                        this.snookerTarget = 'red';
                    } else {
                        // No reds left, check if we need to enter colors phase
                        this.checkEnterColorsPhase();
                    }
                } else {
                    // Colors phase - advance to next color
                    this.advanceColorSequence();
                }
            }
        }

        if (scoredPoints > 0) {
            this.awardSnookerPoints(this.currentPlayer, scoredPoints);
            this.currentBreak += scoredPoints;
            this.highestBreak = Math.max(this.highestBreak, this.currentBreak);
            this.turnContinues = true;
        } else {
            // No ball potted - end of break
            this.currentBreak = 0;
            this.turnContinues = false;
        }

        // Check if game is over
        if (this.isSnookerGameOver()) {
            this.endSnookerGame();
            return;
        }

        // Handle turn change
        if (!this.turnContinues) {
            this.switchPlayer();
        }

        this.isBreakShot = false;
        this.state = GameState.PLAYING;

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    getActualRedsRemaining() {
        return this.balls.filter(b => b.isRed && !b.pocketed).length;
    }


    // Check if the first ball hit was valid for snooker
    isValidSnookerHit(ball) {
        if (this.snookerTarget === 'red') {
            return ball.isRed;
        } else if (this.snookerTarget === 'color') {
            return ball.isColor;
        } else {
            // Specific color in sequence
            return ball.colorName === this.snookerTarget;
        }
    }

    // Check if a pocketed ball was valid
    isValidSnookerPot(ball) {
        if (this.snookerTarget === 'red') {
            return ball.isRed;
        } else if (this.snookerTarget === 'color') {
            return ball.isColor;
        } else {
            // Specific color in sequence
            return ball.colorName === this.snookerTarget;
        }
    }

    // Get the foul value based on balls involved
    getSnookerFoulValue() {
        let maxValue = 4;

        // Check first ball hit
        if (this.firstBallHit && this.firstBallHit.pointValue) {
            maxValue = Math.max(maxValue, this.firstBallHit.pointValue);
        }

        // Check pocketed balls
        for (const ball of this.ballsPocketed) {
            if (ball.pointValue) {
                maxValue = Math.max(maxValue, ball.pointValue);
            }
        }

        // Check target ball value
        maxValue = Math.max(maxValue, this.getTargetBallValue());

        return maxValue;
    }

    // Get the value of the current target ball
    getTargetBallValue() {
        if (this.snookerTarget === 'red') {
            return 4; // Minimum foul value
        } else if (this.snookerTarget === 'color') {
            return 4; // Any color, minimum value
        } else {
            // Specific color
            return Constants.SNOOKER_POINTS[this.snookerTarget] || 4;
        }
    }

    // Award points to a player in snooker
    awardSnookerPoints(player, points) {
        if (player === 1) {
            this.player1Score += points;
        } else {
            this.player2Score += points;
        }
    }

    // Re-spot a snooker color ball on its spot
    respotBall(ball) {
        if (!ball.spotPosition) return;

        // Try original spot first
        if (this.isSpotClear(ball.spotPosition, ball)) {
            ball.setPosition(ball.spotPosition.x, ball.spotPosition.y);
        } else {
            // Find nearest clear spot toward black end
            const clearSpot = this.findNearestClearSpot(ball.spotPosition, ball);
            ball.setPosition(clearSpot.x, clearSpot.y);
        }

        ball.pocketed = false;
        ball.sinking = false;
        ball.velocity = Vec2.create(0, 0);
    }

    // Re-spot any illegally pocketed color balls
    respotSnookerColors(pocketed) {
        for (const ball of pocketed) {
            if (ball.isColor) {
                this.respotBall(ball);
            }
        }
    }

    // Check if a spot is clear of other balls
    isSpotClear(spot, excludeBall) {
        const minDist = Constants.BALL_RADIUS * 2.2;
        for (const ball of this.balls) {
            if (ball === excludeBall || ball.pocketed) continue;
            const dist = Vec2.distance(spot, ball.position);
            if (dist < minDist) return false;
        }
        return true;
    }

    // Find the nearest clear spot (toward black end of table)
    findNearestClearSpot(spot, ball) {
        const tableCenter = this.table.center;
        const step = Constants.BALL_RADIUS * 0.5;

        // Try spots toward the black end (positive X)
        for (let offset = step; offset < 200; offset += step) {
            const testSpot = { x: spot.x + offset, y: spot.y };
            if (this.isSpotClear(testSpot, ball) && this.table.isOnTable(testSpot.x, testSpot.y)) {
                return testSpot;
            }
        }

        // If no spot toward black, try behind the spot
        for (let offset = step; offset < 200; offset += step) {
            const testSpot = { x: spot.x - offset, y: spot.y };
            if (this.isSpotClear(testSpot, ball) && this.table.isOnTable(testSpot.x, testSpot.y)) {
                return testSpot;
            }
        }

        // Fallback to original spot
        return spot;
    }

    // Handle foul in snooker - opponent gets ball in hand anywhere
    handleSnookerFoul() {
        this.switchPlayer();
        this.currentBreak = 0;

        // Reset target to red if reds are still on the table
        if (this.redsRemaining > 0) {
            this.snookerTarget = 'red';
        } else if (!this.colorsPhase) {
            // No reds left but not yet in colors phase - enter colors phase
            this.colorsPhase = true;
            this.snookerTarget = 'yellow';
        }
        // If already in colors phase, target stays the same (current color in sequence)

        // Snooker uses ball in hand anywhere on the table
        this.state = GameState.BALL_IN_HAND;

        if (this.onFoul) {
            this.onFoul(this.foulReason);
        }

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Check if we should enter colors phase
    checkEnterColorsPhase() {
        if (this.redsRemaining === 0 && !this.colorsPhase) {
            // If current target is 'color' (just potted the last red's color)
            // or 'red' (didn't pot the color after last red), enter colors phase
            if (this.snookerTarget === 'red' || this.snookerTarget === 'color') {
                this.colorsPhase = true;
                this.snookerTarget = 'yellow';
                this.nextColorInSequence = 'yellow';
            }
        }
    }

    // Advance to the next color in the sequence
    advanceColorSequence() {
        const currentIndex = this.colorSequence.indexOf(this.snookerTarget);
        if (currentIndex < this.colorSequence.length - 1) {
            this.snookerTarget = this.colorSequence[currentIndex + 1];
            this.nextColorInSequence = this.snookerTarget;
        }
    }

    // Check if the snooker game is over
    isSnookerGameOver() {
        // Game is over when black is potted in colors phase
        if (this.colorsPhase) {
            const blackBall = this.balls.find(b => b.colorName === 'black');
            if (blackBall && blackBall.pocketed) {
                return true;
            }
        }
        return false;
    }

    // End the snooker game
    endSnookerGame() {
        if (this.player1Score > this.player2Score) {
            this.winner = 1;
            this.gameOverReason = `Player 1 wins ${this.player1Score}-${this.player2Score}`;
        } else if (this.player2Score > this.player1Score) {
            this.winner = 2;
            this.gameOverReason = `Player 2 wins ${this.player2Score}-${this.player1Score}`;
        } else {
            // Tie - re-spot black (simplified: just declare a tie)
            this.winner = null;
            this.gameOverReason = `Tie game ${this.player1Score}-${this.player2Score}`;
        }

        this.endGame();
    }

    // Get snooker game info for UI
    getSnookerInfo() {
        return {
            player1Score: this.player1Score,
            player2Score: this.player2Score,
            currentBreak: this.currentBreak,
            highestBreak: this.highestBreak,
            snookerTarget: this.snookerTarget,
            redsRemaining: this.redsRemaining,
            colorsPhase: this.colorsPhase
        };
    }
}
