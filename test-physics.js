// Physics test - clean physics model
// Run with: node test-physics.js

const BALL_RADIUS = 12;

// Physics constants (matching physics.js)
const MU_SLIDE = 0.025;   // Low sliding friction - ball skids on cloth
const MU_ROLL = 0.012;    // Rolling friction - slows ball once rolling
const GRAVITY = 9.8;
const SLIDE_THRESHOLD = 0.3;
const MIN_VELOCITY = 0.05;

function applyFriction(ball, dt) {
    const speed = Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);

    // Use last known direction when ball is slow (prevents unstable direction flipping)
    let dirX = 0, dirY = 0;
    if (speed > 0.1) {
        dirX = ball.velocity.x / speed;
        dirY = ball.velocity.y / speed;
    } else if (ball.lastDirX !== undefined) {
        dirX = ball.lastDirX;
        dirY = ball.lastDirY;
    }

    // Slip = v - ω*r
    const slipForward = speed - ball.angularVel.y * ball.radius;
    const slipSide = ball.angularVel.x * ball.radius;
    const totalSlip = Math.sqrt(slipForward * slipForward + slipSide * slipSide);

    if (totalSlip > SLIDE_THRESHOLD) {
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

        // Angular friction brings spin toward natural roll
        const angularAccel = (5 / 2) * frictionAccel / ball.radius;
        ball.angularVel.y += slipDirForward * angularAccel;
        ball.angularVel.x -= slipDirSide * angularAccel;

        // Store direction when ball is moving (for draw/follow when nearly stopped)
        if (speed > 0.1) {
            ball.lastDirX = ball.velocity.x / speed;
            ball.lastDirY = ball.velocity.y / speed;
        }
    } else {
        ball.isSliding = false;

        if (speed > 0.01) {
            ball.angularVel.y = speed / ball.radius;
        }

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
        if (speed < MIN_VELOCITY * 2) {
            ball.lastDirX = undefined;
            ball.lastDirY = undefined;
        }
    }
}

function createBall(vx, vy, angularY) {
    return {
        position: { x: 400, y: 200 },
        velocity: { x: vx, y: vy },
        angularVel: { x: 0, y: angularY },
        radius: BALL_RADIUS,
        isSliding: false,
        lastDirX: vx > 0 ? 1 : (vx < 0 ? -1 : undefined),
        lastDirY: 0
    };
}

function runSimulation(name, ball, frames = 120) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${name}`);
    console.log(`${'='.repeat(60)}`);

    const naturalRoll = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2) / ball.radius;
    const slip = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2) - ball.angularVel.y * ball.radius;
    console.log(`Initial: vel=${ball.velocity.x.toFixed(2)}, ω=${ball.angularVel.y.toFixed(2)}, naturalRoll=${naturalRoll.toFixed(2)}, slip=${slip.toFixed(2)}`);

    const substeps = 8;
    const dt = 1.0 / substeps;

    let maxBackwardVel = 0;

    for (let frame = 0; frame < frames; frame++) {
        for (let step = 0; step < substeps; step++) {
            applyFriction(ball, dt);
            ball.position.x += ball.velocity.x * dt;
        }

        const speed = Math.abs(ball.velocity.x);
        const currentSlip = speed - ball.angularVel.y * ball.radius;

        if (ball.velocity.x < maxBackwardVel) {
            maxBackwardVel = ball.velocity.x;
        }

        if (frame < 15 || frame % 20 === 0 || (speed < 0.1 && frame < 60)) {
            console.log(`Frame ${frame.toString().padStart(3)}: pos=${ball.position.x.toFixed(1).padStart(7)}, vel=${ball.velocity.x.toFixed(3).padStart(8)}, ω=${ball.angularVel.y.toFixed(3).padStart(7)}, slip=${currentSlip.toFixed(2).padStart(7)}, sliding=${ball.isSliding}`);
        }

        if (speed < 0.01 && Math.abs(ball.angularVel.y) < 0.01) {
            console.log(`Ball stopped at frame ${frame}`);
            break;
        }
    }

    console.log(`Final position: ${ball.position.x.toFixed(1)} (moved ${(ball.position.x - 400).toFixed(1)})`);
    if (maxBackwardVel < -0.1) {
        console.log(`Max backward velocity: ${maxBackwardVel.toFixed(2)} (DRAW ACHIEVED!)`);
    }
    return ball;
}

// Calculate realistic spin for given power and spin setting (matching main.js)
function calculateSpin(power, spinY) {
    const naturalRoll = power / BALL_RADIUS;
    const spinIntensity = naturalRoll * 3;  // Matches main.js spinIntensity = naturalRoll * 3
    return naturalRoll - (spinY * spinIntensity);
}

console.log('#'.repeat(70));
console.log('CLEAN PHYSICS TESTS');
console.log('#'.repeat(70));

// Test 1: No spin - natural roll
const power10 = 10;
console.log(`\nPower ${power10}, natural roll ω = ${(power10/BALL_RADIUS).toFixed(3)}`);
runSimulation('Power 10, NO SPIN (natural roll)', createBall(power10, 0, power10/BALL_RADIUS), 200);

// Test 2: Full backspin
const backspinOmega = calculateSpin(10, 1);
console.log(`\nPower 10, full backspin ω = ${backspinOmega.toFixed(3)}`);
runSimulation('Power 10, FULL BACKSPIN', createBall(10, 0, backspinOmega), 150);

// Test 3: Power 15 full backspin
const backspin15 = calculateSpin(15, 1);
console.log(`\nPower 15, full backspin ω = ${backspin15.toFixed(3)}`);
runSimulation('Power 15, FULL BACKSPIN', createBall(15, 0, backspin15), 150);

// Test 4: Power 20 (max) full backspin
const backspin20 = calculateSpin(20, 1);
console.log(`\nPower 20, full backspin ω = ${backspin20.toFixed(3)}`);
runSimulation('Power 20 (MAX), FULL BACKSPIN', createBall(20, 0, backspin20), 150);

// Test 5: Full topspin
const topspin10 = calculateSpin(10, -1);
console.log(`\nPower 10, full topspin ω = ${topspin10.toFixed(3)}`);
runSimulation('Power 10, FULL TOPSPIN', createBall(10, 0, topspin10), 200);

// Test 6: Post-collision scenario (ball nearly stopped but has backspin)
console.log('\n' + '#'.repeat(70));
console.log('POST-COLLISION TESTS');
console.log('Simulating cue ball after hitting object ball - nearly stopped but has backspin');
console.log('#'.repeat(70));

const postCollision = createBall(1, 0, backspinOmega);  // Slow but still has full backspin
postCollision.lastDirX = 1;
postCollision.lastDirY = 0;
runSimulation('Post-collision: vel=1, backspin preserved', postCollision, 100);

const postCollision2 = createBall(0.1, 0, backspinOmega);  // Nearly stopped
postCollision2.lastDirX = 1;
postCollision2.lastDirY = 0;
runSimulation('Post-collision: vel=0.1, backspin preserved (DRAW SHOT)', postCollision2, 100);

// Test 7: Compare distances traveled with and without spin
console.log('\n' + '#'.repeat(70));
console.log('DISTANCE COMPARISON');
console.log('Does backspin dramatically reduce distance? (It should NOT for fast shots)');
console.log('#'.repeat(70));

const noSpinBall = createBall(15, 0, 15/BALL_RADIUS);
const backspinBall = createBall(15, 0, backspin15);
backspinBall.lastDirX = 1;

console.log('\nSimulating both balls for 60 frames...');
for (let frame = 0; frame < 60; frame++) {
    for (let step = 0; step < 8; step++) {
        applyFriction(noSpinBall, 1/8);
        applyFriction(backspinBall, 1/8);
        noSpinBall.position.x += noSpinBall.velocity.x / 8;
        backspinBall.position.x += backspinBall.velocity.x / 8;
    }
}

console.log(`No spin ball traveled: ${(noSpinBall.position.x - 400).toFixed(1)} pixels`);
console.log(`Backspin ball traveled: ${(backspinBall.position.x - 400).toFixed(1)} pixels`);
console.log(`Difference: ${(noSpinBall.position.x - backspinBall.position.x).toFixed(1)} pixels`);
console.log(`Backspin ball went ${((backspinBall.position.x - 400) / (noSpinBall.position.x - 400) * 100).toFixed(0)}% as far`);
