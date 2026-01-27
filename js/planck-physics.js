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
const SPIN_EFFECT_SCALE = 0;

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

            // Ball-Ball collision
            if (dataA.type === 'ball' && dataB.type === 'ball') {
                const ballA = dataA.ball;
                const ballB = dataB.ball;

                // Calculate collision speed for sound
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

                // Queue spin effect to apply after collision resolves
                if (ballA.number === 0 || ballB.number === 0) {
                    const cueBall = ballA.number === 0 ? ballA : ballB;
                    this.pendingSpinEffects.push({
                        type: 'ball',
                        ball: cueBall,
                        spinY: cueBall.angularVel.y,
                        spinX: cueBall.angularVel.x
                    });
                }
            }

            // Ball-Rail collision
            if ((dataA.type === 'ball' && dataB.type === 'rail') ||
                (dataA.type === 'rail' && dataB.type === 'ball')) {
                const ballData = dataA.type === 'ball' ? dataA : dataB;
                const railData = dataA.type === 'rail' ? dataA : dataB;
                const body = dataA.type === 'ball' ? bodyA : bodyB;

                const vel = body.getLinearVelocity();
                const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

                this.collisionEvents.push({
                    type: 'rail',
                    ball: ballData.ball,
                    speed: speed
                });

                // Queue english effect to apply after collision resolves
                if (Math.abs(ballData.ball.angularVel.x) > 0.5) {
                    this.pendingSpinEffects.push({
                        type: 'rail',
                        ball: ballData.ball,
                        railType: railData.railType,
                        spinX: ballData.ball.angularVel.x
                    });
                }
            }
        });
    }

    // Apply queued spin effects after physics step
    applyPendingSpinEffects() {
        for (const effect of this.pendingSpinEffects) {
            // Check if already processed this frame
            const key = `${effect.type}-${effect.ball.number}`;
            if (this.processedCollisions.has(key)) continue;
            this.processedCollisions.add(key);

            const body = this.ballToBody.get(effect.ball);
            if (!body) continue;

            const vel = body.getLinearVelocity();
            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
            if (speed < 0.5) continue;

            if (effect.type === 'ball') {
                this.applyDrawFollow(effect.ball, body, vel, speed, effect.spinY);
            } else if (effect.type === 'rail') {
                this.applyEnglish(effect.ball, body, vel, effect.railType, effect.spinX);
            }
        }
        this.pendingSpinEffects = [];
    }

    // Apply draw/follow: adjusts cue ball velocity after hitting object ball
    applyDrawFollow(ball, body, vel, speed, spinY) {
        // Skip if spin effects are disabled
        if (SPIN_EFFECT_SCALE === 0) return;

        // spinY is the angular velocity at time of collision
        // Negative = backspin (draw), High positive = topspin (follow)
        // Natural roll is somewhere in between (roughly 5-15 for typical shots)

        // Clamp to reasonable range
        const clampedSpin = Math.max(-50, Math.min(80, spinY));

        // Scale: with natural roll ~10, backspin gives -20 to -40, topspin gives +30 to +60
        // We want backspin to noticeably slow/reverse, topspin to push through
        const normalizedSpin = clampedSpin / 40; // Range roughly -1.25 to 2

        // Apply velocity adjustment (backspin reduces, topspin increases)
        // Clamp factor to avoid extreme values, scaled by SPIN_EFFECT_SCALE
        const rawFactor = 1 + (normalizedSpin * 0.35);
        const factor = Math.max(0.5, Math.min(1.8, 1 + (rawFactor - 1) * SPIN_EFFECT_SCALE));

        body.setLinearVelocity(planck.Vec2(vel.x * factor, vel.y * factor));

        // Consume the spin
        ball.angularVel.y *= 0.3;
        ball.angularVel.x *= 0.5;
    }

    // Apply english: adjusts ball angle off the rail
    applyEnglish(ball, body, vel, railType, spinX) {
        // Skip if spin effects are disabled
        if (SPIN_EFFECT_SCALE === 0) return;

        // Clamp the sidespin
        const clampedSpin = Math.max(-50, Math.min(50, spinX));

        // Scale influence - make it noticeable but not crazy
        const spinInfluence = clampedSpin * 0.008 * SPIN_EFFECT_SCALE;

        let newVelX = vel.x;
        let newVelY = vel.y;

        if (railType === 'left' || railType === 'right') {
            // Side rails: english affects vertical component
            newVelY += spinInfluence * Math.abs(vel.x);
        } else if (railType === 'top' || railType === 'bottom') {
            // Top/bottom rails: english affects horizontal component
            newVelX += spinInfluence * Math.abs(vel.y);
        }

        body.setLinearVelocity(planck.Vec2(newVelX, newVelY));

        // Consume some sidespin
        ball.angularVel.x *= 0.7;
    }

    createBallBody(ball) {
        const pos = planck.Vec2(
            ball.position.x / SCALE,
            ball.position.y / SCALE
        );

        const body = this.world.createBody({
            type: 'dynamic',
            position: pos,
            bullet: true, // CCD for fast balls
            linearDamping: 1.1, // Rolling friction - slows balls over distance
            angularDamping: 2.5 // Spin decay
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
            // Convert velocity from pixels/second back to pixels/frame
            ball.velocity.x = vel.x * SCALE / VELOCITY_SCALE;
            ball.velocity.y = vel.y * SCALE / VELOCITY_SCALE;

            // Sync angular velocity from Planck (2D rotation)
            const angVel = body.getAngularVelocity();
            ball.angularVel.y = angVel; // Use for visual rotation
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
        // Stop balls that are barely moving
        const minSpeed = 1.0; // Planck units/second
        const minSpeedSq = minSpeed * minSpeed;
        const minAngularSpeed = 80.0; // radians/second

        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            const vel = body.getLinearVelocity();
            const speedSq = vel.x * vel.x + vel.y * vel.y;
            const angVel = Math.abs(body.getAngularVelocity());

            // Stop linear velocity if below threshold
            if (speedSq < minSpeedSq) {
                body.setLinearVelocity(planck.Vec2(0, 0));
            }

            // Stop angular velocity if below threshold
            if (angVel < minAngularSpeed) {
                body.setAngularVelocity(0);
            }

            // Put to sleep only if both are stopped
            if (speedSq < minSpeedSq && angVel < minAngularSpeed) {
                body.setAwake(false);
            }
        }
    }

    areBallsMoving(balls) {
        // Use same thresholds as stopSlowBalls
        const minSpeed = 1.0; // Planck units/second
        const minSpeedSq = minSpeed * minSpeed;
        const minAngularSpeed = 80.0; // radians/second

        for (const ball of balls) {
            if (ball.pocketed) continue;
            if (ball.sinking) return true;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            // Check if body is awake and has significant motion
            if (body.isAwake()) {
                const vel = body.getLinearVelocity();
                const speedSq = vel.x * vel.x + vel.y * vel.y;
                if (speedSq > minSpeedSq) {
                    return true;
                }

                const angVel = Math.abs(body.getAngularVelocity());
                if (angVel > minAngularSpeed) {
                    return true;
                }
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
