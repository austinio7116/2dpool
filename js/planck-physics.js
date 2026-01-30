// Physics engine using Planck.js (Box2D port)
// Refactored to use native Z-spin and custom Slip Friction for X/Y spin

import planck from 'planck';
import { Vec2, Constants } from './utils.js';

if (planck.Settings) {
    planck.Settings.velocityThreshold = 0.01;
} else if (planck.internal && planck.internal.Settings) {
    planck.internal.Settings.velocityThreshold = 0.01;
}

const SCALE = 100;
const VELOCITY_SCALE = 60;

export class PlanckPhysics {
    constructor(table) {
        this.table = table;
        this.collisionEvents = [];
        this.speedMultiplier = 1.0;
        this.accumulator = 0;
        this.tableStyle = 1; // Default table style (1-indexed)

        // Constants for the Slip Friction Model
        // Friction coefficient between ball and cloth (dynamic)
        this.mu_slide = 0.05;
        // Friction coefficient for rolling (much lower)
        this.mu_roll = 0.01;
        // Gravitational acceleration (scaled m/s^2)
        this.g = 9.8;

        this.world = planck.World({
            gravity: planck.Vec2(0, 0)
        });

        this.ballToBody = new Map();
        this.bodyToBall = new Map();
        this.railBodies = []; // Track rail bodies for recreation

        this.setupContactListener();
        this.createTableBoundaries();
    }

    setTableStyle(tableNum) {
        if (this.tableStyle === tableNum) return;
        this.tableStyle = tableNum;
        this.recreateTableBoundaries();
    }

    recreateTableBoundaries() {
        // Destroy existing rail bodies
        for (const body of this.railBodies) {
            this.world.destroyBody(body);
        }
        this.railBodies = [];

        // Recreate with new style
        this.createTableBoundaries();
    }

    createTableBoundaries() {
        const b = this.table.bounds;
        const pocketRadius = Constants.POCKET_RADIUS;
        const ballRadius = Constants.BALL_RADIUS;
        const gap = pocketRadius + ballRadius * 0.5;

        // For curved pocket tables, corners need a larger gap
        const useCurvedPockets = this.tableStyle === 7 || this.tableStyle === 8;
        const cornerGap = useCurvedPockets ? gap + 3 : gap;

        // Create Rails
        this.createRailSegment(b.left + cornerGap, b.top, this.table.center.x - gap, b.top, 'top');
        this.createRailSegment(this.table.center.x + gap, b.top, b.right - cornerGap, b.top, 'top');
        this.createRailSegment(b.left + cornerGap, b.bottom, this.table.center.x - gap, b.bottom, 'bottom');
        this.createRailSegment(this.table.center.x + gap, b.bottom, b.right - cornerGap, b.bottom, 'bottom');
        this.createRailSegment(b.left, b.top + cornerGap, b.left, b.bottom - cornerGap, 'left');
        this.createRailSegment(b.right, b.top + cornerGap, b.right, b.bottom - cornerGap, 'right');

        this.createPocketEntrySegments();
    }

    createPocketEntrySegments() {
        // Tables 7 (UK pub) and 8 (mini snooker) use curved pocket entries
        const useCurvedPockets = this.tableStyle === 7 || this.tableStyle === 8;

        if (useCurvedPockets) {
            this.createCurvedPocketEntries();
        } else {
            this.createStraightPocketEntries();
        }
    }

    createStraightPocketEntries() {
        const b = this.table.bounds;
        const pocketRadius = Constants.POCKET_RADIUS;
        const ballRadius = Constants.BALL_RADIUS;
        const gap = pocketRadius + ballRadius * 0.5;
        const segmentLength = 20; // Length of angled segments

        // Angles in degrees (configurable)
        const sidePocketAngle = 70; // Degrees from cushion line for side pockets
        const cornerPocketAngle = 45; // Degrees from cushion line for corner pockets

        // Convert to radians
        const sideRad = sidePocketAngle * Math.PI / 180;
        const cornerRad = cornerPocketAngle * Math.PI / 180;

        // Side pocket entry segments (top)
        this.createRailSegment(
            this.table.center.x - gap, b.top,
            this.table.center.x - gap + Math.cos(sideRad) * segmentLength, b.top - Math.sin(sideRad) * segmentLength,
            'pocket'
        );
        this.createRailSegment(
            this.table.center.x + gap, b.top,
            this.table.center.x + gap - Math.cos(sideRad) * segmentLength, b.top - Math.sin(sideRad) * segmentLength,
            'pocket'
        );

        // Side pocket entry segments (bottom)
        this.createRailSegment(
            this.table.center.x - gap, b.bottom,
            this.table.center.x - gap + Math.cos(sideRad) * segmentLength, b.bottom + Math.sin(sideRad) * segmentLength,
            'pocket'
        );
        this.createRailSegment(
            this.table.center.x + gap, b.bottom,
            this.table.center.x + gap - Math.cos(sideRad) * segmentLength, b.bottom + Math.sin(sideRad) * segmentLength,
            'pocket'
        );

        // Corner pocket entry segments
        // Top-left corner
        this.createRailSegment(
            b.left + gap, b.top,
            b.left + gap - Math.cos(cornerRad) * segmentLength, b.top - Math.sin(cornerRad) * segmentLength,
            'pocket'
        );
        this.createRailSegment(
            b.left, b.top + gap,
            b.left - Math.sin(cornerRad) * segmentLength, b.top + gap - Math.cos(cornerRad) * segmentLength,
            'pocket'
        );

        // Top-right corner
        this.createRailSegment(
            b.right - gap, b.top,
            b.right - gap + Math.cos(cornerRad) * segmentLength, b.top - Math.sin(cornerRad) * segmentLength,
            'pocket'
        );
        this.createRailSegment(
            b.right, b.top + gap,
            b.right + Math.sin(cornerRad) * segmentLength, b.top + gap - Math.cos(cornerRad) * segmentLength,
            'pocket'
        );

        // Bottom-left corner
        this.createRailSegment(
            b.left + gap, b.bottom,
            b.left + gap - Math.cos(cornerRad) * segmentLength, b.bottom + Math.sin(cornerRad) * segmentLength,
            'pocket'
        );
        this.createRailSegment(
            b.left, b.bottom - gap,
            b.left - Math.sin(cornerRad) * segmentLength, b.bottom - gap + Math.cos(cornerRad) * segmentLength,
            'pocket'
        );

        // Bottom-right corner
        this.createRailSegment(
            b.right - gap, b.bottom,
            b.right - gap + Math.cos(cornerRad) * segmentLength, b.bottom + Math.sin(cornerRad) * segmentLength,
            'pocket'
        );
        this.createRailSegment(
            b.right, b.bottom - gap,
            b.right + Math.sin(cornerRad) * segmentLength, b.bottom - gap + Math.cos(cornerRad) * segmentLength,
            'pocket'
        );
    }

    createCurvedPocketEntries() {
        const b = this.table.bounds;
        const pocketRadius = Constants.POCKET_RADIUS;
        const ballRadius = Constants.BALL_RADIUS;
        const gap = pocketRadius + ballRadius * 0.5;
        const cornerGap = gap + 3;  // Corner gaps are larger for curved tables

        // Curve parameters - different for corner vs middle pockets
        // Corner pockets have gentler curves, middle pockets have tighter curves
        const cornerCurveLength = 28;  // Length of curved segment for corners
        const middleCurveLength = 22;  // Length of curved segment for middle pockets
        const cornerCurveAmount = 0.4; // How much the corner curves bulge (multiplier)
        const middleCurveAmount = 0.5; // Middle pockets curve amount

        // Middle pocket entries (top) - curve outward (convex)
        // Inner endpoints moved 3px towards center
        this.createCurvedPocketEntry(
            this.table.center.x - gap, b.top,
            this.table.center.x - gap + middleCurveLength * 0.3 + 3, b.top - middleCurveLength,
            middleCurveAmount, 8
        );
        this.createCurvedPocketEntry(
            this.table.center.x + gap, b.top,
            this.table.center.x + gap - middleCurveLength * 0.3 - 3, b.top - middleCurveLength,
            -middleCurveAmount, 8
        );

        // Middle pocket entries (bottom)
        this.createCurvedPocketEntry(
            this.table.center.x - gap, b.bottom,
            this.table.center.x - gap + middleCurveLength * 0.3 + 3, b.bottom + middleCurveLength,
            -middleCurveAmount, 8
        );
        this.createCurvedPocketEntry(
            this.table.center.x + gap, b.bottom,
            this.table.center.x + gap - middleCurveLength * 0.3 - 3, b.bottom + middleCurveLength,
            middleCurveAmount, 8
        );

        // Corner pocket entries - gentler curves (convex)
        // Inner endpoints moved 3px towards pocket along rail direction
        // Top-left corner
        this.createCurvedPocketEntry(
            b.left + cornerGap, b.top,
            b.left + cornerGap - cornerCurveLength * 0.7 - 3, b.top - cornerCurveLength * 0.7,
            -cornerCurveAmount, 6
        );
        this.createCurvedPocketEntry(
            b.left, b.top + cornerGap,
            b.left - cornerCurveLength * 0.7, b.top + cornerGap - cornerCurveLength * 0.7 - 3,
            cornerCurveAmount, 6
        );

        // Top-right corner
        this.createCurvedPocketEntry(
            b.right - cornerGap, b.top,
            b.right - cornerGap + cornerCurveLength * 0.7 + 3, b.top - cornerCurveLength * 0.7,
            cornerCurveAmount, 6
        );
        this.createCurvedPocketEntry(
            b.right, b.top + cornerGap,
            b.right + cornerCurveLength * 0.7, b.top + cornerGap - cornerCurveLength * 0.7 - 3,
            -cornerCurveAmount, 6
        );

        // Bottom-left corner
        this.createCurvedPocketEntry(
            b.left + cornerGap, b.bottom,
            b.left + cornerGap - cornerCurveLength * 0.7 - 3, b.bottom + cornerCurveLength * 0.7,
            cornerCurveAmount, 6
        );
        this.createCurvedPocketEntry(
            b.left, b.bottom - cornerGap,
            b.left - cornerCurveLength * 0.7, b.bottom - cornerGap + cornerCurveLength * 0.7 + 3,
            -cornerCurveAmount, 6
        );

        // Bottom-right corner
        this.createCurvedPocketEntry(
            b.right - cornerGap, b.bottom,
            b.right - cornerGap + cornerCurveLength * 0.7 + 3, b.bottom + cornerCurveLength * 0.7,
            -cornerCurveAmount, 6
        );
        this.createCurvedPocketEntry(
            b.right, b.bottom - cornerGap,
            b.right + cornerCurveLength * 0.7, b.bottom - cornerGap + cornerCurveLength * 0.7 + 3,
            cornerCurveAmount, 6
        );
    }

    createRailSegment(x1, y1, x2, y2, railType) {
        const body = this.world.createBody({
            type: 'static',
            position: planck.Vec2(0, 0)
        });

        const toM = (px) => px / SCALE;

        body.createFixture({
            shape: planck.Edge(
                planck.Vec2(toM(x1), toM(y1)),
                planck.Vec2(toM(x2), toM(y2))
            ),
            // INCREASED FRICTION:
            // This enables the "Check Side" and "Running Side" effects natively.
            // When a spinning ball hits this, the friction causes a tangential kick.
            friction: 0.3, 
            restitution: Constants.RAIL_RESTITUTION
        });

        body.setUserData({ type: 'rail', railType: railType });
        this.railBodies.push(body);
    }

    // Create a curved pocket entry using multiple segments to approximate an arc
    createCurvedPocketEntry(startX, startY, endX, endY, curveDirection, numSegments = 6) {
        // curveDirection: positive curves one way, negative curves the other
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;

        // Calculate perpendicular direction for curve bulge
        const dx = endX - startX;
        const dy = endY - startY;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Perpendicular vector (normalized)
        const perpX = -dy / len;
        const perpY = dx / len;

        // Curve depth (how far the arc bulges)
        const curveDepth = len * 0.4 * curveDirection;

        // Generate points along a quadratic bezier curve
        const points = [];
        for (let i = 0; i <= numSegments; i++) {
            const t = i / numSegments;
            // Quadratic bezier: P = (1-t)²*P0 + 2*(1-t)*t*P1 + t²*P2
            // Control point is at midpoint + perpendicular offset
            const controlX = midX + perpX * curveDepth;
            const controlY = midY + perpY * curveDepth;

            const oneMinusT = 1 - t;
            const x = oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * controlX + t * t * endX;
            const y = oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * controlY + t * t * endY;
            points.push({ x, y });
        }

        // Create edge segments between consecutive points
        for (let i = 0; i < points.length - 1; i++) {
            this.createRailSegment(
                points[i].x, points[i].y,
                points[i + 1].x, points[i + 1].y,
                'pocket'
            );
        }
    }

    setupContactListener() {
        // We only need to track collisions for Game Logic (sounds, rules).
        // Physics (English/Throw) is now handled natively by Planck friction.
        this.world.on('begin-contact', (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const dataA = fixtureA.getBody().getUserData();
            const dataB = fixtureB.getBody().getUserData();

            if (!dataA || !dataB) return;

            // Ball-Ball Collision
            if (dataA.type === 'ball' && dataB.type === 'ball') {
                const velA = fixtureA.getBody().getLinearVelocity();
                const velB = fixtureB.getBody().getLinearVelocity();
                const relVelX = velA.x - velB.x;
                const relVelY = velA.y - velB.y;
                const speed = Math.sqrt(relVelX * relVelX + relVelY * relVelY);

                this.collisionEvents.push({
                    type: 'ball',
                    ballA: dataA.ball,
                    ballB: dataB.ball,
                    speed
                });
            }
            // Ball-Rail Collision
            else if ((dataA.type === 'ball' && dataB.type === 'rail') || 
                     (dataA.type === 'rail' && dataB.type === 'ball')) {
                
                const ballBody = dataA.type === 'ball' ? fixtureA.getBody() : fixtureB.getBody();
                const ballData = dataA.type === 'ball' ? dataA : dataB;
                const railData = dataA.type === 'rail' ? dataA : dataB;
                const speed = ballBody.getLinearVelocity().length();

                this.collisionEvents.push({
                    type: 'rail',
                    ball: ballData.ball,
                    railType: railData.railType,
                    speed
                });
            }
        });
    }


    createBallBody(ball) {
        const pos = planck.Vec2(ball.position.x / SCALE, ball.position.y / SCALE);

        const body = this.world.createBody({
            type: 'dynamic',
            position: pos,
            bullet: true,
            // Native damping handles basic air resistance
            linearDamping: 1, 
            // Angular damping for the Z-axis (English decay)
            angularDamping: 1 
        });

        body.setLinearVelocity(planck.Vec2(
            ball.velocity.x * VELOCITY_SCALE / SCALE,
            ball.velocity.y * VELOCITY_SCALE / SCALE
        ));

        body.createFixture({
            shape: planck.Circle(ball.radius / SCALE),
            density: 1.0,
            // Friction enables "Throw" (spin transfer between balls) and English on rails
            friction: 0.1, 
            restitution: Constants.RESTITUTION
        });

        body.setUserData({ type: 'ball', ball: ball });

        // Sync Z-Spin (English) from Ball to Body
        body.setAngularVelocity(ball.spinZ);

        this.ballToBody.set(ball, body);
        this.bodyToBall.set(body, ball);

        return body;
    }

    syncBallsToPlanck(balls) {
        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            let body = this.ballToBody.get(ball);
            if (!body) {
                body = this.createBallBody(ball);
                continue;
            }

            // Sync if game logic forced a change (e.g. shot execution)
            if (ball.forceSync) {
                body.setPosition(planck.Vec2(ball.position.x / SCALE, ball.position.y / SCALE));
                body.setLinearVelocity(planck.Vec2(
                    ball.velocity.x * VELOCITY_SCALE / SCALE,
                    ball.velocity.y * VELOCITY_SCALE / SCALE
                ));
                body.setAngularVelocity(ball.spinZ); // Sync English
                body.setAwake(true);
                ball.forceSync = false;
            }
        }
    }

    syncPlanckToBalls(balls) {
        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            const pos = body.getPosition();
            const vel = body.getLinearVelocity();

            ball.position.x = pos.x * SCALE;
            ball.position.y = pos.y * SCALE;
            ball.velocity.x = vel.x * SCALE / VELOCITY_SCALE;
            ball.velocity.y = vel.y * SCALE / VELOCITY_SCALE;
            
            // Sync Z-Spin back to ball for storage/vis
            ball.spinZ = body.getAngularVelocity();
        }
    }

    /**
     * The Core Integrator for Cloth Physics
     * Simulates friction based on the relative velocity between the contact point and the cloth.
     * This naturally produces: Draw, Follow, Drag, and Masse curves.
     */
    applyClothFriction(ball, body, dt) {
        if (!body.isAwake()) return;

        const v = body.getLinearVelocity(); 
        const speed = v.length();
        const radius = ball.radius / SCALE;
        const omega = ball.spin; 

        // 1. Calculate Contact Point Velocity
        const v_cp_x = v.x + omega.y * radius;
        const v_cp_y = v.y - omega.x * radius;
        const slipSpeed = Math.sqrt(v_cp_x * v_cp_x + v_cp_y * v_cp_y);

        // 2. Determine Friction Impulse
        // TWEAK: Increased threshold from 0.05 to 0.15
        // This forces more "slightly imperfect" rolls to be treated as pure rolling (drag only)
        const isSlipping = slipSpeed > 0.15;
        
        if (isSlipping) {
            // Dynamic Friction (Safe Zone Logic from previous step)
            const slipThreshold = 2.5; 
            let dynamicMu = 0.025;     

            if (slipSpeed > slipThreshold) {
                dynamicMu += (slipSpeed - slipThreshold) * 0.12;
            }
            dynamicMu = Math.min(dynamicMu, 0.35);

            const forceMag = dynamicMu * body.getMass() * this.g;
            
            const dirX = -v_cp_x / slipSpeed;
            const dirY = -v_cp_y / slipSpeed;

            let fx = dirX * forceMag;
            let fy = dirY * forceMag;

            // --- ENERGY FIX: PREVENT INFINITE ROLL ---
            // Calculate if this force is trying to accelerate the ball
            if (speed > 0.01) {
                const dot = fx * (v.x/speed) + fy * (v.y/speed);
                
                // If dot > 0, the friction is pushing the ball forward (Topspin kick).
                // We only want this if the slip is REAL (e.g. cue ball shot), 
                // not a micro-artifact of rolling.
                if (dot > 0) {
                     // If slip is small (< 1.0 m/s), dampen the forward kick significantly.
                     // This effectively kills the "Magical Acceleration" from micro-topspin.
                     if (slipSpeed < 1.0) {
                         fx *= 0.1;
                         fy *= 0.1;
                     }
                }
            }
            // -----------------------------------------

            // Suppress Magnus (Swerve) for object balls
            if (ball.number !== 0 && speed > 0.1) {
                const vxNorm = v.x / speed;
                const vyNorm = v.y / speed;
                const dot = fx * vxNorm + fy * vyNorm;
                fx = dot * vxNorm;
                fy = dot * vyNorm;
            }

            body.applyForceToCenter(planck.Vec2(fx, fy), true);

            // Torque (Spin Decay)
            const alpha = 2.5 * dt; 

            // Ideal rotation for pure roll
            const idealOmegaX = v.y / radius;
            const idealOmegaY = -v.x / radius;
            
            ball.spin.x = ball.spin.x * (1 - alpha) + idealOmegaX * alpha;
            ball.spin.y = ball.spin.y * (1 - alpha) + idealOmegaY * alpha;
            
            ball.isSliding = true;

        } else {
            // ROLLING (Drag Only)
            // This is where we want the ball to be 99% of the time!
            const dragMag = this.mu_roll * body.getMass() * this.g;
            
            if (speed > 0.01) {
                const dirX = -v.x / speed;
                const dirY = -v.y / speed;
                body.applyForceToCenter(planck.Vec2(dirX * dragMag, dirY * dragMag), true);
                
                const idealOmegaX = v.y / radius;
                const idealOmegaY = -v.x / radius;
                const rollLockSpeed = 0.2;
                
                ball.spin.x = ball.spin.x * (1 - rollLockSpeed) + idealOmegaX * rollLockSpeed;
                ball.spin.y = ball.spin.y * (1 - rollLockSpeed) + idealOmegaY * rollLockSpeed;
            } else {
                body.setLinearVelocity(planck.Vec2(0,0));
                body.setAngularVelocity(0);
                ball.spin.x = 0;
                ball.spin.y = 0;
            }
            ball.isSliding = false;
        }
    }

    update(balls, deltaTime = 16.67) {
        this.collisionEvents = [];
        
        // Clean up pocketed balls
        for (const ball of balls) {
            if ((ball.pocketed || ball.sinking) && this.ballToBody.has(ball)) {
                this.world.destroyBody(this.ballToBody.get(ball));
                this.ballToBody.delete(ball);
                this.bodyToBall.delete(this.ballToBody.get(ball));

                // --- FIX START ---
                // Zero out ALL physics state so it doesn't "remember" velocity or spin
                // when respotted later.
                ball.velocity.x = 0;
                ball.velocity.y = 0;
                ball.spinZ = 0;      // Clear English/Side Spin
                ball.spin.x = 0;     // Clear Top/Bottom Spin
                ball.spin.y = 0;
                ball.isSliding = false;
                // --- FIX END ---
            }
        }

        this.syncBallsToPlanck(balls);

        const fixedDt = (1.0 / 60.0) * this.speedMultiplier;
        const dtSec = fixedDt; // Seconds
        
        this.accumulator += Math.min(deltaTime, 50) / 1000;

        let framesRun = 0;
        while (this.accumulator >= fixedDt && framesRun < 3) {
            
            // 1. Apply our custom Cloth Forces (Magnus/Friction) BEFORE the physics step
            for (const ball of balls) {
                if (ball.pocketed || ball.sinking) continue;
                const body = this.ballToBody.get(ball);
                if (body) {
                    this.applyClothFriction(ball, body, dtSec);
                }
            }

            // 2. Step the physics world
            this.world.step(fixedDt, 8, 3);
            
            this.handlePockets(balls);
            
            this.accumulator -= fixedDt;
            framesRun++;
        }

        this.syncPlanckToBalls(balls);
        this.stopSlowBalls(balls);
        
        // Update sinking animation
        for (const ball of balls) {
            if (ball.sinking) ball.update();
        }

        return this.collisionEvents;
    }

    handlePockets(balls) {
        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            const pos = body.getPosition();
            const px = pos.x * SCALE;
            const py = pos.y * SCALE;

            for (const pocket of this.table.pockets) {
                const dx = px - pocket.position.x;
                const dy = py - pocket.position.y;
                const distSq = dx * dx + dy * dy;
                const fallRadius = pocket.radius - ball.radius * 0.5;

                if (distSq < fallRadius * fallRadius) {
                    const velocity = body.getLinearVelocity();
                    const speed = velocity.length();

                    ball.position.x = px;
                    ball.position.y = py;
                    ball.startSinking(pocket);

                    this.collisionEvents.push({
                        type: 'pocket',
                        ball: ball,
                        pocket: pocket,
                        speed: speed
                    });
                    break;
                }
            }
        }
    }

    stopSlowBalls(balls) {
        const stopLinearSq = 0.005 * 0.005; // Planck units
        const stopSpin = 0.5;

        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;
            const body = this.ballToBody.get(ball);
            if (!body) continue;

            const v = body.getLinearVelocity();
            const wZ = body.getAngularVelocity();
            const wXY = Math.abs(ball.spin.x) + Math.abs(ball.spin.y);

            // If everything is moving very slowly, kill it
            if (v.lengthSquared() < stopLinearSq && Math.abs(wZ) < stopSpin && wXY < stopSpin) {
                body.setLinearVelocity(planck.Vec2(0,0));
                body.setAngularVelocity(0);
                ball.spin.x = 0;
                ball.spin.y = 0;
                body.setAwake(false);
            }
        }
    }

    areBallsMoving(balls) {
        const minVelSq = 0.001 * 0.001;
        const minSpin = 0.1;

        for (const ball of balls) {
            // FIX: If a ball is currently sinking, the turn is NOT over. 
            // We must wait for the animation to finish and 'pocketed' to be set to true.
            if (ball.sinking) return true; 

            if (ball.pocketed) continue;
            const body = this.ballToBody.get(ball);
            if (!body) continue;
            if (!body.isAwake()) continue;

            const v = body.getLinearVelocity();
            // Check Linear
            if (v.lengthSquared() > minVelSq) return true;
            // Check English (Z)
            if (Math.abs(body.getAngularVelocity()) > minSpin) return true;
            // Check Draw/Follow (X/Y)
            if (Math.abs(ball.spin.x) > minSpin || Math.abs(ball.spin.y) > minSpin) return true;
        }
        return false;
    }

    setSpeedMultiplier(multiplier) {
        this.speedMultiplier = Math.max(0.1, Math.min(3.0, multiplier));
    }

    // Reset physics state for new game - destroys all ball bodies
    reset() {
        // Destroy all ball bodies
        for (const [ball, body] of this.ballToBody) {
            this.world.destroyBody(body);
        }
        this.ballToBody.clear();
        this.bodyToBall.clear();

        // Clear pending state
        this.collisionEvents = [];
        this.accumulator = 0;
    }

    predictTrajectory(cueBall, direction, power, balls, maxSteps = 200) {
        const trajectory = {
            cuePath: [{ x: cueBall.position.x, y: cueBall.position.y }],
            firstHit: null,
            targetPath: []
        };

        // Use geometric raycast for precise ghost ball positioning
        const hitResult = this.findFirstBallHit(cueBall, direction, balls);

        if (hitResult) {
            trajectory.firstHit = {
                position: hitResult.contactPoint,
                targetBallNumber: hitResult.ball.number
            };

            // Predict target ball path based on collision normal
            const nx = hitResult.ball.position.x - hitResult.contactPoint.x;
            const ny = hitResult.ball.position.y - hitResult.contactPoint.y;
            const nLen = Math.sqrt(nx * nx + ny * ny);
            const normalX = nx / nLen;
            const normalY = ny / nLen;

            let tx = hitResult.ball.position.x;
            let ty = hitResult.ball.position.y;
            let tvx = normalX * power * 0.7;
            let tvy = normalY * power * 0.7;

            for (let t = 0; t < 50; t++) {
                tx += tvx;
                ty += tvy;
                tvx *= 0.97;
                tvy *= 0.97;
                trajectory.targetPath.push({ x: tx, y: ty });
                if (tvx * tvx + tvy * tvy < 0.5) break;
            }

            // Build cue path up to contact point
            const dist = Math.sqrt(
                (hitResult.contactPoint.x - cueBall.position.x) ** 2 +
                (hitResult.contactPoint.y - cueBall.position.y) ** 2
            );
            const steps = Math.min(Math.ceil(dist / 5), 100);
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                trajectory.cuePath.push({
                    x: cueBall.position.x + direction.x * dist * t,
                    y: cueBall.position.y + direction.y * dist * t
                });
            }
        } else {
            // No ball hit - trace path with rail bounces
            this.tracePathWithRails(cueBall, direction, power, trajectory, maxSteps);
        }

        return trajectory;
    }

    // Geometric raycast to find exact contact point with first ball hit
    findFirstBallHit(cueBall, direction, balls) {
        let closest = null;
        let closestDist = Infinity;
        const combinedRadius = cueBall.radius * 2; // Both balls same size

        for (const ball of balls) {
            if (ball.number === 0 || ball.pocketed) continue;

            // Vector from cue ball to target ball
            const toTargetX = ball.position.x - cueBall.position.x;
            const toTargetY = ball.position.y - cueBall.position.y;

            // Project target onto aim direction
            const projection = toTargetX * direction.x + toTargetY * direction.y;

            // Ball is behind us
            if (projection < 0) continue;

            // Perpendicular distance from aim line to ball center
            const perpX = toTargetX - projection * direction.x;
            const perpY = toTargetY - projection * direction.y;
            const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);

            // Check if aim line passes close enough to hit this ball
            if (perpDist < combinedRadius) {
                // Calculate exact contact point
                // Distance along aim line to contact point
                const offset = Math.sqrt(combinedRadius * combinedRadius - perpDist * perpDist);
                const contactDist = projection - offset;

                if (contactDist > 0 && contactDist < closestDist) {
                    closestDist = contactDist;
                    closest = {
                        ball: ball,
                        contactPoint: {
                            x: cueBall.position.x + direction.x * contactDist,
                            y: cueBall.position.y + direction.y * contactDist
                        },
                        distance: contactDist
                    };
                }
            }
        }

        return closest;
    }

    // Trace cue ball path including rail bounces when no ball is hit directly
    tracePathWithRails(cueBall, direction, power, trajectory, maxSteps) {
        const b = this.table.bounds;
        const r = cueBall.radius;

        let px = cueBall.position.x;
        let py = cueBall.position.y;
        let vx = direction.x * power;
        let vy = direction.y * power;

        for (let step = 0; step < maxSteps; step++) {
            px += vx * 0.3;
            py += vy * 0.3;

            trajectory.cuePath.push({ x: px, y: py });

            // Rail bounces
            if (px - r < b.left || px + r > b.right) {
                vx = -vx * 0.8;
                px = Math.max(b.left + r, Math.min(b.right - r, px));
            }
            if (py - r < b.top || py + r > b.bottom) {
                vy = -vy * 0.8;
                py = Math.max(b.top + r, Math.min(b.bottom - r, py));
            }

            // Friction
            vx *= 0.995;
            vy *= 0.995;

            // Stop if slow enough
            if (vx * vx + vy * vy < 0.1) break;
        }
    }
}