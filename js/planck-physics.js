// Physics engine using Planck.js (Box2D port)
// Planck handles all physics: collisions, friction, and angular velocity

import planck from 'planck';
import { Vec2, Constants } from './utils.js';

// Adjust Planck's velocity threshold to account for our scale
// Default is 1.0 m/s - we need it lower since our velocities are scaled down
if (planck.Settings) {
    planck.Settings.velocityThreshold = 0.01;
} else if (planck.internal && planck.internal.Settings) {
    planck.internal.Settings.velocityThreshold = 0.01;
}

// Scale factor: 100 pixels = 1 Planck meter
// This keeps velocities within Planck's internal limits (~120 m/s max)
const SCALE = 100;
// Velocity conversion: game uses pixels/frame, Planck uses units/second
// At 60fps, multiply by 60 to convert pixels/frame to pixels/second
const VELOCITY_SCALE = 60;

// Custom spin effects scale - set to 0 to disable custom spin physics
// These effects (draw/follow, english) are applied on top of Planck's physics
// and currently cause energy conservation issues. Set to 1.0 to re-enable.
const SPIN_EFFECT_SCALE = 2;

export class PlanckPhysics {
    constructor(table) {
        this.table = table;
        this.collisionEvents = [];
        this.processedCollisions = new Set(); // Track spin effects applied this frame
        this.pendingSpinEffects = []; // Queue spin effects to apply after collision resolution
        this.speedMultiplier = 1.0; // Adjustable simulation speed
        this.accumulator = 0; // Time accumulator for fixed timestep

        // Create Planck world with zero gravity (horizontal table)
        this.world = planck.World({
            gravity: planck.Vec2(0, 0)
        });

        // Ball <-> Body mappings
        this.ballToBody = new Map();
        this.bodyToBall = new Map();

        // Setup collision detection
        this.setupContactListener();

        // Create table boundaries with pocket gaps
        this.createTableBoundaries();
    }

    createTableBoundaries() {
        const b = this.table.bounds;
        const pocketRadius = Constants.POCKET_RADIUS;
        const ballRadius = Constants.BALL_RADIUS;
        const gap = pocketRadius + ballRadius * 0.5; // Gap at pockets

        // Convert to meters
        const toM = (px) => px / SCALE;

        // Top rail: two segments with gap at center (side pocket)
        this.createRailSegment(b.left + gap, b.top, this.table.center.x - gap, b.top, 'top');
        this.createRailSegment(this.table.center.x + gap, b.top, b.right - gap, b.top, 'top');

        // Bottom rail: two segments with gap at center
        this.createRailSegment(b.left + gap, b.bottom, this.table.center.x - gap, b.bottom, 'bottom');
        this.createRailSegment(this.table.center.x + gap, b.bottom, b.right - gap, b.bottom, 'bottom');

        // Left rail: one segment with gaps at corners
        this.createRailSegment(b.left, b.top + gap, b.left, b.bottom - gap, 'left');

        // Right rail: one segment with gaps at corners
        this.createRailSegment(b.right, b.top + gap, b.right, b.bottom - gap, 'right');

        // Add angled pocket entry segments to close gaps
        this.createPocketEntrySegments();
    }

    createPocketEntrySegments() {
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
        // Left side of top center pocket - angle goes up and right
        this.createRailSegment(
            this.table.center.x - gap, b.top,
            this.table.center.x - gap + Math.cos(sideRad) * segmentLength, b.top - Math.sin(sideRad) * segmentLength,
            'pocket'
        );
        // Right side of top center pocket - angle goes up and left
        this.createRailSegment(
            this.table.center.x + gap, b.top,
            this.table.center.x + gap - Math.cos(sideRad) * segmentLength, b.top - Math.sin(sideRad) * segmentLength,
            'pocket'
        );

        // Side pocket entry segments (bottom)
        // Left side of bottom center pocket - angle goes down and right
        this.createRailSegment(
            this.table.center.x - gap, b.bottom,
            this.table.center.x - gap + Math.cos(sideRad) * segmentLength, b.bottom + Math.sin(sideRad) * segmentLength,
            'pocket'
        );
        // Right side of bottom center pocket - angle goes down and left
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
            friction: 0.1,
            restitution: Constants.RAIL_RESTITUTION
        });

        body.setUserData({ type: 'rail', railType: railType });
    }

    setupContactListener() {
        this.world.on('begin-contact', (contact) => {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const bodyA = fixtureA.getBody();
            const bodyB = fixtureB.getBody();
            const dataA = bodyA.getUserData();
            const dataB = bodyB.getUserData();

            if (!dataA || !dataB) return;

            // --- BALL ON BALL ---
            if (dataA.type === 'ball' && dataB.type === 'ball') {
                const ballA = dataA.ball;
                const ballB = dataB.ball;
                
                const velA = bodyA.getLinearVelocity();
                const velB = bodyB.getLinearVelocity();
                const relVelX = velA.x - velB.x;
                const relVelY = velA.y - velB.y;
                const speed = Math.sqrt(relVelX * relVelX + relVelY * relVelY);

                this.collisionEvents.push({
                    type: 'ball',
                    ballA: ballA,
                    ballB: ballB,
                    speed: speed
                });

                // Spin Effects (Cue Ball Only)
                // We leave this exactly as you had it, since it was working for you
                if (ballA.number === 0 || ballB.number === 0) {
                    const cueBody = ballA.number === 0 ? bodyA : bodyB;
                    const cueBall = ballA.number === 0 ? ballA : ballB;
                    
                    const vel = cueBody.getLinearVelocity();
                    const curSpeed = vel.length();

                    if (curSpeed > 0.5) {
                        const dir = planck.Vec2(vel.x / curSpeed, vel.y / curSpeed);
                        const angularVel = cueBody.getAngularVelocity();

                        this.pendingSpinEffects.push({
                            type: 'ball',
                            ball: cueBall,
                            body: cueBody,
                            impactDir: dir,
                            spinY: angularVel
                        });
                    }
                }
            }

            // --- BALL ON RAIL ---
            if ((dataA.type === 'ball' && dataB.type === 'rail') ||
                (dataA.type === 'rail' && dataB.type === 'ball')) {
                
                const ballData = dataA.type === 'ball' ? dataA : dataB;
                const railData = dataA.type === 'rail' ? dataA : dataB;
                const body = dataA.type === 'ball' ? bodyA : bodyB;

                const vel = body.getLinearVelocity();
                const speed = vel.length();

                this.collisionEvents.push({
                    type: 'rail',
                    ball: ballData.ball,
                    railType: railData.railType,
                    speed: speed
                });

                // Apply English (Cue Ball Only)
                if (ballData.ball.number === 0) {
                    // 1. Calculate the Normal (The direction the rail is facing)
                    const worldManifold = contact.getWorldManifold();
                    let normal = worldManifold.normal;
                    
                    // Ensure normal points Rail -> Ball (Into the table)
                    if (dataA.type === 'ball') normal = planck.Vec2(-normal.x, -normal.y);

                    this.pendingSpinEffects.push({
                        type: 'rail',
                        ball: ballData.ball,
                        body: body,
                        // CHANGE: Pass the normal vector
                        normal: normal,
                        // CHANGE: Explicitly read X-Spin (English) from JS object
                        spinX: ballData.ball.angularVel.x 
                    });
                }
            }
        });
    }

    // Apply queued spin effects after physics step
    applyPendingSpinEffects() {
        for (const effect of this.pendingSpinEffects) {
            // Prevent double application
            const key = `${effect.type}-${effect.ball.number}`;
            if (this.processedCollisions.has(key)) continue;
            this.processedCollisions.add(key);

            if (effect.type === 'ball') {
                this.applyDrawFollow(effect.body, effect.impactDir, effect.spinY);
            } else if (effect.type === 'rail') {
                // CHANGE: Pass 'normal' and 'spinX'
                this.applyEnglish(effect.body, effect.normal, effect.spinX);
            }
        }
        this.pendingSpinEffects = [];
    }

    applyDrawFollow(body, impactDir, spinRadPerSec) {
        if (SPIN_EFFECT_SCALE === 0) return;

        // 1. SCALING: Get the mass. This is the most important fix.
        // Box2D balls are ~0.03kg. Applying force without mass scaling = explosion.
        const mass = body.getMass(); 
        
        // 2. CLAMPING: Cap the spin to avoiding glitchy super-forces
        // 150 rad/s is extremely high spin. Anything more is likely a bug.
        const cleanSpin = Math.max(-150, Math.min(150, spinRadPerSec));

        // 3. COEFFICIENT: How much force per unit of spin?
        // spin (rad/s) * coeff = Acceleration (m/s^2)
        // We want Backspin (-100) to cause maybe -1.5 m/s change in velocity.
        // 100 * 0.015 = 1.5. 
        const drawPower = 0.01 * SPIN_EFFECT_SCALE;

        // Calculate Impulse (Mass * DeltaV)
        const impulseMag = cleanSpin * drawPower * mass;

        // Apply along the impact vector
        // Positive spin (Topspin) pushes forward (+impactDir)
        // Negative spin (Backspin) pushes backward (-impactDir)
        const impulse = planck.Vec2(
            impactDir.x * impulseMag,
            impactDir.y * impulseMag
        );

        // Apply to center of mass
        body.applyLinearImpulse(impulse, body.getWorldCenter(), true);

        // Dampen spin significantly after impact
        body.setAngularVelocity(body.getAngularVelocity() * 0.5);
    }

    applyEnglish(body, normal, spinX) {
        if (SPIN_EFFECT_SCALE === 0) return;

        const mass = body.getMass();
        const cleanSpin = Math.max(-100, Math.min(100, spinX));
        
        // CHANGE: Vector Math
        // Tangent Vector: Rotates Normal 90 degrees
        // If Normal is (0, 1) [Top Rail], Tangent becomes (1, 0) [Right]
        const tangent = planck.Vec2(normal.y, -normal.x);

        // Power coefficient
        const englishPower = 0.01 * SPIN_EFFECT_SCALE;
        const impulseMag = cleanSpin * englishPower * mass;

        const impulse = planck.Vec2(
            tangent.x * impulseMag,
            tangent.y * impulseMag
        );

        body.applyLinearImpulse(impulse, body.getWorldCenter(), true);
        
        // Dampen the English (X) on the Ball object
        // (Since Box2D doesn't know about X-spin, we dampen it manually here)
        const ball = this.bodyToBall.get(body);
        if (ball) {
            ball.angularVel.x *= 0.6; 
        }
    }

    createBallBody(ball) {
        const pos = planck.Vec2(
            ball.position.x / SCALE,
            ball.position.y / SCALE
        );

        const body = this.world.createBody({
            type: 'dynamic',
            position: pos,
            bullet: true,
            linearDamping: 1.1,  // Slight increase (Cloth drag)
            angularDamping: 2.5  // Slight increase (Spin decay)
        });

        // Set initial velocity (convert from pixels/frame to pixels/second)
        body.setLinearVelocity(planck.Vec2(
            ball.velocity.x * VELOCITY_SCALE / SCALE,
            ball.velocity.y * VELOCITY_SCALE / SCALE
        ));

        body.createFixture({
            shape: planck.Circle(ball.radius / SCALE),
            density: 1.0,
            friction: 0.05, // Ball-ball friction for spin transfer
            restitution: Constants.RESTITUTION
        });

        body.setUserData({ type: 'ball', ball: ball });

        // Set initial angular velocity (for spin effects)
        // Convert from game units to Planck angular velocity
        body.setAngularVelocity(ball.angularVel.y * VELOCITY_SCALE);

        this.ballToBody.set(ball, body);
        this.bodyToBall.set(body, ball);

        return body;
    }

    syncBallsToPlanck(balls) {
        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            let body = this.ballToBody.get(ball);
            if (!body) {
                // New ball - create body and sync initial state
                body = this.createBallBody(ball);
                continue;
            }

            // Only sync if ball velocity was changed externally (e.g., shot taken)
            // Check if ball.velocity differs significantly from what Planck has
            const planckVel = body.getLinearVelocity();
            const expectedVelX = planckVel.x / VELOCITY_SCALE;
            const expectedVelY = planckVel.y / VELOCITY_SCALE;

            const velDiffX = Math.abs(ball.velocity.x - expectedVelX);
            const velDiffY = Math.abs(ball.velocity.y - expectedVelY);

            // If there's a significant difference, the game set a new velocity (shot taken)
            if (velDiffX > 0.1 || velDiffY > 0.1) {
                body.setPosition(planck.Vec2(
                    ball.position.x / SCALE,
                    ball.position.y / SCALE
                ));
                body.setLinearVelocity(planck.Vec2(
                    ball.velocity.x * VELOCITY_SCALE / SCALE,
                    ball.velocity.y * VELOCITY_SCALE / SCALE
                ));
                // Set angular velocity from ball's spin
                body.setAngularVelocity(ball.angularVel.y * VELOCITY_SCALE);
                body.setAwake(true);
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

            // --- THE FIX FOR ZOMBIE SPIN ---
            if (!body.isAwake()) {
                // If Box2D says it's asleep, FORCE visual spin to zero
                ball.angularVel.x = 0;
                ball.angularVel.y = 0;
            } else {
                // Otherwise sync normally
                ball.angularVel.y = body.getAngularVelocity() / VELOCITY_SCALE;
                //ball.angularVel.x *= 0.98;
            }
        }
    }

    update(balls, deltaTime = 16.67) {
        this.collisionEvents = [];
        this.processedCollisions.clear(); // Reset spin collision tracking each frame
        this.pendingSpinEffects = []; // Clear pending effects

        // Remove pocketed balls from physics world
        for (const ball of balls) {
            if ((ball.pocketed || ball.sinking) && this.ballToBody.has(ball)) {
                const body = this.ballToBody.get(ball);
                this.world.destroyBody(body);
                this.ballToBody.delete(ball);
                this.bodyToBall.delete(body);
            }
        }

        // Ensure all active balls have bodies and are synced
        this.syncBallsToPlanck(balls);

        // Fixed timestep physics with accumulator for frame-rate independence
        // Physics runs at 60Hz base rate, scaled by speedMultiplier
        const fixedDt = (1.0 / 60.0) * this.speedMultiplier;
        const substepsPerFrame = 8;
        const substepDt = fixedDt / substepsPerFrame;

        // Add frame time to accumulator (cap at 50ms to prevent spiral of death)
        this.accumulator += Math.min(deltaTime, 50) / 1000;

        // Run physics frames until we've caught up, max 3 to prevent freezing
        let framesRun = 0;
        while (this.accumulator >= fixedDt && framesRun < 3) {
            for (let step = 0; step < substepsPerFrame; step++) {
                // Step Planck world - handles all physics including friction
                this.world.step(substepDt, 6, 2);

                // Check pockets (not a Planck collision)
                this.handlePockets(balls);
            }
            this.accumulator -= fixedDt;
            framesRun++;
        }

        // Apply spin effects AFTER physics has resolved collisions
        this.applyPendingSpinEffects();

        // Sync final state back to Ball objects
        this.syncPlanckToBalls(balls);

        // Stop very slow balls
        this.stopSlowBalls(balls);

        // Update sinking animations
        for (const ball of balls) {
            if (ball.sinking) {
                ball.update();
            }
        }

        return this.collisionEvents;
    }

    handlePockets(balls) {
        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            // Get current position from Planck body
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
                    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

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
        // Lower threshold to let balls roll naturally to the very end
        const stopThreshold = 0.05; 
        const stopThresholdSq = stopThreshold * stopThreshold;
        const brakeThresholdSq = 0.5 * 0.5;

        // CRITICAL: Lower this. 2.0 rad/s is visible. 0.1 is virtually stopped.
        const spinSleepThreshold = 0.1; 

        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            // If already asleep, skip math to save performance
            if (!body.isAwake()) continue;

            const vel = body.getLinearVelocity();
            const speedSq = vel.x * vel.x + vel.y * vel.y;
            let angVel = body.getAngularVelocity();

            // 1. Linear Motion Check
            if (speedSq < stopThresholdSq) {
                // Force linear stop
                body.setLinearVelocity(planck.Vec2(0, 0));

                // Aggressive spin braking (friction with cloth)
                angVel *= 0.3;
                body.setAngularVelocity(angVel);

                // 2. Sleep Check
                // Only sleep if BOTH linear is stopped AND spin is tiny
                if (Math.abs(angVel) < spinSleepThreshold) {
                    // Force absolute zero before sleeping to prevent zombie animation
                    body.setAngularVelocity(0); 
                    body.setAwake(false);
                }
            }
        }
    }

    areBallsMoving(balls) {
        const minSpeedSq = 0.01 * 0.01; // Extremely sensitive check
        const minAngularSpeed = 0.1;    // Match the sleep threshold

        for (const ball of balls) {
            if (ball.pocketed) continue;
            if (ball.sinking) return true;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            // If Box2D thinks it's awake, we double check values
            if (body.isAwake()) {
                const vel = body.getLinearVelocity();
                const speedSq = vel.x * vel.x + vel.y * vel.y;
                
                // If it's moving linearly, it's definitely moving
                if (speedSq > minSpeedSq) return true;

                // If it's spinning, it's definitely moving
                if (Math.abs(body.getAngularVelocity()) > minAngularSpeed) return true;
                
                // If it's awake but values are tiny (waiting for stopSlowBalls to catch it),
                // we can consider it "stopped" for the sake of the turn timer,
                // BUT usually it's safer to wait for stopSlowBalls to sleep it.
                // Returning true here is safer to prevent cutting animation short.
                return true; 
            }
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
        this.processedCollisions.clear();
        this.pendingSpinEffects = [];
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
