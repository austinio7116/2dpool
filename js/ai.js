// AI opponent system for pool game
// Supports 8-ball, 9-ball, UK 8-ball, and snooker modes with 3 difficulty levels

import { Vec2 } from './utils.js';
import { GameMode, GameState } from './game.js';

// Debug logging - set to true to see AI decision making
const AI_DEBUG = false;

function aiLog(...args) {
    if (AI_DEBUG) {
        console.log('%c[AI]', 'color: #4CAF50; font-weight: bold', ...args);
    }
}

function aiLogGroup(label) {
    if (AI_DEBUG) {
        console.group(`%c[AI] ${label}`, 'color: #4CAF50; font-weight: bold');
    }
}

function aiLogGroupEnd() {
    if (AI_DEBUG) {
        console.groupEnd();
    }
}

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
        aimError: 0.01,         // Small aim variation (1-2 degrees)
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
        this.physics = null;

        // Visualization overlay data (persists until shot completes)
        this.visualization = null;
    }

    // Clear visualization when shot completes
    clearVisualization() {
        this.visualization = null;
    }

    // Get current visualization for rendering
    getVisualization() {
        return this.visualization;
    }

    setDifficulty(difficulty) {
        if (DIFFICULTY_SETTINGS[difficulty]) {
            this.difficulty = difficulty;
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    setPhysics(physics) {
        this.physics = physics;
        this.initializePocketGeometry(this.physics);
    }

    setGameReferences(game, table) {
        this.game = game;
        this.table = table;
    }

    initializePocketGeometry(physicsEngine) {
        if (!physicsEngine || !physicsEngine.railBodies) {
            console.error("AI: Physics engine missing or empty");
            return;
        }

        const railBodies = physicsEngine.railBodies;
        this.pocketJaws = [];

        const scale = this.physicsScale || 100;
        const bounds = this.table.bounds;

        console.log(`AI: Geometry Scan. Scale=${scale}. Bodies=${railBodies.length}`);

        // -----------------------------
        // Helpers
        // -----------------------------
        const distPointToSegment = (p, a, b) => {
            const abx = b.x - a.x, aby = b.y - a.y;
            const apx = p.x - a.x, apy = p.y - a.y;
            const abLen2 = abx * abx + aby * aby;
            if (abLen2 < 1e-8) return Math.hypot(apx, apy);

            let t = (apx * abx + apy * aby) / abLen2;
            t = Math.max(0, Math.min(1, t));
            const cx = a.x + abx * t;
            const cy = a.y + aby * t;
            return Math.hypot(p.x - cx, p.y - cy);
        };

        const distPointToPolyline = (p, verts) => {
            if (!verts || verts.length < 2) return Infinity;
            let best = Infinity;
            for (let i = 0; i < verts.length - 1; i++) {
                const d = distPointToSegment(p, verts[i], verts[i + 1]);
                if (d < best) best = d;
            }
            return best;
        };

        const centroid = (verts) => {
            let sx = 0, sy = 0;
            for (const v of verts) { sx += v.x; sy += v.y; }
            const n = Math.max(1, verts.length);
            return { x: sx / n, y: sy / n };
        };

        const computeDirection = (verts) => {
            // Stable direction: from first to last non-degenerate span
            for (let i = 0; i < verts.length - 1; i++) {
                const dx = verts[i + 1].x - verts[i].x;
                const dy = verts[i + 1].y - verts[i].y;
                const len = Math.hypot(dx, dy);
                if (len > 1e-3) return { x: dx / len, y: dy / len };
            }
            return { x: 1, y: 0 };
        };

        const classifyRailByBounds = (verts) => {
            // Classify polyline as top/bottom/left/right by centroid proximity to bounds
            const c = centroid(verts);
            const dTop = Math.abs(c.y - bounds.top);
            const dBottom = Math.abs(bounds.bottom - c.y);
            const dLeft = Math.abs(c.x - bounds.left);
            const dRight = Math.abs(bounds.right - c.x);

            let name = 'top';
            let best = dTop;

            if (dBottom < best) { best = dBottom; name = 'bottom'; }
            if (dLeft < best)   { best = dLeft;   name = 'left'; }
            if (dRight < best)  { best = dRight;  name = 'right'; }

            const axis = (name === 'top' || name === 'bottom') ? 'horizontal' : 'vertical';
            return { name, axis, centroid: c };
        };

        // -----------------------------
        // 1) Collect FULL rail polylines
        // -----------------------------
        const rawRails = []; // each is { verts: [...], body, fixture, userData }

        for (const body of railBodies) {
            let fixture = body.getFixtureList();
            const uData = body.getUserData();

            while (fixture) {
                const shape = fixture.getShape();
                const type = shape.getType();

                if (type === 'chain' && uData?.railType === 'chain') {
                    let vertices = shape.m_vertices;

                    if (!vertices || vertices.length === 0) {
                        vertices = [];
                        const count = shape.getChildCount
                            ? shape.getChildCount()
                            : (shape.m_count || 0);
                        for (let i = 0; i < count; i++) {
                            if (shape.getVertex) vertices.push(shape.getVertex(i));
                        }
                    }

                    if (vertices && vertices.length > 1) {
                        const vertsPx = [];
                        for (const v of vertices) {
                            const vx = (v.x !== undefined) ? v.x : 0;
                            const vy = (v.y !== undefined) ? v.y : 0;

                            const gx = vx * scale;
                            const gy = vy * scale;

                            if (!isNaN(gx) && !isNaN(gy)) {
                                vertsPx.push({ x: gx, y: gy });
                            }
                        }

                        if (vertsPx.length > 1) {
                            rawRails.push({
                                verts: vertsPx,
                                body,
                                fixture,
                                userData: uData
                            });
                        }
                    }
                }

                fixture = fixture.getNext();
            }
        }

        if (rawRails.length === 0) {
            console.error("AI: No chain rail polylines found.");
            return;
        }

        // -----------------------------
        // 2) Classify each polyline rail
        // -----------------------------
        const rails = rawRails.map((r, idx) => {
            const info = classifyRailByBounds(r.verts);
            const dir = computeDirection(r.verts);

            return {
                id: idx,
                verts: r.verts,     // FULL rail vertices (pixels)
                dir,                // approximate tangent direction
                name: info.name,    // 'top'|'bottom'|'left'|'right' (best guess)
                axis: info.axis,    // 'horizontal'|'vertical'
                centroid: info.centroid
            };
        });

        // Optional: collapse rails by side if you have multiple polylines per side.
        // If your physics creates 6 segments (pocket cuts), you can KEEP them all.
        // We'll just pick the two closest ones per pocket below.

        // -----------------------------
        // 3) For each pocket, pick the TWO closest rail polylines
        //    These are your "2 rail pieces that relate to the pocket by proximity".
        // -----------------------------
        const pockets = this.table.pockets;

        pockets.forEach((pocket, pIndex) => {
            const pocketPos = pocket.position;

            const sorted = rails
                .map(r => ({
                    rail: r,
                    d: distPointToPolyline(pocketPos, r.verts)
                }))
                .sort((a, b) => a.d - b.d);

            if (sorted.length < 2 || !isFinite(sorted[0].d) || !isFinite(sorted[1].d)) {
                this.pocketJaws[pIndex] = { isValid: false, center: pocketPos };
                return;
            }

            const railA = sorted[0].rail;
            const railB = sorted[1].rail;

            this.pocketJaws[pIndex] = {
                isValid: true,
                center: pocketPos,

                // FULL geometry for each pocket-adjacent rail piece:
                railA: railA.verts,
                railB: railB.verts,

                // Metadata so getPocketAimPoint can choose near/far by angle safely:
                railAInfo: { id: railA.id, name: railA.name, axis: railA.axis, dir: railA.dir, centroid: railA.centroid },
                railBInfo: { id: railB.id, name: railB.name, axis: railB.axis, dir: railB.dir, centroid: railB.centroid }
            };

            // Debug (optional)
            // console.log(`Pocket ${pIndex}: closest rails = ${railA.name} (id ${railA.id}), ${railB.name} (id ${railB.id})`);
        });
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
            return this.table.findValidKitchenPosition(this.game.balls, this.table.center.y + (Math.random() - 0.5) * 180);
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
                x: (yellowAbsolute.x + greenAbsolute.x) / 2 + (Math.random() - 0.5) * -3,
                y: yellowAbsolute.y * 0.7 + greenAbsolute.y * 0.3 + (Math.random() - 0.5) * 3 // 70% toward yellow
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
            aiLog('AI TURN - Difficulty:', this.difficulty, '| Mode:', this.game.mode);

            // Special handling for break shot - just hit the rack hard
            if (this.game.isBreakShot) {
                aiLog('Shot type: BREAK');
                this.playBreakShot();
            } else {
                const shot = this.findBestShot();

                if (shot) {
                    aiLog('Shot type: POTTING ATTEMPT');
                    this.executeShot(shot);
                } else {
                    // No good shot found, play safety
                    aiLog('Shot type: SAFETY (no good pots)');
                    this.playSafety();
                }
            }

            this.isThinking = false;
            if (this.onThinkingEnd) this.onThinkingEnd();
        }, settings.thinkingDelay);
    }

    // Play a break shot - different strategies for pool vs snooker
    playBreakShot() {
        aiLogGroup('Break Shot');
        const cueBall = this.game.cueBall;
        if (!cueBall) {
            aiLog('No cue ball found');
            aiLogGroupEnd();
            return;
        }

        const rackBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);
        if (rackBalls.length === 0) {
            aiLog('No rack balls found');
            aiLogGroupEnd();
            return;
        }

        const settings = DIFFICULTY_SETTINGS[this.difficulty];
        const isSnooker = this.game.mode === GameMode.SNOOKER;
        aiLog('Mode:', isSnooker ? 'SNOOKER' : 'POOL', '| Difficulty:', this.difficulty);

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
            basePower = isFullSize ? 55 : 46;
            aiLog('Table size:', isFullSize ? 'FULL (15 reds)' : 'MINI', '| Red count:', redBalls.length);
            aiLog('Target red:', `Ball at (${targetBall.position.x.toFixed(1)}, ${targetBall.position.y.toFixed(1)})`);

            // For snooker break: aim at the side of the back right red
            // Thin cut on the right side of the ball
            // Full-size tables need thinner contact to avoid sending cue ball into the pack
            const ballRadius = targetBall.radius || 12;
            const thinCutOffset = isFullSize ? ballRadius * + 0.5 + (Math.random() - 0.5) * 0.01 : ballRadius * + 0.5 + (Math.random() - 0.5) * 0.01;
            aiLog('Thin cut offset:', thinCutOffset.toFixed(2), '(', isFullSize ? '0.5x' : '0.5x', 'ball radius)');

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
            const spin = { x: 0.7 + (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.2 }; // Right side
            aiLog('Break shot params:', { power: power.toFixed(1), spin, aimError: (aimError * 180 / Math.PI).toFixed(2) + '°' });
            aiLogGroupEnd();

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
        aiLog('Pool break:', { power: power.toFixed(1), aimError: (aimError * 180 / Math.PI).toFixed(2) + '°' });
        aiLogGroupEnd();

        if (this.onShot) {
            this.onShot(Vec2.normalize(adjustedDir), power, { x: 0, y: 0 });
        }
    }

    // Find all possible shots and select the best one
    findBestShot() {
        aiLogGroup('Finding Best Shot');
        const cueBall = this.game.cueBall;
        if (!cueBall || cueBall.pocketed) {
            aiLog('No cue ball available');
            aiLogGroupEnd();
            return null;
        }

        const validTargets = this.getValidTargets();
        aiLog('Valid targets:', validTargets.length, 'balls');
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

        if (shots.length === 0) {
            aiLog('No valid shots found');
            aiLogGroupEnd();
            return null;
        }

        // Sort by score (highest first)
        shots.sort((a, b) => b.score - a.score);

        aiLog('Found', shots.length, 'possible shots');
        // Log top 3 shots
        const topShots = shots.slice(0, 3);
        topShots.forEach((s, i) => {
            const ballName = s.target.colorName || s.target.number || 'ball';
            const pocketName = s.pocket.type + (s.pocket.position.x < this.table.center.x ? '-left' : '-right');
            aiLog(`  #${i + 1}: ${ballName} → ${pocketName} | cut: ${s.cutAngle.toFixed(1)}° | score: ${s.score.toFixed(1)}${s.isBank ? ' (BANK)' : ''}`);
        });

        // Select shot based on difficulty
        const selected = this.selectShot(shots);
        const selectedBall = selected.target.colorName || selected.target.number || 'ball';
        aiLog('Selected:', selectedBall, '| Difficulty mode:', DIFFICULTY_SETTINGS[this.difficulty].shotSelection);
        aiLogGroupEnd();
        return selected;
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
        const pocketAimPoint = this.getPocketAimPoint(target.position, pocket, ballRadius);

        // Calculate ghost ball position (where cue ball needs to hit)
        const ghostBall = this.calculateGhostBall(target.position, pocketAimPoint, ballRadius, cueBallRadius);

        // CRITICAL: Check if we can legally reach and pot this ball without fouling
        // This is more thorough than just checking center-to-center paths

        // 1. Check if path from cue ball to ghost ball is clear
        if (!this.isPathClear(cueBallPos, ghostBall, [target])) {
            return null;
        }

        // 2. Check if path from target to pocket is clear
        if (!this.isPathClear(target.position, pocketAimPoint, [target])) {
            return null;
        }

        // 3. NEW: Check that no ball is blocking the potting angle
        // Even if we can reach the ghost ball, another ball near the target
        // could obstruct the required contact angle
        if (!this.isPottingAngleClear(cueBallPos, target, pocket)) {
            return null;
        }

        // 4. NEW: Check for balls that the cue ball would clip near the contact point
        // This catches cases where a ball is just off the direct path but would still be hit
        if (this.wouldClipBallNearTarget(cueBallPos, ghostBall, target)) {
            return null;
        }

        // Calculate shot parameters
        const aimDirection = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
        const distanceToGhost = Vec2.distance(cueBallPos, ghostBall);
        const distanceToPocket = Vec2.distance(target.position, pocketAimPoint);

        // Calculate cut angle (angle between cue ball aim line and pocket direction)
        // Must use ghostBall (where cue ball aims) not target center
        const targetToPocket = Vec2.normalize(Vec2.subtract(pocketAimPoint, target.position));
        const cueBallToGhost = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
        const cutAngle = Math.acos(Math.max(-1, Math.min(1, Vec2.dot(cueBallToGhost, targetToPocket))));
        const cutAngleDeg = cutAngle * 180 / Math.PI;

        // Reject shots with extreme cut angles (over 60 degrees is very difficult)
        // Exception: allow up to 75 degrees if ball is very close to pocket
        const isNearPocket = distanceToPocket < ballRadius * 4; // Within ~4 ball widths
        const maxCutAngle = isNearPocket ? 60 : 50;

        if (cutAngleDeg > maxCutAngle) {
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

    // Check if the potting angle is clear - no ball blocking the angle we need to hit
    isPottingAngleClear(cueBallPos, target, pocket) {
        const ballRadius = target.radius || 12;
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Get all balls that could interfere (not pocketed, not cue ball, not target)
        const otherBalls = this.game.balls.filter(b =>
            !b.pocketed && !b.isCueBall && b !== target
        );

        // Direction from cue ball approach to target
        const approachDir = Vec2.normalize(Vec2.subtract(target.position, cueBallPos));

        // Direction target needs to go (toward pocket)
        const pocketDir = Vec2.normalize(Vec2.subtract(pocket.position, target.position));

        // Check each ball to see if it's blocking the required angle
        for (const ball of otherBalls) {
            const otherRadius = ball.radius || 12;

            // Distance from this ball to the target ball
            const distToTarget = Vec2.distance(ball.position, target.position);

            // If this ball is very close to target, check if it blocks the potting angle
            if (distToTarget < (ballRadius + otherRadius + cueBallRadius) * 2) {
                // Vector from target to this other ball
                const targetToOther = Vec2.subtract(ball.position, target.position);

                // Check if this ball is in the "approach cone" - the area the cue ball
                // needs to travel through to make the shot
                const dotApproach = Vec2.dot(Vec2.normalize(targetToOther), Vec2.multiply(approachDir, -1));

                // If the ball is roughly behind the target (from cue ball's perspective)
                // and close enough to interfere with the contact
                if (dotApproach > 0.3) { // Ball is somewhat in the approach direction
                    // Check perpendicular distance to the approach line
                    const projLength = Vec2.dot(targetToOther, Vec2.multiply(approachDir, -1));
                    const closestOnLine = Vec2.add(target.position, Vec2.multiply(approachDir, -projLength));
                    const perpDist = Vec2.distance(ball.position, closestOnLine);

                    // If the ball is close enough to the approach line to cause interference
                    if (perpDist < (otherRadius + cueBallRadius) && projLength > 0 && projLength < cueBallRadius * 3) {
                        const blockerName = ball.colorName || ball.number || 'ball';
                        const targetName = target.colorName || target.number || 'ball';
                        if (AI_DEBUG) aiLog(`  Shot rejected: ${blockerName} blocks potting angle to ${targetName}`);
                        return false; // This ball blocks the potting angle
                    }
                }

                // Also check if ball blocks the pocket direction (between target and pocket)
                const dotPocket = Vec2.dot(Vec2.normalize(targetToOther), pocketDir);
                if (dotPocket > 0.5 && distToTarget < ballRadius + otherRadius + 5) {
                    const blockerName = ball.colorName || ball.number || 'ball';
                    const targetName = target.colorName || target.number || 'ball';
                    if (AI_DEBUG) aiLog(`  Shot rejected: ${blockerName} blocking pocket path from ${targetName}`);
                    return false;
                }
            }
        }

        return true;
    }

    // Check if cue ball would clip another ball when traveling to ghost ball position
    // This catches edge cases where a ball is just off the direct path
    wouldClipBallNearTarget(cueBallPos, ghostBall, target) {
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Get balls near the target/ghost ball area
        const otherBalls = this.game.balls.filter(b =>
            !b.pocketed && !b.isCueBall && b !== target
        );

        const approachDir = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
        const distToGhost = Vec2.distance(cueBallPos, ghostBall);

        for (const ball of otherBalls) {
            const otherRadius = ball.radius || 12;

            // Check distance from this ball to the ghost ball position
            const distToGhostBall = Vec2.distance(ball.position, ghostBall);

            // If a ball is very close to where the cue ball needs to be at contact
            if (distToGhostBall < (cueBallRadius + otherRadius) * 1.5) {
                // More careful check: would the cue ball hit this ball?
                const toBall = Vec2.subtract(ball.position, cueBallPos);
                const projection = Vec2.dot(toBall, approachDir);

                // Only check balls that are along our path (not behind us)
                if (projection > 0 && projection < distToGhost + cueBallRadius) {
                    const closestPoint = Vec2.add(cueBallPos, Vec2.multiply(approachDir, projection));
                    const perpDist = Vec2.distance(ball.position, closestPoint);

                    // Use full collision radius (no tolerance) for this close-range check
                    if (perpDist < (cueBallRadius + otherRadius)) {
                        const clipName = ball.colorName || ball.number || 'ball';
                        const targetName = target.colorName || target.number || 'ball';
                        if (AI_DEBUG) aiLog(`  Shot rejected: would clip ${clipName} near ${targetName}`);
                        return true; // Would clip this ball
                    }
                }
            }
        }

        return false;
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

        // Corner pockets accept wide angles
        // Side pockets need at least 30 degrees from the rail - shots along the
        // rail toward the middle pocket will rattle in the jaws
        const maxAngle = pocket.type === 'corner' ? 80 : 60;

        return approachAngle <= maxAngle;
    }

    // Calculate the angle of approach to the pocket
    // Returns 0 for ideal approach, higher for more difficult angles
    calculatePocketApproachAngle(targetPos, pocket) {
        const pocketPos = pocket.position;
        const tableCenter = this.table.center;

        // Direction from target to pocket (direction ball will travel)
        const shotDir = Vec2.normalize(Vec2.subtract(pocketPos, targetPos));

        if (pocket.type === 'corner') {
            // For corners, ideal entry is from the table center direction toward the pocket
            const idealDir = Vec2.normalize(Vec2.subtract(pocketPos, tableCenter));
            const dot = Vec2.dot(shotDir, idealDir);
            return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        } else {
            // For side pockets, measure angle FROM THE RAIL
            // 0 degrees = along the rail (bad - will rattle)
            // 90 degrees = perpendicular to rail (ideal)
            // We want at least 30 degrees from the rail

            // Convert to angle from rail: 0 = along rail, 90 = perpendicular
            const angleFromRail = Math.asin(Math.min(1, Math.abs(shotDir.y))) * 180 / Math.PI;

            // Return angle as deviation from ideal (perpendicular)
            // Perpendicular = 0 deviation, along rail = 90 deviation
            // But we want shots at 30+ degrees from rail to be acceptable
            // So: perpAngle = 90 - angleFromRail
            // perpAngle of 0 = perpendicular (best)
            // perpAngle of 60 = 30 degrees from rail (acceptable limit)
            // perpAngle of 90 = along rail (worst, reject)
            return 90 - angleFromRail;
        }
    }

    /**
     * getPocketAimPoint using pocket-local rail identity from initializePocketGeometry()
     *
     * Requires initializePocketGeometry() to have stored:
     *   this.pocketJaws[pocketIndex] = {
     *     railA: [...full polyline verts...],
     *     railB: [...full polyline verts...],
     *     railAInfo: { axis: 'horizontal'|'vertical', centroid: {x,y}, ... },
     *     railBInfo: { axis: 'horizontal'|'vertical', centroid: {x,y}, ... }
     *   }
     *
     * Logic (per your spec):
     * 1) For this pocket, we have exactly two rail pieces by proximity: railA & railB.
     * 2) "Near" rail = shallower angle between (rail line) and (target->pocket) line.
     *    - horizontal rail line => angle = asin(|refDir.y|)
     *    - vertical rail line   => angle = asin(|refDir.x|)
     * 3) Start 30° from the FAR side (open side away from near rail), sweep toward near rail,
     *    and find the first angle where a thick scan ray (ballRadius + margin corridor)
     *    first touches the near rail geometry.
     * 4) Aim point = point on that ray closest to pocket center (projection), clamped to [0, distToPocket].
     *
     * Coordinate system: x right, y down.
     */
    getPocketAimPoint(targetPos, pocket, ballRadius) {
        if (!targetPos) return pocket.position;

        const pocketIndex = this.table.pockets.indexOf(pocket);
        const jaws = this.pocketJaws?.[pocketIndex];

        if (!jaws || !jaws.isValid || !jaws.railA || !jaws.railB || !jaws.railAInfo || !jaws.railBInfo) {
            return pocket.position;
        }

        const pocketPos = pocket.position;

        // Thickness of the scan corridor
        const margin = 2;
        const thickR = ballRadius + margin;

        // Reference direction: target -> pocket center
        const refVec = Vec2.subtract(pocketPos, targetPos);
        const distToPocket = Vec2.length(refVec);
        if (distToPocket < 1e-6) return pocketPos;

        const refDir = Vec2.normalize(refVec);
        const refAngle = Math.atan2(refVec.y, refVec.x);

        // Wrap angle to [-PI, PI]
        const wrapPI = (a) => {
            while (a > Math.PI) a -= 2 * Math.PI;
            while (a < -Math.PI) a += 2 * Math.PI;
            return a;
        };

        // Relative angle of a point around target vs reference direction
        const relAngleToPoint = (p) => {
            const a = Math.atan2(p.y - targetPos.y, p.x - targetPos.x);
            return wrapPI(a - refAngle);
        };

        // Angle between refDir and a rail *line direction* given the rail axis
        // (this is your "simple angle check")
        const angleToRailLine = (axis) => {
            // horizontal rail line is (1,0) => angle = asin(|refDir.y|)
            // vertical   rail line is (0,1) => angle = asin(|refDir.x|)
            return axis === 'horizontal'
                ? Math.asin(Math.min(1, Math.abs(refDir.y)))
                : Math.asin(Math.min(1, Math.abs(refDir.x)));
        };

        // 1) Pick near rail (shallower angle) among the two pocket-adjacent rails
        const angA = angleToRailLine(jaws.railAInfo.axis);
        const angB = angleToRailLine(jaws.railBInfo.axis);

        let nearVerts, nearCentroid;
        if (angA < angB) {
            nearVerts = jaws.railA;
            nearCentroid = jaws.railAInfo.centroid;
        } else if (angB < angA) {
            nearVerts = jaws.railB;
            nearCentroid = jaws.railBInfo.centroid;
        } else {
            // Tie: pick whichever rail piece is closer to the pocket center
            const cA = jaws.railAInfo.centroid;
            const cB = jaws.railBInfo.centroid;
            const dA = Math.hypot(cA.x - pocketPos.x, cA.y - pocketPos.y);
            const dB = Math.hypot(cB.x - pocketPos.x, cB.y - pocketPos.y);
            if (dA <= dB) {
                nearVerts = jaws.railA;
                nearCentroid = cA;
            } else {
                nearVerts = jaws.railB;
                nearCentroid = cB;
            }
        }

        if (!nearVerts || nearVerts.length < 2) return pocketPos;

        // 2) Determine which side (CW vs CCW) we must rotate to move toward the NEAR rail.
        // Use the centroid direction: if we rotate the ray toward where the near rail sits, we should "hit" it.
        // We decide the sweep direction by the sign of cross(refDir, toNear).
        const toNear = Vec2.normalize(Vec2.subtract(nearCentroid, targetPos));
        const cross = refDir.x * toNear.y - refDir.y * toNear.x;

        // cross > 0 => toNear is CCW from refDir => sweep CCW (increasing relative angle)
        // cross < 0 => toNear is CW  from refDir => sweep CW  (decreasing relative angle)
        const sweepSign = (cross >= 0) ? +1 : -1;

        // 3) Start 30° on the FAR (open) side: opposite the direction toward near rail
        const startRel = -sweepSign * (30 * Math.PI / 180);

        // 4) Find first touch angle using angular blocked-interval entry (vertex-based)
        // Each vertex v blocks [ang-width, ang+width] where width=asin(thickR/dist).
        let touchRel = null;

        if (sweepSign > 0) {
            // sweeping CCW (increasing angle)
            let best = Infinity;

            for (const v of nearVerts) {
                const dx = v.x - targetPos.x;
                const dy = v.y - targetPos.y;
                const d = Math.hypot(dx, dy);
                if (d <= thickR + 1e-6) continue;

                const ang = relAngleToPoint(v);
                const width = Math.asin(Math.min(1, thickR / d));

                // As we increase angle, we enter at (ang - width)
                const enter = ang - width;

                if (enter >= startRel && enter < best) best = enter;
            }

            if (best !== Infinity) touchRel = best;
        } else {
            // sweeping CW (decreasing angle)
            let best = -Infinity;

            for (const v of nearVerts) {
                const dx = v.x - targetPos.x;
                const dy = v.y - targetPos.y;
                const d = Math.hypot(dx, dy);
                if (d <= thickR + 1e-6) continue;

                const ang = relAngleToPoint(v);
                const width = Math.asin(Math.min(1, thickR / d));

                // As we decrease angle, we enter at (ang + width)
                const enter = ang + width;

                if (enter <= startRel && enter > best) best = enter;
            }

            if (best !== -Infinity) touchRel = best;
        }

        if (touchRel === null) return pocketPos;

        // 5) Convert touch angle to a scan ray
        const finalAngle = refAngle + touchRel;
        const scanDir = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };

        // 6) Return point on that ray closest to the pocket center (projection),
        // clamped between target and pocket center distance.
        const t = Math.max(0, Math.min(distToPocket, Vec2.dot(refVec, scanDir)));

        return {
            x: targetPos.x + scanDir.x * t,
            y: targetPos.y + scanDir.y * t
        };
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

        const pocketAimPoint = this.getPocketAimPoint(target.position, pocket, ballRadius);
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

            const cutAngleDeg = cutAngle * 180 / Math.PI;

            const maxCutAngle = 40;

            if (cutAngleDeg > maxCutAngle) {
                continue;  // Too extreme cut angle for bank shot
            }

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
    scoreShot(cutAngle, distanceToGhost, distanceToPocket, _pocketType) {
        // 1. Cut Angle Score
        // Keep linear, but reduce overall impact in the final sum.
        const cutAngleScore = Math.max(0, 100 - (cutAngle / 90) * 100);

        // 2. Cue Ball Distance Score (Exponential Decay)
        // Previous logic was too linear. This penalizes long shots significantly more.
        const maxDist = Math.max(this.table.width, this.table.height);
        
        // Normalize distance: 0 = close, 1 = max table distance
        const normalizedDist = distanceToGhost / maxDist;
        
        // Use a power curve (x^1.5) so short shots stay high-scoring, 
        // but medium-long shots drop off faster than linear.
        // Factor 90 ensures cross-table shots score very low (10/100).
        const distanceScore = Math.max(0, 100 - (Math.pow(normalizedDist, 1.2) * 90));

        // 3. Object Ball Distance Score (Target to Pocket)
        // Similar to cue ball, longer travel = higher risk of missing/collision
        const pocketDistScore = Math.max(0, 100 - (distanceToPocket / maxDist) * 80);

        // 4. Rebalanced Weights
        // Old: Angle (0.35), CueDist (0.25), PocketDist (0.20)
        // New: Angle (0.20), CueDist (0.45), PocketDist (0.25)
        // This forces the AI to prefer being close to the ball above all else.
        return cutAngleScore * 0.20 +
               distanceScore * 0.15 +
               pocketDistScore * 0.55 +
               10; // Slightly lower base score to filter out truly bad shots
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
        // Base power of 15, scaling up with distance
        let power = 5 + (totalDistance / 40);

        // Cut shots need more power because energy transfers less efficiently
        // At 45° cut, only ~70% of energy transfers to target ball
        // At 60° cut, only ~50% transfers
        const cutFactor = 1 + (cutAngle / 60) * 0.5;
        power *= cutFactor;

        // Clamp to reasonable range - minimum 5, max 50
        return Math.max(5, Math.min(50, power));
    }

    // Execute the chosen shot
    executeShot(shot) {
        aiLogGroup('Executing Shot');
        const ballName = shot.target.colorName || shot.target.number || 'ball';
        aiLog('Target:', ballName, '| Cut angle:', shot.cutAngle.toFixed(1) + '°', '| Base power:', shot.power.toFixed(1));

        const settings = DIFFICULTY_SETTINGS[this.difficulty];
        const cueBallPos = this.game.cueBall.position;
        const ballRadius = shot.target.radius || 12;

        // Store initial aim direction before any adjustments
        const initialDirection = Vec2.clone(shot.direction);
        let adjustedGhostBall = Vec2.clone(shot.ghostBall);
        let directionAfterThrow = initialDirection;

        // Cut-induced throw compensation for shots > 5 degrees
        // Instead of rotating aim angle (which affects long shots more),
        // shift the ghost ball position by a fixed distance
        if (shot.cutAngle > 1) {
            const throwShift = this.calculateThrowShift(shot, ballRadius);
            aiLog('Throw compensation: shift ghost ball by', throwShift.toFixed(2), 'px');

            // Shift ghost ball perpendicular to the shot line
            const perpendicular = { x: -initialDirection.y, y: initialDirection.x };

            // Determine shift direction based on cut direction
            const cueToBall = Vec2.subtract(shot.target.position, cueBallPos);
            const ballToPocket = Vec2.subtract(shot.pocket.position, shot.target.position);
            const cross = cueToBall.x * ballToPocket.y - cueToBall.y * ballToPocket.x;
            const shiftDir = cross > 0 ? -1 : 1; // Shift to aim thinner

            adjustedGhostBall = Vec2.add(shot.ghostBall, Vec2.multiply(perpendicular, throwShift * shiftDir));
            directionAfterThrow = Vec2.normalize(Vec2.subtract(adjustedGhostBall, cueBallPos));
        } else {
            aiLog('No throw compensation (cut ≤ 1°)');
            directionAfterThrow = Vec2.clone(initialDirection);
        }

        let direction = directionAfterThrow;

        // Apply aim error based on difficulty (still as angle, but this is intentional variance)
        const aimError = (Math.random() - 0.5) * 2 * settings.aimError * (Math.PI / 180);
        direction = Vec2.rotate(direction, aimError);
        direction = Vec2.normalize(direction);
        aiLog('Aim error applied:', (aimError * 180 / Math.PI).toFixed(2) + '°');

        // Apply power error
        let power = shot.power;
        const powerError = (Math.random() - 0.5) * 2 * settings.powerError;
        power = power * (1 + powerError);
        
        // Decide whether to use backspin
        const spin = this.calculateSpin(shot);

        if (spin.y > 0.05) {
            const drawStrength = Math.min(1, Math.abs(spin.y)); // 0..1
            power *= (1 + 0.20 * drawStrength); // +0%..+20%
        }
        //power = Math.max(2, Math.min(20, power));
        aiLog('Final power:', power.toFixed(1), '(error:', (powerError * 100).toFixed(1) + '%)');


        // Store visualization data for rendering overlay
        const pocketAimPoint = this.getPocketAimPoint(shot.target.position, shot.pocket, ballRadius);
        this.visualization = {
            cueBallPos: Vec2.clone(cueBallPos),
            ghostBall: shot.ghostBall,                    // Original ghost ball
            adjustedGhostBall: adjustedGhostBall,         // After throw compensation
            targetBallPos: Vec2.clone(shot.target.position),
            pocketAimPoint: pocketAimPoint,
            pocketPos: shot.pocket.position,
            initialAimLine: initialDirection,       // Before throw compensation
            throwAdjustedLine: directionAfterThrow, // After throw, before error
            finalAimLine: direction,                // Final direction with error
            cutAngle: shot.cutAngle
        };

        aiLogGroupEnd();
        if (this.onShot) {
            this.onShot(direction, power, spin);
        }
    }

    // Calculate throw compensation as a DISTANCE to shift the ghost ball
    // Returns pixels to shift (always positive, direction determined in executeShot)
    // This is distance-independent - same shift regardless of shot length
    calculateThrowShift(shot, ballRadius) {
        const cutAngleDeg = shot.cutAngle;
        if (cutAngleDeg < 1 || cutAngleDeg > 65) return 0;

        const thetaRad = cutAngleDeg * Math.PI / 180;
        // Friction constant: usually 0.1
        const friction = 0.1; 
        
        // Normalized power: map your power (10-50) to a relative speed factor
        const speedFactor = Math.max(0.5, shot.power / 20);

        // CIT formula: (R * mu * sin(2*theta)) / Speed
        // High speed = less throw; 30-degree cut = max throw
        let throwAmount = (ballRadius * friction * Math.sin(2 * thetaRad)) / speedFactor;

        // Clamp to 15% of ball radius (maximum physically likely throw)
        return Math.min(throwAmount, ballRadius * 0.50);
    }

    // Calculate spin for the shot based on position play considerations
    // In main.js physics: spin.y > 0 = follow/topspin, spin.y < 0 = draw/backspin
    calculateSpin(shot) {
        aiLogGroup('Spin Decision');
        const cueBall = this.game.cueBall;
        if (!cueBall) {
            aiLog('No cue ball - using no spin');
            aiLogGroupEnd();
            return { x: 0, y: 0 };
        }

        let spinY = 0;
        let reason = 'center ball (stun)';

        // Condition 1: Dead straight shot with object ball near pocket - USE BACKSPIN
        // This avoids following the object ball into the pocket (roll-in-off)
        if (shot.cutAngle < 8) {
            const distToPocket = Vec2.distance(shot.target.position, shot.pocket.position);
            const ballRadius = shot.target.radius || 12;
            aiLog('Condition 1: Straight shot check - cut:', shot.cutAngle.toFixed(1) + '°', '| dist to pocket:', distToPocket.toFixed(0) + 'px', '| threshold:', (ballRadius * 6).toFixed(0) + 'px');
            if (distToPocket < ballRadius * 6) {
                // More backspin for straighter shots and closer distances
                const backspinAmount = 0.5 + (1 - shot.cutAngle / 8) * 0.3;
                spinY = backspinAmount; // Negative = backspin/draw
                reason = 'straight shot near pocket - backspin to avoid roll-in';
                aiLog('  → TRIGGERED: backspin =', (spinY).toFixed(2));
            }
        } else {
            aiLog('Condition 1: Skipped (cut angle', shot.cutAngle.toFixed(1) + '° > 8°)');
        }

        // Condition 2: Check scratch risk with natural roll
        if (spinY === 0) {
            const naturalPath = this.predictCueBallPath(shot, 0); // 0 = stun/center ball
            aiLog('Condition 2: Scratch risk check (stun) -', naturalPath.scratchRisk ? 'RISK DETECTED' : 'no risk');
            if (naturalPath.scratchRisk) {
                // Try backspin to pull cue ball back
                spinY = 0.7;
                reason = 'scratch risk with stun - using backspin';
                aiLog('  → TRIGGERED: backspin = 0.70');
            }
        }

        // Condition 3: Compare position quality with different spin options
        if (spinY === 0) {
            // Evaluate position with stun, backspin, and topspin
            const stunScore = this.evaluateCueBallPosition(shot, 0);
            const backspinScore = this.evaluateCueBallPosition(shot, -0.5);
            const topspinScore = this.evaluateCueBallPosition(shot, 0.5);

            aiLog('Condition 3: Position comparison - stun:', stunScore.toFixed(1), '| backspin:', backspinScore.toFixed(1), '| topspin:', topspinScore.toFixed(1));

            // Also check scratch risk for each option
            const stunScratch = this.predictCueBallPath(shot, 0).scratchRisk;
            const backspinScratch = this.predictCueBallPath(shot, -0.5).scratchRisk;
            const topspinScratch = this.predictCueBallPath(shot, 0.5).scratchRisk;

            aiLog('  Scratch risks - stun:', stunScratch, '| backspin:', backspinScratch, '| topspin:', topspinScratch);

            // Penalize options that risk scratching
            const stunFinal = stunScratch ? stunScore - 50 : stunScore;
            const backspinFinal = backspinScratch ? backspinScore - 50 : backspinScore;
            const topspinFinal = topspinScratch ? topspinScore - 50 : topspinScore;

            // Pick best option
            if (backspinFinal > stunFinal && backspinFinal > topspinFinal && backspinFinal > stunScore - 10) {
                spinY = 0.5;
                reason = `backspin gives better position (${backspinFinal.toFixed(0)} vs stun ${stunFinal.toFixed(0)})`;
                aiLog('  → CHOSE: backspin');
            } else if (topspinFinal > stunFinal && topspinFinal > backspinFinal && topspinFinal > stunScore - 10) {
                spinY = -0.5;
                reason = `topspin gives better position (${topspinFinal.toFixed(0)} vs stun ${stunFinal.toFixed(0)})`;
                aiLog('  → CHOSE: topspin');
            } else {
                aiLog('  → CHOSE: stun (default or best)');
                reason = 'stun is optimal or safest';
            }
        }

        aiLog('DECISION: spin.y =', spinY.toFixed(2), '| Reason:', reason);
        aiLogGroupEnd();
        return { x: 0, y: spinY };
    }

    // Predict where cueball will go after contact
    // spinY: Positive = Backspin, Negative = Topspin, 0 = Stun
    predictCueBallPath(shot, spinY = 0) {
        const target = shot.target;
        const ghostPos = shot.ghostBall; // Deflection starts at ghost ball position

        // Direction target ball will travel (toward pocket)
        const targetDir = Vec2.normalize(Vec2.subtract(shot.pocket.position, target.position));
        const cueBallIncomingDir = shot.direction;

        let cueBallAfterDir;

        // Condition: Backspin (Positive spinY)
        if (spinY > 0.3) {
            // Draw: ball pulls back toward shooter
            cueBallAfterDir = Vec2.multiply(cueBallIncomingDir, -1);
        } 
        // Condition: Straight shots (very small cut angle)
        else if (shot.cutAngle < 5) {
            if (spinY < -0.3) {
                // Topspin: Follow through in target direction
                cueBallAfterDir = targetDir;
            } else {
                // Stun: stops dead (effectively no direction)
                cueBallAfterDir = { x: 0, y: 0 };
            }
        } 
        // Condition: Standard Cut Shot (Tangent Line / 90 degree rule)
        else {
            // The tangent line is perpendicular to the direction the object ball travels
            // Cross product determines which side of the target ball path the cue ball goes
            const cross = cueBallIncomingDir.x * targetDir.y - cueBallIncomingDir.y * targetDir.x;
            if (cross > 0) {
                cueBallAfterDir = { x: -targetDir.y, y: targetDir.x };
            } else {
                cueBallAfterDir = { x: targetDir.y, y: -targetDir.x };
            }

            // Blend Topspin (Negative spinY)
            // Topspin curves the ball forward from the tangent line toward the target direction
            if (spinY < -0.1) {
                const topspinStrength = Math.abs(spinY);
                cueBallAfterDir = Vec2.normalize(Vec2.add(
                    Vec2.multiply(cueBallAfterDir, 1 - topspinStrength * 0.7),
                    Vec2.multiply(targetDir, topspinStrength * 0.7)
                ));
            }
        }

        // Normalize if moving
        if (Vec2.length(cueBallAfterDir) > 0.01) {
            cueBallAfterDir = Vec2.normalize(cueBallAfterDir);
        }

        // Project and check scratch risk starting from Ghost Position
        const scratchRisk = this.checkPathNearPockets(ghostPos, cueBallAfterDir);

        return {
            direction: cueBallAfterDir,
            scratchRisk
        };
    }

    // Check if a path from position in direction goes near any pocket
    checkPathNearPockets(startPos, direction) {
        if (direction.x === 0 && direction.y === 0) return false;

        const pockets = this.table.pockets;
        const ballRadius = this.game.cueBall?.radius || 12;

        for (const pocket of pockets) {
            const toPocket = Vec2.subtract(pocket.position, startPos);
            const projection = Vec2.dot(toPocket, direction);

            // Pocket is behind the cue ball's path
            if (projection < 0) continue;

            // Point of closest approach to the pocket center
            const closestPoint = Vec2.add(startPos, Vec2.multiply(direction, projection));
            const distToPocketCenter = Vec2.distance(closestPoint, pocket.position);

            // SCRATCH LOGIC:
            // A scratch occurs if the cue ball's edge overlaps the pocket radius.
            // We also check projection distance; if the ball is very far away, 
            // friction would stop it before it scratches, but here we assume a full hit.
            if (distToPocketCenter < (pocket.radius + ballRadius * 0.5)) {
                return true;
            }
        }
        return false;
    }

    // Evaluate how good the cue ball position will be after the shot
    // spinY: positive = topspin/follow, negative = backspin/draw, 0 = stun
    evaluateCueBallPosition(shot, spinY = 0) {
        const target = shot.target;

        // Predict approximate cue ball position after shot with given spin
        const path = this.predictCueBallPath(shot, spinY);

        // Estimate where cue ball ends up (rough approximation)
        // Power and spin affect how far it travels after contact
        // Backspin reduces travel distance, topspin increases it
        let travelDist = shot.power * 15;
        if (spinY > 0) {
            // Backspin reduces forward travel (can even go negative for draw)
            travelDist *= Math.max(0.1, 1 + -spinY * 1.5); // spinY=-0.5 -> travelDist*0.35
        } else if (spinY < 0) {
            // Topspin increases follow-through
            travelDist *= (1 + -spinY * 0.5); // spinY=0.5 -> travelDist*1.25
        }

        const endPos = Vec2.add(target.position, Vec2.multiply(path.direction, travelDist));

        // Clamp to table bounds
        const bounds = this.table.bounds;
        endPos.x = Math.max(bounds.left + 20, Math.min(bounds.right - 20, endPos.x));
        endPos.y = Math.max(bounds.top + 20, Math.min(bounds.bottom - 20, endPos.y));

        // Find next target balls
        const validTargets = this.getValidTargets().filter(b => b !== target);
        if (validTargets.length === 0) {
            return 100; // No more targets, position doesn't matter
        }

        // Score based on how many pocketing opportunities from predicted position
        let bestScore = 0;
        for (const nextTarget of validTargets) {
            for (const pocket of this.table.pockets) {
                const potentialShot = this.evaluatePotentialShot(endPos, nextTarget, pocket);
                if (potentialShot && potentialShot.score > bestScore) {
                    bestScore = potentialShot.score;
                }
            }
        }

        return bestScore;
    }

    // Play a safety shot when no good pocketing options
    playSafety() {
        aiLogGroup('Safety Shot');
        aiLog('No good pocketing options - playing safety');

        const cueBall = this.game.cueBall;
        if (!cueBall) {
            aiLog('No cue ball');
            aiLogGroupEnd();
            return;
        }

        const validTargets = this.getValidTargets();
        if (validTargets.length === 0) {
            // No valid targets at all - just hit any ball
            const anyBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);
            if (anyBalls.length === 0) {
                aiLog('No balls to hit');
                aiLogGroupEnd();
                return;
            }
            validTargets.push(...anyBalls);
            aiLog('No valid targets - hitting any ball');
        }

        // Check if we're snookered (no direct path to any valid target)
        const isSnookered = this.checkIfSnookered(validTargets);

        if (isSnookered) {
            aiLog('AI is SNOOKERED - attempting escape');
            const escapeShot = this.findSnookerEscape(validTargets);

            if (escapeShot) {
                const targetName = escapeShot.target.colorName || escapeShot.target.number || 'ball';
                aiLog('Escape shot: bank off', escapeShot.rail, 'to hit', targetName,
                      '| Power:', escapeShot.power.toFixed(1));

                const settings = DIFFICULTY_SETTINGS[this.difficulty];
                const aimError = (Math.random() - 0.5) * 2 * settings.aimError * (Math.PI / 180);
                const adjustedDir = Vec2.rotate(escapeShot.direction, aimError);

                let power = escapeShot.power;
                const powerError = (Math.random() - 0.5) * 2 * settings.powerError;
                power = power * (1 + powerError);
                power = Math.max(5, Math.min(40, power));

                aiLogGroupEnd();
                if (this.onShot) {
                    this.onShot(Vec2.normalize(adjustedDir), power, { x: 0, y: 0 });
                }
                return;
            }
            aiLog('No escape found - will try direct shot anyway');
        }

        // Get opponent's target balls for snookering
        const opponentBalls = this.getOpponentTargets();
        aiLog('Opponent has', opponentBalls.length, 'target balls');

        // Find best safety shot - one that leaves opponent snookered or in a difficult position
        const safetyShot = this.findBestSafetyShot(validTargets, opponentBalls);

        if (safetyShot) {
            const targetName = safetyShot.target.colorName || safetyShot.target.number || 'ball';
            aiLog('Best safety: hit', targetName,
                  '| Angle:', safetyShot.contactAngle.toFixed(1) + '°',
                  '| Power:', safetyShot.power.toFixed(1),
                  '| Score:', safetyShot.score.toFixed(1));
            if (safetyShot.snookerBall) {
                const snookerName = safetyShot.snookerBall.colorName || safetyShot.snookerBall.number || 'ball';
                aiLog('  Snooker behind:', snookerName);
            }

            const settings = DIFFICULTY_SETTINGS[this.difficulty];

            // Apply aim error based on difficulty
            const aimError = (Math.random() - 0.5) * 2 * settings.aimError * (Math.PI / 180);
            const adjustedDir = Vec2.rotate(safetyShot.direction, aimError);

            // Apply power error
            let power = safetyShot.power;
            let spin = safetyShot.spin;
            const powerError = (Math.random() - 0.5) * 2 * settings.powerError;
            power = power * (1 + powerError);
            if (spin.y > 0.05) {
                const drawStrength = Math.min(1, Math.abs(spin.y)); // 0..1
                power *= (1 + 0.20 * drawStrength); // +0%..+20%
            }

            aiLogGroupEnd();
            if (this.onShot) {
                this.onShot(Vec2.normalize(adjustedDir), power, safetyShot.spin);
            }
            return;
        }

        // Fallback: just hit the closest reachable ball with moderate power
        aiLog('No good safety found - using basic safety');
        let bestTarget = null;
        let bestDist = Infinity;

        for (const target of validTargets) {
            const dist = Vec2.distance(cueBall.position, target.position);
            if (this.canLegallyReachBall(cueBall.position, target)) {
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = target;
                }
            }
        }

        // If still no target found and we're snookered, try the escape shot again with lower standards
        if (!bestTarget && isSnookered) {
            const desperateEscape = this.findSnookerEscape(validTargets, true);
            if (desperateEscape) {
                aiLog('Desperate escape attempt');
                const settings = DIFFICULTY_SETTINGS[this.difficulty];
                const aimError = (Math.random() - 0.5) * 2 * settings.aimError * (Math.PI / 180);
                const adjustedDir = Vec2.rotate(desperateEscape.direction, aimError);

                aiLogGroupEnd();
                if (this.onShot) {
                    this.onShot(Vec2.normalize(adjustedDir), desperateEscape.power, { x: 0, y: 0 });
                }
                return;
            }
        }

        if (!bestTarget) {
            aiLog('No legal target found - forced to foul');
            // Last resort: aim at nearest valid target even if blocked
            for (const target of validTargets) {
                const dist = Vec2.distance(cueBall.position, target.position);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = target;
                }
            }
        }

        if (!bestTarget) {
            aiLog('No target found at all');
            aiLogGroupEnd();
            return;
        }

        const targetName = bestTarget.colorName || bestTarget.number || 'ball';
        aiLog('Fallback target:', targetName);

        const direction = Vec2.normalize(Vec2.subtract(bestTarget.position, cueBall.position));
        const power = Math.max(8, Math.min(14, 6 + bestDist / 80));

        const settings = DIFFICULTY_SETTINGS[this.difficulty];
        const aimError = (Math.random() - 0.5) * 2 * settings.aimError * (Math.PI / 180);
        const adjustedDir = Vec2.rotate(direction, aimError);

        aiLogGroupEnd();
        if (this.onShot) {
            this.onShot(Vec2.normalize(adjustedDir), power, { x: 0, y: 0 });
        }
    }

    // Check if AI is snookered (no direct clear path to any valid target)
    checkIfSnookered(validTargets) {
        const cueBall = this.game.cueBall;
        if (!cueBall) return false;

        for (const target of validTargets) {
            if (this.canLegallyReachBall(cueBall.position, target)) {
                return false; // At least one target is reachable
            }
        }
        return true; // No targets reachable - we're snookered
    }

    // Check if we can legally reach a ball (path is clear of other balls)
    canLegallyReachBall(fromPos, targetBall) {
        const cueBallRadius = this.game.cueBall?.radius || 12;
        const targetRadius = targetBall.radius || 12;

        // Get all other balls (not cue ball, not target, not pocketed)
        const otherBalls = this.game.balls.filter(b =>
            !b.pocketed && !b.isCueBall && b !== targetBall
        );

        const direction = Vec2.subtract(targetBall.position, fromPos);
        const distance = Vec2.length(direction);
        if (distance < 1) return true;

        const normalized = Vec2.normalize(direction);

        // Check each ball to see if it blocks the path
        for (const ball of otherBalls) {
            const ballRadius = ball.radius || 12;
            const toBall = Vec2.subtract(ball.position, fromPos);
            const projection = Vec2.dot(toBall, normalized);

            // Ball is behind us or beyond target
            if (projection < 0 || projection > distance - targetRadius) continue;

            // Calculate perpendicular distance to path
            const closestPoint = Vec2.add(fromPos, Vec2.multiply(normalized, projection));
            const perpDist = Vec2.distance(ball.position, closestPoint);

            // Check if this ball blocks the path
            const clearance = ballRadius + cueBallRadius;
            if (perpDist < clearance) {
                return false; // Path is blocked
            }
        }

        return true;
    }

    // Find an escape shot when snookered - try all angles and trace through rail bounces
    findSnookerEscape(validTargets, desperate = false) {
        const cueBall = this.game.cueBall;
        if (!cueBall) return null;

        const escapeOptions = [];

        // Try angles all around (every 5 degrees = 72 angles)
        const angleStep = 5;
        for (let angleDeg = 0; angleDeg < 360; angleDeg += angleStep) {
            const angleRad = angleDeg * Math.PI / 180;
            const aimDir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };

            // Trace this shot path through rail bounces to see what ball we hit first
            const traceResult = this.traceShotPath(cueBall.position, aimDir, validTargets);

            if (traceResult && traceResult.hitsValidTarget) {
                // Calculate power based on total distance
                const power = Math.min(30, 12 + traceResult.totalDistance / 25);

                // Score: prefer shorter paths and fewer bounces
                let score = 100 - traceResult.totalDistance / 15 - traceResult.bounces * 15;

                // Bonus if we hit target without bouncing (direct shot we missed earlier)
                if (traceResult.bounces === 0) {
                    score += 20;
                }

                if (score > 0 || desperate) {
                    escapeOptions.push({
                        target: traceResult.targetHit,
                        rail: traceResult.bounces > 0 ? `${traceResult.bounces} cushion(s)` : 'direct',
                        direction: aimDir,
                        power,
                        score,
                        bounces: traceResult.bounces,
                        angle: angleDeg
                    });
                }
            }
        }

        if (escapeOptions.length === 0) {
            return null;
        }

        // Sort by score and return best
        escapeOptions.sort((a, b) => b.score - a.score);

        aiLog('Found', escapeOptions.length, 'escape options');
        const topEscape = escapeOptions[0];
        const targetName = topEscape.target.colorName || topEscape.target.number || 'ball';
        aiLog('Best escape: angle', topEscape.angle + '°', '→', targetName,
              '| bounces:', topEscape.bounces, '| score:', topEscape.score.toFixed(1));

        return topEscape;
    }

    // Trace a shot path through rail bounces and find what ball is hit first
    traceShotPath(startPos, aimDir, validTargets) {
        const cueBallRadius = this.game.cueBall?.radius || 12;
        const bounds = this.table.bounds;
        const margin = cueBallRadius + 2;

        // All balls we could potentially hit
        const allBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);

        let currentPos = { x: startPos.x, y: startPos.y };
        let currentDir = { x: aimDir.x, y: aimDir.y };
        let totalDistance = 0;
        let bounces = 0;
        const maxBounces = 3; // Allow up to 3 cushion bounces
        const maxDistance = 2000; // Safety limit

        while (bounces <= maxBounces && totalDistance < maxDistance) {
            // Find the first ball we'd hit along current path
            let firstBallHit = null;
            let firstBallDist = Infinity;

            for (const ball of allBalls) {
                const ballRadius = ball.radius || 12;
                const toBall = Vec2.subtract(ball.position, currentPos);
                const projection = Vec2.dot(toBall, currentDir);

                if (projection < 0) continue; // Ball is behind us

                // Calculate perpendicular distance to aim line
                const closestPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, projection));
                const perpDist = Vec2.distance(ball.position, closestPoint);

                // Check if we'd hit this ball
                const hitRadius = ballRadius + cueBallRadius;
                if (perpDist < hitRadius) {
                    // Calculate actual contact distance
                    const offset = Math.sqrt(Math.max(0, hitRadius * hitRadius - perpDist * perpDist));
                    const contactDist = projection - offset;
                    if (contactDist > 1 && contactDist < firstBallDist) {
                        firstBallDist = contactDist;
                        firstBallHit = ball;
                    }
                }
            }

            // Find distance to each rail
            let nearestRailDist = Infinity;
            let hitRail = null;

            // Top rail
            if (currentDir.y < -0.01) {
                const t = (bounds.top + margin - currentPos.y) / currentDir.y;
                if (t > 0 && t < nearestRailDist) {
                    nearestRailDist = t;
                    hitRail = 'top';
                }
            }
            // Bottom rail
            if (currentDir.y > 0.01) {
                const t = (bounds.bottom - margin - currentPos.y) / currentDir.y;
                if (t > 0 && t < nearestRailDist) {
                    nearestRailDist = t;
                    hitRail = 'bottom';
                }
            }
            // Left rail
            if (currentDir.x < -0.01) {
                const t = (bounds.left + margin - currentPos.x) / currentDir.x;
                if (t > 0 && t < nearestRailDist) {
                    nearestRailDist = t;
                    hitRail = 'left';
                }
            }
            // Right rail
            if (currentDir.x > 0.01) {
                const t = (bounds.right - margin - currentPos.x) / currentDir.x;
                if (t > 0 && t < nearestRailDist) {
                    nearestRailDist = t;
                    hitRail = 'right';
                }
            }

            // Do we hit a ball before the rail?
            if (firstBallHit && firstBallDist < nearestRailDist) {
                totalDistance += firstBallDist;

                // Check if it's a valid target
                const isValidTarget = validTargets.includes(firstBallHit);

                return {
                    hitsValidTarget: isValidTarget,
                    targetHit: firstBallHit,
                    totalDistance,
                    bounces
                };
            }

            // Hit the rail - bounce
            if (!hitRail) {
                break; // Something went wrong
            }

            // Move to rail contact point
            const railHitPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, nearestRailDist));
            totalDistance += nearestRailDist;

            // Check rail hit point isn't near a pocket (would go in)
            if (this.isNearPocket(railHitPoint)) {
                return null; // Would scratch
            }

            // Reflect direction off rail WITH cushion throw compensation
            // Cushion friction causes ball to come off straighter than pure reflection
            // The throw factor reduces the angle (0.75 = comes off 25% straighter)
            const cushionThrowFactor = 0.75;

            if (hitRail === 'top' || hitRail === 'bottom') {
                // For horizontal rails, the x component is the "along rail" part
                // Reduce it to simulate coming off straighter
                currentDir = {
                    x: currentDir.x * cushionThrowFactor,
                    y: -currentDir.y
                };
            } else {
                // For vertical rails, the y component is the "along rail" part
                currentDir = {
                    x: -currentDir.x,
                    y: currentDir.y * cushionThrowFactor
                };
            }
            // Re-normalize after throw adjustment
            currentDir = Vec2.normalize(currentDir);

            currentPos = railHitPoint;
            bounces++;
        }

        return null; // Didn't hit anything valid
    }

    // Check if a position is near a pocket
    isNearPocket(pos) {
        const pockets = this.table.pockets;
        for (const pocket of pockets) {
            const dist = Vec2.distance(pos, pocket.position);
            if (dist < pocket.radius + 10) {
                return true;
            }
        }
        return false;
    }

    // Check if path is clear of ALL balls (for snooker escape)
    isPathClearOfAllBalls(start, end, excludeBalls = []) {
        const cueBallRadius = this.game.cueBall?.radius || 12;
        const balls = this.game.balls.filter(b =>
            !b.pocketed && !b.isCueBall && !excludeBalls.includes(b)
        );

        const direction = Vec2.subtract(end, start);
        const distance = Vec2.length(direction);
        if (distance < 1) return true;

        const normalized = Vec2.normalize(direction);

        for (const ball of balls) {
            const ballRadius = ball.radius || 12;
            const toBall = Vec2.subtract(ball.position, start);
            const projection = Vec2.dot(toBall, normalized);

            if (projection < -5 || projection > distance + 5) continue;

            const closestPoint = Vec2.add(start, Vec2.multiply(normalized, Math.max(0, Math.min(distance, projection))));
            const perpDist = Vec2.distance(ball.position, closestPoint);

            const clearance = ballRadius + cueBallRadius;
            if (perpDist < clearance) {
                return false;
            }
        }

        return true;
    }

    // Get opponent's target balls (what they need to hit)
    getOpponentTargets() {
        const mode = this.game.mode;
        const balls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);
        const opponentPlayer = this.game.currentPlayer === 1 ? 2 : 1;

        switch (mode) {
            case GameMode.EIGHT_BALL: {
                const opponentGroup = opponentPlayer === 1 ? this.game.player1Group : this.game.player2Group;
                if (!opponentGroup) {
                    // Groups not assigned - opponent can hit anything except 8-ball
                    return balls.filter(b => !b.isEightBall);
                }
                const groupBalls = balls.filter(b => {
                    if (opponentGroup === 'solid') return b.isSolid;
                    if (opponentGroup === 'stripe') return b.isStripe;
                    return false;
                });
                // If opponent cleared their group, they're on the 8-ball
                if (groupBalls.length === 0) {
                    return balls.filter(b => b.isEightBall);
                }
                return groupBalls;
            }

            case GameMode.NINE_BALL:
                // Opponent must hit lowest ball
                return balls.filter(b => b.number === this.game.lowestBall);

            case GameMode.UK_EIGHT_BALL: {
                const opponentGroup = opponentPlayer === 1 ? this.game.player1Group : this.game.player2Group;
                if (!opponentGroup) {
                    return balls.filter(b => !b.isEightBall);
                }
                const groupBalls = balls.filter(b => {
                    if (opponentGroup === 'group1') return b.isGroup1;
                    if (opponentGroup === 'group2') return b.isGroup2;
                    return false;
                });
                if (groupBalls.length === 0) {
                    return balls.filter(b => b.isEightBall);
                }
                return groupBalls;
            }

            case GameMode.SNOOKER:
                // In snooker, opponent's target depends on current target
                // For safety, we want to hide reds if they're on reds, colors if on colors
                if (this.game.snookerTarget === 'red') {
                    return balls.filter(b => b.isRed);
                } else {
                    return balls.filter(b => b.isColor);
                }

            case GameMode.FREE_PLAY:
            default:
                return balls;
        }
    }

    // Find the best safety shot that leaves opponent in difficulty
    findBestSafetyShot(validTargets, opponentBalls) {
        const cueBall = this.game.cueBall;
        const cueBallRadius = cueBall?.radius || 12;
        const safetyOptions = [];

        // For each valid target we can reach directly
        for (const target of validTargets) {
            // First check if we can legally reach this ball at all
            if (!this.canLegallyReachBall(cueBall.position, target)) {
                continue; // Can't reach this ball legally
            }

            const ballRadius = target.radius || 12;

            // Try different contact angles (thin cuts to thick hits)
            // Contact angle: 0 = full ball (straight through), 90 = thinnest possible
            for (let contactAngle = 0; contactAngle <= 70; contactAngle += 10) {
                // Try both sides of the target ball (and center for angle 0)
                const sides = contactAngle === 0 ? [0] : [-1, 1];
                for (const side of sides) {
                    // Calculate ghost ball position for this contact angle
                    const directDir = Vec2.normalize(Vec2.subtract(target.position, cueBall.position));

                    // Perpendicular direction
                    const perpDir = { x: -directDir.y * side, y: directDir.x * side };

                    // Ghost ball offset based on contact angle
                    // contactAngle of 0 = full hit, 90 = miss
                    const angleRad = contactAngle * Math.PI / 180;
                    const lateralOffset = Math.sin(angleRad) * (ballRadius + cueBallRadius);

                    // Ghost ball position
                    const ghostBall = Vec2.add(
                        Vec2.subtract(target.position, Vec2.multiply(directDir, ballRadius + cueBallRadius)),
                        Vec2.multiply(perpDir, lateralOffset)
                    );

                    // CRITICAL: Check if the path to ghost ball would hit target FIRST
                    // (not some other ball before we reach the target)
                    const aimDir = Vec2.normalize(Vec2.subtract(ghostBall, cueBall.position));

                    // Verify we don't hit any other ball before reaching the target
                    if (!this.willHitTargetFirst(cueBall.position, aimDir, target)) {
                        continue; // Would hit wrong ball first - foul!
                    }

                    // Calculate minimum power needed to reach the target ball
                    const distanceToGhost = Vec2.distance(cueBall.position, ghostBall);
                    // Based on calculatePower formula: power = 12 + distance/35
                    // Need enough power to travel the distance with some margin
                    const minPowerToReach = 5 + (distanceToGhost / 40);

                    // Try different power levels
                    for (const power of [8, 12, 18, 24, 30]) {
                        // Skip power levels that won't reach the target ball
                        if (power < minPowerToReach) {
                            continue;
                        }
                        // Try with and without backspin
                        for (const spinY of [0, 0.5]) { // 0 = stun, 0.5 = backspin
                            // Predict where cue ball ends up
                            const cueBallEndPos = this.predictSafetyCueBallPosition(
                                cueBall.position, target.position, ghostBall,
                                aimDir, power, spinY, contactAngle
                            );

                            // Score this position based on opponent difficulty
                            const safetyScore = this.scoreSafetyPosition(
                                cueBallEndPos, opponentBalls, target
                            );

                            if (safetyScore.score > 0) {
                                safetyOptions.push({
                                    target,
                                    ghostBall,
                                    direction: aimDir,
                                    power,
                                    spin: { x: 0, y: spinY },
                                    contactAngle,
                                    cueBallEndPos,
                                    score: safetyScore.score,
                                    snookerBall: safetyScore.snookerBall
                                });
                            }
                        }
                    }
                }
            }
        }

        if (safetyOptions.length === 0) {
            return null;
        }

        // Sort by score and return best
        safetyOptions.sort((a, b) => b.score - a.score);

        // Log top options
        aiLog('Found', safetyOptions.length, 'safety options');
        const topOptions = safetyOptions.slice(0, 3);
        topOptions.forEach((opt, i) => {
            const name = opt.target.colorName || opt.target.number || 'ball';
            aiLog(`  #${i + 1}: ${name} | angle: ${opt.contactAngle}° | power: ${opt.power} | score: ${opt.score.toFixed(1)}`);
        });

        return safetyOptions[0];
    }

    // Check if shooting in a direction will hit the target ball FIRST (not another ball)
    willHitTargetFirst(cueBallPos, aimDir, targetBall) {
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Get all balls except cue ball
        const allBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);

        // Find which ball we hit first along this aim direction
        let firstHitBall = null;
        let firstHitDist = Infinity;

        for (const ball of allBalls) {
            const ballRadius = ball.radius || 12;
            const toBall = Vec2.subtract(ball.position, cueBallPos);
            const projection = Vec2.dot(toBall, aimDir);

            // Ball is behind us
            if (projection < 0) continue;

            // Calculate perpendicular distance to aim line
            const closestPoint = Vec2.add(cueBallPos, Vec2.multiply(aimDir, projection));
            const perpDist = Vec2.distance(ball.position, closestPoint);

            // Check if we'd hit this ball
            const hitRadius = ballRadius + cueBallRadius;
            if (perpDist < hitRadius) {
                // Calculate actual contact distance (accounting for ball radius)
                const contactDist = projection - Math.sqrt(Math.max(0, hitRadius * hitRadius - perpDist * perpDist));
                if (contactDist > 0 && contactDist < firstHitDist) {
                    firstHitDist = contactDist;
                    firstHitBall = ball;
                }
            }
        }

        // Return true only if the first ball we'd hit is the target
        return firstHitBall === targetBall;
    }

    // Predict where cue ball ends up after a safety shot
    predictSafetyCueBallPosition(_cueBallStart, targetPos, ghostBall, aimDir, power, spinY, contactAngle) {
        // After contact, cue ball deflects based on cut angle
        // Thinner cut = cue ball continues more in original direction
        // Fuller hit = more deflection (up to 90° for stun shot)

        const angleRad = contactAngle * Math.PI / 180;

        // Direction target ball will travel (roughly opposite of contact normal)
        const contactNormal = Vec2.normalize(Vec2.subtract(targetPos, ghostBall));

        // Tangent line (perpendicular to contact)
        const tangent = { x: -contactNormal.y, y: contactNormal.x };

        // For a stun shot, cue ball travels along tangent
        // For topspin, cue ball follows through more
        // For backspin, cue ball pulls back

        let deflectionDir;
        if (spinY > 0.3) {
            // Backspin - pull back toward original direction
            deflectionDir = Vec2.normalize(Vec2.add(
                Vec2.multiply(tangent, Math.cos(angleRad)),
                Vec2.multiply(aimDir, -spinY * 0.5)
            ));
        } else if (spinY < -0.3) {
            // Topspin - follow through
            deflectionDir = Vec2.normalize(Vec2.add(
                Vec2.multiply(tangent, Math.cos(angleRad) * 0.5),
                Vec2.multiply(contactNormal, 0.5)
            ));
        } else {
            // Stun - follow tangent line
            // Determine which way along tangent based on approach direction
            const dot = Vec2.dot(aimDir, tangent);
            deflectionDir = dot >= 0 ? tangent : Vec2.multiply(tangent, -1);
        }

        // Travel distance depends on power, cut angle, and spin
        // Thinner cuts transfer less energy to object ball, so cue ball keeps more speed
        const energyRetained = Math.cos(angleRad) * 0.7 + 0.3;
        let travelDist = power * 20 * energyRetained;

        // Backspin reduces travel, topspin increases
        if (spinY > 0) {
            travelDist *= (1 - spinY * 0.4);
        } else if (spinY < 0) {
            travelDist *= (1 - spinY * 0.3);
        }

        // Calculate end position
        let endPos = Vec2.add(targetPos, Vec2.multiply(deflectionDir, travelDist));

        // Simulate bounces off rails
        endPos = this.simulateRailBounces(targetPos, endPos);

        return endPos;
    }

    // Simple rail bounce simulation
    simulateRailBounces(startPos, endPos) {
        const bounds = this.table.bounds;
        const margin = 15; // Ball can't be right at the edge

        let currentPos = { x: startPos.x, y: startPos.y };
        let targetPos = { x: endPos.x, y: endPos.y };

        // Allow up to 3 bounces
        for (let bounce = 0; bounce < 3; bounce++) {
            // Check if we'd go out of bounds
            const outLeft = targetPos.x < bounds.left + margin;
            const outRight = targetPos.x > bounds.right - margin;
            const outTop = targetPos.y < bounds.top + margin;
            const outBottom = targetPos.y > bounds.bottom - margin;

            if (!outLeft && !outRight && !outTop && !outBottom) {
                break; // Within bounds
            }

            const direction = Vec2.subtract(targetPos, currentPos);
            const dist = Vec2.length(direction);
            if (dist < 1) break;

            const dir = Vec2.normalize(direction);

            // Find where we hit the rail
            let t = dist;
            let hitRail = null;

            if (outLeft && dir.x < 0) {
                const tLeft = (bounds.left + margin - currentPos.x) / dir.x;
                if (tLeft > 0 && tLeft < t) { t = tLeft; hitRail = 'left'; }
            }
            if (outRight && dir.x > 0) {
                const tRight = (bounds.right - margin - currentPos.x) / dir.x;
                if (tRight > 0 && tRight < t) { t = tRight; hitRail = 'right'; }
            }
            if (outTop && dir.y < 0) {
                const tTop = (bounds.top + margin - currentPos.y) / dir.y;
                if (tTop > 0 && tTop < t) { t = tTop; hitRail = 'top'; }
            }
            if (outBottom && dir.y > 0) {
                const tBottom = (bounds.bottom - margin - currentPos.y) / dir.y;
                if (tBottom > 0 && tBottom < t) { t = tBottom; hitRail = 'bottom'; }
            }

            if (!hitRail) break;

            // Move to rail contact point
            const hitPoint = Vec2.add(currentPos, Vec2.multiply(dir, t));
            const remainingDist = dist - t;

            // Reflect direction WITH cushion throw
            // Cushion friction causes ball to come off straighter (reduced angle)
            const cushionThrowFactor = 0.75;
            let newDir;
            if (hitRail === 'left' || hitRail === 'right') {
                // Vertical rail - y component is "along rail", reduce it
                newDir = { x: -dir.x, y: dir.y * cushionThrowFactor };
            } else {
                // Horizontal rail - x component is "along rail", reduce it
                newDir = { x: dir.x * cushionThrowFactor, y: -dir.y };
            }
            newDir = Vec2.normalize(newDir);

            // Energy loss on bounce
            const bounceEnergy = 0.7;
            currentPos = hitPoint;
            targetPos = Vec2.add(hitPoint, Vec2.multiply(newDir, remainingDist * bounceEnergy));
        }

        // Clamp to table bounds
        targetPos.x = Math.max(bounds.left + margin, Math.min(bounds.right - margin, targetPos.x));
        targetPos.y = Math.max(bounds.top + margin, Math.min(bounds.bottom - margin, targetPos.y));

        return targetPos;
    }

    // Score a safety position - higher score = better safety
    scoreSafetyPosition(cueBallEndPos, opponentBalls, hitTarget) {
        let score = 0;
        let bestSnookerBall = null;

        const pockets = this.table.pockets;

        // Get all balls that could act as blockers (not cue ball, not pocketed)
        const blockerBalls = this.game.balls.filter(b =>
            !b.pocketed && !b.isCueBall
        );

        // Check how many opponent balls we can snooker
        for (const opponentBall of opponentBalls) {

            // Check if there's a clear path from predicted cue position to this opponent ball
            const pathToOpponent = this.isPathClear(cueBallEndPos, opponentBall.position, [opponentBall]);

            if (!pathToOpponent) {
                // Great! Opponent can't directly see this ball - it's snookered
                score += 30;

                // Find which ball is blocking
                for (const blocker of blockerBalls) {
                    if (blocker === opponentBall) continue;
                    if (this.ballBlocksPath(cueBallEndPos, opponentBall.position, blocker)) {
                        if (!bestSnookerBall) bestSnookerBall = blocker;
                        break;
                    }
                }
            } else {
                // Can see the ball - but can they pot it?
                let canPotAny = false;
                for (const pocket of pockets) {
                    // Check if opponent has a potting opportunity
                    if (this.isPathClear(opponentBall.position, pocket.position, [opponentBall])) {
                        // Check the angle - if it's a difficult shot, that's good for us
                        const cueToBall = Vec2.normalize(Vec2.subtract(opponentBall.position, cueBallEndPos));
                        const ballToPocket = Vec2.normalize(Vec2.subtract(pocket.position, opponentBall.position));
                        const cutAngle = Math.acos(Math.max(-1, Math.min(1, Vec2.dot(cueToBall, ballToPocket)))) * 180 / Math.PI;

                        // If easy shot exists (< 45 degree cut), that's bad
                        if (cutAngle < 45) {
                            canPotAny = true;
                            break;
                        }
                    }
                }

                if (!canPotAny) {
                    // Opponent can see ball but can't easily pot it
                    score += 10;
                } else {
                    // Opponent has a makeable shot - bad position
                    score -= 20;
                }
            }
        }

        // Bonus for distance from opponent balls (harder for them to reach)
        let minDistToOpponent = Infinity;
        for (const opponentBall of opponentBalls) {
            const dist = Vec2.distance(cueBallEndPos, opponentBall.position);
            if (dist < minDistToOpponent) {
                minDistToOpponent = dist;
            }
        }
        // More distance is better, up to a point
        score += Math.min(20, minDistToOpponent / 30);

        // Penalty for being close to a pocket (risk of scratching if opponent kicks)
        let minDistToPocket = Infinity;
        for (const pocket of pockets) {
            const dist = Vec2.distance(cueBallEndPos, pocket.position);
            if (dist < minDistToPocket) {
                minDistToPocket = dist;
            }
        }
        if (minDistToPocket < 50) {
            score -= 20; // Too close to pocket
        } else if (minDistToPocket < 100) {
            score -= 10;
        }

        // Bonus for being near a rail (limits opponent's options)
        const bounds = this.table.bounds;
        const distToNearestRail = Math.min(
            cueBallEndPos.x - bounds.left,
            bounds.right - cueBallEndPos.x,
            cueBallEndPos.y - bounds.top,
            bounds.bottom - cueBallEndPos.y
        );
        if (distToNearestRail < 40) {
            score += 5; // Near cushion is good
        }

        // Big bonus if we're behind the ball we hit (and it's blocking opponent balls)
        const hitBallBlocking = opponentBalls.some(ob =>
            this.ballBlocksPath(cueBallEndPos, ob.position, hitTarget)
        );
        if (hitBallBlocking) {
            score += 25;
            if (!bestSnookerBall) bestSnookerBall = hitTarget;
        }

        return { score, snookerBall: bestSnookerBall };
    }

    // Check if a ball blocks the path between two points
    ballBlocksPath(start, end, ball) {
        const ballRadius = ball.radius || 12;
        const cueBallRadius = this.game.cueBall?.radius || 12;
        const blockRadius = ballRadius + cueBallRadius - 2;

        const direction = Vec2.subtract(end, start);
        const dist = Vec2.length(direction);
        if (dist < 1) return false;

        const normalized = Vec2.normalize(direction);
        const toBall = Vec2.subtract(ball.position, start);
        const projection = Vec2.dot(toBall, normalized);

        // Ball is behind start or beyond end
        if (projection < 0 || projection > dist) return false;

        // Calculate perpendicular distance to path
        const closestPoint = Vec2.add(start, Vec2.multiply(normalized, projection));
        const perpDist = Vec2.distance(ball.position, closestPoint);

        return perpDist < blockRadius;
    }

    // Randomize who breaks (called at game start when AI is enabled)
    static randomizeBreak() {
        return Math.random() < 0.5 ? 1 : 2;
    }
}
