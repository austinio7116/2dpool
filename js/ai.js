// AI opponent system for pool game
// Supports 8-ball, 9-ball, UK 8-ball, and snooker modes with 3 difficulty levels

import { Vec2 } from './utils.js';
import { GameMode, GameState } from './game.js';

// Difficulty configurations
const DIFFICULTY_SETTINGS = {
    easy: {
        aimError: 3,          // Degrees of aim error
        thinkingDelay: 300,   // ms before shooting
        powerError: 0.20,      // Power variation
        shotSelection: 'random' // Picks from top 50%
    },
    medium: {
        aimError: 1,
        thinkingDelay: 300,
        powerError: 0.10,
        shotSelection: 'top3'  // Best of top 3
    },
    hard: {
        aimError: 0.3,         // Small aim variation (1-2 degrees)
        thinkingDelay: 300,
        powerError: 0.02,      // Small power variation (2%)
        shotSelection: 'optimal' // Always best shot
    }
};

export class AI {
    constructor() {
        this.difficulty = 'medium';
        this.enabled = false;
        this.isThinking = false;

        // Callbacks
        this.onShot = null;         // Called when AI wants to shoot
        this.onBallPlacement = null; // Called for ball-in-hand
        this.onThinkingStart = null;
        this.onThinkingEnd = null;

        // Game references (set by main.js)
        this.game = null;
        this.table = null;
    }

    setDifficulty(difficulty) {
        if (DIFFICULTY_SETTINGS[difficulty]) {
            this.difficulty = difficulty;
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setGameReferences(game, table) {
        this.game = game;
        this.table = table;
    }

    // Called when it's the AI's turn (player 2)
    takeTurn() {
        if (!this.enabled || !this.game || this.game.currentPlayer !== 2) {
            return;
        }

        if (this.game.state === GameState.BALL_IN_HAND) {
            this.handleBallInHand();
        } else if (this.game.state === GameState.PLAYING) {
            this.planAndExecuteShot();
        }
    }

    // Handle ball-in-hand placement
    handleBallInHand() {
        const settings = DIFFICULTY_SETTINGS[this.difficulty];

        this.isThinking = true;
        if (this.onThinkingStart) this.onThinkingStart();

        setTimeout(() => {
            let position = this.findBestCueBallPosition();

            // Validate position can actually be placed
            const kitchenOnly = this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL;
            if (position && !this.game.canPlaceCueBall(position, kitchenOnly)) {
                // Fallback to a valid kitchen position if our chosen position fails
                position = this.table.findValidKitchenPosition(this.game.balls, this.table.center.y);
            }

            if (this.onBallPlacement && position) {
                this.onBallPlacement(position);
            }

            this.isThinking = false;
            if (this.onThinkingEnd) this.onThinkingEnd();

            // After placing, plan the shot (only if state changed to PLAYING)
            setTimeout(() => {
                if (this.game.state === GameState.PLAYING) {
                    this.planAndExecuteShot();
                }
            }, 200);
        }, settings.thinkingDelay / 2);
    }

    // Find best position for cue ball placement
    findBestCueBallPosition() {
        // For snooker break, place cue ball between green and yellow spots
        if (this.game.isBreakShot && this.game.mode === GameMode.SNOOKER) {
            return this.getSnookerBreakPosition();
        }

        // For pool break shots, just use a standard kitchen position (center of kitchen)
        if (this.game.isBreakShot) {
            return this.table.findValidKitchenPosition(this.game.balls, this.table.center.y);
        }

        const validTargets = this.getValidTargets();
        if (validTargets.length === 0) {
            return this.table.findValidCueBallPosition(this.game.balls, this.table.center.y);
        }

        const pockets = this.table.pockets;
        let bestPosition = null;
        let bestScore = -Infinity;

        // Check if kitchen only (break shot or UK 8-ball)
        const kitchenOnly = this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL;

        // Sample positions to find best placement
        const sampleCount = 20;
        const bounds = this.table.bounds;

        for (let i = 0; i < sampleCount; i++) {
            let x, y;

            if (kitchenOnly) {
                // Kitchen area only
                x = bounds.left + Math.random() * (this.table.kitchenLine - bounds.left - 20) + 10;
                y = bounds.top + Math.random() * (bounds.bottom - bounds.top - 20) + 10;
            } else {
                // Anywhere on table
                x = bounds.left + Math.random() * (bounds.right - bounds.left - 20) + 10;
                y = bounds.top + Math.random() * (bounds.bottom - bounds.top - 20) + 10;
            }

            const pos = { x, y };

            // Check if valid position
            if (!this.game.canPlaceCueBall(pos, kitchenOnly)) continue;

            // Score this position based on shot opportunities
            let score = 0;
            for (const target of validTargets) {
                for (const pocket of pockets) {
                    const shot = this.evaluatePotentialShot(pos, target, pocket);
                    if (shot && shot.score > score) {
                        score = shot.score;
                    }
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestPosition = pos;
            }
        }

        return bestPosition || this.table.findValidCueBallPosition(this.game.balls, this.table.center.y);
    }

    // Get snooker break position - between green and yellow spots
    getSnookerBreakPosition() {
        const tableCenter = this.table.center;
        const spots = this.table.spots;

        if (spots && spots.yellow && spots.green) {
            // Spots are relative to table center
            const yellowAbsolute = {
                x: tableCenter.x + spots.yellow.x,
                y: tableCenter.y + spots.yellow.y
            };
            const greenAbsolute = {
                x: tableCenter.x + spots.green.x,
                y: tableCenter.y + spots.green.y
            };

            // Position between green and yellow, but offset toward yellow to avoid brown ball
            // (Brown is at the exact center between green and yellow)
            // Use 70/30 split to ensure we're far enough from brown (need > 2 ball radii)
            const position = {
                x: (yellowAbsolute.x + greenAbsolute.x) / 2,
                y: yellowAbsolute.y * 0.7 + greenAbsolute.y * 0.3  // 70% toward yellow
            };

            // Verify position is valid before returning
            if (this.game.canPlaceCueBall(position, true)) {
                return position;
            }
        }

        // Fallback to default kitchen position
        return this.table.findValidKitchenPosition(this.game.balls, this.table.center.y);
    }

    // Main shot planning and execution
    planAndExecuteShot() {
        if (!this.game || this.game.state !== GameState.PLAYING) return;

        const settings = DIFFICULTY_SETTINGS[this.difficulty];

        this.isThinking = true;
        if (this.onThinkingStart) this.onThinkingStart();

        setTimeout(() => {
            // Special handling for break shot - just hit the rack hard
            if (this.game.isBreakShot) {
                this.playBreakShot();
            } else {
                const shot = this.findBestShot();

                if (shot) {
                    this.executeShot(shot);
                } else {
                    // No good shot found, play safety
                    this.playSafety();
                }
            }

            this.isThinking = false;
            if (this.onThinkingEnd) this.onThinkingEnd();
        }, settings.thinkingDelay);
    }

    // Play a break shot - different strategies for pool vs snooker
    playBreakShot() {
        const cueBall = this.game.cueBall;
        if (!cueBall) return;

        const rackBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);
        if (rackBalls.length === 0) return;

        const settings = DIFFICULTY_SETTINGS[this.difficulty];
        const isSnooker = this.game.mode === GameMode.SNOOKER;

        let targetBall;
        let basePower;

        if (isSnooker) {
            // Snooker break: aim at the BACK RIGHT red of the pack
            // Back = furthest from cue ball, Right = positive y (below center line)
            const redBalls = rackBalls.filter(b => b.isRed);
            if (redBalls.length === 0) {
                targetBall = rackBalls[0];
            } else {
                // Find the back right red: furthest from cue ball AND on right side (positive y)
                let bestScore = -Infinity;
                targetBall = redBalls[0];
                for (const ball of redBalls) {
                    const distFromCue = Vec2.distance(cueBall.position, ball.position);
                    // Positive y = right side of table when looking from baulk
                    const rightSide = ball.position.y - this.table.center.y;
                    // Score: prefer far balls on the right side
                    const score = distFromCue * 0.5 + rightSide * 2;
                    if (score > bestScore) {
                        bestScore = score;
                        targetBall = ball;
                    }
                }
            }

            // Adjust power based on table size (15 reds = full size, 6 reds = mini)
            const isFullSize = redBalls.length >= 15;
            basePower = isFullSize ? 55 : 45;

            // For snooker break: aim at the side of the back right red
            // Thin cut on the right side of the ball
            const ballRadius = targetBall.radius || 12;
            const thinCutOffset = ballRadius * 0.5;

            // Offset perpendicular to aim line
            const aimDir = Vec2.normalize(Vec2.subtract(targetBall.position, cueBall.position));
            const perpendicular = { x: -aimDir.y, y: aimDir.x };

            // Offset to hit the right side of the target ball (positive y direction)
            const thinAimPoint = Vec2.add(targetBall.position, Vec2.multiply(perpendicular, thinCutOffset));

            const direction = Vec2.normalize(Vec2.subtract(thinAimPoint, cueBall.position));

            // Apply power variation based on difficulty
            const powerVariation = settings.powerError * basePower * 0.1;
            const power = basePower - Math.random() * powerVariation;

            // Apply aim error based on difficulty
            const aimError = (Math.random() - 0.5) * settings.aimError * (Math.PI / 180);
            const adjustedDir = Vec2.rotate(direction, aimError);

            // Add RIGHT-hand side spin for snooker break
            const spin = { x: 0.6, y: 0 }; // Right side

            if (this.onShot) {
                this.onShot(Vec2.normalize(adjustedDir), power, spin);
            }
            return; // Early return for snooker break
        } else {
            // Pool modes (8-ball, 9-ball, UK 8-ball): aim at apex, power 60
            // Find ball closest to cue ball (should be apex)
            let minDist = Infinity;
            targetBall = rackBalls[0];
            for (const ball of rackBalls) {
                const dist = Vec2.distance(cueBall.position, ball.position);
                if (dist < minDist) {
                    minDist = dist;
                    targetBall = ball;
                }
            }
            basePower = 60;
        }

        // Aim at the target ball
        const direction = Vec2.normalize(Vec2.subtract(targetBall.position, cueBall.position));

        // Apply power variation based on difficulty
        const powerVariation = settings.powerError * basePower * 0.1;
        const power = basePower - Math.random() * powerVariation;

        // Apply aim error based on difficulty (hard = perfect)
        const aimError = (Math.random() - 0.5) * settings.aimError * (Math.PI / 180);
        const adjustedDir = Vec2.rotate(direction, aimError);

        if (this.onShot) {
            this.onShot(Vec2.normalize(adjustedDir), power, { x: 0, y: 0 });
        }
    }

    // Find all possible shots and select the best one
    findBestShot() {
        const cueBall = this.game.cueBall;
        if (!cueBall || cueBall.pocketed) return null;

        const validTargets = this.getValidTargets();
        const pockets = this.table.pockets;
        const shots = [];

        // Enumerate all target + pocket combinations for direct shots
        for (const target of validTargets) {
            for (const pocket of pockets) {
                const shot = this.evaluatePotentialShot(cueBall.position, target, pocket);
                if (shot) {
                    shots.push(shot);
                }
            }
        }

        // If no direct shots found, try bank shots
        if (shots.length === 0) {
            for (const target of validTargets) {
                // Check if there's no direct path to this target
                if (!this.isPathClear(cueBall.position, target.position, [target])) {
                    // Try bank shots for each pocket
                    for (const pocket of pockets) {
                        const bankShot = this.calculateBankShot(cueBall.position, target, pocket);
                        if (bankShot && bankShot.score > 20) { // Only consider decent bank shots
                            shots.push(bankShot);
                        }
                    }
                }
            }
        }

        if (shots.length === 0) return null;

        // Sort by score (highest first)
        shots.sort((a, b) => b.score - a.score);

        // Select shot based on difficulty
        return this.selectShot(shots);
    }

    // Get valid target balls based on game mode
    getValidTargets() {
        const mode = this.game.mode;
        const balls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);

        switch (mode) {
            case GameMode.EIGHT_BALL:
                return this.getValidTargets8Ball(balls);
            case GameMode.NINE_BALL:
                return this.getValidTargets9Ball(balls);
            case GameMode.UK_EIGHT_BALL:
                return this.getValidTargetsUK8Ball(balls);
            case GameMode.SNOOKER:
                return this.getValidTargetsSnooker(balls);
            case GameMode.FREE_PLAY:
                return balls;
            default:
                return balls;
        }
    }

    // 8-Ball: Must hit own group, or 8-ball if group cleared
    getValidTargets8Ball(balls) {
        const playerGroup = this.game.currentPlayer === 1 ? this.game.player1Group : this.game.player2Group;

        if (!playerGroup) {
            // Groups not assigned yet - can hit any ball except 8-ball
            return balls.filter(b => !b.isEightBall);
        }

        const groupBalls = balls.filter(b => {
            if (playerGroup === 'solid') return b.isSolid;
            if (playerGroup === 'stripe') return b.isStripe;
            return false;
        });

        // If group cleared, target 8-ball
        if (groupBalls.length === 0) {
            return balls.filter(b => b.isEightBall);
        }

        return groupBalls;
    }

    // 9-Ball: Must hit lowest numbered ball first
    getValidTargets9Ball(balls) {
        const lowestBall = this.game.lowestBall;
        return balls.filter(b => b.number === lowestBall);
    }

    // UK 8-Ball: Similar to 8-ball but with group1/group2
    getValidTargetsUK8Ball(balls) {
        const playerGroup = this.game.currentPlayer === 1 ? this.game.player1Group : this.game.player2Group;

        if (!playerGroup) {
            return balls.filter(b => !b.isEightBall);
        }

        const groupBalls = balls.filter(b => {
            if (playerGroup === 'group1') return b.isGroup1;
            if (playerGroup === 'group2') return b.isGroup2;
            return false;
        });

        if (groupBalls.length === 0) {
            return balls.filter(b => b.isEightBall);
        }

        return groupBalls;
    }

    // Snooker: Red or specific color based on target
    getValidTargetsSnooker(balls) {
        const target = this.game.snookerTarget;

        if (target === 'red') {
            return balls.filter(b => b.isRed);
        } else if (target === 'color') {
            // Can hit any color
            return balls.filter(b => b.isColor);
        } else {
            // Specific color in sequence
            return balls.filter(b => b.colorName === target);
        }
    }

    // Evaluate a potential shot (target ball into pocket)
    evaluatePotentialShot(cueBallPos, target, pocket) {
        const ballRadius = target.radius || 12;
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Get adjusted aim point between pocket jaws (not center)
        const pocketAimPoint = this.getPocketAimPoint(target.position, pocket);

        // Calculate ghost ball position (where cue ball needs to hit)
        const ghostBall = this.calculateGhostBall(target.position, pocketAimPoint, ballRadius, cueBallRadius);

        // Check if path from cue ball to ghost ball is clear
        if (!this.isPathClear(cueBallPos, ghostBall, [target])) {
            return null;
        }

        // Check if path from target to pocket is clear (exclude target ball itself!)
        if (!this.isPathClear(target.position, pocketAimPoint, [target])) {
            return null;
        }

        // Calculate shot parameters
        const aimDirection = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
        const distanceToGhost = Vec2.distance(cueBallPos, ghostBall);
        const distanceToPocket = Vec2.distance(target.position, pocketAimPoint);

        // Calculate cut angle (angle between cue ball approach and pocket direction)
        const targetToPocket = Vec2.normalize(Vec2.subtract(pocketAimPoint, target.position));
        const cueBallToTarget = Vec2.normalize(Vec2.subtract(target.position, cueBallPos));
        const cutAngle = Math.acos(Math.max(-1, Math.min(1, Vec2.dot(cueBallToTarget, targetToPocket))));
        const cutAngleDeg = cutAngle * 180 / Math.PI;

        // Reject shots with extreme cut angles (over 85 degrees is nearly impossible)
        if (cutAngleDeg > 85) {
            return null;
        }

        // Check pocket approach angle (is the ball approaching pocket at a reasonable angle)
        if (!this.checkPocketApproach(target.position, pocket)) {
            return null;
        }

        // Score the shot
        const score = this.scoreShot(cutAngleDeg, distanceToGhost, distanceToPocket, pocket.type);

        // Calculate power needed
        const power = this.calculatePower(distanceToGhost, distanceToPocket, cutAngleDeg);

        return {
            target,
            pocket,
            ghostBall,
            direction: aimDirection,
            power,
            cutAngle: cutAngleDeg,
            score
        };
    }

    // Calculate ghost ball position for pocketing
    // Ghost ball = where cue ball center needs to be at moment of contact to send target to pocket
    calculateGhostBall(targetPos, pocketPos, targetRadius, cueBallRadius) {
        const direction = Vec2.normalize(Vec2.subtract(pocketPos, targetPos));
        // Contact point is targetRadius + cueBallRadius away from target center
        return Vec2.subtract(targetPos, Vec2.multiply(direction, targetRadius + cueBallRadius));
    }

    // Check if path between two points is clear of other balls
    isPathClear(start, end, excludeBalls) {
        const balls = this.game.balls.filter(b =>
            !b.pocketed &&
            !b.isCueBall &&
            !excludeBalls.includes(b)
        );

        const direction = Vec2.subtract(end, start);
        const distance = Vec2.length(direction);

        // If points are very close, path is clear
        if (distance < 1) return true;

        const normalized = Vec2.normalize(direction);
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Check for obstacles along the path
        for (const ball of balls) {
            const toball = Vec2.subtract(ball.position, start);
            const projection = Vec2.dot(toball, normalized);

            // Ball is behind start or beyond end (with small tolerance)
            if (projection < -5 || projection > distance + 5) continue;

            // Calculate perpendicular distance to path
            const closestPoint = Vec2.add(start, Vec2.multiply(normalized, Math.max(0, Math.min(distance, projection))));
            const perpDist = Vec2.distance(ball.position, closestPoint);

            // Check if ball blocks the path (use slightly smaller margin for better shot finding)
            const ballRadius = ball.radius || 12;
            const clearance = ballRadius + cueBallRadius - 2; // Allow slight overlap for edge cases
            if (perpDist < clearance) {
                return false;
            }
        }

        return true;
    }

    // Check if pocket approach angle is valid
    checkPocketApproach(targetPos, pocket) {
        const approachAngle = this.calculatePocketApproachAngle(targetPos, pocket);

        // Corner pockets accept balls from wider angles
        // Side pockets are more restrictive but still fairly generous
        const maxAngle = pocket.type === 'corner' ? 80 : 60;

        return approachAngle <= maxAngle;
    }

    // Calculate the angle of approach to the pocket
    calculatePocketApproachAngle(targetPos, pocket) {
        const pocketPos = pocket.position;
        const tableCenter = this.table.center;

        // Direction from target to pocket (direction ball will travel)
        const shotDir = Vec2.normalize(Vec2.subtract(pocketPos, targetPos));

        // Ideal direction for ball to enter pocket
        // This should be the direction a ball would travel to go INTO the pocket
        let idealDir;
        if (pocket.type === 'corner') {
            // For corners, ideal entry is from the table center direction toward the pocket
            idealDir = Vec2.normalize(Vec2.subtract(pocketPos, tableCenter));
        } else {
            // For side pockets, ideal entry is perpendicular to the long rail
            // Top pocket (y < center): ball travels up (negative y)
            // Bottom pocket (y > center): ball travels down (positive y)
            idealDir = { x: 0, y: pocketPos.y < tableCenter.y ? -1 : 1 };
        }

        const dot = Vec2.dot(shotDir, idealDir);
        return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }

    // Calculate aim point between pocket jaws (not center)
    // This adjusts the target point based on approach angle to aim between the cushion jaws
    getPocketAimPoint(_targetPos, pocket) {
        const pocketPos = pocket.position;
        const pocketRadius = pocket.radius || 22;

        // Move the aim point inward from pocket center toward the table
        // This places it between the jaws rather than at the back of the pocket
        const jawOffset = pocketRadius * 0.4; // Aim point is 40% of radius inside the opening

        if (pocket.type === 'corner') {
            // For corners, pull aim point diagonally toward table center
            const tableCenter = this.table.center;
            const toCenter = Vec2.normalize(Vec2.subtract(tableCenter, pocketPos));
            return Vec2.add(pocketPos, Vec2.multiply(toCenter, jawOffset));
        } else {
            // For side pockets, pull aim point perpendicular to the rail (into table)
            const yDir = pocketPos.y < this.table.center.y ? 1 : -1;
            return { x: pocketPos.x, y: pocketPos.y + jawOffset * yDir };
        }
    }

    // Calculate a bank shot off the rail
    calculateBankShot(cueBallPos, target, pocket) {
        const bounds = this.table.bounds;
        const ballRadius = target.radius || 12;
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Try each rail as a potential bank surface
        const rails = [
            { name: 'top', y: bounds.top, axis: 'y', normal: { x: 0, y: 1 } },
            { name: 'bottom', y: bounds.bottom, axis: 'y', normal: { x: 0, y: -1 } },
            { name: 'left', x: bounds.left, axis: 'x', normal: { x: 1, y: 0 } },
            { name: 'right', x: bounds.right, axis: 'x', normal: { x: -1, y: 0 } }
        ];

        const pocketAimPoint = this.getPocketAimPoint(target.position, pocket);
        let bestBankShot = null;
        let bestScore = -Infinity;

        for (const rail of rails) {
            // Calculate reflection point on this rail
            // Mirror the pocket aim point across the rail
            let mirroredTarget;
            if (rail.axis === 'y') {
                mirroredTarget = { x: pocketAimPoint.x, y: 2 * rail.y - pocketAimPoint.y };
            } else {
                mirroredTarget = { x: 2 * rail.x - pocketAimPoint.x, y: pocketAimPoint.y };
            }

            // Ghost ball for hitting target toward mirrored point
            const ghostDir = Vec2.normalize(Vec2.subtract(mirroredTarget, target.position));
            const ghostBall = Vec2.subtract(target.position, Vec2.multiply(ghostDir, ballRadius + cueBallRadius));

            // Check if cue ball can reach ghost ball
            if (!this.isPathClear(cueBallPos, ghostBall, [target])) continue;

            // Calculate where target ball would hit the rail
            const toMirror = Vec2.subtract(mirroredTarget, target.position);
            let railHitPoint;
            if (rail.axis === 'y') {
                const t = (rail.y - target.position.y) / toMirror.y;
                if (t <= 0 || t > 1) continue; // Rail not in path
                railHitPoint = { x: target.position.x + toMirror.x * t, y: rail.y };
            } else {
                const t = (rail.x - target.position.x) / toMirror.x;
                if (t <= 0 || t > 1) continue;
                railHitPoint = { x: rail.x, y: target.position.y + toMirror.y * t };
            }

            // Check path from target to rail is clear
            if (!this.isPathClear(target.position, railHitPoint, [target])) continue;

            // Check path from rail to pocket is clear
            if (!this.isPathClear(railHitPoint, pocketAimPoint, [target])) continue;

            // Score this bank shot (lower than direct shots)
            const distToGhost = Vec2.distance(cueBallPos, ghostBall);
            const distToPocket = Vec2.distance(target.position, railHitPoint) + Vec2.distance(railHitPoint, pocketAimPoint);
            const cutAngle = this.calculateCutAngle(cueBallPos, target.position, mirroredTarget);

            // Bank shots are harder, so reduce score
            const baseScore = this.scoreShot(cutAngle, distToGhost, distToPocket, pocket.type);
            const bankPenalty = 25; // Bank shots scored lower
            const score = baseScore - bankPenalty;

            if (score > bestScore) {
                bestScore = score;
                const aimDirection = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
                bestBankShot = {
                    target,
                    pocket,
                    ghostBall,
                    direction: aimDirection,
                    power: this.calculatePower(distToGhost, distToPocket, cutAngle),
                    cutAngle,
                    score,
                    isBank: true,
                    rail: rail.name
                };
            }
        }

        return bestBankShot;
    }

    // Calculate cut angle between cue approach and target direction
    calculateCutAngle(cueBallPos, targetPos, aimPoint) {
        const cueBallToTarget = Vec2.normalize(Vec2.subtract(targetPos, cueBallPos));
        const targetToAim = Vec2.normalize(Vec2.subtract(aimPoint, targetPos));
        const dot = Vec2.dot(cueBallToTarget, targetToAim);
        return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }

    // Score a shot (0-100 scale)
    scoreShot(cutAngle, distanceToGhost, distanceToPocket, pocketType) {
        // Cut angle score: straight shots are easier
        const cutAngleScore = Math.max(0, 100 - (cutAngle / 90) * 100);

        // Distance score: closer is easier
        const maxDist = Math.max(this.table.width, this.table.height);
        const distanceScore = Math.max(0, 100 - (distanceToGhost / maxDist) * 60);

        // Pocket distance score
        const pocketDistScore = Math.max(0, 100 - (distanceToPocket / maxDist) * 40);

        // Pocket type bonus (corner pockets are easier)
        const pocketBonus = pocketType === 'corner' ? 10 : 0;

        // Weighted average
        return cutAngleScore * 0.35 +
               distanceScore * 0.25 +
               pocketDistScore * 0.20 +
               pocketBonus +
               15; // Base score for having a clear shot
    }

    // Select a shot based on difficulty
    selectShot(shots) {
        const settings = DIFFICULTY_SETTINGS[this.difficulty];

        if (shots.length === 0) return null;

        switch (settings.shotSelection) {
            case 'random':
                // Pick randomly from top 50%
                const topHalf = shots.slice(0, Math.ceil(shots.length / 2));
                return topHalf[Math.floor(Math.random() * topHalf.length)];

            case 'top3':
                // Pick best from top 3
                const top3 = shots.slice(0, Math.min(3, shots.length));
                return top3[Math.floor(Math.random() * top3.length)];

            case 'optimal':
            default:
                return shots[0];
        }
    }

    // Calculate power needed for the shot
    calculatePower(distanceToGhost, distanceToPocket, cutAngle = 0) {
        // Base power from total distance (cue to ghost + target to pocket)
        const totalDistance = distanceToGhost + distanceToPocket;

        // Power scales with distance - need more power for longer shots
        // Typical table is ~800px wide, so 400px is a medium shot
        // Base power of 12, scaling up with distance
        let power = 12 + (totalDistance / 40);

        // Cut shots need more power because energy transfers less efficiently
        // At 45° cut, only ~70% of energy transfers to target ball
        // At 60° cut, only ~50% transfers
        const cutFactor = 1 + (cutAngle / 60) * 0.8;
        power *= cutFactor;

        // Clamp to reasonable range - minimum 10, max 20
        return Math.max(10, Math.min(20, power));
    }

    // Execute the chosen shot
    executeShot(shot) {
        const settings = DIFFICULTY_SETTINGS[this.difficulty];

        let direction = shot.direction;

        // Cut-induced throw compensation disabled - was causing aim issues
        // TODO: Re-implement with correct direction calculation if needed

        // Apply aim error based on difficulty
        const aimError = (Math.random() - 0.5) * 2 * settings.aimError * (Math.PI / 180);
        direction = Vec2.rotate(direction, aimError);
        direction = Vec2.normalize(direction);

        // Apply power error
        let power = shot.power;
        const powerError = (Math.random() - 0.5) * 2 * settings.powerError;
        power = power * (1 + powerError);
        power = Math.max(2, Math.min(20, power));

        // Basic spin (no spin for now, could be enhanced for hard mode)
        const spin = { x: 0, y: 0 };

        if (this.onShot) {
            this.onShot(direction, power, spin);
        }
    }

    // Play a safety shot when no good pocketing options
    playSafety() {
        const cueBall = this.game.cueBall;
        if (!cueBall) return;

        const validTargets = this.getValidTargets();
        if (validTargets.length === 0) {
            // No valid targets at all - just hit any ball
            const anyBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);
            if (anyBalls.length === 0) return;
            validTargets.push(...anyBalls);
        }

        // Find a target we can actually reach (path is clear)
        let bestTarget = null;
        let bestDist = Infinity;

        for (const target of validTargets) {
            const dist = Vec2.distance(cueBall.position, target.position);
            // Check if we can reach this ball
            if (this.isPathClear(cueBall.position, target.position, [target])) {
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = target;
                }
            }
        }

        // If no clear path found, just aim at closest
        if (!bestTarget) {
            for (const target of validTargets) {
                const dist = Vec2.distance(cueBall.position, target.position);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = target;
                }
            }
        }

        if (!bestTarget) return;

        // Aim at the target - use decent power to at least scatter balls
        const direction = Vec2.normalize(Vec2.subtract(bestTarget.position, cueBall.position));

        // Power based on distance - need to at least reach the ball with some momentum
        const power = Math.max(8, Math.min(14, 6 + bestDist / 80));

        const settings = DIFFICULTY_SETTINGS[this.difficulty];

        // Apply aim error
        const aimError = (Math.random() - 0.5) * 2 * settings.aimError * (Math.PI / 180);
        const adjustedDir = Vec2.rotate(direction, aimError);

        if (this.onShot) {
            this.onShot(Vec2.normalize(adjustedDir), power, { x: 0, y: 0 });
        }
    }

    // Randomize who breaks (called at game start when AI is enabled)
    static randomizeBreak() {
        return Math.random() < 0.5 ? 1 : 2;
    }
}
