// Cushion bounce calibration system
// Fires test shots into cushions using real Planck physics (via ShotSimulator)
// and builds a lookup table for accurate bounce predictions in traceShotPath.

import { ShotSimulator } from './shot-simulator.js';

export class CushionCalibrator {
    constructor(table, tableNum) {
        this.table = table;
        this.tableNum = tableNum || null;
        this.lookupTable = new Map();
        this.calibrated = false;
    }

    /**
     * Run calibration by firing test shots at the top rail.
     * Other rails are symmetric — we only need one rail's data.
     */
    calibrate() {
        const sim = new ShotSimulator(this.table);
        if (this.tableNum) {
            sim.setTableStyle(this.tableNum);
        }

        // Incoming angles: 10° to 80° in 5° steps (relative to rail normal)
        // 0° = head-on into rail, 90° = parallel to rail
        const angles = [];
        for (let a = 10; a <= 80; a += 5) angles.push(a);

        // Sidespin values to test
        const spins = [-0.8, -0.4, 0, 0.4, 0.8];

        // Table geometry
        const bounds = this.table.bounds;
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;

        // Cue ball properties
        const ballRadius = 12;
        const power = 8;

        for (const angleDeg of angles) {
            for (const spin of spins) {
                const angleRad = angleDeg * Math.PI / 180;

                // Direction toward top rail at the desired incidence angle
                // Rail normal points downward (+y), so incoming direction is upward (-y)
                // incidence angle is measured from the normal
                // At 0° incidence: direction is straight up (0, -1)
                // At 45° incidence: direction is (sin45, -cos45)
                const dirX = Math.sin(angleRad);
                const dirY = -Math.cos(angleRad);
                const direction = { x: dirX, y: dirY };

                // Create a single cue ball at center of table
                const cueBall = {
                    position: { x: centerX, y: centerY },
                    velocity: { x: 0, y: 0 },
                    spin: { x: 0, y: 0 },
                    spinZ: 0,
                    radius: ballRadius,
                    pocketed: false,
                    sinking: false,
                    isCueBall: true,
                    number: 0,
                    isSliding: false
                };

                // Run simulation
                const result = sim.simulate([cueBall], direction, power, { x: spin, y: 0 });

                // Measure outgoing direction from the bounce point
                // The cue ball started at center and hit the top rail, then bounced
                // We need to find where it hit the rail and its direction after
                const endPos = result.cueBallEndPos;

                // Approximate rail hit point: same x trajectory, y = top rail
                const distToRail = centerY - (bounds.top + ballRadius + 2);
                const railHitX = centerX + dirX * (distToRail / -dirY);
                const railHitY = bounds.top + ballRadius + 2;

                // Outgoing direction = endPos - railHitPoint
                const outDx = endPos.x - railHitX;
                const outDy = endPos.y - railHitY;
                const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

                if (outLen < 1) {
                    // Ball didn't move much after bounce (pocketed or stopped at rail)
                    continue;
                }

                // Outgoing angle relative to rail normal (which points down, +y)
                // outgoing direction should have positive y (going away from top rail)
                const outNormX = outDx / outLen;
                const outNormY = outDy / outLen;

                // Angle from normal: acos(dot(outDir, normal))
                // Normal for top rail = (0, 1) (pointing into table)
                const outAngleRad = Math.acos(Math.max(-1, Math.min(1, outNormY)));
                const outAngleDeg = outAngleRad * 180 / Math.PI;

                // Check sign: if outNormX < 0, the ball deflected left
                const signedOutAngle = outNormX < 0 ? -outAngleDeg : outAngleDeg;

                // Speed ratio: approximate from distance traveled
                // incoming speed = power, outgoing speed proportional to distance from rail hit to end
                // This is a rough proxy — energy loss ratio
                const incomingDist = distToRail / Math.cos(angleRad);
                const outgoingDist = outLen;
                const totalTravel = incomingDist + outgoingDist;
                // Ratio of outgoing to incoming speed (estimated from distances and energy)
                const speedRatio = Math.min(1, outgoingDist / (incomingDist * 1.5));

                const key = `${angleDeg}_${spin}`;
                this.lookupTable.set(key, {
                    outAngle: signedOutAngle,
                    speedRatio: Math.max(0.1, Math.min(1.0, speedRatio))
                });
            }
        }

        this.calibrated = true;
    }

    /**
     * Get bounce prediction using bilinear interpolation into the lookup table.
     * @param {number} incomingAngle - Angle relative to rail normal in degrees (0=head-on, 90=grazing)
     * @param {number} sidespin - Sidespin value (-1 to 1)
     * @returns {{ outgoingAngle: number, speedRatio: number }} outgoingAngle is signed (+ = same side as incoming)
     */
    getBouncePrediction(incomingAngle, sidespin) {
        if (!this.calibrated || this.lookupTable.size === 0) {
            return this.fallbackPrediction(incomingAngle, sidespin);
        }

        // Clamp inputs to calibrated range
        const clampedAngle = Math.max(10, Math.min(80, incomingAngle));
        const clampedSpin = Math.max(-0.8, Math.min(0.8, sidespin));

        // Find bracketing angle values (5° steps from 10 to 80)
        const angleLow = Math.floor(clampedAngle / 5) * 5;
        const angleHigh = angleLow + 5;
        const angleFrac = (clampedAngle - angleLow) / 5;

        // Find bracketing spin values [-0.8, -0.4, 0, 0.4, 0.8]
        const spinSteps = [-0.8, -0.4, 0, 0.4, 0.8];
        let spinLowIdx = 0;
        for (let i = 0; i < spinSteps.length - 1; i++) {
            if (clampedSpin >= spinSteps[i] && clampedSpin <= spinSteps[i + 1]) {
                spinLowIdx = i;
                break;
            }
        }
        const spinLow = spinSteps[spinLowIdx];
        const spinHigh = spinSteps[spinLowIdx + 1];
        const spinFrac = (spinHigh - spinLow) !== 0 ? (clampedSpin - spinLow) / (spinHigh - spinLow) : 0;

        // Clamp angle bounds to calibration range
        const aL = Math.max(10, Math.min(80, angleLow));
        const aH = Math.max(10, Math.min(80, angleHigh));

        // Look up 4 corners for bilinear interpolation
        const v00 = this.lookupTable.get(`${aL}_${spinLow}`);
        const v10 = this.lookupTable.get(`${aH}_${spinLow}`);
        const v01 = this.lookupTable.get(`${aL}_${spinHigh}`);
        const v11 = this.lookupTable.get(`${aH}_${spinHigh}`);

        // If any corner is missing, fall back
        if (!v00 || !v10 || !v01 || !v11) {
            return this.fallbackPrediction(incomingAngle, sidespin);
        }

        // Bilinear interpolation
        const outAngle = this.bilerp(v00.outAngle, v10.outAngle, v01.outAngle, v11.outAngle, angleFrac, spinFrac);
        const speedRatio = this.bilerp(v00.speedRatio, v10.speedRatio, v01.speedRatio, v11.speedRatio, angleFrac, spinFrac);

        return {
            outgoingAngle: outAngle,
            speedRatio: Math.max(0.1, Math.min(1.0, speedRatio))
        };
    }

    bilerp(v00, v10, v01, v11, tx, ty) {
        const a = v00 * (1 - tx) + v10 * tx;
        const b = v01 * (1 - tx) + v11 * tx;
        return a * (1 - ty) + b * ty;
    }

    /**
     * Fallback: old fixed-constant model
     */
    fallbackPrediction(incomingAngle, sidespin) {
        // Old model: cushionThrowFactor = 0.75, spin deflection = ±15°
        const inRad = incomingAngle * Math.PI / 180;
        // Throw factor makes ball come off straighter
        const adjustedAngle = Math.atan(Math.tan(inRad) * 0.75);
        const spinDeflection = (sidespin || 0) * 15;
        const outAngle = adjustedAngle * 180 / Math.PI + spinDeflection;

        return {
            outgoingAngle: outAngle,
            speedRatio: 0.7
        };
    }
}
