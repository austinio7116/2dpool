// Physics engine for pool ball dynamics with realistic spin simulation
// Uses proper friction physics - no special cases, just real physics

import { Vec2, Constants } from './utils.js';

export class Physics {
    constructor(table) {
        this.table = table;
        this.collisionEvents = [];
    }

    update(balls, initialSpin = null) {
        this.collisionEvents = [];

        // Use multiple substeps for stability
        const substeps = 8;
        const dt = 1.0 / substeps;

        for (let step = 0; step < substeps; step++) {
            // Apply friction physics to all balls
            for (const ball of balls) {
                if (!ball.pocketed && !ball.sinking) {
                    this.applyFriction(ball, dt);
                }
            }

            // Move all balls
            for (const ball of balls) {
                if (!ball.pocketed && !ball.sinking) {
                    ball.position.x += ball.velocity.x * dt;
                    ball.position.y += ball.velocity.y * dt;
                }
            }

            // Check pockets first
            this.handlePockets(balls);

            // Resolve all ball-ball collisions
            this.resolveBallCollisions(balls);

            // Resolve rail collisions
            this.handleRailCollisions(balls);
        }

        // Stop very slow balls
        for (const ball of balls) {
            if (!ball.pocketed && !ball.sinking) {
                const speedSq = ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y;
                const angSpeedSq = ball.angularVel.x * ball.angularVel.x + ball.angularVel.y * ball.angularVel.y;

                // Only stop if both velocity AND spin are negligible
                if (speedSq < Constants.MIN_VELOCITY * Constants.MIN_VELOCITY &&
                    angSpeedSq < Constants.MIN_ANGULAR_VEL * Constants.MIN_ANGULAR_VEL) {
                    ball.velocity.x = 0;
                    ball.velocity.y = 0;
                    ball.angularVel.x = 0;
                    ball.angularVel.y = 0;
                }
            }

            // Update sinking animation
            if (ball.sinking) {
                ball.update();
            }
        }

        return this.collisionEvents;
    }

    /**
     * Apply friction physics to a ball.
     *
     * Physics model:
     * - Slip velocity = ball surface velocity at contact - ground velocity
     * - For forward/back spin: slip_forward = v - ω_y * r
     * - For sidespin: slip_side = ω_x * r
     *
     * When sliding (slip ≠ 0):
     * - Friction force F = μ * m * g (constant magnitude)
     * - Direction: opposes the slip velocity
     * - Linear acceleration: a = F/m = μg
     * - Angular acceleration: α = τ/I = (F*r) / (2/5*m*r²) = 5μg/(2r)
     *
     * When rolling (slip ≈ 0):
     * - Much smaller rolling friction applies
     * - ω = v/r maintained
     */
    applyFriction(ball, dt) {
        const speed = Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);

        // Physics constants
        // In pool, sliding friction primarily converts spin toward natural roll
        // It doesn't dramatically slow the ball - that's rolling friction's job
        const MU_SLIDE = 0.025;    // Low sliding friction - ball skids on cloth
        const MU_ROLL = 0.012;     // Rolling friction - slows the ball once rolling
        const GRAVITY = 9.8;       // Gravity (normalized for game scale)
        const SLIDE_THRESHOLD = 0.3; // Below this slip speed, consider it rolling

        // Get ball direction - use last known direction when nearly stopped
        // This prevents direction from flipping unstably when velocity crosses zero
        let dirX, dirY;
        if (speed > 0.1) {
            dirX = ball.velocity.x / speed;
            dirY = ball.velocity.y / speed;
        } else if (ball.lastDirX !== undefined) {
            // Use remembered direction when ball is slow
            dirX = ball.lastDirX;
            dirY = ball.lastDirY;
        } else {
            dirX = 0;
            dirY = 0;
        }

        // Calculate slip velocity in the direction of travel
        // slip = v - ω*r where positive ω means surface moving forward
        // For backspin: ω < 0, so slip = v - (-|ω|)*r = v + |ω|*r > v
        // Wait, let me reconsider the sign convention...
        //
        // angularVel.y > 0 = topspin (surface at contact moving in direction of travel)
        // angularVel.y < 0 = backspin (surface at contact moving opposite to travel)
        //
        // Surface velocity at contact = ω * r (in direction of travel)
        // Ball velocity = v (in direction of travel)
        // Slip = v - surface_velocity = v - ω*r
        //
        // For natural roll: ω = v/r, slip = v - v = 0
        // For backspin: ω < v/r, slip = v - ω*r > 0 (surface moving backward relative to ground)
        // For topspin: ω > v/r, slip = v - ω*r < 0 (surface moving forward relative to ground)

        const slipForward = speed - ball.angularVel.y * ball.radius;
        const slipSide = ball.angularVel.x * ball.radius; // Sidespin creates perpendicular slip

        const totalSlip = Math.sqrt(slipForward * slipForward + slipSide * slipSide);

        if (totalSlip > SLIDE_THRESHOLD) {
            // Ball is sliding - apply sliding friction
            ball.isSliding = true;

            const frictionAccel = MU_SLIDE * GRAVITY * dt;
            const slipMag = totalSlip;
            const slipDirForward = slipForward / slipMag;
            const slipDirSide = slipSide / slipMag;

            // Simple physics: friction opposes slip
            // Affects both velocity and spin, bringing them toward natural roll

            if (speed > 0.1) {
                // Ball moving - friction acts opposite to slip direction
                const frictionForward = -slipDirForward * frictionAccel;
                ball.velocity.x += dirX * frictionForward;
                ball.velocity.y += dirY * frictionForward;
            } else if (ball.lastDirX !== undefined) {
                // Ball nearly stopped but has spin - friction accelerates ball
                // This creates draw (backspin) and follow (topspin) effects
                const frictionDir = slipForward > 0 ? -1 : 1;
                ball.velocity.x += ball.lastDirX * frictionDir * frictionAccel;
                ball.velocity.y += ball.lastDirY * frictionDir * frictionAccel;
            }

            // Sidespin causes curve
            if (Math.abs(slipSide) > SLIDE_THRESHOLD && speed > 0.1) {
                const perpX = -dirY;
                const perpY = dirX;
                ball.velocity.x += perpX * (-slipDirSide * frictionAccel * 0.5);
                ball.velocity.y += perpY * (-slipDirSide * frictionAccel * 0.5);
            }

            // Angular friction brings spin toward natural roll
            const angularAccel = (5 / 2) * frictionAccel / ball.radius;
            ball.angularVel.y += slipDirForward * angularAccel;
            ball.angularVel.x -= slipDirSide * angularAccel;

            // Store direction
            if (speed > 0.1) {
                ball.lastDirX = dirX;
                ball.lastDirY = dirY;
            }

        } else {
            // Ball is rolling naturally
            ball.isSliding = false;

            // Maintain natural roll relationship
            if (speed > 0.01) {
                ball.angularVel.y = speed / ball.radius;
            }

            // Apply rolling friction (much smaller than sliding)
            const rollingDecel = MU_ROLL * GRAVITY * dt;
            if (speed > rollingDecel) {
                const factor = (speed - rollingDecel) / speed;
                ball.velocity.x *= factor;
                ball.velocity.y *= factor;
                ball.angularVel.y *= factor;
            }

            // Sidespin still decays even when rolling
            ball.angularVel.x *= (1 - MU_ROLL * dt);

            // Clear last direction when ball is rolling slowly
            if (speed < Constants.MIN_VELOCITY * 2) {
                ball.lastDirX = undefined;
                ball.lastDirY = undefined;
            }
        }
    }

    resolveBallCollisions(balls) {
        const activeBalls = balls.filter(b => !b.pocketed && !b.sinking);
        const n = activeBalls.length;

        // Check all pairs
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                this.collideBalls(activeBalls[i], activeBalls[j]);
            }
        }
    }

    collideBalls(a, b) {
        // Vector from a to b
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius;
        const minDistSq = minDist * minDist;

        // No collision if not overlapping
        if (distSq >= minDistSq) {
            return;
        }

        // Avoid division by zero
        if (distSq < 0.0001) {
            b.position.x += 1;
            return;
        }

        const dist = Math.sqrt(distSq);

        // Normal vector from a to b
        const nx = dx / dist;
        const ny = dy / dist;

        // Tangent vector (perpendicular to normal)
        const tx = -ny;
        const ty = nx;

        // Penetration depth
        const overlap = minDist - dist;

        // Separate the balls
        const separationFactor = 0.5;
        a.position.x -= nx * overlap * separationFactor;
        a.position.y -= ny * overlap * separationFactor;
        b.position.x += nx * overlap * separationFactor;
        b.position.y += ny * overlap * separationFactor;

        // Relative velocity of a with respect to b
        const relVelX = a.velocity.x - b.velocity.x;
        const relVelY = a.velocity.y - b.velocity.y;

        // Relative velocity along collision normal (positive = approaching)
        const relVelNormal = relVelX * nx + relVelY * ny;

        // Only apply impulse if balls are approaching
        if (relVelNormal <= 0) {
            return;
        }

        // Coefficient of restitution
        const e = Constants.RESTITUTION;

        // Impulse magnitude (assuming equal mass = 1)
        const j = (1 + e) * relVelNormal / 2;

        // Apply impulse (a gets pushed back, b gets pushed forward along normal)
        a.velocity.x -= j * nx;
        a.velocity.y -= j * ny;
        b.velocity.x += j * nx;
        b.velocity.y += j * ny;

        // Ball-ball collisions don't directly transfer spin in idealized physics
        // The cue ball keeps its spin, object balls start with natural roll

        // Set object balls to natural roll
        if (!a.isCueBall) {
            const speedA = Math.sqrt(a.velocity.x * a.velocity.x + a.velocity.y * a.velocity.y);
            if (speedA > Constants.MIN_VELOCITY) {
                a.angularVel.y = speedA / a.radius;
                a.angularVel.x = 0;
            }
        }
        if (!b.isCueBall) {
            const speedB = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.y * b.velocity.y);
            if (speedB > Constants.MIN_VELOCITY) {
                b.angularVel.y = speedB / b.radius;
                b.angularVel.x = 0;
            }
        }

        // For cue ball: spin is preserved, physics will handle the rest naturally
        // If cue ball has backspin and slows down, friction will reverse it (draw shot)
        // No special cases needed - just let the friction physics work

        // Sidespin (english) causes "throw" on the object ball
        const cueBall = a.isCueBall ? a : (b.isCueBall ? b : null);
        const objectBall = a.isCueBall ? b : (b.isCueBall ? a : null);

        if (cueBall && objectBall && Math.abs(cueBall.angularVel.x) > 0.1) {
            // Sidespin throws the object ball slightly off-line
            const throwFactor = 0.02 * cueBall.angularVel.x;
            objectBall.velocity.x += tx * throwFactor;
            objectBall.velocity.y += ty * throwFactor;
        }

        // Record collision event for sound
        this.collisionEvents.push({
            type: 'ball',
            ballA: a,
            ballB: b,
            speed: Math.abs(relVelNormal)
        });
    }

    handleRailCollisions(balls) {
        const b = this.table.bounds;

        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            const r = ball.radius;
            const x = ball.position.x;
            const y = ball.position.y;

            // Check if near any pocket - if so, allow ball to go into pocket area
            let nearPocket = false;
            for (const pocket of this.table.pockets) {
                const pdx = x - pocket.position.x;
                const pdy = y - pocket.position.y;
                const pDistSq = pdx * pdx + pdy * pdy;
                const pocketZone = pocket.radius + r;
                if (pDistSq < pocketZone * pocketZone) {
                    nearPocket = true;
                    break;
                }
            }

            if (nearPocket) continue;

            let collided = false;

            // Left rail
            if (x - r < b.left) {
                ball.position.x = b.left + r;
                if (ball.velocity.x < 0) {
                    ball.velocity.x = -ball.velocity.x * Constants.RAIL_RESTITUTION;

                    // Sidespin affects rebound
                    if (Math.abs(ball.angularVel.x) > 0.1) {
                        ball.velocity.y += ball.angularVel.x * 0.1;
                        ball.angularVel.x *= 0.7;
                    }

                    collided = true;
                }
            }
            // Right rail
            else if (x + r > b.right) {
                ball.position.x = b.right - r;
                if (ball.velocity.x > 0) {
                    ball.velocity.x = -ball.velocity.x * Constants.RAIL_RESTITUTION;

                    if (Math.abs(ball.angularVel.x) > 0.1) {
                        ball.velocity.y -= ball.angularVel.x * 0.1;
                        ball.angularVel.x *= 0.7;
                    }

                    collided = true;
                }
            }

            // Top rail
            if (y - r < b.top) {
                ball.position.y = b.top + r;
                if (ball.velocity.y < 0) {
                    ball.velocity.y = -ball.velocity.y * Constants.RAIL_RESTITUTION;

                    if (Math.abs(ball.angularVel.x) > 0.1) {
                        ball.velocity.x -= ball.angularVel.x * 0.1;
                        ball.angularVel.x *= 0.7;
                    }

                    collided = true;
                }
            }
            // Bottom rail
            else if (y + r > b.bottom) {
                ball.position.y = b.bottom - r;
                if (ball.velocity.y > 0) {
                    ball.velocity.y = -ball.velocity.y * Constants.RAIL_RESTITUTION;

                    if (Math.abs(ball.angularVel.x) > 0.1) {
                        ball.velocity.x += ball.angularVel.x * 0.1;
                        ball.angularVel.x *= 0.7;
                    }

                    collided = true;
                }
            }

            if (collided) {
                this.collisionEvents.push({
                    type: 'rail',
                    ball: ball,
                    speed: Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y)
                });
            }
        }
    }

    handlePockets(balls) {
        for (const ball of balls) {
            if (ball.pocketed || ball.sinking) continue;

            for (const pocket of this.table.pockets) {
                const dx = ball.position.x - pocket.position.x;
                const dy = ball.position.y - pocket.position.y;
                const distSq = dx * dx + dy * dy;

                // Ball falls in when its center is within the pocket detection radius
                const fallRadius = pocket.radius - ball.radius * 0.5;

                if (distSq < fallRadius * fallRadius) {
                    ball.startSinking(pocket);
                    ball.angularVel = { x: 0, y: 0 };
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

    areBallsMoving(balls) {
        for (const ball of balls) {
            if (ball.pocketed) continue;
            if (ball.sinking) return true;

            const speedSq = ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y;
            if (speedSq > Constants.MIN_VELOCITY * Constants.MIN_VELOCITY) {
                return true;
            }

            // Also check if ball has significant spin (it might start moving again)
            const angSpeedSq = ball.angularVel.x * ball.angularVel.x + ball.angularVel.y * ball.angularVel.y;
            if (angSpeedSq > Constants.MIN_ANGULAR_VEL * Constants.MIN_ANGULAR_VEL * 4) {
                return true;
            }
        }
        return false;
    }

    predictTrajectory(cueBall, direction, power, balls, maxSteps = 200) {
        // Clone balls for simulation
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
            // Move cue ball
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

                        // Predict where target ball will go
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

            // Rail bounces for prediction
            const r = simCue.radius;
            if (simCue.position.x - r < b.left || simCue.position.x + r > b.right) {
                simCue.velocity.x = -simCue.velocity.x * 0.8;
                simCue.position.x = Math.max(b.left + r, Math.min(b.right - r, simCue.position.x));
            }
            if (simCue.position.y - r < b.top || simCue.position.y + r > b.bottom) {
                simCue.velocity.y = -simCue.velocity.y * 0.8;
                simCue.position.y = Math.max(b.top + r, Math.min(b.bottom - r, simCue.position.y));
            }

            // Apply friction
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
