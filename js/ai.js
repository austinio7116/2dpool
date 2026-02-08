// AI opponent system for pool game
// Supports 8-ball, 9-ball, UK 8-ball, and snooker modes with 3 difficulty levels

import { Vec2 } from './utils.js';
import { GameMode, GameState } from './game.js';
import { AI_PERSONAS, getPersonaById } from './ai-personas.js';
import { ShotSimulator } from './shot-simulator.js';

// Debug logging - set to true to see AI decision making
const AI_DEBUG = false;

// Trained angle error prediction model (loaded dynamically if available)
let angleModel = null;
let angleModelLoaded = false;

// Try to load the trained angle model
async function loadAngleModel() {
    try {
        const module = await import('./angle-model.js');
        if (module.predictAngleError && typeof module.predictAngleError === 'function') {
            angleModel = module;
            angleModelLoaded = true;
            console.log('[AI] Loaded trained angle model:', module.ANGLE_MODEL_INFO || 'no metadata');
        }
    } catch (e) {
        // Model not available - will use fallback calculateThrowShift
        angleModelLoaded = false;
        if (AI_DEBUG) {
            console.log('[AI] No trained angle model found, using default throw compensation');
        }
    }
}

// Attempt to load model on module init
loadAngleModel();

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

// Legacy difficulty settings removed - now using AI personas from ai-personas.js

export class AI {
    constructor() {
        this.difficulty = 'medium';
        this.enabled = false;
        this.isThinking = false;
        this.trainingMode = false;  // AI plays both sides (demo mode)

        // Persona system
        this.persona = null;   // Primary AI persona (player 2)
        this.persona2 = null;  // Second persona (player 1 in training mode)

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

        // Shot tracking for data collection
        this.pendingShot = null;  // Current shot being tracked
        this.shotHistory = [];    // All tracked shots
        this.lastTurnPlayer = null;

        // Track last shot that resulted in a foul (to avoid repeated fouls)
        this.lastFoulShot = null;  // { targetId, pocketIndex, cutAngle, direction }
        this.lastExecutedShot = null;  // Most recent shot executed (for foul tracking)
    }

    // Clear visualization when shot completes
    clearVisualization() {
        this.visualization = null;
        this.shotCandidates = null;
        this.chosenShotEndPos = null;
    }

    // Record that the AI's last shot resulted in a foul (called from main.js)
    recordFoul(shot) {
        // Use provided shot or fall back to lastExecutedShot
        const foulShot = shot || this.lastExecutedShot;
        if (foulShot && foulShot.target) {
            this.lastFoulShot = {
                targetId: foulShot.target.id || foulShot.target.number,
                pocketIndex: foulShot.pocket ? this.table.pockets.indexOf(foulShot.pocket) : -1,
                cutAngle: foulShot.cutAngle || 0,
                direction: foulShot.direction ? Vec2.clone(foulShot.direction) : null,
                isSafetyShot: foulShot.isSafetyShot || false
            };
            aiLog('Recorded foul shot:', this.lastFoulShot);
        }
    }

    // Clear foul tracking (called when AI successfully completes a shot without fouling)
    clearFoulTracking() {
        this.lastFoulShot = null;
    }

    // Get current visualization for rendering
    getVisualization() {
        if (!this.visualization && !this.shotCandidates && !this.chosenShotEndPos) return null;
        return {
            main: this.visualization,
            candidates: this.shotCandidates,
            chosenEndPos: this.chosenShotEndPos
        };
    }

    setDifficulty(difficulty) {
        // Backward compat: map old difficulty strings to default personas
        const difficultyToPersona = {
            easy: 'rookie_rick',
            medium: 'steady_sue',
            hard: 'the_machine'
        };
        if (difficulty === 'training') {
            this.trainingMode = true;
            this.persona = getPersonaById('the_machine');
            this.persona2 = getPersonaById('the_machine');
            this.difficulty = 'hard';
        } else if (difficultyToPersona[difficulty]) {
            this.trainingMode = false;
            this.persona = getPersonaById(difficultyToPersona[difficulty]);
            this.difficulty = difficulty;
        }
    }

    setPersona(persona) {
        if (persona) {
            this.persona = persona;
        }
    }

    setPersona2(persona) {
        if (persona) {
            this.persona2 = persona;
        }
    }

    getCurrentPersona() {
        // In training mode, switch persona based on current player
        if (this.trainingMode && this.game) {
            return this.game.currentPlayer === 1 ? (this.persona2 || this.persona) : this.persona;
        }
        return this.persona || getPersonaById('steady_sue');
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


    // Called when it's the AI's turn (player 2, or either player in training mode)
    takeTurn() {
        // In training mode, AI plays both sides; otherwise only player 2
        const isAIPlayer = this.trainingMode || this.game.currentPlayer === 2;
        if (!this.enabled || !this.game || !isAIPlayer) {
            return;
        }

        // NEW: Detect Turn Shift
        // If the current player is different from the last time we actively played,
        // it means the opponent took a turn in between.
        if (this.lastTurnPlayer !== this.game.currentPlayer) {
             // Exception: Snooker 'Restore' puts balls back, so we SHOULD keep foul memory.
             // But for standard play, clear it.
             const isRestore = this.game.pendingFoulDecision?.decision === 'restore';
             
             if (!isRestore) {
                 this.clearFoulTracking();
                 aiLog('[AI] New turn detected - clearing previous foul memory');
             }
             
             this.lastTurnPlayer = this.game.currentPlayer;
        }

        if (this.game.state === GameState.BALL_IN_HAND) {
            this.handleBallInHand();
        } else if (this.game.state === GameState.PLAYING) {
            this.planAndExecuteShot();
        } else if (this.game.state === GameState.AWAITING_DECISION) {
            this.handleSnookerDecision();
        }
    }

    // Handle snooker foul decision (play, restore, or put opponent back in)
    handleSnookerDecision() {
        const settings = this.getCurrentPersona();

        this.isThinking = true;
        if (this.onThinkingStart) this.onThinkingStart();

        setTimeout(() => {
            const foulInfo = this.game.pendingFoulDecision;
            if (!foulInfo) {
                this.isThinking = false;
                if (this.onThinkingEnd) this.onThinkingEnd();
                return;
            }

            aiLogGroup('Snooker Foul Decision');
            aiLog('Foul Info:', foulInfo);

            // Evaluate the table from the current cue ball position
            const cueBallPos = this.game.cueBall?.position;
            let currentShotScore = 0;

            if (cueBallPos) {
                const validTargets = this.getValidTargets();
                const pockets = this.table.pockets;

                for (const target of validTargets) {
                    for (const pocket of pockets) {
                        const shot = this.evaluatePotentialShot(cueBallPos, target, pocket);
                        if (shot && shot.score > currentShotScore) {
                            currentShotScore = shot.score;
                        }
                    }
                }
            }

            aiLog('Current best shot score:', currentShotScore.toFixed(1));

            // Evaluate free ball opportunities if available
            let freeBallScore = 0;
            if (foulInfo.isFreeBall && cueBallPos) {
                // With free ball, we can nominate any ball - find best opportunity
                const allBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);
                const pockets = this.table.pockets;
                for (const target of allBalls) {
                    for (const pocket of pockets) {
                        const shot = this.evaluatePotentialShot(cueBallPos, target, pocket);
                        if (shot && shot.score > freeBallScore) {
                            freeBallScore = shot.score;
                        }
                    }
                }
                aiLog('Free ball best shot score:', freeBallScore.toFixed(1));
            }

            let decision = 'play'; // Default: play from current position

            // Decision logic:
            // 1. If free ball gives significantly better opportunity, take it
            if (foulInfo.isFreeBall && freeBallScore > currentShotScore + 15 && freeBallScore > 40) {
                decision = 'free_ball';
                aiLog('Decision: free_ball (better opportunity, score:', freeBallScore.toFixed(1) + ')');
            }
            // 2. If we have a good shot (score > 50), play on
            else if (currentShotScore > 50) {
                decision = 'play';
                aiLog('Decision: play (good shot available, score:', currentShotScore.toFixed(1) + ')');
            }
            // 3. If free ball available and current position is mediocre, take free ball
            else if (foulInfo.isFreeBall && freeBallScore > 40) {
                decision = 'free_ball';
                aiLog('Decision: free_ball (mediocre position but free ball helps, score:', freeBallScore.toFixed(1) + ')');
            }
            // 4. If position is bad and restore is available (miss rule), restore
            else if (foulInfo.isMiss && foulInfo.canRestore && currentShotScore < 40) {
                decision = 'restore';
                aiLog('Decision: restore (bad position, score:', currentShotScore.toFixed(1) + ')');
            }
            // 5. If position is very bad (score < 30), put opponent back in
            else if (currentShotScore < 30) {
                decision = 'replay';
                aiLog('Decision: replay (very bad position, score:', currentShotScore.toFixed(1) + ')');
            }
            else {
                aiLog('Decision: play (default)');
            }

            aiLogGroupEnd();

            // Apply the decision through the game
            if (this.game.applySnookerDecision) {
                this.game.applySnookerDecision(decision);
            }

            this.isThinking = false;
            if (this.onThinkingEnd) this.onThinkingEnd();

            // If we chose to play or free_ball, schedule the shot after state updates
            if (decision === 'play' || decision === 'free_ball') {
                setTimeout(() => {
                    // If free ball was chosen, nominate the best target ball
                    if (decision === 'free_ball' && this.game.isFreeBall) {
                        this.nominateFreeBall();
                    }

                    if (this.game.state === GameState.PLAYING) {
                        this.planAndExecuteShot();
                    } else if (this.game.state === GameState.BALL_IN_HAND) {
                        this.handleBallInHand();
                    }
                }, 300);
            }
        }, settings.thinkingDelay);
    }

    // Nominate the best ball for free ball
    nominateFreeBall() {
        const cueBallPos = this.game.cueBall?.position;
        if (!cueBallPos) return;

        const allBalls = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);
        const pockets = this.table.pockets;
        let bestBall = null;
        let bestScore = -Infinity;

        for (const target of allBalls) {
            for (const pocket of pockets) {
                const shot = this.evaluatePotentialShot(cueBallPos, target, pocket);
                if (shot && shot.score > bestScore) {
                    bestScore = shot.score;
                    bestBall = target;
                }
            }
        }

        if (bestBall && this.game.setFreeBallNomination) {
            aiLog('AI nominates free ball:', bestBall.colorName || bestBall.number || 'ball');
            this.game.setFreeBallNomination(bestBall);
        }
    }

    // Handle ball-in-hand placement
    handleBallInHand() {
        const settings = this.getCurrentPersona();

        this.isThinking = true;
        if (this.onThinkingStart) this.onThinkingStart();

        setTimeout(() => {
            let position = this.findBestCueBallPosition();

            // Determine placement mode (must match main.js placeCueBall logic)
            let placementMode = 'anywhere';
            if (this.game.mode === GameMode.SNOOKER) {
                placementMode = 'dzone';
            } else if (this.game.isBreakShot || this.game.mode === GameMode.UK_EIGHT_BALL) {
                placementMode = 'kitchen';
            }

            // Validate position can actually be placed
            if (position && !this.game.canPlaceCueBall(position, placementMode)) {
                // Fallback to a valid position based on placement mode
                if (placementMode === 'dzone') {
                    position = this.table.findValidDPosition(this.game.balls, this.table.center.y);
                } else if (placementMode === 'kitchen') {
                    position = this.table.findValidKitchenPosition(this.game.balls, this.table.center.y);
                } else {
                    position = this.table.findValidCueBallPosition(this.game.balls, this.table.center.y);
                }
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

        // For snooker ball-in-hand (after foul), must place in D-zone
        if (this.game.mode === GameMode.SNOOKER) {
            return this.findBestDZonePosition();
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

        // Determine placement mode
        let placementMode = 'anywhere';
        if (kitchenOnly) {
            placementMode = 'kitchen';
        }

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
            if (!this.game.canPlaceCueBall(pos, placementMode)) continue;

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

    // Get snooker break position - on the line between yellow and brown spots
    getSnookerBreakPosition() {
        const tableCenter = this.table.center;
        const spots = this.table.spots;

        if (!spots || !spots.yellow || !spots.brown) {
            return this.table.findValidDPosition(this.game.balls, this.table.center.y);
        }

        const ballRadius = this.game.cueBall?.radius || 10;
        const minGap = ballRadius * 2 + 5; // At least 5px gap from touching either ball

        // Get absolute positions
        const yellowY = tableCenter.y + spots.yellow.y;
        const brownY = tableCenter.y + spots.brown.y;
        const x = tableCenter.x + spots.yellow.x; // Yellow and brown share same x (baulk line)

        // Determine which is lower/higher y value
        const lowerY = Math.min(yellowY, brownY);
        const upperY = Math.max(yellowY, brownY);

        // Available range between the two balls (with gap from each)
        const rangeStart = lowerY + minGap;
        const rangeEnd = upperY - minGap;

        if (rangeStart >= rangeEnd) {
            // Not enough space, use midpoint
            return { x, y: (yellowY + brownY) / 2 };
        }

        // Random position between yellow and brown
        const y = rangeStart + Math.random() * (rangeEnd - rangeStart);

        return { x, y };
    }

    // Find best position within the D-zone for snooker ball-in-hand
    findBestDZonePosition() {
        const validTargets = this.getValidTargets();
        const dGeometry = this.table.getDGeometry();

        if (!dGeometry) {
            return this.table.findValidDPosition(this.game.balls, this.table.center.y);
        }

        const { baulkX, centerY, radius } = dGeometry;
        const pockets = this.table.pockets;
        let bestPosition = null;
        let bestScore = -Infinity;

        // Sample positions within the D
        const sampleCount = 30;
        for (let i = 0; i < sampleCount; i++) {
            // Generate random point in D (semicircle)
            const r = Math.random() * radius * 0.9; // Stay slightly inside D
            const angle = Math.PI / 2 + Math.random() * Math.PI; // 90 to 270 degrees (left semicircle)
            const x = baulkX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            const pos = { x, y };

            // Check if valid position
            if (!this.game.canPlaceCueBall(pos, 'dzone')) continue;

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

        return bestPosition || this.table.findValidDPosition(this.game.balls, this.table.center.y);
    }

    // Make decision after opponent commits a foul (WPBSA rules)
    makeSnookerFoulDecision(foulInfo) {
        aiLog('Making snooker foul decision:', foulInfo);

        // Simple AI decision logic:
        // 1. If we have good shots available, play on
        // 2. If position is bad and restore is available, restore
        // 3. Otherwise play on

        const validTargets = this.getValidTargets();
        const cueBallPos = this.game.cueBall?.position;

        if (!cueBallPos || validTargets.length === 0) {
            // No valid targets, prefer restore if available
            if (foulInfo.canRestore) {
                aiLog('Decision: restore (no good shots)');
                return 'restore';
            }
            aiLog('Decision: play (no restore available)');
            return 'play';
        }

        // Evaluate current position
        let bestShotScore = 0;
        const pockets = this.table.pockets;

        for (const target of validTargets) {
            for (const pocket of pockets) {
                const shot = this.evaluatePotentialShot(cueBallPos, target, pocket);
                if (shot && shot.score > bestShotScore) {
                    bestShotScore = shot.score;
                }
            }
        }

        aiLog('Best shot score from current position:', bestShotScore);

        // If we have a reasonable shot (score > 50), play on
        if (bestShotScore > 50) {
            aiLog('Decision: play (good shot available)');
            return 'play';
        }

        // Position is bad - consider restore if available
        if (foulInfo.canRestore) {
            aiLog('Decision: restore (bad position)');
            return 'restore';
        }

        // No restore available, must play on
        aiLog('Decision: play (no restore available)');
        return 'play';
    }

    // Choose which color to nominate when targeting colors
    chooseColorNomination(balls) {
        // AI strategy: nominate the highest value color that's pottable
        const colorOrder = ['black', 'pink', 'blue', 'brown', 'green', 'yellow'];
        const colorValues = { yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7 };

        const cueBallPos = this.game.cueBall?.position;
        if (!cueBallPos) return 'black'; // Default to black

        const pockets = this.table.pockets;
        let bestColor = null;
        let bestScore = -Infinity;

        for (const colorName of colorOrder) {
            const colorBall = balls.find(b => b.isColor && b.colorName === colorName && !b.pocketed);
            if (!colorBall) continue;

            // Check if we can pot this color
            for (const pocket of pockets) {
                const shot = this.evaluatePotentialShot(cueBallPos, colorBall, pocket);
                if (shot) {
                    // Weight by color value and shot quality
                    const weightedScore = shot.score * (colorValues[colorName] / 7);
                    if (weightedScore > bestScore) {
                        bestScore = weightedScore;
                        bestColor = colorName;
                    }
                }
            }
        }

        // If no good shot found, just nominate the highest available color
        if (!bestColor) {
            for (const colorName of colorOrder) {
                const colorBall = balls.find(b => b.isColor && b.colorName === colorName && !b.pocketed);
                if (colorBall) {
                    bestColor = colorName;
                    break;
                }
            }
        }

        aiLog('AI nominated color:', bestColor || 'black');
        return bestColor || 'black';
    }

    // Main shot planning and execution
    planAndExecuteShot() {
        if (!this.game || this.game.state !== GameState.PLAYING) return;

        const settings = this.getCurrentPersona();

        this.isThinking = true;
        if (this.onThinkingStart) this.onThinkingStart();

        setTimeout(() => {
            aiLog('AI TURN - Persona:', settings.name, '| Mode:', this.game.mode);

            // Special handling for break shot - just hit the rack hard
            if (this.game.isBreakShot) {
                aiLog('Shot type: BREAK');
                this.playBreakShot();
            } else {
                const shot = this.findBestShot();

                if (shot) {
                    aiLog('Shot type: POTTING ATTEMPT');

                    // Handle snooker color nomination before executing shot
                    if (this.game.mode === GameMode.SNOOKER &&
                        this.game.snookerTarget === 'color' &&
                        shot.target.isColor) {
                        aiLog('Nominating color:', shot.target.colorName);
                        if (this.game.setNominatedColor) {
                            this.game.setNominatedColor(shot.target.colorName);
                        }
                    }

                    this.executeShot(shot);
                } else {
                    // No good shot found, play safety
                    aiLog('Shot type: SAFETY (no good pots)');

                    // For snooker safety, still need to nominate if on colors
                    if (this.game.mode === GameMode.SNOOKER && this.game.snookerTarget === 'color') {
                        const nomination = this.chooseColorNomination(this.game.balls);
                        if (this.game.setNominatedColor) {
                            this.game.setNominatedColor(nomination);
                        }
                    }

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

        const settings = this.getCurrentPersona();
        const isSnooker = this.game.mode === GameMode.SNOOKER;
        aiLog('Mode:', isSnooker ? 'SNOOKER' : 'POOL', '| Persona:', settings.name);

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
            basePower = isFullSize ? 35 : 35;
            aiLog('Table size:', isFullSize ? 'FULL (15 reds)' : 'MINI', '| Red count:', redBalls.length);
            aiLog('Target red:', `Ball at (${targetBall.position.x.toFixed(1)}, ${targetBall.position.y.toFixed(1)})`);

            // For snooker break: aim at the side of the back right red
            // Thin cut on the right side of the ball
            // Full-size tables need thinner contact to avoid sending cue ball into the pack
            const ballRadius = targetBall.radius || 12;
            const thinCutOffset = isFullSize ? ballRadius * + 1.8 + (Math.random() - 0.5) * 0.01 : ballRadius * + 1.7 + (Math.random() - 0.5) * 0.01;
            aiLog('Thin cut offset:', thinCutOffset.toFixed(2), '(', isFullSize ? '0.5x' : '0.5x', 'ball radius)');

            // Offset perpendicular to aim line
            const aimDir = Vec2.normalize(Vec2.subtract(targetBall.position, cueBall.position));
            const perpendicular = { x: -aimDir.y, y: aimDir.x };

            // Offset to hit the right side of the target ball (positive y direction)
            const thinAimPoint = Vec2.add(targetBall.position, Vec2.multiply(perpendicular, thinCutOffset));

            const direction = Vec2.normalize(Vec2.subtract(thinAimPoint, cueBall.position));

            // Apply power variation based on difficulty
            const powerVariation = settings.powerAccuracy * basePower * 0.1;
            const power = basePower - Math.random() * powerVariation;

            // Apply aim error based on difficulty
            const aimError = (Math.random() - 0.5) * settings.lineAccuracy * (Math.PI / 180);
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
        const powerVariation = settings.powerAccuracy * basePower * 0.1;
        const power = basePower - Math.random() * powerVariation;

        // Apply aim error based on difficulty (hard = perfect)
        const aimError = (Math.random() - 0.5) * settings.lineAccuracy * (Math.PI / 180);
        const adjustedDir = Vec2.rotate(direction, aimError);
        aiLog('Pool break:', { power: power.toFixed(1), aimError: (aimError * 180 / Math.PI).toFixed(2) + '°' });
        aiLogGroupEnd();

        if (this.onShot) {
            this.onShot(Vec2.normalize(adjustedDir), power, { x: 0, y: 0 });
        }
    }

    // Find all possible shots, simulating different powers/spins for position
    findBestShot() {
        aiLogGroup('Finding Best Shot');
        const cueBall = this.game.cueBall;
        if (!cueBall || cueBall.pocketed) return null;

        const validTargets = this.getValidTargets();
        const pockets = this.table.pockets;
        let candidateShots = [];

        // 1. Identify all geometrically possible pots and generate power/spin variants
        for (const target of validTargets) {
            for (const pocket of pockets) {
                const baseShot = this.evaluatePotentialShot(cueBall.position, target, pocket, { basicCheck: true });
                if (baseShot) {
                    const variants = this.analyzeShotVariants(cueBall.position, target, pocket, baseShot);
                    candidateShots.push(...variants);
                }
            }
        }

        // If no direct shots, look for banks
        if (candidateShots.length === 0) {
            aiLog('No direct shots, looking for banks...');
             for (const target of validTargets) {
                if (!this.isPathClear(cueBall.position, target.position, [target])) {
                    for (const pocket of pockets) {
                        const bankShot = this.calculateBankShot(cueBall.position, target, pocket);
                        if (bankShot && bankShot.score > 20) candidateShots.push(bankShot);
                    }
                }
            }
        }

        if (candidateShots.length === 0) {
            aiLogGroupEnd();
            return null;
        }

        const persona = this.getCurrentPersona();

        // 2. Group variants by target+pocket (each group = one pot opportunity)
        const shotGroups = new Map();
        const pocketNames = (p) => p.type + (p.position.x < this.table.center.x ? '-L' : '-R');
        for (const shot of candidateShots) {
            const key = `${shot.target.colorName || shot.target.number}->${pocketNames(shot.pocket)}`;
            if (!shotGroups.has(key)) shotGroups.set(key, []);
            shotGroups.get(key).push(shot);
        }

        // 3. For each group, find best potScore and best positionScore
        const groups = [];
        for (const [key, variants] of shotGroups) {
            const bestPot = Math.max(...variants.map(v => v.potScore));
            const bestPos = Math.max(...variants.map(v => v.positionScore));
            groups.push({ key, variants, bestPot, bestPos });
        }

        // Sort groups by potScore (pure potting simplicity)
        groups.sort((a, b) => b.bestPot - a.bestPot);

        // Store candidate summary for visualization overlay
        this.shotCandidates = groups.map(g => {
            const best = g.variants.reduce((a, b) => b.compositeScore > a.compositeScore ? b : a);
            return {
                targetPos: Vec2.clone(best.target.position),
                pocketPos: { x: best.pocket.position.x, y: best.pocket.position.y },
                ghostBall: Vec2.clone(best.ghostBall),
                potScore: g.bestPot,
                key: g.key
            };
        });

        // Log ranked pot opportunities
        aiLog('--- Pot opportunities (ranked by potScore) ---');
        for (const g of groups) {
            aiLog(`  ${g.key}  pot:${g.bestPot.toFixed(0)}  pos:${g.bestPos.toFixed(0)}  (${g.variants.length} variants)`);
        }

        // 4. Pick the easiest pot, unless a similar-difficulty pot has much better position
        //    Controlled by persona.position: 0 = never switch for position, 1 = full switching
        let chosenGroup = groups[0];
        const posAwareness = persona.position;

        if (posAwareness > 0.05) {
            // Scale thresholds: higher position = more willing to sacrifice pot for position
            const POT_SIMILARITY_THRESHOLD = 10 * posAwareness;    // 0→0, 1→10
            const POS_ADVANTAGE_THRESHOLD = 25 / posAwareness;     // 0.2→125, 0.5→50, 1→25

            for (let i = 1; i < groups.length; i++) {
                const potDiff = chosenGroup.bestPot - groups[i].bestPot;
                const posDiff = groups[i].bestPos - chosenGroup.bestPos;
                if (potDiff <= POT_SIMILARITY_THRESHOLD && posDiff >= POS_ADVANTAGE_THRESHOLD) {
                    aiLog(`Switching: ${groups[i].key} similar pot (-${potDiff.toFixed(0)}) but much better pos (+${posDiff.toFixed(0)})`);
                    chosenGroup = groups[i];
                    break;
                }
            }
        }

        // 5. Within chosen group, filter to variants that maintain potting confidence
        const POT_DROP_LIMIT = 15;
        const viable = chosenGroup.variants.filter(v => v.potScore >= chosenGroup.bestPot - POT_DROP_LIMIT);
        const pool = viable.length > 0 ? viable : chosenGroup.variants;

        // 5b. Physics simulation pass — simulate all viable variants with Planck
        // Done here (not earlier) so every selectable variant has accurate position data
        if (persona.position > 0) {
            this.resimulateTopCandidates(pool, persona);
        }

        // Sort variants: position=0 sorts purely by potScore (easiest pot),
        // position=1 sorts purely by positionScore (best leave)
        // Lower power = more reliable position prediction, so boost position
        // score for softer shots (up to +10 at minimum power, scaled by awareness)
        pool.sort((a, b) => {
            const aPowerBonus = (1 - a.power / 50) * 10 * posAwareness;
            const bPowerBonus = (1 - b.power / 50) * 10 * posAwareness;
            const aScore = a.potScore * (1 - posAwareness) + (a.positionScore + aPowerBonus) * posAwareness;
            const bScore = b.potScore * (1 - posAwareness) + (b.positionScore + bPowerBonus) * posAwareness;
            return bScore - aScore;
        });

        // Apply shotSelection personality to pick from sorted variants
        const bestOption = this.selectShot(pool);

        const ballName = bestOption.target.colorName || bestOption.target.number;
        const pocketName = bestOption.pocket.type;
        // Format the "Next Ball" string
        let positionInfo = "None";
        if (bestOption.nextBall) {
            const nbName = bestOption.nextBall.colorName || bestOption.nextBall.number;
            positionInfo = `Ball ${nbName}`;
        }

        aiLog(`🎯 TARGET SELECTED: ${ballName} (into ${pocketName})`);
        aiLog(`🎱 PLAYING FOR POSITION ON: ${positionInfo} (Score: ${bestOption.positionScore.toFixed(0)})`);
        aiLog(`--- Selected: ${ballName}->${pocketNames(bestOption.pocket)} | pot:${bestOption.potScore.toFixed(0)} pos:${bestOption.positionScore.toFixed(0)} | power:${bestOption.power.toFixed(0)} spin:${bestOption.spin?.y?.toFixed(1) || '0'} | via ${persona.shotSelection} from ${pool.length} viable ---`);

        // 6. Confidence check (safetyBias determines risk tolerance)
        const baseThreshold = this.game.mode !== GameMode.SNOOKER ? 0 : 20;
        const minPotConfidence = baseThreshold + ((persona.safetyBias + 30) / 50) * 40;

        if (bestOption.potScore < minPotConfidence) {
            aiLog(`Low confidence: ${bestOption.potScore.toFixed(0)} < ${minPotConfidence.toFixed(0)} (safetyBias: ${persona.safetyBias})`);

            // Rescue: is there any variant across ALL groups with potScore well above threshold?
            const rescueThreshold = minPotConfidence + 5;
            const safePot = candidateShots.find(s => s.potScore > rescueThreshold);
            if (safePot) {
                const safeName = safePot.target.colorName || safePot.target.number;
                aiLog(`RESCUE: ${safeName} pot:${safePot.potScore.toFixed(0)} — taking safe pot over risky position`);
                // Simulate rescue shot for accurate end position
                this.resimulateTopCandidates([safePot], persona);
                this.chosenShotEndPos = safePot.cueBallEndPos ? { x: safePot.cueBallEndPos.x, y: safePot.cueBallEndPos.y } : null;
                aiLogGroupEnd();
                return safePot;
            }

            // Compare against safety play
            const opponentTargets = this.getOpponentTargets();
            const bestSafety = this.findBestSafetyShot(validTargets, opponentTargets);
            const safetyQuality = bestSafety ? bestSafety.score : 0;
            const aggressionBias = 25 - persona.safetyBias;

            if (safetyQuality < (bestOption.potScore + aggressionBias)) {
                aiLog(`ATTACK: safety(${safetyQuality.toFixed(0)}) < pot(${bestOption.potScore.toFixed(0)}) + aggression(${aggressionBias}) — going for it`);
                this.chosenShotEndPos = bestOption.cueBallEndPos ? { x: bestOption.cueBallEndPos.x, y: bestOption.cueBallEndPos.y } : null;
                aiLogGroupEnd();
                return bestOption;
            }

            aiLog(`SAFETY: safety(${safetyQuality.toFixed(0)}) beats pot(${bestOption.potScore.toFixed(0)}) + aggression(${aggressionBias})`);
            this.chosenShotEndPos = null;
            aiLogGroupEnd();
            return null;
        }

        aiLog(`ACCEPTED (pot:${bestOption.potScore.toFixed(0)} >= threshold:${minPotConfidence.toFixed(0)})`);
        this.chosenShotEndPos = bestOption.cueBallEndPos ? { x: bestOption.cueBallEndPos.x, y: bestOption.cueBallEndPos.y } : null;
        aiLogGroupEnd();
        return bestOption;
    }

    // Generate variations (Soft/Med/Hard + Top/Stun/Back) for a specific pot
    analyzeShotVariants(cueBallPos, target, pocket, baseGeometry) {
        const variants = [];
        
        // 1. Calculate the "Pure" Geometric Difficulty once
        const baseDifficulty = this.calculatePottingDifficulty(cueBallPos, target, pocket, true);

        // 1. Calculate Minimum Power Needed
        const distCueToTarget = Vec2.distance(cueBallPos, target.position);
        const distTargetToPocket = Vec2.distance(target.position, pocket.position);
        const totalDist = distCueToTarget + distTargetToPocket;
        
        // Cut angle: thinner cuts transfer less energy, need more cue ball power
        const cutRad = baseGeometry.cutAngle * Math.PI / 180;
        const cutFactor = 1 / Math.max(0.3, Math.cos(cutRad));
        // minPowerToReach in "desired potting strength" units (before cut scaling)
        const minPottingPower = (totalDist / 45) + 2;

        // 2. Define Your Sweep Arrays
        // (Using the values you provided)
        const powerLevels = [2.5, 3.5, 4.5, 5.5, 6.5, 8.5, 10.5, 13.5, 18.5, 21.5, 26.5, 39.5, 38.5, 45.5];
        const persona = this.getCurrentPersona();
        const maxSpin = persona.spinAbility;
        const allSpinLevels = [-0.9, -0.5, -0.2, 0, 0.2, 0.5, 0.9];
        const spinLevels = allSpinLevels.filter(s => Math.abs(s) <= maxSpin); // Filter by spinAbility

        // 3. Iterate All Permutations
        // powerLevels represent desired potting strength; we scale by cut angle to get actual cue ball power
        for (const pottingPower of powerLevels) {

            // FILTER: Skip powers that are too soft to reach the pocket
            if (pottingPower < minPottingPower) continue;

            // Scale to actual cue ball power needed at this cut angle
            const cueBallPower = pottingPower * cutFactor;

            for (const spinY of spinLevels) {

                // Apply draw compensation (was previously in executeShot)
                let effectivePower = cueBallPower;
                if (spinY > 0.05) {
                    effectivePower *= (1 + 0.20 * Math.min(1, Math.abs(spinY)));
                }

                // --- SIMULATION LOGIC ---

                // Predict Scratch
                const prediction = this.predictCueBallPath({
                    target, pocket, ghostBall: baseGeometry.ghostBall,
                    direction: baseGeometry.direction, power: effectivePower, cutAngle: baseGeometry.cutAngle
                }, spinY);

                if (prediction.scratchRisk) continue;

                // Predict Position
                const predictedEndPos = this.predictEndPosition({
                    ghostBall: baseGeometry.ghostBall, power: effectivePower, cutAngle: baseGeometry.cutAngle
                }, spinY, prediction.direction);

                // Evaluate Next Shot
                const { score: positionScore, nextBall } = this.evaluatePositionQuality(predictedEndPos, target);

                // --- SCORING LOGIC ---

                // Start with base geometric difficulty
                let potScore = baseDifficulty;

                // Apply Power Penalty (Higher power = lower accuracy)
                // This is crucial so it prefers the "Softest" successful power
                // powerBias weights which power levels are preferred:
                //   >1.0 = reduce penalty (favor harder shots)
                //   <1.0 = increase penalty (favor softer shots)
                // Amplified so persona power preference strongly affects shot selection
                const powerPenaltyScale = Math.max(0.05, 1 + (1 - persona.powerBias) * 3);
                const powerPenalty = (effectivePower / 50) * 15 * powerPenaltyScale;
                potScore -= powerPenalty;

                // Apply Side Pocket + High Power Risk
                if (pocket.type === 'side' && effectivePower > 30) {
                    potScore -= 15;
                }

                // Calculate Composite Score using persona's position awareness
                // position 0 = pure potting, position 1 = max 30% weight on position
                const posWeight = persona.position * 0.3;
                const compositeScore = (potScore * (1 - posWeight)) + (positionScore * posWeight);

                // Name generation for debugging
                let typeName = 'Stun';
                if (spinY > 0.1) typeName = 'Draw';
                if (spinY < -0.1) typeName = 'Follow';

                variants.push({
                    ...baseGeometry,
                    target, pocket,
                    power: effectivePower,
                    spin: { x: 0, y: spinY },
                    powerLevel: `${typeName} (${pottingPower}→${effectivePower.toFixed(0)})`,
                    potScore: Math.max(0, potScore),
                    positionScore,
                    nextBall,
                    compositeScore,
                    cueBallEndPos: predictedEndPos
                });
            }
        }

        return variants;
    }

    // Lazy-initialize the shot simulator and keep table style in sync
    ensureShotSimulator() {
        if (!this.shotSimulator) {
            this.shotSimulator = new ShotSimulator(this.table);
        }
        // Always sync table style in case it changed between turns
        if (this.physics && this.physics.tableStyle) {
            this.shotSimulator.setTableStyle(this.physics.tableStyle);
        }
        return this.shotSimulator;
    }

    /**
     * Pass 2: Re-score top candidates using physics simulation for accurate position.
     * Takes the top N candidates by compositeScore, simulates each with Planck physics,
     * and replaces their positionScore/compositeScore/cueBallEndPos with accurate values.
     */
    resimulateTopCandidates(candidates, persona) {
        const simulator = this.ensureShotSimulator();
        const posWeight = persona.position * 0.3;

        aiLog(`--- Pass 2: Simulating ${candidates.length} candidates ---`);

        for (const variant of candidates) {
            // Apply throw compensation so simulation matches execution
            const cueBallPos = this.game.cueBall.position;
            const throwAdj = this.calculateThrowAdjustment(
                cueBallPos, variant.ghostBall, variant.target.position,
                variant.pocket.position, variant.cutAngle, variant.power,
                variant.spin?.y || 0
            );
            const simDirection = throwAdj.adjustedDirection;

            const result = simulator.simulate(
                this.game.balls,
                simDirection,
                variant.power,
                variant.spin
            );

            // Update with simulated position
            variant.cueBallEndPos = result.cueBallEndPos;

            // If cue ball was pocketed in simulation, mark as scratch
            if (result.cueBallPocketed) {
                variant.positionScore = 0;
                variant.compositeScore = 0;
                aiLog(`  SIM ${variant.powerLevel}: SCRATCH`);
                continue;
            }

            // Re-evaluate position quality with accurate end position
            const { score: simPosScore, nextBall } = this.evaluatePositionQuality(
                result.cueBallEndPos, variant.target
            );

            const oldPosScore = variant.positionScore;
            variant.positionScore = simPosScore;
            variant.nextBall = nextBall;

            // Recalculate composite score with accurate position
            variant.compositeScore = (variant.potScore * (1 - posWeight)) + (simPosScore * posWeight);

            aiLog(`  SIM ${variant.powerLevel}: pos ${oldPosScore.toFixed(0)} -> ${simPosScore.toFixed(0)} | composite ${variant.compositeScore.toFixed(0)}`);
        }
    }

    resimulateTopSafetyCandidates(candidates, opponentBalls) {
        const SIM_COUNT = 8;

        candidates.sort((a, b) => b.score - a.score);
        const topN = candidates.slice(0, SIM_COUNT);

        const simulator = this.ensureShotSimulator();

        aiLog(`--- Safety Pass 2: Simulating top ${topN.length} candidates ---`);

        for (const variant of topN) {
            const result = simulator.simulate(
                this.game.balls,
                variant.direction,
                variant.power,
                variant.spin
            );

            // If cue ball pocketed, safety fails
            if (result.cueBallPocketed) {
                variant.score = 0;
                variant.cueBallEndPos = result.cueBallEndPos;
                aiLog(`  SIM SAFETY: SCRATCH`);
                continue;
            }

            // Build updated opponent ball positions from simulation
            const simPositions = new Map(
                result.ballEndPositions.map(b => [b.number, b.position])
            );
            const updatedOpponentBalls = opponentBalls.map(ob => {
                const simPos = simPositions.get(ob.number);
                if (simPos) {
                    return { ...ob, position: simPos };
                }
                return ob;
            }).filter(ob => !result.pocketedBalls.includes(ob.number));

            const oldScore = variant.score;
            const oldEndPos = variant.cueBallEndPos;
            variant.cueBallEndPos = result.cueBallEndPos;

            // Re-score with accurate positions
            const safetyResult = this.scoreSafetyPosition(
                result.cueBallEndPos, updatedOpponentBalls, variant.target
            );
            variant.score = safetyResult.score;
            variant.snookerBall = safetyResult.snookerBall;

            aiLog(`  SIM SAFETY: score ${oldScore.toFixed(0)} -> ${variant.score.toFixed(0)} | ` +
                  `endPos (${oldEndPos.x.toFixed(0)},${oldEndPos.y.toFixed(0)}) -> ` +
                  `(${result.cueBallEndPos.x.toFixed(0)},${result.cueBallEndPos.y.toFixed(0)})`);
        }
    }

    // Unified physics/geometry evaluator: Returns 0 (Impossible) to 100 (Guaranteed)
    // Unified physics/geometry evaluator
    calculatePottingDifficulty(cueBallPos, targetBall, pocket, debug = false) {
        const ballRadius = targetBall.radius || 12; // Needed for ghost ball calc
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // 1. Calculate Ghost Ball Position (Crucial Fix)
        // We aim at the ghost ball, not the center of the target ball
        const pocketDir = Vec2.normalize(Vec2.subtract(pocket.position, targetBall.position));
        const ghostBall = Vec2.subtract(targetBall.position, Vec2.multiply(pocketDir, ballRadius + cueBallRadius));

        // 2. Calculate Angle using Ghost Ball
        // Vector from Cue Ball -> Ghost Ball
        const aimLine = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
        // Vector from Target -> Pocket
        const pocketLine = pocketDir; // Already calculated
        
        const dot = Vec2.dot(aimLine, pocketLine);
        const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

        const distCueToTarget = Vec2.distance(cueBallPos, targetBall.position);
        const distTargetToPocket = Vec2.distance(targetBall.position, pocket.position);
        
        // Start with perfect score
        let score = 100;
        const penalties = {}; 

        // 3. Base Score from Angle (0 to 100)
        // Cutoff > 80 degrees
        if (cutAngle > 80) {
            if (debug) aiLog(`      [${targetBall.number || 'Color'}] IMPOSSIBLE CUT (>80°): ${cutAngle.toFixed(1)}°`);
            return 0; 
        }
        
        // Pocket proximity factor: 0 = far (no forgiveness), 1 = on the pocket (max forgiveness)
        const proximityFactor = Math.max(0, 1 - distTargetToPocket / 350);

        // Non-linear angle penalty, scaled by pocket proximity
        // Close to pocket: penalty reduced by up to 65% (angular errors don't compound over short distances)
        const rawAnglePenalty = Math.pow(cutAngle / 60, 2) * 50;
        const anglePenalty = rawAnglePenalty * (1 - proximityFactor * 0.65);
        score -= anglePenalty;
        penalties.angle = anglePenalty;

        // 4. Distance Factors
        // A: Cue to Ghost Ball (Aiming Difficulty)
        const distToGhost = Vec2.distance(cueBallPos, ghostBall);
        // Gentler base: straight long shots are manageable
        const baseAimPenalty = Math.max(0, (distToGhost - 200) / 15);
        // Cut angle amplifies aiming difficulty (thin cuts over distance are harder)
        const cutAmplifier = 1 + (cutAngle / 60) * 0.8;
        const aimingPenalty = baseAimPenalty * cutAmplifier;
        score -= aimingPenalty;
        penalties.aimDist = aimingPenalty;

        // B: Target to Pocket
        if (distTargetToPocket < 120) {
            // Close to pocket: significant bonus (balls hanging over pocket are near-certain)
            const proximityBonus = ((120 - distTargetToPocket) / 120) * 30;
            score += proximityBonus;
            penalties.pocketDist = -proximityBonus;
        } else if (distTargetToPocket > 200) {
            // Long pots get progressively harder (non-linear)
            const excessDist = distTargetToPocket - 200;
            const pocketPenalty = Math.pow(excessDist / 250, 1.4) * 25;
            score -= pocketPenalty;
            penalties.pocketDist = pocketPenalty;
        } else {
            penalties.pocketDist = 0;
        }

        // 5. Side Pocket Knuckle Penalty
        if (pocket.type === 'side') {
            const angleFromRail = Math.asin(Math.abs(pocketLine.y)) * 180 / Math.PI;

            if (angleFromRail < 40) {
                // Severe penalty for shallow angles into side pockets
                const sidePenalty = Math.pow((45 - angleFromRail), 1.7) * 0.8;
                score -= sidePenalty;
                penalties.sidePocket = sidePenalty;
            }
        }

        // 6. Corner pocket cushion penalty on curved-pocket tables
        if (pocket.type === 'corner') {
            const tableStyle = this.physics?.tableStyle || 1;
            const hasCurvedPockets = tableStyle === 7 || tableStyle === 8 || tableStyle === 9;
            if (hasCurvedPockets) {
                // Calculate approach angle vs ideal entry line (diagonal into corner)
                const idealDir = Vec2.normalize(Vec2.subtract(pocket.position, this.table.center));
                const approachDot = Vec2.dot(pocketDir, idealDir);
                const approachAngle = Math.acos(Math.max(-1, Math.min(1, approachDot))) * 180 / Math.PI;

                // Penalty for steep approach angles (running along cushion)
                if (approachAngle > 35) {
                    const cushionPenalty = Math.pow((approachAngle - 35) / 45, 1.5) * 25;
                    score -= cushionPenalty;
                    penalties.cushionAngle = cushionPenalty;
                }
            }
        }

        const finalScore = Math.max(0, Math.min(100, score));

        if (debug) {
            const ballName = targetBall.colorName || targetBall.number;
            const pocketName = pocket.type + (pocket.position.x < this.table.center.x ? '-L' : '-R');
            
            let logStr = `   Eval ${ballName}->${pocketName} | Score: ${finalScore.toFixed(0)} | Cut: ${cutAngle.toFixed(1)}°`;
            
            logStr += ` | P: Angle -${penalties.angle?.toFixed(0) || 0} (prox ${proximityFactor.toFixed(2)})`;
            logStr += ` AimDist -${penalties.aimDist?.toFixed(0) || 0}`;
            logStr += ` PktDist ${penalties.pocketDist > 0 ? '-' : '+'}${Math.abs(penalties.pocketDist?.toFixed(0) || 0)}`;

            if (penalties.sidePocket) logStr += ` SideKnuckle -${penalties.sidePocket.toFixed(0)}`;
            if (penalties.cushionAngle) logStr += ` CushionAngle -${penalties.cushionAngle.toFixed(0)}`;
            
            aiLog(logStr);
        }

        return finalScore;
    }

    // Estimate where the cue ball physically stops
    predictEndPosition(shot, spinY, exitDirection) {
        // Simple friction physics approximation
        // High power = further travel. Backspin (spinY > 0) checks up. Topspin (spinY < 0) rolls further.

        // After collision, cue ball retains sin(cutAngle) of its speed
        const cutRad = (shot.cutAngle || 0) * Math.PI / 180;
        const retained = shot.cutAngle > 5 ? Math.sin(cutRad) : 0.1; // Near-straight = stun
        let travelFactor = shot.power * retained * 15;
        
        if (spinY > 0) { // Backspin/Draw
            // On a cut shot, draw acts perpendicular to tangent line somewhat, 
            // but primarily it kills forward momentum.
            travelFactor *= Math.max(0.2, 1 - (spinY * 1.5)); 
        } else if (spinY < 0) { // Topspin/Follow
            travelFactor *= (1 + (Math.abs(spinY) * 0.5));
        }

        const start = shot.ghostBall; // Approximate start of deflection
        
        // Ensure we handle table bounds
        const bounds = this.table.bounds;
        let endX = start.x + (exitDirection.x * travelFactor);
        let endY = start.y + (exitDirection.y * travelFactor);

        // Simple clamp to table (ignoring rail bounces for speed, or use your simulateRailBounces)
        endX = Math.max(bounds.left + 15, Math.min(bounds.right - 15, endX));
        endY = Math.max(bounds.top + 15, Math.min(bounds.bottom - 15, endY));

        return { x: endX, y: endY };
    }

    // Look at the table from the predicted cue ball position: Is there a good next shot?
    evaluatePositionQuality(predictedCuePos, ballJustHit) {
        // 1. Determine valid targets for the NEXT shot
        let nextTargets = [];
        const remainingBalls = this.game.balls.filter(b => 
            !b.pocketed && !b.isCueBall && b !== ballJustHit
        );

        if (this.game.mode === GameMode.SNOOKER) {
            if (ballJustHit.isRed) {
                nextTargets = remainingBalls.filter(b => b.isColor);
            } else if (ballJustHit.isColor) {
                const reds = remainingBalls.filter(b => b.isRed);
                if (reds.length > 0) {
                    nextTargets = reds;
                } else {
                    // Colors phase: must pot in sequence yellow→green→brown→blue→pink→black
                    // Find the lowest remaining color in sequence (excluding the one we just potted)
                    const sequence = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
                    for (const colorName of sequence) {
                        const ball = remainingBalls.find(b => b.colorName === colorName);
                        if (ball) {
                            nextTargets = [ball];
                            break;
                        }
                    }
                }
            }
        } else if (this.game.mode === GameMode.NINE_BALL) {
            // --- 9-BALL LOGIC ---
            // If we just potted the lowest ball, we need position on the NEXT lowest
            if (remainingBalls.length > 0) {
                // Find the ball with the absolute lowest number among those remaining
                const nextLowest = remainingBalls.reduce((min, b) => 
                    b.number < min.number ? b : min
                , remainingBalls[0]);
                
                nextTargets = [nextLowest];
            }
        } 
        else {
            // --- 8-BALL & UK 8-BALL LOGIC ---
            // 1. Get targets from our group that would remain after this shot
            // (We assume getValidTargets returns our full group currently)
            const currentValid = this.getValidTargets();
            const groupRemains = currentValid.filter(b => b !== ballJustHit && !b.isEightBall);

            if (groupRemains.length > 0) {
                // If we still have group balls left, position on any of them is fine
                nextTargets = groupRemains;
            } else {
                // If no group balls remain, we are clearing the table -> We MUST get on the Black (8-ball)
                // Note: In 8-ball, the 8 might be in 'remainingBalls' but not 'currentValid' if we haven't cleared yet
                const eightBall = remainingBalls.find(b => b.isEightBall);
                if (eightBall) {
                    nextTargets = [eightBall];
                }
            }
        }

        if (nextTargets.length === 0) return { score: 100, nextBall: null };

        // --- NEW: RESPOTTING LOGIC ---
        // Calculate where the ball we just hit will be respotted so we don't plan a shot through it
        const extraObstacles = [];
        if (this.game.mode === GameMode.SNOOKER && ballJustHit && ballJustHit.isColor) {
            const spots = this.table.spots;
            // Ensure we have spot data and the ball has a color name
            if (spots && ballJustHit.colorName && spots[ballJustHit.colorName]) {
                const spotRel = spots[ballJustHit.colorName];
                
                // Convert relative spot coordinates (from table center) to absolute table coordinates
                const spotAbs = {
                    x: this.table.center.x + spotRel.x,
                    y: this.table.center.y + spotRel.y
                };

                // Add as a virtual obstacle
                extraObstacles.push({
                    position: spotAbs,
                    radius: ballJustHit.radius || 12,
                    isVirtual: true // Flag for debugging if needed
                });
            }
        }
        // -----------------------------

        let bestNextShotScore = 0;
        let bestNextBall = null; // New: Track the specific ball

        for (const nextBall of nextTargets) {
             // Pass extraObstacles (the respotted ball) to isPathClear
             if (!this.isPathClear(predictedCuePos, nextBall.position, [nextBall], extraObstacles)) continue;

             for (const pocket of this.table.pockets) {
                 // 0. Check if the path from next ball to pocket is clear of other balls
                 if (!this.isPathClear(nextBall.position, pocket.position, [nextBall], extraObstacles)) continue;

                 // 1. Get the Unified Difficulty Score
                 const difficulty = this.calculatePottingDifficulty(predictedCuePos, nextBall, pocket);

                 // If the shot is too hard (<20), it's not a valid "position" to play for
                 if (difficulty < 20) continue;

                 let finalScore = difficulty;

                 // 2. Add Snooker Value Bonus
                 if (this.game.mode === GameMode.SNOOKER) {
                     const values = { red: 1, yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7 };
                     const val = values[nextBall.colorName] || 1;
                     // Bonus: Black (+42), Pink (+36)
                     finalScore += (val * 6);
                 }

                 if (finalScore > bestNextShotScore) {
                     bestNextShotScore = finalScore;
                     bestNextBall = nextBall; // Capture the winning ball
                 }
             }
        }
        return { score: bestNextShotScore, nextBall: bestNextBall };
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

    // 8-Ball: Must hit own group (1-7 or 9-15), or 8-ball if group cleared
    // FIX: Uses numeric ranges instead of visual properties (solid/stripe)
    getValidTargets8Ball(balls) {
        const playerGroup = this.game.currentPlayer === 1 ? this.game.player1Group : this.game.player2Group;

        if (!playerGroup) {
            // Groups not assigned yet - can hit any ball except 8-ball
            return balls.filter(b => !b.isEightBall);
        }

        const groupBalls = balls.filter(b => {
            // 'solid' group maps to numbers 1-7
            if (playerGroup === 'solid') return b.number >= 1 && b.number <= 7;
            // 'stripe' group maps to numbers 9-15
            if (playerGroup === 'stripe') return b.number >= 9 && b.number <= 15;
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
    // FIX: Uses numeric ranges to ensure AI targets specific balls regardless of color
    getValidTargetsUK8Ball(balls) {
        const playerGroup = this.game.currentPlayer === 1 ? this.game.player1Group : this.game.player2Group;

        if (!playerGroup) {
            return balls.filter(b => !b.isEightBall);
        }

        const groupBalls = balls.filter(b => {
            // Group 1 (typically Reds) maps to 1-7
            if (playerGroup === 'group1') return b.number >= 1 && b.number <= 7;
            // Group 2 (typically Yellows) maps to 9-15
            if (playerGroup === 'group2') return b.number >= 9 && b.number <= 15;
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
    evaluatePotentialShot(cueBallPos, target, pocket, options = {}) {
        const ballRadius = target.radius || 12;
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Get adjusted aim point between pocket jaws (not center)
        const pocketAimPoint = this.getPocketAimPoint(target.position, pocket, ballRadius);

        // Calculate ghost ball position (where cue ball needs to hit)
        const ghostBall = this.calculateGhostBall(target.position, pocketAimPoint, ballRadius, cueBallRadius);

        // 1. First check if path from target to pocket is clear (no throw adjustment needed)
        if (!this.isPathClear(target.position, pocketAimPoint, [target])) {
            return null;
        }

        // Calculate shot parameters early so we can compute throw adjustment
        const aimDirection = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
        const distanceToGhost = Vec2.distance(cueBallPos, ghostBall);
        const distanceToPocket = Vec2.distance(target.position, pocketAimPoint);

        // Calculate cut angle (angle between cue ball aim line and pocket direction)
        const targetToPocket = Vec2.normalize(Vec2.subtract(pocketAimPoint, target.position));
        const cueBallToGhost = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));
        const cutAngle = Math.acos(Math.max(-1, Math.min(1, Vec2.dot(cueBallToGhost, targetToPocket))));
        const cutAngleDeg = cutAngle * 180 / Math.PI;

        // Reject shots with extreme cut angles (over 60 degrees is very difficult)
        // Exception: allow up to 75 degrees if ball is very close to pocket
        const isNearPocket = distanceToPocket < ballRadius * 4; // Within ~4 ball widths
        const maxCutAngle = isNearPocket ? 75 : 70;

        if (cutAngleDeg > maxCutAngle) {
            return null;
        }

        // Check pocket approach angle (is the ball approaching pocket at a reasonable angle)
        if (!this.checkPocketApproach(target.position, pocket)) {
            return null;
        }

        if (options.basicCheck) {
            // ... (Inside your existing function, after checking isPathClear and cutAngle < 80)
            if (!this.isPathClear(cueBallPos, ghostBall, [target])) return null;
            
            // Return minimal data needed for the variant analyzer
            return {
                target, pocket, ghostBall, direction: aimDirection, cutAngle: cutAngleDeg
            };
        }

        // Calculate power needed for throw calculation
        const power = this.calculatePower(distanceToGhost, distanceToPocket, cutAngleDeg);

        // Calculate throw adjustment using spinY=0 (stun) as baseline for evaluation
        // The actual spin will be calculated during execution, but stun is a reasonable
        // baseline for determining if the shot path is geometrically possible
        const throwAdjustment = this.calculateThrowAdjustment(
            cueBallPos, ghostBall, target.position, pocket.position, cutAngleDeg, power, 0
        );

        // 2. Check if path from cue ball to throw-adjusted ghost ball is clear
        if (!this.isPathClear(cueBallPos, throwAdjustment.adjustedGhostBall, [target])) {
            if (AI_DEBUG) {
                const targetName = target.colorName || target.number || 'ball';
                aiLog(`  Shot rejected: throw-adjusted path to ${targetName} is blocked`);
            }
            return null;
        }

        // 3. Check that no ball is blocking the potting angle
        if (!this.isPottingAngleClear(cueBallPos, target, pocket)) {
            return null;
        }

        // 4. Check for balls that the cue ball would clip near the contact point
        // Use throw-adjusted ghost ball for more accurate collision prediction
        if (this.wouldClipBallNearTarget(cueBallPos, throwAdjustment.adjustedGhostBall, target)) {
            return null;
        }

        // Score the shot
        const score = this.scoreShot(cutAngleDeg, distanceToGhost, distanceToPocket, pocket.type, target, power);

        return {
            target,
            pocket,
            ghostBall,                                          // original ghost ball
            adjustedGhostBall: throwAdjustment.adjustedGhostBall, // throw-compensated ghost ball
            direction: aimDirection,                             // original direction (to ghost ball)
            adjustedDirection: throwAdjustment.adjustedDirection, // throw-compensated direction
            throwAngle: throwAdjustment.throwAngle,              // amount of throw compensation applied
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
    // Added: extraObstacles parameter to support virtual balls (like respotted colors)
    isPathClear(start, end, excludeBalls, extraObstacles = []) {
        const balls = this.game.balls.filter(b =>
            !b.pocketed &&
            !b.isCueBall &&
            !excludeBalls.includes(b)
        );

        // Combine actual balls with any virtual obstacles (like predicted respots)
        const allObstacles = balls.concat(extraObstacles);

        const direction = Vec2.subtract(end, start);
        const distance = Vec2.length(direction);

        // If points are very close, path is clear
        if (distance < 1) return true;

        const normalized = Vec2.normalize(direction);
        const cueBallRadius = this.game.cueBall?.radius || 12;

        // Check for obstacles along the path
        for (const ball of allObstacles) {
            const toball = Vec2.subtract(ball.position, start);
            const projection = Vec2.dot(toball, normalized);

            // Ball is behind start or beyond end (with small tolerance)
            if (projection < -5 || projection > distance + 5) continue;

            // Calculate perpendicular distance to path
            const closestPoint = Vec2.add(start, Vec2.multiply(normalized, Math.max(0, Math.min(distance, projection))));
            const perpDist = Vec2.distance(ball.position, closestPoint);

            // Check if ball blocks the path
            const ballRadius = ball.radius || 12;
            const clearance = ballRadius + cueBallRadius; // Allow slight overlap for edge cases
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
     * Improved getPocketAimPoint:
     * - For thin approaches: hug the near jaw (your current good behavior).
     * - For wider approaches (~35°+): find first-touch angle to BOTH rails (railA & railB),
     *   then aim at the angular midpoint (center of the window).
     *
     * Requires initializePocketGeometry() to store:
     *   pocketJaws[pocketIndex] = {
     *     railA: [...full polyline verts...],
     *     railB: [...full polyline verts...],
     *     railAInfo: { axis:'horizontal'|'vertical', centroid:{x,y}, ... },
     *     railBInfo: { axis:'horizontal'|'vertical', centroid:{x,y}, ... }
     *   }
     *
     * Coords: x right, y down.
     */
    getPocketAimPoint(targetPos, pocket, ballRadius) {
        if (!targetPos) return pocket.position;

        const pocketIndex = this.table.pockets.indexOf(pocket);
        const jaws = this.pocketJaws?.[pocketIndex];

        if (!jaws || !jaws.isValid || !jaws.railA || !jaws.railB || !jaws.railAInfo || !jaws.railBInfo) {
            return pocket.position;
        }

        const pocketPos = pocket.position;

        // Corridor thickness: "thick scan line"
        const margin = 3;
        const thickR = ballRadius + margin;

        // Reference: target -> pocket center
        const refVec = Vec2.subtract(pocketPos, targetPos);
        const distToPocket = Vec2.length(refVec);
        if (distToPocket < 1e-6) return pocketPos;

        const refDir = Vec2.normalize(refVec);
        const refAngle = Math.atan2(refVec.y, refVec.x);

        // Wrap to [-PI, PI]
        const wrapPI = (a) => {
            while (a > Math.PI) a -= 2 * Math.PI;
            while (a < -Math.PI) a += 2 * Math.PI;
            return a;
        };

        // Relative angle of a point around target vs refAngle
        const relAngleToPoint = (p) => {
            const a = Math.atan2(p.y - targetPos.y, p.x - targetPos.x);
            return wrapPI(a - refAngle);
        };

        // Simple angle check between refDir and a rail LINE direction (your rule)
        const angleToRailLine = (axis) => {
            // horizontal rail line (1,0) => asin(|refDir.y|)
            // vertical rail line (0,1)   => asin(|refDir.x|)
            return axis === 'horizontal'
                ? Math.asin(Math.min(1, Math.abs(refDir.y)))
                : Math.asin(Math.min(1, Math.abs(refDir.x)));
        };

        // Choose near rail by shallower angle
        const angA = angleToRailLine(jaws.railAInfo.axis);
        const angB = angleToRailLine(jaws.railBInfo.axis);

        let nearVerts, nearCentroid, nearAngle;
        let farVerts,  farCentroid,  farAngle;

        // DETECT SIDE POCKET (Same Axis)
        if (jaws.railAInfo.axis === jaws.railBInfo.axis) {
            // For side pockets, angles are identical. We must determine "Near"
            // by looking at which side of the pocket the ball is coming from.
            
            // Project the rail offsets onto the shot direction (refVec).
            // The "Near" rail will be the one opposing the shot vector (negative dot product relative to pocket),
            // or simply the one "upstream" from the pocket.
            
            const vecToA = Vec2.subtract(jaws.railAInfo.centroid, pocketPos);
            const vecToB = Vec2.subtract(jaws.railBInfo.centroid, pocketPos);
            
            // Dot product with Incoming Shot Vector (Target -> Pocket)
            // Note: refVec points INTO the pocket.
            // If coming from Left, refVec.x > 0. A rail on the Left has vecToRail.x < 0.
            // So a Dot Product < 0 means that rail is on the incoming side (Near).
            
            const dotA = Vec2.dot(refVec, vecToA);
            const dotB = Vec2.dot(refVec, vecToB);

            // The rail with the lower (more negative) dot product is the one we are crossing first
            if (dotA < dotB) {
                nearVerts = jaws.railA; nearCentroid = jaws.railAInfo.centroid;
                farVerts  = jaws.railB; farCentroid  = jaws.railBInfo.centroid;
            } else {
                nearVerts = jaws.railB; nearCentroid = jaws.railBInfo.centroid;
                farVerts  = jaws.railA; farCentroid  = jaws.railAInfo.centroid;
            }
            
            // Recalculate angle for the chosen one (they are the same anyway)
            nearAngle = angleToRailLine(jaws.railAInfo.axis);
            farAngle = nearAngle;
            
        } else {
            // CORNER POCKET (Different Axes) - Keep existing logic
            const angA = angleToRailLine(jaws.railAInfo.axis);
            const angB = angleToRailLine(jaws.railBInfo.axis);

            if (angA < angB) {
                nearVerts = jaws.railA; nearCentroid = jaws.railAInfo.centroid; nearAngle = angA;
                farVerts  = jaws.railB; farCentroid  = jaws.railBInfo.centroid; farAngle  = angB;
            } else if (angB < angA) {
                nearVerts = jaws.railB; nearCentroid = jaws.railBInfo.centroid; nearAngle = angB;
                farVerts  = jaws.railA; farCentroid  = jaws.railAInfo.centroid; farAngle  = angA;
            } else {
                // Tie-breaker (rare for corners, but fallback to distance)
                const cA = jaws.railAInfo.centroid;
                const cB = jaws.railBInfo.centroid;
                const dA = Math.hypot(cA.x - pocketPos.x, cA.y - pocketPos.y);
                const dB = Math.hypot(cB.x - pocketPos.x, cB.y - pocketPos.y);
                if (dA <= dB) {
                    nearVerts = jaws.railA; nearCentroid = cA; nearAngle = angA;
                    farVerts  = jaws.railB; farCentroid  = cB; farAngle  = angB;
                } else {
                    nearVerts = jaws.railB; nearCentroid = cB; nearAngle = angB;
                    farVerts  = jaws.railA; farCentroid  = cA; farAngle  = angA;
                }
            }
        }

        if (!nearVerts || nearVerts.length < 2 || !farVerts || farVerts.length < 2) return pocketPos;

        // Helper: find "first touch" relative angle when sweeping toward a rail
        // Sweep direction is chosen so that we rotate toward the rail centroid (in angular sense).
        const firstTouchTowardRail = (railVerts, railCentroid) => {
            const toRail = Vec2.normalize(Vec2.subtract(railCentroid, targetPos));
            const cross = refDir.x * toRail.y - refDir.y * toRail.x;
            const sweepSign = (cross >= 0) ? +1 : -1; // + => CCW, - => CW

            // Start 30° on the OPEN side (opposite the rail side)
            const startRel = -sweepSign * (30 * Math.PI / 180);

            let touchRel = null;

            if (sweepSign > 0) {
                // sweeping CCW (increasing)
                let best = Infinity;
                for (const v of railVerts) {
                    const dx = v.x - targetPos.x;
                    const dy = v.y - targetPos.y;
                    const d = Math.hypot(dx, dy);
                    if (d <= thickR + 1e-6) continue;

                    const ang = relAngleToPoint(v);
                    const width = Math.asin(Math.min(1, thickR / d));
                    const enter = ang - width; // entry boundary when increasing

                    if (enter >= startRel && enter < best) best = enter;
                }
                if (best !== Infinity) touchRel = best;
            } else {
                // sweeping CW (decreasing)
                let best = -Infinity;
                for (const v of railVerts) {
                    const dx = v.x - targetPos.x;
                    const dy = v.y - targetPos.y;
                    const d = Math.hypot(dx, dy);
                    if (d <= thickR + 1e-6) continue;

                    const ang = relAngleToPoint(v);
                    const width = Math.asin(Math.min(1, thickR / d));
                    const enter = ang + width; // entry boundary when decreasing

                    if (enter <= startRel && enter > best) best = enter;
                }
                if (best !== -Infinity) touchRel = best;
            }

            return touchRel; // may be null
        };

        // Decide whether we are in "thin" mode or "window-center" mode.
        const THIN_DEG_CORNER = 35;
        const THIN_DEG_SIDE   = 45;

        const thinThreshold = (pocket.type === 'side')
            ? THIN_DEG_SIDE
            : THIN_DEG_CORNER;
        const thinMode = (nearAngle * 180 / Math.PI) < thinThreshold;

        let chosenRel = null;

        if (thinMode) {
            // --- Thin: hug the near jaw (what already works well)
            chosenRel = firstTouchTowardRail(nearVerts, nearCentroid);
            if (chosenRel === null) return pocketPos;
        } else {
            // --- Wider: compute both jaw limits and aim through the center
            const touchA = firstTouchTowardRail(jaws.railA, jaws.railAInfo.centroid);
            const touchB = firstTouchTowardRail(jaws.railB, jaws.railBInfo.centroid);

            if (touchA === null || touchB === null) {
                // If one side fails, fall back to near-jaw (still better than wrong)
                chosenRel = firstTouchTowardRail(nearVerts, nearCentroid);
                if (chosenRel === null) return pocketPos;
            } else {
                // These represent the two window boundaries (in relative angle space)
                const lower = Math.min(touchA, touchB);
                const upper = Math.max(touchA, touchB);

                // If bounds collapse or invert, fall back safely
                if (upper - lower < 1e-4) {
                    chosenRel = (lower + upper) * 0.5;
                } else {
                    // Aim down the middle of the window
                    const bias = 0.5;
                    chosenRel = lower + (upper - lower) * bias;
                }
            }
        }

        // Build scan ray direction at chosenRel
        const finalAngle = refAngle + chosenRel;
        const scanDir = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };

        // Point on that ray closest to the pocket center: projection
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
            const baseScore = this.scoreShot(cutAngle, distToGhost, distToPocket, pocket.type, target);
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
    // Update the method signature and logic
    scoreShot(cutAngle, distanceToGhost, distanceToPocket, _pocketType, targetBall, power) {
        // 1. Cut Angle Score
        const cutAngleScore = Math.max(0, 100 - (cutAngle / 90) * 100);

        // 2. Cue Ball Distance Score (Exponential Decay)
        const maxDist = Math.max(this.table.width, this.table.height);
        const normalizedDist = distanceToGhost / maxDist;
        const distanceScore = Math.max(0, 100 - (Math.pow(normalizedDist, 1.2) * 90));
        const powerScore = Math.max(0, 55 - power);

        // 3. Object Ball Distance Score (Target to Pocket)
        const pocketDistScore = Math.max(0, 100 - (distanceToPocket / maxDist) * 80);

        // Calculate Base Positional Score
        let finalScore = cutAngleScore * 0.34 +
                        distanceScore * 0.23 +
                        pocketDistScore * 0.43 +
                        powerScore * 0.25 +
                        10;

        // --- SNOOKER VALUE MULTIPLIER ---
        if (this.game.mode === GameMode.SNOOKER && targetBall) {
            const values = {
                'red': 1,
                'yellow': 2,
                'green': 3,
                'brown': 4,
                'blue': 5,
                'pink': 6,
                'black': 7
            };
            
            const ballValue = values[targetBall.colorName] || 1;
            
            // We use a weighted multiplier. We don't want to multiply the whole score 
            // by 7 (which would make AI take impossible black shots over easy reds).
            // Instead, we add a "Value Bonus".
            const valueBonus = (ballValue - 1) * 5; // Black adds +30 to the score
            finalScore += valueBonus;
        }

        return finalScore;
    }

    // Select a shot based on difficulty
    selectShot(shots) {
        const settings = this.getCurrentPersona();

        if (shots.length === 0) return null;

        // Filter out or deprioritize shots that match the last foul shot
        let availableShots = shots;
        if (this.lastFoulShot && shots.length > 1) {
            const nonFoulShots = shots.filter(shot => !this.isSameShotAsFoul(shot));
            if (nonFoulShots.length > 0) {
                aiLog('Avoiding previous foul shot - filtered from', shots.length, 'to', nonFoulShots.length, 'options');
                availableShots = nonFoulShots;
            } else {
                // All shots match the foul - will add angle variation in executeShot
                aiLog('All shots similar to foul shot - will add angle variation');
            }
        }

        switch (settings.shotSelection) {
            case 'random':
                // Pick randomly from top 50%
                const topHalf = availableShots.slice(0, Math.ceil(availableShots.length / 2));
                return topHalf[Math.floor(Math.random() * topHalf.length)];

            case 'top3':
                // Pick best from top 3
                const top3 = availableShots.slice(0, Math.min(3, availableShots.length));
                return top3[Math.floor(Math.random() * top3.length)];

            case 'optimal':
            default:
                return availableShots[0];
        }
    }

    // Check if a shot is the same as the last foul shot
    isSameShotAsFoul(shot) {
        if (!this.lastFoulShot) return false;

        const targetId = shot.target.id || shot.target.number;
        const pocketIndex = this.table.pockets.indexOf(shot.pocket);

        // Same target ball and same pocket = same shot
        return targetId === this.lastFoulShot.targetId &&
               pocketIndex === this.lastFoulShot.pocketIndex;
    }

    // Calculate power needed for the shot
    calculatePower(distanceToGhost, distanceToPocket, cutAngle = 0) {
        // Base power from total distance (cue to ghost + target to pocket)
        const totalDistance = distanceToGhost + distanceToPocket;

        // Power scales with distance - need more power for longer shots
        // Typical table is ~800px wide, so 400px is a medium shot
        // Base power of 15, scaling up with distance
        let power = 0.5 + (totalDistance / 45);

        // Cut shots need more power because energy transfers less efficiently
        // At 45° cut, only ~70% of energy transfers to target ball
        // At 60° cut, only ~50% transfers
        const cutFactor = 1 + (cutAngle / 50) * 0.5;
        power *= cutFactor;

        // Clamp to reasonable range - minimum 5, max 55
        return Math.max(5, Math.min(55, power));
    }

    // Execute the chosen shot
    executeShot(shot) {
        aiLogGroup('Executing Shot');
        const ballName = shot.target.colorName || shot.target.number || 'ball';
        aiLog('Target:', ballName, '| Cut angle:', shot.cutAngle.toFixed(1) + '°', '| Base power:', shot.power.toFixed(1));

        const settings = this.getCurrentPersona();
        const cueBallPos = this.game.cueBall.position;
        const ballRadius = shot.target.radius || 12;

        // Store initial aim direction before any adjustments
        const initialDirection = Vec2.clone(shot.direction);

        // Calculate spin early so we can use it for model prediction
        let spin;
        if (shot.spin) {
            spin = shot.spin;
            aiLog('Using planned spin:', spin);
        } else {
            spin = this.calculateSpin(shot); // Fallback for bank shots/safety
        }

        // Recalculate throw with actual spin for maximum accuracy
        // During evaluation, spinY=0 was used; now we have the real spin value
        const throwAdjustment = this.calculateThrowAdjustment(
            cueBallPos, shot.ghostBall, shot.target.position, shot.pocket.position,
            shot.cutAngle, shot.power, spin.y
        );

        const adjustedGhostBall = throwAdjustment.adjustedGhostBall;
        const directionAfterThrow = throwAdjustment.adjustedDirection;

        if (shot.cutAngle > 1) {
            aiLog('Throw compensation:', throwAdjustment.throwAngle.toFixed(2), '° (with spin.y:', spin.y.toFixed(2), ')');
        } else {
            aiLog('No throw compensation (cut ≤ 1°)');
        }

        let direction = directionAfterThrow;

        // Apply aim error based on difficulty (still as angle, but this is intentional variance)
        let aimError = (Math.random() - 0.5) * 2 * settings.lineAccuracy * (Math.PI / 180);

        // UPDATED FOUL HANDLING
        // Instead of random large shifts, use a deterministic shift if we are repeating
        if (this.isSameShotAsFoul(shot)) {
            // If we are here, it means the Planner chose the same shot again despite the filter 
            // (or it's the only option). We must force a shift.
            
            // Check if we shifted positive or negative last time (heuristic) or just toggle
            // For now, simply add a deterministic offset that is larger than the previous error
            const avoidanceShift = 1.5 * (Math.PI / 180); 
            
            // Use a consistent offset based on turn number to toggle direction if needed, 
            // or just alternate based on a property we add to 'this'
            this._foulRetryToggle = !this._foulRetryToggle;
            const sign = this._foulRetryToggle ? 1 : -1;
            
            aimError += (avoidanceShift * sign);
            
            aiLog(`Repeating foul shot detected. Forcing deterministic shift: ${(sign * 1.5).toFixed(1)}°`);
        }

        direction = Vec2.rotate(direction, aimError);
        direction = Vec2.normalize(direction);
        aiLog('Aim error applied:', (aimError * 180 / Math.PI).toFixed(2) + '°');

        // Apply power error
        let power = shot.power;
        const powerError = (Math.random() - 0.5) * 2 * settings.powerAccuracy;
        power = power * (1 + powerError);

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

        // Record pending shot data for tracking
        const cueBallToTargetDist = Vec2.distance(cueBallPos, shot.target.position);
        const targetToPocketDir = Vec2.normalize(Vec2.subtract(pocketAimPoint, shot.target.position));
        const intendedAngle = Math.atan2(targetToPocketDir.y, targetToPocketDir.x) * 180 / Math.PI;

        this.pendingShot = {
            timestamp: Date.now(),
            targetBall: shot.target,
            targetBallPos: Vec2.clone(shot.target.position),
            pocketAimPoint: Vec2.clone(pocketAimPoint),
            intendedAngle: intendedAngle,  // Angle from target ball to pocket aim point
            power: power,
            spinY: spin.y,
            cutAngle: shot.cutAngle,
            cueBallToTargetDist: cueBallToTargetDist,
            difficulty: this.difficulty
        };

        // Store last executed shot for foul tracking
        this.lastExecutedShot = shot;

        aiLogGroupEnd();
        if (this.onShot) {
            this.onShot(direction, power, spin);
        }
    }

    // Calculate throw adjustment for a shot - used by both evaluation and execution
    // Returns { adjustedGhostBall, adjustedDirection, throwAngle }
    calculateThrowAdjustment(cueBallPos, ghostBall, targetPos, pocketPos, cutAngleDeg, power, spinY = 0) {
        const ballRadius = 12; // Standard ball radius
        const direction = Vec2.normalize(Vec2.subtract(ghostBall, cueBallPos));

        // No adjustment needed for very straight shots
        if (cutAngleDeg <= 1) {
            return {
                adjustedGhostBall: Vec2.clone(ghostBall),
                adjustedDirection: Vec2.clone(direction),
                throwAngle: 0
            };
        }

        // Determine cut direction for compensation sign
        const cueToBall = Vec2.subtract(targetPos, cueBallPos);
        const ballToPocket = Vec2.subtract(pocketPos, targetPos);
        const cross = cueToBall.x * ballToPocket.y - cueToBall.y * ballToPocket.x;
        const cutSign = cross > 0 ? -1 : 1;

        let adjustedDirection;
        let adjustedGhostBall;
        let throwAngle = 0;

        if (angleModelLoaded && angleModel) {
            // Use trained model to predict angle error
            const predictedError = angleModel.predictAngleError(cutAngleDeg, cueToBall, power);
            throwAngle = predictedError;
            const adjustmentRad = (predictedError * Math.PI / 180) * cutSign;

            // Rotate the aim direction to compensate
            adjustedDirection = Vec2.rotate(direction, -adjustmentRad);
            adjustedDirection = Vec2.normalize(adjustedDirection);

            // Update ghost ball position to match rotated direction
            const distToGhost = Vec2.distance(cueBallPos, ghostBall);
            adjustedGhostBall = Vec2.add(cueBallPos, Vec2.multiply(adjustedDirection, distToGhost));
        } else {
            // Fallback: use physics-based throw shift calculation
            // Create a minimal shot object for calculateThrowShift
            const throwShift = this.calculateThrowShiftDirect(cutAngleDeg, power, ballRadius);
            throwAngle = Math.atan(throwShift / (ballRadius * 2)) * 180 / Math.PI;

            // Shift ghost ball perpendicular to the shot line
            const perpendicular = { x: -direction.y, y: direction.x };
            adjustedGhostBall = Vec2.add(ghostBall, Vec2.multiply(perpendicular, throwShift * cutSign));
            adjustedDirection = Vec2.normalize(Vec2.subtract(adjustedGhostBall, cueBallPos));
        }

        return {
            adjustedGhostBall,
            adjustedDirection,
            throwAngle
        };
    }

    // Direct throw shift calculation without requiring a shot object
    calculateThrowShiftDirect(cutAngleDeg, power, ballRadius) {
        // Throw is negligible on very full or extremely thin shots
        if (cutAngleDeg < 1 || cutAngleDeg > 75) return 0;

        const thetaRad = cutAngleDeg * Math.PI / 180;

        // Typical coefficient of friction for pool balls is ~0.06
        const friction = 0.05;

        // CIT is inversely proportional to speed.
        // We map your power (5-50) to a speed factor.
        const speedFactor = Math.max(0.5, power / 15);

        // Angle of throw (radians) ≈ (friction * sin(2 * theta)) / speed
        // This peaks the throw effect around a 30-45 degree cut.
        const throwAngleRad = (friction * Math.sin(2 * thetaRad)) / speedFactor;

        // Convert the angular deviation into a lateral shift distance for the ghost ball.
        // We use the distance from contact to target center (2 * ballRadius)
        const shiftDistance = (ballRadius * 2) * Math.tan(throwAngleRad);

        // Physical limit: throw rarely exceeds 15-20% of the ball's radius
        return Math.min(shiftDistance, ballRadius * 0.25);
    }

    calculateThrowShift(shot, ballRadius) {
        const cutAngleDeg = shot.cutAngle;
        // Throw is negligible on very full or extremely thin shots
        if (cutAngleDeg < 1 || cutAngleDeg > 75) return 0;

        const thetaRad = cutAngleDeg * Math.PI / 180;
        
        // Typical coefficient of friction for pool balls is ~0.06
        const friction = 0.05; 
        
        // CIT is inversely proportional to speed. 
        // We map your power (5-50) to a speed factor.
        const speedFactor = Math.max(0.5, shot.power / 15);

        // Angle of throw (radians) ≈ (friction * sin(2 * theta)) / speed
        // This peaks the throw effect around a 30-45 degree cut.
        const throwAngleRad = (friction * Math.sin(2 * thetaRad)) / speedFactor;

        // Convert the angular deviation into a lateral shift distance for the ghost ball.
        // We use the distance from contact to target center (2 * ballRadius)
        const shiftDistance = (ballRadius * 2) * Math.tan(throwAngleRad);

        // Physical limit: throw rarely exceeds 15-20% of the ball's radius
        return Math.min(shiftDistance, ballRadius * 0.25);
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

        // SAFETY CHECK: Never apply topspin on straight shots (≤1 degree cut angle)
        // Topspin on a straight shot will follow the object ball into the pocket (scratch)
        if (shot.cutAngle <= 1 && spinY < 0) {
            aiLog('OVERRIDE: Preventing topspin on straight shot (cut ≤ 1°) - using stun instead');
            spinY = 0;
            reason = 'straight shot - topspin blocked to prevent scratch';
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

                const settings = this.getCurrentPersona();
                let aimError = (Math.random() - 0.5) * 2 * settings.lineAccuracy * (Math.PI / 180);

                // Check if we fouled on the same escape attempt before
                const targetId = escapeShot.target.id || escapeShot.target.number;
                if (this.lastFoulShot && this.lastFoulShot.targetId === targetId && this.lastFoulShot.isSafetyShot) {
                    const foulAvoidanceAngle = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 10) * (Math.PI / 180);
                    aimError += foulAvoidanceAngle;
                    aiLog('Foul avoidance: adding', (foulAvoidanceAngle * 180 / Math.PI).toFixed(1) + '° to escape shot');
                }

                const adjustedDir = Vec2.rotate(escapeShot.direction, aimError);

                let power = escapeShot.power;
                const powerError = (Math.random() - 0.5) * 2 * settings.powerAccuracy;
                power = power * (1 + powerError);
                power = Math.max(5, Math.min(40, power));

                // Track escape shot for foul avoidance
                this.lastExecutedShot = {
                    target: escapeShot.target,
                    pocket: { position: escapeShot.target.position },
                    cutAngle: 0,
                    direction: Vec2.clone(escapeShot.direction),
                    isSafetyShot: true
                };

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

            const settings = this.getCurrentPersona();

            // Apply aim error based on difficulty
            let aimError = (Math.random() - 0.5) * 2 * settings.lineAccuracy * (Math.PI / 180);

            // Check if we fouled on a similar safety before
            const targetId = safetyShot.target.id || safetyShot.target.number;
            if (this.lastFoulShot && this.lastFoulShot.targetId === targetId && this.lastFoulShot.isSafetyShot) {
                const foulAvoidanceAngle = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 10) * (Math.PI / 180);
                aimError += foulAvoidanceAngle;
                aiLog('Foul avoidance: adding', (foulAvoidanceAngle * 180 / Math.PI).toFixed(1) + '° to safety shot');
            }

            const adjustedDir = Vec2.rotate(safetyShot.direction, aimError);

            // Apply power error
            let power = safetyShot.power;
            const powerError = (Math.random() - 0.5) * 2 * settings.powerAccuracy;
            power = power * (1 + powerError);

            // Set planned cue ball position for visualization
            this.chosenShotEndPos = safetyShot.cueBallEndPos ? { x: safetyShot.cueBallEndPos.x, y: safetyShot.cueBallEndPos.y } : null;

            // Track safety shot for foul avoidance
            this.lastExecutedShot = {
                target: safetyShot.target,
                pocket: { position: safetyShot.target.position },
                cutAngle: safetyShot.contactAngle || 0,
                direction: Vec2.clone(safetyShot.direction),
                isSafetyShot: true
            };

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
                const settings = this.getCurrentPersona();
                let aimError = (Math.random() - 0.5) * 2 * settings.lineAccuracy * (Math.PI / 180);

                // Check if we fouled on the same escape attempt before
                const targetId = desperateEscape.target.id || desperateEscape.target.number;
                if (this.lastFoulShot && this.lastFoulShot.targetId === targetId && this.lastFoulShot.isSafetyShot) {
                    const foulAvoidanceAngle = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 20) * (Math.PI / 180);
                    aimError += foulAvoidanceAngle;
                    aiLog('Foul avoidance: adding', (foulAvoidanceAngle * 180 / Math.PI).toFixed(1) + '° to desperate escape');
                }

                const adjustedDir = Vec2.rotate(desperateEscape.direction, aimError);

                // Track escape shot for foul avoidance
                this.lastExecutedShot = {
                    target: desperateEscape.target,
                    pocket: { position: desperateEscape.target.position },
                    cutAngle: 0,
                    direction: Vec2.clone(desperateEscape.direction),
                    isSafetyShot: true
                };

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

        const settings = this.getCurrentPersona();
        let aimError = (Math.random() - 0.5) * 2 * settings.lineAccuracy * (Math.PI / 180);

        // Check if this is the same target we fouled on last time
        const targetId = bestTarget.id || bestTarget.number;
        if (this.lastFoulShot && this.lastFoulShot.targetId === targetId) {
            // Add significant angle variation to try a different approach
            // Try to come at the ball from a different angle (±15-30 degrees)
            const foulAvoidanceAngle = (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 15) * (Math.PI / 180);
            aimError += foulAvoidanceAngle;
            aiLog('Foul avoidance: adding', (foulAvoidanceAngle * 180 / Math.PI).toFixed(1) + '° to try different approach');
        }

        const adjustedDir = Vec2.rotate(direction, aimError);

        // Store this as a safety shot for foul tracking (use pocket index -1 to indicate safety)
        this.lastExecutedShot = {
            target: bestTarget,
            pocket: { position: bestTarget.position }, // Dummy pocket for safety shots
            cutAngle: 0,
            direction: Vec2.clone(direction),
            isSafetyShot: true
        };

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
    // Find an escape shot when snookered - using Coarse-to-Fine search
    findSnookerEscape(validTargets, desperate = false) {
        const cueBall = this.game.cueBall;
        if (!cueBall) return null;

        // 1. PHASE ONE: Coarse Scan
        // Scan every 4 degrees to find potential sectors
        const sectors = []; // Store promising angles
        const coarseStep = 4;
        
        for (let angleDeg = 0; angleDeg < 360; angleDeg += coarseStep) {
            const angleRad = angleDeg * Math.PI / 180;
            const aimDir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
            
            const result = this.traceShotPath(cueBall.position, aimDir, validTargets);
            
            if (result) {
                // Keep if we hit a target, OR if we got reasonably close (within 4 ball widths)
                if (result.hitsValidTarget || result.closestApproach < 50) {
                    sectors.push({
                        angle: angleDeg,
                        result: result,
                        score: this.scoreEscapeResult(result)
                    });
                }
            }
        }

        // Sort sectors by potential
        sectors.sort((a, b) => b.score - a.score);
        
        // Take top 5 distinct sectors to refine
        // (Filter to ensure we don't just refine 5 angles right next to each other)
        const uniqueSectors = [];
        for (const s of sectors) {
            if (!uniqueSectors.some(u => Math.abs(u.angle - s.angle) < 6)) {
                uniqueSectors.push(s);
            }
            if (uniqueSectors.length >= 5) break;
        }

        // 2. PHASE TWO: Fine Refinement (Homing In)
        const candidates = [];
        const fineStep = 0.5; // High precision
        const searchRange = 5; // Search +/- 5 degrees around coarse hit

        for (const sector of uniqueSectors) {
            const startAng = sector.angle - searchRange;
            const endAng = sector.angle + searchRange;

            for (let a = startAng; a <= endAng; a += fineStep) {
                const rad = a * Math.PI / 180;
                const dir = { x: Math.cos(rad), y: Math.sin(rad) };
                
                const trace = this.traceShotPath(cueBall.position, dir, validTargets);
                
                if (trace && trace.hitsValidTarget) {
                    // Calculate precise power based on distance
                    const power = Math.min(35, 12 + trace.totalDistance / 25);
                    
                    candidates.push({
                        target: trace.targetHit,
                        rail: trace.bounces > 0 ? `${trace.bounces} cushion(s)` : 'direct',
                        direction: dir,
                        power: power,
                        score: this.scoreEscapeResult(trace) + 10, // Bonus for confirmed hit
                        bounces: trace.bounces,
                        angle: a
                    });
                }
            }
        }

        // 3. PHASE THREE: Foul Memory Filtering
        // Filter out shots that look exactly like the last foul
        if (this.lastFoulShot && candidates.length > 0) {
            const foulDir = this.lastFoulShot.direction;
            
            // Remove candidates that are within 1.5 degrees of the mistake
            const filtered = candidates.filter(c => {
                const dot = Vec2.dot(c.direction, foulDir);
                const diffAngle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
                
                // If it's practically the same shot that failed, skip it
                if (diffAngle < 1.5 && this.isSameShotAsFoul({ target: c.target, pocket: {position: {x:0, y:0}} })) {
                    aiLog(`Skipping candidate at ${c.angle.toFixed(1)}° - too close to previous foul`);
                    return false;
                }
                return true;
            });
            
            // If we have filtered options, use them. If we filtered everything, keep the original list (better to try than freeze)
            if (filtered.length > 0) {
                candidates.length = 0;
                candidates.push(...filtered);
            }
        }

        if (candidates.length === 0) return null;

        // Sort by score
        candidates.sort((a, b) => b.score - a.score);
        
        const best = candidates[0];
        aiLog(`Best Escape Found: ${best.angle.toFixed(1)}° (${best.rail}) -> Score: ${best.score.toFixed(0)}`);
        
        return best;
    }

    // Helper to score escape attempts
    scoreEscapeResult(trace) {
        if (!trace) return -100;
        
        let score = 0;
        
        if (trace.hitsValidTarget) {
            score = 100;
        } else {
            // Partial score for getting close (helps sorting in Phase 1)
            score = 50 - Math.min(50, trace.closestApproach);
        }

        // Penalize distance and bounces (prefer simple shots)
        score -= (trace.totalDistance / 20); 
        score -= (trace.bounces * 10);

        return score;
    }

    // Trace a shot path through rail bounces and find what ball is hit first
    // UPDATED: Now returns closest approach info for homing in on targets
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
        const maxBounces = 3; 
        const maxDistance = 2500; 

        // Track the closest we ever get to a valid target (for refining aim)
        let closestApproach = Infinity;
        let closestTarget = null;

        while (bounces <= maxBounces && totalDistance < maxDistance) {
            // 1. Check for ball collisions
            let firstBallHit = null;
            let firstBallDist = Infinity;

            for (const ball of allBalls) {
                const ballRadius = ball.radius || 12;
                const toBall = Vec2.subtract(ball.position, currentPos);
                const projection = Vec2.dot(toBall, currentDir);

                // Check "Near Miss" for valid targets
                if (validTargets.includes(ball) && projection > 0) {
                    const closestPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, projection));
                    const perpDist = Vec2.distance(ball.position, closestPoint);
                    if (perpDist < closestApproach) {
                        closestApproach = perpDist;
                        closestTarget = ball;
                    }
                }

                if (projection < 0) continue; // Ball is behind us

                // Calculate perpendicular distance to aim line
                const closestPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, projection));
                const perpDist = Vec2.distance(ball.position, closestPoint);

                // Check collision
                const hitRadius = ballRadius + cueBallRadius;
                if (perpDist < hitRadius) {
                    const offset = Math.sqrt(Math.max(0, hitRadius * hitRadius - perpDist * perpDist));
                    const contactDist = projection - offset;
                    
                    if (contactDist > 1 && contactDist < firstBallDist) {
                        firstBallDist = contactDist;
                        firstBallHit = ball;
                    }
                }
            }

            // 2. Find nearest rail
            let nearestRailDist = Infinity;
            let hitRail = null;

            // ... (Your existing Rail Detection Logic here - unchanged) ...
            // [Copy the Left/Right/Top/Bottom detection from your original code]
            if (currentDir.y < -0.01) {
                const t = (bounds.top + margin - currentPos.y) / currentDir.y;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'top'; }
            }
            if (currentDir.y > 0.01) {
                const t = (bounds.bottom - margin - currentPos.y) / currentDir.y;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'bottom'; }
            }
            if (currentDir.x < -0.01) {
                const t = (bounds.left + margin - currentPos.x) / currentDir.x;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'left'; }
            }
            if (currentDir.x > 0.01) {
                const t = (bounds.right - margin - currentPos.x) / currentDir.x;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'right'; }
            }
            // ... (End Rail Detection) ...

            // 3. Resolve Collision
            if (firstBallHit && firstBallDist < nearestRailDist) {
                totalDistance += firstBallDist;
                const isValidTarget = validTargets.includes(firstBallHit);
                
                return {
                    hitsValidTarget: isValidTarget,
                    targetHit: firstBallHit,
                    totalDistance,
                    bounces,
                    closestApproach: 0 // Direct hit
                };
            }

            if (!hitRail) break;

            // Move to rail
            const railHitPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, nearestRailDist));
            
            // Pocket Scratch Check
            if (this.isNearPocket(railHitPoint)) return null; 

            totalDistance += nearestRailDist;
            
            // Reflect with cushion throw (Your existing logic)
            const cushionThrowFactor = 0.75;
            if (hitRail === 'top' || hitRail === 'bottom') {
                currentDir = { x: currentDir.x * cushionThrowFactor, y: -currentDir.y };
            } else {
                currentDir = { x: -currentDir.x, y: currentDir.y * cushionThrowFactor };
            }
            currentDir = Vec2.normalize(currentDir);
            
            currentPos = railHitPoint;
            bounces++;
        }

        // Return the closest we got (for the refinement phase)
        return {
            hitsValidTarget: false,
            targetHit: closestTarget,
            totalDistance,
            bounces,
            closestApproach // Tells us how close we got
        };
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
    // FIX: Updated to use numeric ranges so AI calculates safety shots correctly
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
                    if (opponentGroup === 'solid') return b.number >= 1 && b.number <= 7;
                    if (opponentGroup === 'stripe') return b.number >= 9 && b.number <= 15;
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
                    if (opponentGroup === 'group1') return b.number >= 1 && b.number <= 7;
                    if (opponentGroup === 'group2') return b.number >= 9 && b.number <= 15;
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
                    for (const power of [2, 3, 4, 5, 6, 8, 10, 12, 18, 21, 26, 30, 38, 45]) {
                        // Skip power levels that won't reach the target ball
                        if (power < minPowerToReach) {
                            continue;
                        }
                        // Try with and without backspin
                        for (const spinY of [-0.5,-0.2, 0, 0.2, 0.5]) { // 0 = stun, 0.5 = backspin
                            // Apply draw compensation (same as analyzeShotVariants)
                            let effectivePower = power;
                            if (spinY > 0.05) {
                                effectivePower *= (1 + 0.20 * Math.min(1, Math.abs(spinY)));
                            }

                            // Predict where cue ball ends up
                            const cueBallEndPos = this.predictSafetyCueBallPosition(
                                cueBall.position, target.position, ghostBall,
                                aimDir, effectivePower, spinY, contactAngle
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
                                    power: effectivePower,
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

        // Pass 2: Re-simulate top candidates with Planck physics
        if (safetyOptions.length > 0) {
            this.resimulateTopSafetyCandidates(safetyOptions, opponentBalls);
            safetyOptions.sort((a, b) => b.score - a.score);
        }

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

    // Simulate ball movement accounting for rails AND collisions with other balls
    simulatePhysicsPath(startPos, direction, maxDistance) {
        let currentPos = { x: startPos.x, y: startPos.y };
        let currentDir = Vec2.normalize(direction);
        let distRemaining = maxDistance;
        const bounds = this.table.bounds;
        const ballRadius = 12; // Approximation
        
        // Get obstacles (all balls on table except the one we just hit)
        // We assume we just hit 'targetPos', so we shouldn't collide with it immediately again
        const obstacles = this.game.balls.filter(b => !b.pocketed && !b.isCueBall);

        // Limit simulation steps to prevent infinite loops
        for (let step = 0; step < 5; step++) {
            if (distRemaining <= 0) break;

            // 1. Find nearest rail hit
            let nearestRailDist = Infinity;
            let hitRail = null;
            const margin = ballRadius; // Stop before center crosses boundary

            // (Reuse your existing rail check logic here, simplified for brevity)
            if (currentDir.x < 0) {
                const t = (bounds.left + margin - currentPos.x) / currentDir.x;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'vert'; }
            }
            if (currentDir.x > 0) {
                const t = (bounds.right - margin - currentPos.x) / currentDir.x;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'vert'; }
            }
            if (currentDir.y < 0) {
                const t = (bounds.top + margin - currentPos.y) / currentDir.y;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'horiz'; }
            }
            if (currentDir.y > 0) {
                const t = (bounds.bottom - margin - currentPos.y) / currentDir.y;
                if (t > 0 && t < nearestRailDist) { nearestRailDist = t; hitRail = 'horiz'; }
            }

            // 2. Find nearest ball collision
            let nearestBallDist = Infinity;
            
            for (const ball of obstacles) {
                // Don't collide with balls behind us or too far
                const toBall = Vec2.subtract(ball.position, currentPos);
                const proj = Vec2.dot(toBall, currentDir);
                if (proj <= 0 || proj > distRemaining + 20) continue;

                // Check perpendicular distance
                const closest = Vec2.add(currentPos, Vec2.multiply(currentDir, proj));
                const dist = Vec2.distance(ball.position, closest);
                
                if (dist < ballRadius * 2) { // Collision!
                    // Exact impact distance
                    const backstep = Math.sqrt(Math.pow(ballRadius * 2, 2) - dist * dist);
                    const impactDist = proj - backstep;
                    
                    if (impactDist > 1 && impactDist < nearestBallDist) {
                        nearestBallDist = impactDist;
                    }
                }
            }

            // 3. Determine what happens first: Stop, Rail, or Ball?
            const moveDist = Math.min(distRemaining, nearestRailDist, nearestBallDist);
            
            // Move the ball
            currentPos = Vec2.add(currentPos, Vec2.multiply(currentDir, moveDist));
            distRemaining -= moveDist;

            // Handle Stop
            if (moveDist === distRemaining) return currentPos; 

            // Handle Ball Collision (Stop dead for safety prediction - mostly accurate enough)
            if (moveDist === nearestBallDist) {
                return currentPos; // We hit a ball, trajectory ends/deflects unpredictably. Stop here.
            }

            // Handle Rail Bounce
            if (moveDist === nearestRailDist) {
                // Reflect
                if (hitRail === 'vert') currentDir.x *= -1;
                else currentDir.y *= -1;
                
                // Lose energy on bounce
                distRemaining *= 0.7; 
            }
        }
        return currentPos;
    }

    // UPDATED prediction method utilizing the physics simulator
    predictSafetyCueBallPosition(_cueBallStart, targetPos, ghostBall, aimDir, power, spinY, contactAngle) {
        const angleRad = contactAngle * Math.PI / 180;
        const contactNormal = Vec2.normalize(Vec2.subtract(targetPos, ghostBall));
        const tangent = { x: -contactNormal.y, y: contactNormal.x };

        // Determine initial deflection direction
        let deflectionDir;
        if (spinY > 0.3) {
            deflectionDir = Vec2.normalize(Vec2.add(
                Vec2.multiply(tangent, Math.cos(angleRad)),
                Vec2.multiply(aimDir, -spinY * 0.5)
            ));
        } else if (spinY < -0.3) {
            deflectionDir = Vec2.normalize(Vec2.add(
                Vec2.multiply(tangent, Math.cos(angleRad) * 0.5),
                Vec2.multiply(contactNormal, 0.5)
            ));
        } else {
            const dot = Vec2.dot(aimDir, tangent);
            deflectionDir = dot >= 0 ? tangent : Vec2.multiply(tangent, -1);
        }

        // Calculate total travel distance energy
        const energyRetained = Math.cos(angleRad) * 0.7 + 0.3;
        let travelDist = power * 20 * energyRetained;

        if (spinY > 0) travelDist *= (1 - spinY * 0.4);
        else if (spinY < 0) travelDist *= (1 - spinY * 0.3);

        // USE NEW PHYSICS SIMULATOR
        // Start simulation from the target position (where contact happens)
        // moving in the deflection direction
        return this.simulatePhysicsPath(targetPos, deflectionDir, travelDist);
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

    // Score a safety position based on the opponent's "Best Case Scenario"
    // Higher score = Better safety (harder for opponent)
    scoreSafetyPosition(cueBallEndPos, opponentBalls, hitTarget) {
        let bestSnookerBall = null;
        let maxOpponentThreat = 0; // 0 = Safe, 100 = Opponent has an easy pot
        let totalSnookers = 0;

        const pockets = this.table.pockets;
        
        // 1. Analyze every ball the opponent could legally hit next
        for (const opponentBall of opponentBalls) {
            
            // Check if they can even see this ball (Snooker Check)
            const isVisible = this.isPathClear(cueBallEndPos, opponentBall.position, [opponentBall]);

            if (!isVisible) {
                
                // Track which ball is snookering them (for debugging/visuals)
                if (!bestSnookerBall) {
                    // Quick check to find the blocker
                    const blockers = this.game.balls.filter(b => !b.pocketed && !b.isCueBall && b !== opponentBall);
                    for (const blocker of blockers) {
                        if (this.ballBlocksPath(cueBallEndPos, opponentBall.position, blocker)) {
                            bestSnookerBall = blocker;
                            break;
                        }
                    }
                }
                continue; // If they can't see it, threat is 0 for this ball (ignoring luck)
            }

            // If visible, calculate how "easy" it is to pot
            for (const pocket of pockets) {
                // Is path to pocket clear?
                if (this.isPathClear(opponentBall.position, pocket.position, [opponentBall])) {
                    
                    // UNIFIED CALL: How easy is this shot for the opponent?
                    const threat = this.calculatePottingDifficulty(cueBallEndPos, opponentBall, pocket);

                    // TRACK THE HIGHEST THREAT
                    // If this specific shot is easier than anything else found so far, update the max threat.
                    if (threat > maxOpponentThreat) {
                        maxOpponentThreat = threat;
                    }
                }
            }
        }

        // --- FINAL SAFETY SCORE CALCULATION ---
        
        // Start with the inverse of the threat
        // MaxThreat 100 (Easy pot) -> Score 0
        // MaxThreat 0 (Total Snooker) -> Score 100
        let safetyScore = 100 - maxOpponentThreat;

        // CRITICAL CLAMP: If the opponent has ANY easy shot (Threat > 50), 
        // the safety has failed regardless of other factors.
        if (maxOpponentThreat > 50) {
            // Cap score low so we don't pick this safety
            // Even if we snookered 14 other balls, this score stays low.
            return { score: Math.min(20, safetyScore), snookerBall: null };
        }

        if (this.game.mode === GameMode.SNOOKER) {
            
            // 1. Determine where Baulk is (Assuming Baulk is on the Left, < kitchenLine)
            const baulkLineX = this.table.kitchenLine;
            const isBehindBaulk = cueBallEndPos.x < baulkLineX;

            if (isBehindBaulk) {
                // 2. Check if there are any easy Reds inside Baulk
                // If there are reds in Baulk, putting the cue ball there isn't safe!
                const redsInBaulk = opponentBalls.filter(b => 
                    b.isRed && b.position.x < baulkLineX
                ).length;

                if (redsInBaulk === 0) {
                    // HUGE BONUS: We are behind baulk, and all reds are down table.
                    // This forces the opponent to hit a long shot.
                    
                    // Base bonus
                    let baulkBonus = 50;

                    // Extra bonus if we are deep in Baulk (near the cushion)
                    const distToBaulkCushion = Math.abs(cueBallEndPos.x - this.table.bounds.left);
                    if (distToBaulkCushion < 50) baulkBonus += 10;

                    safetyScore += baulkBonus;

                    aiLog('   + Baulk Safety Bonus applied');
                }
            }
        }

        // If we survived the "Hanger Check", add minor bonuses for quality of life
        
        // 1. Distance Bonus: If we left them a long shot (low threat), reward putting the cue ball far away
        // Find distance to nearest opponent ball
        let nearestDist = Infinity;
        for (const ob of opponentBalls) {
            const d = Vec2.distance(cueBallEndPos, ob.position);
            if (d < nearestDist) nearestDist = d;
        }
        if (nearestDist > 600) safetyScore += 10; // Good distance safety

        // 2. Snooker Bonus: Even if not totally safe, snookering more balls limits their options
        // removed - not helpful

        // 3. Rail Bonus: Freezing cue ball to rail is annoying for opponent
        const bounds = this.table.bounds;
        const distToRail = Math.min(
            cueBallEndPos.x - bounds.left, bounds.right - cueBallEndPos.x,
            cueBallEndPos.y - bounds.top, bounds.bottom - cueBallEndPos.y
        );
        if (distToRail < 25) safetyScore += 5;

        return { score: safetyScore, snookerBall: bestSnookerBall };
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