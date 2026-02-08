// Shot simulator for AI position evaluation
// Wraps a secondary PlanckPhysics instance to run headless physics simulations

import { PlanckPhysics } from './planck-physics.js';

export class ShotSimulator {
    constructor(table) {
        this.table = table;
        this.physics = new PlanckPhysics(table, { simulationMode: true });
        this.simBalls = [];
    }

    setTableStyle(tableNum) {
        this.physics.setTableStyle(tableNum);
    }

    /**
     * Run a physics simulation for a shot and return where the cue ball ends up.
     * @param {Array} gameBalls - The real game balls (used as initial state)
     * @param {Object} direction - Normalized {x, y} aim direction
     * @param {number} power - Shot power (same scale as executeShot)
     * @param {Object} spin - {x, y} spin values (same as input spin)
     * @returns {{ cueBallEndPos: {x,y}, pocketedBalls: number[] }}
     */
    simulate(gameBalls, direction, power, spin) {
        // 1. Clone ball states into lightweight objects
        this.simBalls = [];
        for (const ball of gameBalls) {
            if (ball.pocketed) continue;

            this.simBalls.push({
                position: { x: ball.position.x, y: ball.position.y },
                velocity: { x: 0, y: 0 },
                spin: { x: 0, y: 0 },
                spinZ: 0,
                radius: ball.radius,
                pocketed: false,
                sinking: false,
                isCueBall: ball.isCueBall,
                number: ball.number,
                isSliding: false,
                forceSync: true  // Force physics engine to pick up initial positions
            });
        }

        // 2. Reset physics - destroy old bodies
        this.physics.reset();

        // 3. Create bodies for all cloned balls
        for (const simBall of this.simBalls) {
            this.physics.createBallBody(simBall);
        }

        // 4. Find cue ball and apply shot
        const cueBall = this.simBalls.find(b => b.isCueBall);
        if (!cueBall) return { cueBallEndPos: { x: 0, y: 0 }, pocketedBalls: [] };

        this.applyShot(cueBall, direction, power, spin);

        // 5. Run simulation loop
        const maxFrames = 200;

        for (let frame = 0; frame < maxFrames; frame++) {
            // Clean up pocketed balls (same as physics.update does)
            for (const ball of this.simBalls) {
                if (ball.pocketed && this.physics.ballToBody.has(ball)) {
                    this.physics.world.destroyBody(this.physics.ballToBody.get(ball));
                    this.physics.ballToBody.delete(ball);
                    ball.velocity.x = 0;
                    ball.velocity.y = 0;
                    ball.spinZ = 0;
                    ball.spin.x = 0;
                    ball.spin.y = 0;
                    ball.isSliding = false;
                }
            }

            // Sync positions to physics
            this.physics.syncBallsToPlanck(this.simBalls);

            // Run substeps (matching real physics)
            const baseDt = 1.0 / 60.0;
            const substeps = this.physics.substeps;
            const stepDt = baseDt / substeps;

            for (let s = 0; s < substeps; s++) {
                for (const ball of this.simBalls) {
                    if (ball.pocketed) continue;
                    const body = this.physics.ballToBody.get(ball);
                    if (body) this.physics.applyClothFriction(ball, body, stepDt);
                }
                this.physics.world.step(stepDt, 16, 8);
                this.physics.handlePockets(this.simBalls);
            }

            // Sync back
            this.physics.syncPlanckToBalls(this.simBalls);
            this.physics.stopSlowBalls(this.simBalls);

            // Check if cue ball was pocketed (scratch)
            if (cueBall.pocketed) break;

            // Check if all balls stopped
            if (!this.physics.areBallsMoving(this.simBalls)) break;
        }

        // 6. Collect results
        const pocketedBalls = this.simBalls
            .filter(b => b.pocketed && !b.isCueBall)
            .map(b => b.number);

        return {
            cueBallEndPos: { x: cueBall.position.x, y: cueBall.position.y },
            pocketedBalls,
            cueBallPocketed: cueBall.pocketed
        };
    }

    /**
     * Apply shot physics to cue ball — mirrors main.js executeShot() logic
     */
    applyShot(cueBall, direction, power, spin) {
        // 1. Linear velocity
        cueBall.velocity.x = direction.x * power;
        cueBall.velocity.y = direction.y * power;

        // 2. Natural roll spin rate: omega = V / R
        const speed = Math.sqrt(cueBall.velocity.x ** 2 + cueBall.velocity.y ** 2);
        const R = cueBall.radius;
        const naturalOmega = speed / R;

        // 3. Z-axis English (sidespin)
        cueBall.spinZ = -spin.x * naturalOmega * 2.0 * 60;

        // 4. X/Y axis (follow/draw)
        const perpX = -direction.y;
        const perpY = direction.x;
        const rollingSpinX = perpX * naturalOmega * 60;
        const rollingSpinY = perpY * naturalOmega * 60;
        const spinFactor = spin.y * 5;

        cueBall.spin.x = rollingSpinX * spinFactor;
        cueBall.spin.y = rollingSpinY * spinFactor;

        cueBall.forceSync = true;
        cueBall.isSliding = true;
    }
}
