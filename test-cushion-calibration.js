// Cushion calibration test
// Tests the interpolation and helper functions offline (no Planck needed)
// For full physics calibration, run in browser console or serve via HTTP
//
// Run with: node test-cushion-calibration.js

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
let passed = 0, failed = 0;

function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ${PASS} ${msg}`); }
    else { failed++; console.log(`  ${FAIL} ${msg}`); }
}

function assertClose(actual, expected, tolerance, msg) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ${PASS} ${msg} (got ${actual.toFixed(2)}, expected ${expected.toFixed(2)}, diff ${diff.toFixed(2)})`);
    } else {
        failed++;
        console.log(`  ${FAIL} ${msg} (got ${actual.toFixed(2)}, expected ${expected.toFixed(2)}, diff ${diff.toFixed(2)})`);
    }
}

// ─── Vec2 utilities (copied from js/utils.js) ───
const Vec2 = {
    create(x = 0, y = 0) { return { x, y }; },
    normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        if (len === 0) return { x: 0, y: 0 };
        return { x: v.x / len, y: v.y / len };
    },
    rotate(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
    }
};

// ─── Helper functions (mirrors ai.js) ───

function computeIncidenceAngle(dir, rail) {
    let normalX, normalY;
    if (rail === 'top') { normalX = 0; normalY = 1; }
    else if (rail === 'bottom') { normalX = 0; normalY = -1; }
    else if (rail === 'left') { normalX = 1; normalY = 0; }
    else { normalX = -1; normalY = 0; }

    const dotVal = (-dir.x * normalX) + (-dir.y * normalY);
    const angleDeg = Math.acos(Math.max(0, Math.min(1, dotVal))) * 180 / Math.PI;
    return angleDeg;
}

function computeReflectedDir(outAngleDeg, rail, incomingDir) {
    const outRad = Math.abs(outAngleDeg) * Math.PI / 180;

    let tangentSign;
    if (rail === 'top' || rail === 'bottom') {
        tangentSign = incomingDir.x > 0 ? 1 : -1;
    } else {
        tangentSign = incomingDir.y > 0 ? 1 : -1;
    }

    if (outAngleDeg < 0) tangentSign *= -1;

    const normalComponent = Math.cos(outRad);
    const tangentialComponent = Math.sin(outRad) * tangentSign;

    let rx, ry;
    if (rail === 'top') {
        rx = tangentialComponent;
        ry = normalComponent;
    } else if (rail === 'bottom') {
        rx = tangentialComponent;
        ry = -normalComponent;
    } else if (rail === 'left') {
        rx = normalComponent;
        ry = tangentialComponent;
    } else {
        rx = -normalComponent;
        ry = tangentialComponent;
    }

    const len = Math.sqrt(rx * rx + ry * ry);
    return { x: rx / len, y: ry / len };
}

// ─── Mock CushionCalibrator for interpolation tests ───

class MockCalibrator {
    constructor() {
        this.lookupTable = new Map();
        this.calibrated = false;
    }

    // Populate with synthetic data: outAngle = inAngle * throwFactor + spin * spinEffect
    populateSynthetic(throwFactor = 0.75, spinEffect = 12) {
        const angles = [];
        for (let a = 10; a <= 80; a += 5) angles.push(a);
        const spins = [-0.8, -0.4, 0, 0.4, 0.8];

        for (const angle of angles) {
            for (const spin of spins) {
                const outAngle = angle * throwFactor + spin * spinEffect;
                const speedRatio = 0.7 - Math.abs(spin) * 0.05;
                this.lookupTable.set(`${angle}_${spin}`, { outAngle, speedRatio });
            }
        }
        this.calibrated = true;
    }

    getBouncePrediction(incomingAngle, sidespin) {
        if (!this.calibrated) return this.fallbackPrediction(incomingAngle, sidespin);

        const clampedAngle = Math.max(10, Math.min(80, incomingAngle));
        const clampedSpin = Math.max(-0.8, Math.min(0.8, sidespin));

        const angleLow = Math.floor(clampedAngle / 5) * 5;
        const angleHigh = angleLow + 5;
        const angleFrac = (clampedAngle - angleLow) / 5;

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

        const aL = Math.max(10, Math.min(80, angleLow));
        const aH = Math.max(10, Math.min(80, angleHigh));

        const v00 = this.lookupTable.get(`${aL}_${spinLow}`);
        const v10 = this.lookupTable.get(`${aH}_${spinLow}`);
        const v01 = this.lookupTable.get(`${aL}_${spinHigh}`);
        const v11 = this.lookupTable.get(`${aH}_${spinHigh}`);

        if (!v00 || !v10 || !v01 || !v11) return this.fallbackPrediction(incomingAngle, sidespin);

        const outAngle = this.bilerp(v00.outAngle, v10.outAngle, v01.outAngle, v11.outAngle, angleFrac, spinFrac);
        const speedRatio = this.bilerp(v00.speedRatio, v10.speedRatio, v01.speedRatio, v11.speedRatio, angleFrac, spinFrac);

        return { outgoingAngle: outAngle, speedRatio };
    }

    bilerp(v00, v10, v01, v11, tx, ty) {
        const a = v00 * (1 - tx) + v10 * tx;
        const b = v01 * (1 - tx) + v11 * tx;
        return a * (1 - ty) + b * ty;
    }

    fallbackPrediction(incomingAngle, sidespin) {
        const inRad = incomingAngle * Math.PI / 180;
        const adjustedAngle = Math.atan(Math.tan(inRad) * 0.75);
        const spinDeflection = (sidespin || 0) * 15;
        return { outgoingAngle: adjustedAngle * 180 / Math.PI + spinDeflection, speedRatio: 0.7 };
    }
}

// ═══════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════

console.log('\n═══ Cushion Calibration Tests ═══\n');

// --- Test 1: computeIncidenceAngle ---
console.log('--- computeIncidenceAngle ---');
{
    // Head-on into top rail: direction (0, -1), should give 0°
    assertClose(computeIncidenceAngle({ x: 0, y: -1 }, 'top'), 0, 0.1, 'Head-on into top rail = 0°');

    // 45° into top rail: direction (sin45, -cos45)
    const sin45 = Math.sin(45 * Math.PI / 180);
    const cos45 = Math.cos(45 * Math.PI / 180);
    assertClose(computeIncidenceAngle({ x: sin45, y: -cos45 }, 'top'), 45, 0.1, '45° into top rail');

    // Grazing top rail: direction (1, -0.01) normalized
    const grazing = Vec2.normalize({ x: 1, y: -0.01 });
    const grazingAngle = computeIncidenceAngle(grazing, 'top');
    assert(grazingAngle > 85, `Grazing top rail = ${grazingAngle.toFixed(1)}° (>85°)`);

    // Head-on into left rail: direction (-1, 0)
    assertClose(computeIncidenceAngle({ x: -1, y: 0 }, 'left'), 0, 0.1, 'Head-on into left rail = 0°');

    // 30° into bottom rail
    const sin30 = Math.sin(30 * Math.PI / 180);
    const cos30 = Math.cos(30 * Math.PI / 180);
    assertClose(computeIncidenceAngle({ x: sin30, y: cos30 }, 'bottom'), 30, 0.1, '30° into bottom rail');

    // 60° into right rail
    const sin60 = Math.sin(60 * Math.PI / 180);
    const cos60 = Math.cos(60 * Math.PI / 180);
    assertClose(computeIncidenceAngle({ x: cos60, y: sin60 }, 'right'), 60, 0.1, '60° into right rail');
}

// --- Test 2: computeReflectedDir ---
console.log('\n--- computeReflectedDir ---');
{
    // Perfect reflection: 45° in, 45° out on top rail
    // Incoming: (0.707, -0.707), outgoing should be (0.707, 0.707)
    const ref1 = computeReflectedDir(45, 'top', { x: 0.707, y: -0.707 });
    assertClose(ref1.y, 0.707, 0.01, 'Top rail 45° reflection: y > 0 (bounces down)');
    assertClose(ref1.x, 0.707, 0.01, 'Top rail 45° reflection: x preserved');

    // Head-on (0°) into top rail: out should be straight down
    const ref2 = computeReflectedDir(0, 'top', { x: 0.1, y: -1 });
    assertClose(ref2.y, 1, 0.01, 'Top rail 0° reflection: straight down');
    assertClose(Math.abs(ref2.x), 0, 0.01, 'Top rail 0° reflection: no x');

    // Left rail, 30° out
    const ref3 = computeReflectedDir(30, 'left', { x: -0.866, y: 0.5 });
    assert(ref3.x > 0, `Left rail reflection: x > 0 (bounces right) got ${ref3.x.toFixed(3)}`);
    assert(ref3.y > 0, `Left rail reflection: y preserved sign, got ${ref3.y.toFixed(3)}`);

    // Bottom rail, 60° out
    const ref4 = computeReflectedDir(60, 'bottom', { x: 0.5, y: 0.866 });
    assert(ref4.y < 0, `Bottom rail reflection: y < 0 (bounces up) got ${ref4.y.toFixed(3)}`);
    assert(ref4.x > 0, `Bottom rail reflection: x preserved, got ${ref4.x.toFixed(3)}`);
}

// --- Test 3: Bilinear interpolation accuracy ---
console.log('\n--- Bilinear Interpolation ---');
{
    const cal = new MockCalibrator();
    cal.populateSynthetic(0.75, 12);

    // Exact grid point: 45°, spin=0
    const exact = cal.getBouncePrediction(45, 0);
    assertClose(exact.outgoingAngle, 45 * 0.75, 0.01, 'Exact grid point (45°, spin=0)');

    // Exact grid point with spin: 30°, spin=0.4
    const exactSpin = cal.getBouncePrediction(30, 0.4);
    assertClose(exactSpin.outgoingAngle, 30 * 0.75 + 0.4 * 12, 0.01, 'Exact grid point (30°, spin=0.4)');

    // Interpolated angle: 42.5° (midpoint of 40-45), spin=0
    const interp1 = cal.getBouncePrediction(42.5, 0);
    const expected1 = 42.5 * 0.75; // Linear model → should interpolate exactly
    assertClose(interp1.outgoingAngle, expected1, 0.1, 'Interpolated angle (42.5°, spin=0)');

    // Interpolated spin: 45°, spin=0.2 (midpoint of 0-0.4)
    const interp2 = cal.getBouncePrediction(45, 0.2);
    const expected2 = 45 * 0.75 + 0.2 * 12;
    assertClose(interp2.outgoingAngle, expected2, 0.1, 'Interpolated spin (45°, spin=0.2)');

    // Fully interpolated: 37°, spin=0.1
    const interp3 = cal.getBouncePrediction(37, 0.1);
    const expected3 = 37 * 0.75 + 0.1 * 12;
    assertClose(interp3.outgoingAngle, expected3, 0.5, 'Fully interpolated (37°, spin=0.1)');

    // Edge: at calibration boundary
    const edge1 = cal.getBouncePrediction(10, 0);
    assertClose(edge1.outgoingAngle, 10 * 0.75, 0.01, 'Edge: minimum angle (10°)');

    const edge2 = cal.getBouncePrediction(80, 0);
    assertClose(edge2.outgoingAngle, 80 * 0.75, 0.01, 'Edge: maximum angle (80°)');

    // Negative spin
    const negSpin = cal.getBouncePrediction(50, -0.6);
    const expectedNeg = 50 * 0.75 + (-0.6) * 12;
    assertClose(negSpin.outgoingAngle, expectedNeg, 0.5, 'Negative spin interpolation (50°, spin=-0.6)');
}

// --- Test 4: Symmetry check (reflected dirs should be symmetric across rails) ---
console.log('\n--- Rail Symmetry ---');
{
    // A 30° bounce off the top rail and bottom rail should produce symmetric results
    const topDir = computeReflectedDir(30, 'top', { x: 0.5, y: -0.866 });
    const botDir = computeReflectedDir(30, 'bottom', { x: 0.5, y: 0.866 });
    assertClose(topDir.x, botDir.x, 0.01, 'Top/bottom symmetry: x components match');
    assertClose(topDir.y, -botDir.y, 0.01, 'Top/bottom symmetry: y components are mirrored');

    const leftDir = computeReflectedDir(30, 'left', { x: -0.866, y: 0.5 });
    const rightDir = computeReflectedDir(30, 'right', { x: 0.866, y: 0.5 });
    assertClose(leftDir.x, -rightDir.x, 0.01, 'Left/right symmetry: x components are mirrored');
    assertClose(leftDir.y, rightDir.y, 0.01, 'Left/right symmetry: y components match');
}

// --- Test 5: Fallback model sanity ---
console.log('\n--- Fallback Model ---');
{
    const cal = new MockCalibrator();
    // NOT calibrated — should use fallback
    const fb = cal.getBouncePrediction(45, 0);
    assert(fb.outgoingAngle > 30 && fb.outgoingAngle < 50, `Fallback 45° → ${fb.outgoingAngle.toFixed(1)}° (reasonable range)`);
    assertClose(fb.speedRatio, 0.7, 0.01, 'Fallback speed ratio = 0.7');
}

// ═══ Summary ═══
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
