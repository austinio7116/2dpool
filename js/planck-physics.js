// Physics engine using Planck.js (Box2D port)
// Planck handles all physics: collisions, friction, and angular velocity

import planck from 'planck';
import { Vec2, Constants } from './utils.js';

// Use 1:1 scale for positions (pixels = Planck units)
const SCALE = 1;
// Velocity conversion: game uses pixels/frame, Planck uses units/second
// At 60fps, multiply by 60 to convert pixels/frame to pixels/second
const VELOCITY_SCALE = 60;

export class PlanckPhysics {
    constructor(table) {
        this.table = table;
        this.collisionEvents = [];
        this.speedMultiplier = 0.5; // Adjustable simulation speed (default 0.5)

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
            friction: 0.1, // Rail friction affects spin on cushion contact
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
            }

            // Ball-Rail collision
            if ((dataA.type === 'ball' && dataB.type === 'rail') ||
                (dataA.type === 'rail' && dataB.type === 'ball')) {
                const ballData = dataA.type === 'ball' ? dataA : dataB;
                const body = dataA.type === 'ball' ? bodyA : bodyB;

                const vel = body.getLinearVelocity();
                const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

                this.collisionEvents.push({
                    type: 'rail',
                    ball: ballData.ball,
                    speed: speed
                });
            }
        });
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
            linearDamping: 0.8, // Rolling friction - slows balls over distance
            angularDamping: 0.3 // Spin decay
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

    update(balls) {
        this.collisionEvents = [];

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

        // Use substeps for collision detection accuracy
        const substeps = 8;
        const planckDt = (1.0 / 60.0 / substeps) * this.speedMultiplier;

        for (let step = 0; step < substeps; step++) {
            // Step Planck world - handles all physics including friction
            this.world.step(planckDt, 6, 2);

            // Check pockets (not a Planck collision)
            this.handlePockets(balls);
        }

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
                    ball.position.x = px;
                    ball.position.y = py;
                    ball.startSinking(pocket);

                    this.collisionEvents.push({
                        type: 'pocket',
                        ball: ball,
                        pocket: pocket
                    });
                    break;
                }
            }
        }
    }

    stopSlowBalls(balls) {
        // Use a generous threshold - 5 pixels/second
        const minSpeed = 5;
        const minSpeedSq = minSpeed * minSpeed;

        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            const vel = body.getLinearVelocity();
            const speedSq = vel.x * vel.x + vel.y * vel.y;

            if (speedSq < minSpeedSq) {
                body.setLinearVelocity(planck.Vec2(0, 0));
                body.setAngularVelocity(0);
                body.setAwake(false); // Put body to sleep
            }
        }
    }

    areBallsMoving(balls) {
        // Use same threshold as stopSlowBalls
        const minSpeed = 5;
        const minSpeedSq = minSpeed * minSpeed;

        for (const ball of balls) {
            if (ball.pocketed) continue;
            if (ball.sinking) return true;

            const body = this.ballToBody.get(ball);
            if (!body) continue;

            // Check if body is awake and moving
            if (body.isAwake()) {
                const vel = body.getLinearVelocity();
                const speedSq = vel.x * vel.x + vel.y * vel.y;
                if (speedSq > minSpeedSq) {
                    return true;
                }
                // Also check angular velocity
                const angVel = Math.abs(body.getAngularVelocity());
                if (angVel > 0.5) {
                    return true;
                }
            }
        }
        return false;
    }

    setSpeedMultiplier(multiplier) {
        this.speedMultiplier = Math.max(0.1, Math.min(3.0, multiplier));
    }

    predictTrajectory(cueBall, direction, power, balls, maxSteps = 200) {
        // Simplified prediction (same as original - just visual guide)
        const simBalls = balls.map(b => ({
            position: { x: b.position.x, y: b.position.y },
            velocity: { x: b.velocity.x, y: b.velocity.y },
            radius: b.radius,
            number: b.number,
            pocketed: b.pocketed
        }));

        const simCue = simBalls.find(b => b.number === 0);
        simCue.velocity.x = direction.x * power;
        simCue.velocity.y = direction.y * power;

        const trajectory = {
            cuePath: [{ x: simCue.position.x, y: simCue.position.y }],
            firstHit: null,
            targetPath: []
        };

        const b = this.table.bounds;

        for (let step = 0; step < maxSteps; step++) {
            simCue.position.x += simCue.velocity.x * 0.3;
            simCue.position.y += simCue.velocity.y * 0.3;

            trajectory.cuePath.push({ x: simCue.position.x, y: simCue.position.y });

            // Check collision with other balls
            if (!trajectory.firstHit) {
                for (const ball of simBalls) {
                    if (ball.number === 0 || ball.pocketed) continue;

                    const dx = ball.position.x - simCue.position.x;
                    const dy = ball.position.y - simCue.position.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = simCue.radius + ball.radius;

                    if (distSq < minDist * minDist) {
                        const dist = Math.sqrt(distSq);
                        const nx = dx / dist;
                        const ny = dy / dist;

                        trajectory.firstHit = {
                            position: { x: simCue.position.x, y: simCue.position.y },
                            targetBallNumber: ball.number
                        };

                        // Predict target ball path
                        const speed = Math.sqrt(simCue.velocity.x * simCue.velocity.x + simCue.velocity.y * simCue.velocity.y);
                        let tx = ball.position.x;
                        let ty = ball.position.y;
                        let tvx = nx * speed * 0.7;
                        let tvy = ny * speed * 0.7;

                        for (let t = 0; t < 50; t++) {
                            tx += tvx;
                            ty += tvy;
                            tvx *= 0.97;
                            tvy *= 0.97;
                            trajectory.targetPath.push({ x: tx, y: ty });
                            if (tvx * tvx + tvy * tvy < 0.5) break;
                        }
                        break;
                    }
                }
            }

            // Rail bounces
            const r = simCue.radius;
            if (simCue.position.x - r < b.left || simCue.position.x + r > b.right) {
                simCue.velocity.x = -simCue.velocity.x * 0.8;
                simCue.position.x = Math.max(b.left + r, Math.min(b.right - r, simCue.position.x));
            }
            if (simCue.position.y - r < b.top || simCue.position.y + r > b.bottom) {
                simCue.velocity.y = -simCue.velocity.y * 0.8;
                simCue.position.y = Math.max(b.top + r, Math.min(b.bottom - r, simCue.position.y));
            }

            // Friction
            simCue.velocity.x *= 0.995;
            simCue.velocity.y *= 0.995;

            // Stop conditions
            const speedSq = simCue.velocity.x * simCue.velocity.x + simCue.velocity.y * simCue.velocity.y;
            if (speedSq < 0.1) break;
            if (trajectory.firstHit && step > 20) break;
        }

        return trajectory;
    }
}
