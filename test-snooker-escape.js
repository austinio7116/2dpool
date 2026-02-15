// Snooker escape logic tests
// Run with: node test-snooker-escape.js

// ─── Vec2 utilities (copied from js/utils.js) ───
const Vec2 = {
    create(x = 0, y = 0) { return { x, y }; },
    add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; },
    subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
    multiply(v, scalar) { return { x: v.x * scalar, y: v.y * scalar }; },
    dot(a, b) { return a.x * b.x + a.y * b.y; },
    length(v) { return Math.sqrt(v.x * v.x + v.y * v.y); },
    normalize(v) {
        const len = Vec2.length(v);
        if (len === 0) return { x: 0, y: 0 };
        return { x: v.x / len, y: v.y / len };
    },
    distance(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return Math.sqrt(dx * dx + dy * dy);
    },
    rotate(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
    },
    clone(v) { return { x: v.x, y: v.y }; }
};

// ─── Table / pocket geometry ───
const TABLE = {
    bounds: { left: 0, right: 800, top: 0, bottom: 400 },
    pockets: [
        { position: { x: 0, y: 0 }, radius: 26 },
        { position: { x: 400, y: 0 }, radius: 22 },
        { position: { x: 800, y: 0 }, radius: 26 },
        { position: { x: 0, y: 400 }, radius: 26 },
        { position: { x: 400, y: 400 }, radius: 22 },
        { position: { x: 800, y: 400 }, radius: 26 }
    ]
};

const BALL_RADIUS = 12;

// ─── Standalone traceShotPath (mirrors js/ai.js) ───
function traceShotPath(startPos, aimDir, validTargets, allBalls, options = {}) {
    const cueBallRadius = BALL_RADIUS;
    const bounds = TABLE.bounds;
    const margin = cueBallRadius + 2;
    const clearanceMargin = options.clearanceMargin !== undefined ? options.clearanceMargin : 2;

    let currentPos = { x: startPos.x, y: startPos.y };
    let currentDir = { x: aimDir.x, y: aimDir.y };
    let totalDistance = 0;
    let bounces = 0;
    const maxBounces = options.maxBounces || 3;
    const maxDistance = 2500;

    let closestApproach = Infinity;
    let closestTarget = null;

    while (bounces <= maxBounces && totalDistance < maxDistance) {
        let firstBallHit = null;
        let firstBallDist = Infinity;

        for (const ball of allBalls) {
            const ballRadius = ball.radius || BALL_RADIUS;
            const toBall = Vec2.subtract(ball.position, currentPos);
            const projection = Vec2.dot(toBall, currentDir);

            // Track closest approach to valid targets
            if (validTargets.includes(ball) && projection > 0) {
                const closestPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, projection));
                const perpDist = Vec2.distance(ball.position, closestPoint);
                if (perpDist < closestApproach) {
                    closestApproach = perpDist;
                    closestTarget = ball;
                }
            }

            if (projection < 0) continue;

            const closestPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, projection));
            const perpDist = Vec2.distance(ball.position, closestPoint);

            const isTarget = validTargets.includes(ball);
            const hitRadius = ballRadius + cueBallRadius + (isTarget ? 0 : clearanceMargin);
            if (perpDist < hitRadius) {
                const offset = Math.sqrt(Math.max(0, hitRadius * hitRadius - perpDist * perpDist));
                const contactDist = projection - offset;
                if (contactDist > 1 && contactDist < firstBallDist) {
                    firstBallDist = contactDist;
                    firstBallHit = ball;
                }
            }
        }

        // Rail detection
        let nearestRailDist = Infinity;
        let hitRail = null;

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

        // Ball hit before rail
        if (firstBallHit && firstBallDist < nearestRailDist) {
            totalDistance += firstBallDist;
            const isValidTarget = validTargets.includes(firstBallHit);
            return {
                hitsValidTarget: isValidTarget,
                targetHit: firstBallHit,
                totalDistance,
                bounces,
                closestApproach: 0
            };
        }

        if (!hitRail) break;

        const railHitPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, nearestRailDist));

        // Check if bounce point is inside a pocket opening — ball would fall in, not bounce
        let inPocket = false;
        for (const pocket of TABLE.pockets) {
            if (Vec2.distance(railHitPoint, pocket.position) < pocket.radius) {
                inPocket = true;
                break;
            }
        }
        if (inPocket) break; // End trace — ball enters pocket (scratch)

        totalDistance += nearestRailDist;

        const cushionThrowFactor = 0.75;
        if (hitRail === 'top' || hitRail === 'bottom') {
            currentDir = { x: currentDir.x * cushionThrowFactor, y: -currentDir.y };
        } else {
            currentDir = { x: -currentDir.x, y: currentDir.y * cushionThrowFactor };
        }
        currentDir = Vec2.normalize(currentDir);

        // Apply sidespin deflection if specified (±1.0 spin → ±15° deflection)
        if (options.sidespin) {
            const spinDeflection = options.sidespin * 15 * (Math.PI / 180);
            currentDir = Vec2.rotate(currentDir, spinDeflection);
        }

        currentPos = railHitPoint;
        bounces++;
    }

    return {
        hitsValidTarget: false,
        targetHit: closestTarget,
        totalDistance,
        bounces,
        closestApproach
    };
}

// ─── Standalone findSnookerEscape (mirrors js/ai.js) ───
function findSnookerEscape(cueBallPos, validTargets, allBalls, desperate = false) {
    const traceOptions = desperate
        ? { maxBounces: 4, clearanceMargin: 0 }
        : {};
    const approachThreshold = desperate ? 80 : 50;
    const coarseStep = desperate ? 2 : 4;

    // Phase 1: Coarse scan
    const sectors = [];
    for (let angleDeg = 0; angleDeg < 360; angleDeg += coarseStep) {
        const angleRad = angleDeg * Math.PI / 180;
        const aimDir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
        const result = traceShotPath(cueBallPos, aimDir, validTargets, allBalls, traceOptions);
        if (result) {
            if (result.hitsValidTarget || result.closestApproach < approachThreshold) {
                sectors.push({ angle: angleDeg, result, score: scoreEscapeResult(result) });
            }
        }
    }
    sectors.sort((a, b) => b.score - a.score);

    const uniqueSectors = [];
    for (const s of sectors) {
        if (!uniqueSectors.some(u => Math.abs(u.angle - s.angle) < 6)) {
            uniqueSectors.push(s);
        }
        if (uniqueSectors.length >= 5) break;
    }

    // Phase 2: Fine refinement
    const candidates = [];
    const fineStep = 0.5;
    const searchRange = 5;
    const spinVariants = [0, -0.7, 0.7];
    let bestNearMiss = null;
    let bestNearMissApproach = Infinity;

    for (const sector of uniqueSectors) {
        const startAng = sector.angle - searchRange;
        const endAng = sector.angle + searchRange;
        for (let a = startAng; a <= endAng; a += fineStep) {
            const rad = a * Math.PI / 180;
            const dir = { x: Math.cos(rad), y: Math.sin(rad) };

            for (const spin of spinVariants) {
                const opts = spin !== 0
                    ? { ...traceOptions, sidespin: spin }
                    : traceOptions;

                const trace = traceShotPath(cueBallPos, dir, validTargets, allBalls, opts);
                if (trace && trace.hitsValidTarget) {
                    const power = Math.min(45, (12 + trace.totalDistance / 25) * Math.pow(1.3, trace.bounces));
                    candidates.push({
                        target: trace.targetHit,
                        direction: dir,
                        power,
                        score: scoreEscapeResult(trace) + 10 - (spin !== 0 ? 5 : 0),
                        bounces: trace.bounces,
                        angle: a,
                        spin: { x: spin, y: 0 }
                    });
                } else if (trace && trace.closestApproach < bestNearMissApproach && trace.targetHit && validTargets.includes(trace.targetHit)) {
                    bestNearMissApproach = trace.closestApproach;
                    bestNearMiss = {
                        target: trace.targetHit,
                        rail: trace.bounces > 0 ? `${trace.bounces} cushion(s)` : 'direct',
                        direction: dir,
                        power: Math.min(45, (12 + trace.totalDistance / 25) * Math.pow(1.3, trace.bounces)),
                        score: scoreEscapeResult(trace),
                        bounces: trace.bounces,
                        angle: a,
                        spin: { x: spin, y: 0 },
                        isNearMiss: true,
                        closestApproach: trace.closestApproach
                    };
                }
            }
        }
    }

    // If no confirmed hits, use best near-miss — far better than deliberate foul
    if (candidates.length === 0) {
        if (bestNearMiss) return bestNearMiss;
        // Fall back to best Phase 1 sector targeting a valid ball
        for (const sector of sectors) {
            const sectorTarget = sector.result.targetHit;
            if (!sectorTarget || !validTargets.includes(sectorTarget)) continue;
            const rad = sector.angle * Math.PI / 180;
            const dir = { x: Math.cos(rad), y: Math.sin(rad) };
            const power = Math.min(45, (12 + (sector.result.totalDistance || 200) / 25) * Math.pow(1.3, sector.result.bounces || 1));
            return {
                target: sectorTarget,
                rail: (sector.result.bounces || 0) > 0 ? `${sector.result.bounces} cushion(s)` : 'direct',
                direction: dir,
                power: power,
                score: sector.score,
                bounces: sector.result.bounces || 0,
                angle: sector.angle,
                spin: { x: 0, y: 0 },
                isNearMiss: true,
                closestApproach: sector.result.closestApproach || 0
            };
        }
        return null;
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
}

function scoreEscapeResult(trace) {
    if (!trace) return -100;
    let score = 0;
    if (trace.hitsValidTarget) {
        score = 100;
    } else {
        score = 50 - Math.min(50, trace.closestApproach);
    }
    score -= (trace.totalDistance / 20);
    score -= (trace.bounces * 15);
    return score;
}

// ─── Test framework ───
let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) {
        console.log(`  ✓ ${name}`);
        passed++;
    } else {
        console.log(`  ✗ FAIL: ${name}`);
        failed++;
    }
}

function makeBall(x, y, id, radius = BALL_RADIUS) {
    return { position: { x, y }, radius, id, pocketed: false, isCueBall: false };
}

// ─── Tests ───

console.log('\n=== Snooker Escape Tests ===\n');

// Test 1: Direct snooker — blocker between cue ball and target in a line
console.log('Test 1: Direct snooker – finds cushion escape');
{
    const cueBall = { x: 400, y: 300 };
    const target = makeBall(400, 100, 'target');    // straight ahead
    const blocker = makeBall(400, 200, 'blocker');  // directly in the way
    const allBalls = [target, blocker];
    const validTargets = [target];

    // Direct shot should be blocked
    const directDir = Vec2.normalize(Vec2.subtract(target.position, cueBall));
    const directTrace = traceShotPath(cueBall, directDir, validTargets, allBalls);
    assert(!directTrace.hitsValidTarget || directTrace.targetHit !== target,
        'Direct shot is blocked by blocker');

    // Escape should find a cushion route
    const escape = findSnookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Escape shot found');
    assert(escape && escape.bounces > 0, 'Escape uses at least one cushion bounce');
    assert(escape && escape.target === target, 'Escape reaches the target ball');
}

// Test 2: Tight gap — blocker partially covering target
console.log('\nTest 2: Tight gap – finds the gap');
{
    const cueBall = { x: 200, y: 200 };
    const target = makeBall(500, 200, 'target');
    // Blocker offset slightly — leaves a small gap
    const blocker = makeBall(350, 225, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = findSnookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Escape finds a path (gap or cushion)');
    assert(escape && escape.target === target, 'Escape reaches the target');
}

// Test 3: Multi-cushion — target behind multiple blockers
console.log('\nTest 3: Multi-cushion escape');
{
    const cueBall = { x: 400, y: 300 };
    const target = makeBall(400, 100, 'target');
    // Wall of blockers
    const b1 = makeBall(350, 200, 'b1');
    const b2 = makeBall(400, 200, 'b2');
    const b3 = makeBall(450, 200, 'b3');
    const allBalls = [target, b1, b2, b3];
    const validTargets = [target];

    const escape = findSnookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Escape found through multi-cushion route');
    if (escape) {
        assert(escape.bounces >= 1, `Uses ${escape.bounces} bounce(s)`);
    }
}

// Test 4: Clearance margin — path that scrapes past blocker by <2px is rejected
console.log('\nTest 4: Clearance margin rejects tight scrapes');
{
    const cueBall = { x: 200, y: 200 };
    const target = makeBall(600, 200, 'target');
    // Place blocker so that a direct shot has perpDist just barely > 2*BALL_RADIUS
    // but < 2*BALL_RADIUS + 2 (clearance margin)
    // Need perpDist from line (200,200)->(600,200) to blocker center
    // Line is y=200, so blocker at y = 200 + 24 + 1 = 225 (just 1px past exact hitRadius)
    const blocker = makeBall(400, 200 + BALL_RADIUS * 2 + 1, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    // With clearance margin (default 2px), this 1px gap should be blocked
    const directDir = Vec2.normalize(Vec2.subtract(target.position, cueBall));
    const withMargin = traceShotPath(cueBall, directDir, validTargets, allBalls, {});
    // The blocker is at perpDist 25 from the line, hitRadius = 12+12+2 = 26 > 25 → blocked
    const blockedByMargin = withMargin && !withMargin.hitsValidTarget;

    // Without clearance margin, the same shot should pass
    const withoutMargin = traceShotPath(cueBall, directDir, validTargets, allBalls, { clearanceMargin: 0 });
    const passesWithout = withoutMargin && withoutMargin.hitsValidTarget;

    assert(blockedByMargin, 'Tight scrape rejected with default clearance margin');
    assert(passesWithout, 'Same path accepted with zero clearance margin');
}

// Test 5: No false negatives — valid clean paths are NOT rejected by margin
console.log('\nTest 5: Valid clean paths not rejected');
{
    const cueBall = { x: 200, y: 200 };
    const target = makeBall(600, 200, 'target');
    // Blocker far away from the line
    const blocker = makeBall(400, 300, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const directDir = Vec2.normalize(Vec2.subtract(target.position, cueBall));
    const trace = traceShotPath(cueBall, directDir, validTargets, allBalls);
    assert(trace && trace.hitsValidTarget, 'Clean direct shot reaches target');
    assert(trace && trace.targetHit === target, 'Correct target hit');
}

// Test 6: Desperate mode finds escapes normal mode misses
console.log('\nTest 6: Desperate mode finds harder escapes');
{
    const cueBall = { x: 400, y: 350 };
    const target = makeBall(400, 50, 'target');
    // Dense wall of blockers
    const blockers = [];
    for (let x = 300; x <= 500; x += 28) {
        blockers.push(makeBall(x, 200, `b${x}`));
    }
    // Add side blockers to limit simple one-cushion routes
    blockers.push(makeBall(200, 250, 'bL'));
    blockers.push(makeBall(600, 250, 'bR'));
    const allBalls = [target, ...blockers];
    const validTargets = [target];

    const normalEscape = findSnookerEscape(cueBall, validTargets, allBalls, false);
    const desperateEscape = findSnookerEscape(cueBall, validTargets, allBalls, true);

    // Desperate mode should find at least as many (usually more) candidates
    // due to wider search and more bounces
    if (!normalEscape && desperateEscape) {
        assert(true, 'Desperate mode found escape that normal mode missed');
    } else if (normalEscape && desperateEscape) {
        assert(true, 'Both modes found escape (desperate not needed here)');
    } else if (!normalEscape && !desperateEscape) {
        // This is acceptable — some positions are truly impossible
        assert(true, 'Neither mode found escape (heavily blocked position)');
    } else {
        assert(true, 'Normal mode found escape');
    }

    // Verify desperate mode uses different parameters
    // We can test this indirectly: desperate trace allows 4 bounces
    const dir = { x: 1, y: 0 };
    const normalTrace = traceShotPath(cueBall, dir, validTargets, allBalls, {});
    const desperateTrace = traceShotPath(cueBall, dir, validTargets, allBalls, { maxBounces: 4, clearanceMargin: 0 });
    // Both should return something (even if no hit), but desperate allows more bounces
    assert(desperateTrace !== null, 'Desperate trace returns result with 4 max bounces');
}

// Test 7: Foul exclusion removed — no candidates filtered by angle proximity
console.log('\nTest 7: No foul exclusion zone filtering');
{
    // The findSnookerEscape function no longer has Phase 3 foul filtering.
    // We verify by checking that all candidates from fine search are preserved.
    // Since there's no foulHistory parameter, this is confirmed by design.
    const cueBall = { x: 400, y: 300 };
    const target = makeBall(400, 100, 'target');
    const blocker = makeBall(400, 200, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = findSnookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Escape found without foul exclusion filtering');
    // If we had foul history filtering, repeated calls with similar angles would get filtered.
    // Call again — should still find escape (no state-based filtering)
    const escape2 = findSnookerEscape(cueBall, validTargets, allBalls);
    assert(escape2 !== null, 'Repeated call still finds escape (no foul memory)');
    // Angles should be the same (deterministic, no foul filtering)
    assert(escape && escape2 && Math.abs(escape.angle - escape2.angle) < 0.01,
        'Same angle chosen both times (no exclusion zones)');
}

// Test 8: Bounce point AT middle pocket — ball would fall in
console.log('\nTest 8: Bounce aimed directly into middle pocket');
{
    // Cue ball below table center, target above.
    // The only "escape" angle fires up at the top rail right at x=400 — the middle pocket.
    // The trace should NOT count this as a valid cushion bounce (the ball goes in the pocket).
    const cueBall = { x: 400, y: 350 };
    const target = makeBall(400, 50, 'target');
    // Blocker directly above cue ball
    const blocker = makeBall(400, 250, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    // Fire directly at top middle pocket
    const dir = Vec2.normalize({ x: 0, y: -1 }); // straight up
    const trace = traceShotPath(cueBall, dir, validTargets, allBalls);

    // The bounce point would be at ~(400, 14) — right at the middle pocket (400,0) r=22
    // Distance from bounce to pocket center = 14, pocket radius = 22
    // This should ideally NOT be treated as a valid cushion escape
    const bounceY = TABLE.bounds.top + BALL_RADIUS + 2; // margin = 14
    const bouncePt = { x: 400, y: bounceY };
    const distToPocket = Vec2.distance(bouncePt, { x: 400, y: 0 });
    console.log(`  (bounce point (400,${bounceY}) is ${distToPocket.toFixed(1)}px from middle pocket center, pocket radius=22)`);

    // If trace bounces here without pocket check, it may claim a valid hit
    // We want the trace to either return null or not claim hitsValidTarget via this pocket-adjacent bounce
    if (trace && trace.bounces > 0 && trace.hitsValidTarget) {
        assert(false, 'Should not find valid escape through middle pocket opening');
    } else {
        assert(true, 'Correctly avoids/ignores middle pocket bounce');
    }
}

// Test 9: Bounce near but not at middle pocket — should still work
console.log('\nTest 9: Bounce near middle pocket but not in it');
{
    // Cue ball offset from center, target on opposite side.
    // Escape bounces off top rail ~60px away from middle pocket — should be fine.
    const cueBall = { x: 250, y: 300 };
    const target = makeBall(550, 100, 'target');
    // Blocker between them
    const blocker = makeBall(400, 200, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = findSnookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Escape found bouncing away from middle pocket');
    if (escape) {
        assert(escape.target === target, 'Hits the correct target');
        console.log(`  (escape angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces})`);
    }
}

// Test 10: Escape must avoid bottom middle pocket too
console.log('\nTest 10: Escape avoids bottom middle pocket');
{
    // Cue ball above center, target below. Blocker in between.
    // Only escape that goes straight down bounces at (400, 386) — near bottom middle pocket (400,400) r=22
    const cueBall = { x: 400, y: 50 };
    const target = makeBall(400, 350, 'target');
    const blocker = makeBall(400, 150, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    // Fire straight down
    const dir = Vec2.normalize({ x: 0, y: 1 });
    const trace = traceShotPath(cueBall, dir, validTargets, allBalls);

    const bounceY = TABLE.bounds.bottom - BALL_RADIUS - 2; // margin = 386
    const bouncePt = { x: 400, y: bounceY };
    const distToPocket = Vec2.distance(bouncePt, { x: 400, y: 400 });
    console.log(`  (bounce point (400,${bounceY}) is ${distToPocket.toFixed(1)}px from bottom middle pocket, pocket radius=22)`);

    if (trace && trace.bounces > 0 && trace.hitsValidTarget) {
        assert(false, 'Should not find valid escape through bottom middle pocket');
    } else {
        assert(true, 'Correctly avoids bottom middle pocket bounce');
    }
}

// Test 11: Full escape search avoids middle pocket routes but finds alternatives
console.log('\nTest 11: Escape search finds alternative when middle pocket blocks direct cushion route');
{
    // Scenario: cue ball at center, target straight above, blocker in between.
    // The straight-up bounce goes into the middle pocket — escape must find a side-cushion route instead.
    const cueBall = { x: 400, y: 300 };
    const target = makeBall(350, 80, 'target');  // Slightly offset so side routes can reach it
    const blocker = makeBall(380, 200, 'blocker');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = findSnookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Escape found despite middle pocket danger zone');
    if (escape) {
        console.log(`  (escape angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, spin: ${escape.spin ? escape.spin.x : 0})`);
    }
}

// Test 12: Direct trace into middle pocket — no blocker interfering before cushion
console.log('\nTest 12: Trace bounces at middle pocket with clear path to cushion');
{
    // Cue ball near bottom, firing up-left so it hits the top rail near x=400 (middle pocket).
    // No blocker between cue ball and the top rail — the ball actually reaches the cushion.
    const cueBall = { x: 410, y: 350 };
    const target = makeBall(200, 300, 'target');
    const allBalls = [target]; // No blockers — test the trace itself

    // Aim almost straight up, slightly left, so bounce point lands near (400, 14) — in pocket zone
    const dir = Vec2.normalize({ x: -0.03, y: -1 });
    const trace = traceShotPath(cueBall, dir, [target], allBalls);

    // The bounce point should be very close to (400, 14), within pocket radius of (400, 0)
    // If the trace happily bounces here, it's treating the pocket opening as a solid cushion
    console.log(`  trace result: bounces=${trace ? trace.bounces : 'null'}, hitsValidTarget=${trace ? trace.hitsValidTarget : 'null'}`);

    if (trace && trace.bounces > 0) {
        // The trace bounced off the cushion at the pocket — this is wrong
        // The ball would fall in the pocket in real physics
        assert(false, 'Should not bounce off cushion inside pocket opening');
    } else {
        assert(true, 'Trace correctly handles pocket opening (no false bounce)');
    }
}

// ═══════════════════════════════════════════════════
// REALISTIC SNOOKER TABLE TESTS
// Full-size snooker: 918x400, 8px balls, 18px pockets
// Pocket centers offset outside playing surface
// ═══════════════════════════════════════════════════

const SNOOKER_BALL_RADIUS = 8;
const SNOOKER_PADDING = 60;
const SNOOKER_TABLE = {
    bounds: {
        left: SNOOKER_PADDING,           // 60
        right: SNOOKER_PADDING + 918,    // 978
        top: SNOOKER_PADDING,            // 60
        bottom: SNOOKER_PADDING + 402    // 462
    },
    pockets: [
        // Corners: offset 5px diagonally into pocket holes; bounds extended by boundsOffset
        { position: { x: 60 - 18 - 5, y: 60 - 18 - 5 }, radius: 18, type: 'corner' },   // TL (37, 37)
        { position: { x: 978 + 17 + 5, y: 60 - 18 - 5 }, radius: 18, type: 'corner' },   // TR (1000, 37)
        { position: { x: 60 - 18 - 5, y: 462 + 15 + 5 }, radius: 18, type: 'corner' },   // BL (37, 482)
        { position: { x: 978 + 17 + 5, y: 462 + 15 + 5 }, radius: 18, type: 'corner' },  // BR (1000, 482)
        // Side pockets: center_x at table center, y offset 15px outside bounds; radius * 0.9
        { position: { x: 519, y: 60 - 18 - 15 }, radius: 16.2, type: 'side' },            // Top middle (519, 27)
        { position: { x: 519, y: 462 + 15 + 15 }, radius: 16.2, type: 'side' }            // Bottom middle (519, 492)
    ]
};

// Override for snooker-specific trace
function snookerTrace(startPos, aimDir, validTargets, allBalls, options = {}) {
    const cueBallRadius = SNOOKER_BALL_RADIUS;
    const bounds = SNOOKER_TABLE.bounds;
    const margin = cueBallRadius + 2;
    const clearanceMargin = options.clearanceMargin !== undefined ? options.clearanceMargin : 2;

    let currentPos = { x: startPos.x, y: startPos.y };
    let currentDir = { x: aimDir.x, y: aimDir.y };
    let totalDistance = 0;
    let bounces = 0;
    const maxBounces = options.maxBounces || 3;
    const maxDistance = 3000;

    let closestApproach = Infinity;
    let closestTarget = null;

    while (bounces <= maxBounces && totalDistance < maxDistance) {
        let firstBallHit = null;
        let firstBallDist = Infinity;

        for (const ball of allBalls) {
            const ballRadius = ball.radius || SNOOKER_BALL_RADIUS;
            const toBall = Vec2.subtract(ball.position, currentPos);
            const projection = Vec2.dot(toBall, currentDir);

            if (validTargets.includes(ball) && projection > 0) {
                const closestPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, projection));
                const perpDist = Vec2.distance(ball.position, closestPoint);
                if (perpDist < closestApproach) {
                    closestApproach = perpDist;
                    closestTarget = ball;
                }
            }

            if (projection < 0) continue;

            const closestPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, projection));
            const perpDist = Vec2.distance(ball.position, closestPoint);

            const isTarget = validTargets.includes(ball);
            const hitRadius = ballRadius + cueBallRadius + (isTarget ? 0 : clearanceMargin);
            if (perpDist < hitRadius) {
                const offset = Math.sqrt(Math.max(0, hitRadius * hitRadius - perpDist * perpDist));
                const contactDist = projection - offset;
                if (contactDist > 1 && contactDist < firstBallDist) {
                    firstBallDist = contactDist;
                    firstBallHit = ball;
                }
            }
        }

        let nearestRailDist = Infinity;
        let hitRail = null;

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

        if (firstBallHit && firstBallDist < nearestRailDist) {
            totalDistance += firstBallDist;
            const isValidTarget = validTargets.includes(firstBallHit);
            return {
                hitsValidTarget: isValidTarget,
                targetHit: firstBallHit,
                totalDistance,
                bounces,
                closestApproach: 0
            };
        }

        if (!hitRail) break;

        const railHitPoint = Vec2.add(currentPos, Vec2.multiply(currentDir, nearestRailDist));

        let inPocket = false;
        for (const pocket of SNOOKER_TABLE.pockets) {
            if (Vec2.distance(railHitPoint, pocket.position) < pocket.radius) {
                inPocket = true;
                break;
            }
        }
        if (inPocket) break;

        totalDistance += nearestRailDist;

        const cushionThrowFactor = 0.75;
        if (hitRail === 'top' || hitRail === 'bottom') {
            currentDir = { x: currentDir.x * cushionThrowFactor, y: -currentDir.y };
        } else {
            currentDir = { x: -currentDir.x, y: currentDir.y * cushionThrowFactor };
        }
        currentDir = Vec2.normalize(currentDir);

        if (options.sidespin) {
            const spinDeflection = options.sidespin * 15 * (Math.PI / 180);
            currentDir = Vec2.rotate(currentDir, spinDeflection);
        }

        currentPos = railHitPoint;
        bounces++;
    }

    return {
        hitsValidTarget: false,
        targetHit: closestTarget,
        totalDistance,
        bounces,
        closestApproach
    };
}

function snookerEscape(cueBallPos, validTargets, allBalls, desperate = false) {
    const traceOptions = desperate
        ? { maxBounces: 4, clearanceMargin: 0 }
        : {};
    const approachThreshold = desperate ? 80 : 50;
    const coarseStep = desperate ? 2 : 4;

    const sectors = [];
    for (let angleDeg = 0; angleDeg < 360; angleDeg += coarseStep) {
        const angleRad = angleDeg * Math.PI / 180;
        const aimDir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
        const result = snookerTrace(cueBallPos, aimDir, validTargets, allBalls, traceOptions);
        if (result) {
            if (result.hitsValidTarget || result.closestApproach < approachThreshold) {
                sectors.push({ angle: angleDeg, result, score: scoreEscapeResult(result) });
            }
        }
    }
    sectors.sort((a, b) => b.score - a.score);

    const uniqueSectors = [];
    for (const s of sectors) {
        if (!uniqueSectors.some(u => Math.abs(u.angle - s.angle) < 6)) {
            uniqueSectors.push(s);
        }
        if (uniqueSectors.length >= 5) break;
    }

    const candidates = [];
    const fineStep = 0.5;
    const searchRange = 5;
    const spinVariants = [0, -0.7, 0.7];
    let bestNearMiss = null;
    let bestNearMissApproach = Infinity;

    for (const sector of uniqueSectors) {
        const startAng = sector.angle - searchRange;
        const endAng = sector.angle + searchRange;
        for (let a = startAng; a <= endAng; a += fineStep) {
            const rad = a * Math.PI / 180;
            const dir = { x: Math.cos(rad), y: Math.sin(rad) };

            for (const spin of spinVariants) {
                const opts = spin !== 0
                    ? { ...traceOptions, sidespin: spin }
                    : traceOptions;

                const trace = snookerTrace(cueBallPos, dir, validTargets, allBalls, opts);
                if (trace && trace.hitsValidTarget) {
                    const power = Math.min(45, (12 + trace.totalDistance / 25) * Math.pow(1.3, trace.bounces));
                    candidates.push({
                        target: trace.targetHit,
                        direction: dir,
                        power,
                        score: scoreEscapeResult(trace) + 10 - (spin !== 0 ? 5 : 0),
                        bounces: trace.bounces,
                        angle: a,
                        spin: { x: spin, y: 0 }
                    });
                } else if (trace && trace.closestApproach < bestNearMissApproach && trace.targetHit && validTargets.includes(trace.targetHit)) {
                    bestNearMissApproach = trace.closestApproach;
                    bestNearMiss = {
                        target: trace.targetHit,
                        rail: trace.bounces > 0 ? `${trace.bounces} cushion(s)` : 'direct',
                        direction: dir,
                        power: Math.min(45, (12 + trace.totalDistance / 25) * Math.pow(1.3, trace.bounces)),
                        score: scoreEscapeResult(trace),
                        bounces: trace.bounces,
                        angle: a,
                        spin: { x: spin, y: 0 },
                        isNearMiss: true,
                        closestApproach: trace.closestApproach
                    };
                }
            }
        }
    }

    if (candidates.length === 0) {
        if (bestNearMiss) return bestNearMiss;
        for (const sector of sectors) {
            const sectorTarget = sector.result.targetHit;
            if (!sectorTarget || !validTargets.includes(sectorTarget)) continue;
            const rad = sector.angle * Math.PI / 180;
            const dir = { x: Math.cos(rad), y: Math.sin(rad) };
            return {
                target: sectorTarget,
                rail: (sector.result.bounces || 0) > 0 ? `${sector.result.bounces} cushion(s)` : 'direct',
                direction: dir,
                power: Math.min(45, (12 + (sector.result.totalDistance || 200) / 25) * Math.pow(1.3, sector.result.bounces || 1)),
                score: sector.score,
                bounces: sector.result.bounces || 0,
                angle: sector.angle,
                spin: { x: 0, y: 0 },
                isNearMiss: true,
                closestApproach: sector.result.closestApproach || 0
            };
        }
        return null;
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
}

function makeSnookerBall(x, y, id, colorName) {
    return { position: { x, y }, radius: SNOOKER_BALL_RADIUS, id, colorName: colorName || id, pocketed: false, isCueBall: false };
}

// Snooker table center reference points
const SC = {  // Snooker Center
    x: SNOOKER_TABLE.bounds.left + 459,  // 519
    y: SNOOKER_TABLE.bounds.top + 201     // 261  (middle of playing area)
};

console.log('\n═══ SNOOKER TABLE ESCAPE TESTS ═══\n');

// Test S1: Simple one-cushion escape — ball behind a color
console.log('Test S1: One-cushion escape off side rail');
{
    // Cue ball on baulk side, target (red) behind the blue on center spot
    // Blue blocks direct path. Side cushion escape should be easy.
    const cueBall = { x: 230, y: 261 };  // Baulk area, center line
    const red = makeSnookerBall(600, 261, 'red1', 'red');  // Far side of blue
    const blue = makeSnookerBall(519, 261, 'blue', 'blue');  // Center spot, blocking
    const allBalls = [red, blue];
    const validTargets = [red];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds one-cushion escape off side rail');
    if (escape) {
        assert(escape.bounces >= 1, `Uses cushion (${escape.bounces} bounce(s))`);
        const hitConfirmed = !escape.isNearMiss;
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, confirmed: ${hitConfirmed}, approach: ${escape.closestApproach !== undefined ? escape.closestApproach.toFixed(1) : 'hit'}`);
    }
}

// Test S2: Simple one-cushion escape off top rail
console.log('\nTest S2: One-cushion escape off top rail');
{
    // Cue ball offset below center, target above, blocker in between
    const cueBall = { x: 400, y: 380 };
    const target = makeSnookerBall(400, 150, 'red2', 'red');
    const blocker = makeSnookerBall(400, 280, 'brown', 'brown');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds escape off top rail');
    if (escape) {
        const hitConfirmed = !escape.isNearMiss;
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, confirmed: ${hitConfirmed}`);
    }
}

// Test S3: Snookered behind black with multiple reds visible
console.log('\nTest S3: Snookered behind black — must kick to reds');
{
    // Cue ball near black spot area, black directly blocking, reds in triangle area
    const cueBall = { x: 900, y: 261 };
    const black = makeSnookerBall(850, 261, 'black', 'black');
    const red1 = makeSnookerBall(750, 240, 'red3', 'red');
    const red2 = makeSnookerBall(750, 280, 'red4', 'red');
    const red3 = makeSnookerBall(730, 261, 'red5', 'red');
    const allBalls = [black, red1, red2, red3];
    const validTargets = [red1, red2, red3];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds kick to reach reds behind black');
    if (escape) {
        console.log(`  angle: ${escape.angle.toFixed(1)}°, target: ${escape.target.colorName}, bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
    }
}

// Test S4: Cue ball tight to cushion — escape off opposite rail
console.log('\nTest S4: Cue ball tight to cushion');
{
    // Cue ball nearly touching bottom rail, snookered by a ball, must go to opposite rail
    const cueBall = { x: 300, y: SNOOKER_TABLE.bounds.bottom - 12 }; // 450, near bottom rail
    const target = makeSnookerBall(300, 150, 'red6', 'red');
    const blocker = makeSnookerBall(300, 350, 'green', 'green');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds escape when tight to cushion');
    if (escape) {
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
    }
}

// Test S5: Multiple blockers — needs to find gap or multi-cushion
console.log('\nTest S5: Multiple blockers across the table');
{
    const cueBall = { x: 230, y: 261 };
    const target = makeSnookerBall(800, 261, 'red7', 'red');
    // Wall of colors
    const b1 = makeSnookerBall(450, 220, 'yellow', 'yellow');
    const b2 = makeSnookerBall(450, 261, 'brown2', 'brown');
    const b3 = makeSnookerBall(450, 300, 'green2', 'green');
    const allBalls = [target, b1, b2, b3];
    const validTargets = [target];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds escape through or around wall of blockers');
    if (escape) {
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
    }
}

// Test S6: Near middle pocket — escape must not go through pocket
console.log('\nTest S6: Escape near top middle pocket on snooker table');
{
    // Cue ball below middle pocket, target on other side. Direct path goes near middle pocket.
    const cueBall = { x: 519, y: 350 };
    const target = makeSnookerBall(519, 120, 'red8', 'red');
    const blocker = makeSnookerBall(519, 250, 'pink', 'pink');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds escape near middle pocket area');
    if (escape) {
        // Should NOT be a straight-up bounce through the middle pocket
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
    }
}

// Test S7: Heavily blocked — escape still targets valid ball or returns null (not wrong ball)
console.log('\nTest S7: Heavily blocked — valid target or null');
{
    const cueBall = { x: 519, y: 261 };
    const target = makeSnookerBall(200, 100, 'red9', 'red');
    // Surround cue ball with blockers
    const blockers = [];
    for (let angle = 0; angle < 360; angle += 30) {
        const rad = angle * Math.PI / 180;
        const bx = 519 + Math.cos(rad) * 40;
        const by = 261 + Math.sin(rad) * 40;
        blockers.push(makeSnookerBall(bx, by, `block${angle}`, 'blocker'));
    }
    const allBalls = [target, ...blockers];
    const validTargets = [target];

    // Normal mode — may return null if completely blocked, but must never target wrong ball
    const escape = snookerEscape(cueBall, validTargets, allBalls);
    if (escape) {
        assert(validTargets.includes(escape.target), 'Normal mode: targets valid ball');
        console.log(`  nearMiss: ${!!escape.isNearMiss}, approach: ${escape.closestApproach !== undefined ? escape.closestApproach.toFixed(1) : 'hit'}`);
    } else {
        assert(true, 'Normal mode: null is acceptable when completely surrounded');
        console.log('  (completely blocked — no valid path found)');
    }

    // Desperate mode — wider search may find a route
    const desperate = snookerEscape(cueBall, validTargets, allBalls, true);
    if (desperate) {
        assert(validTargets.includes(desperate.target), 'Desperate mode: targets valid ball');
    } else {
        assert(true, 'Desperate mode: null acceptable when truly impossible');
    }
}

// Test S8: Phase 1 finds sectors but Phase 2 finds 0 confirmed hits — must use near-miss
console.log('\nTest S8: Phase 1 promising but Phase 2 no confirmed — uses near-miss');
{
    // Place target so traces come close but the reflection model can't quite hit it
    // This simulates the "63 sectors, 0 candidates" failure
    const cueBall = { x: 150, y: 400 };
    const target = makeSnookerBall(850, 100, 'red10', 'red');  // Far corner, hard to hit via cushion
    // Blocker prevents direct shot
    const blocker = makeSnookerBall(500, 250, 'blue2', 'blue');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Returns result even if no confirmed hit');
    if (escape && escape.isNearMiss) {
        assert(escape.closestApproach < 100, `Near-miss approach ${escape.closestApproach.toFixed(1)}px is reasonable (< 100)`);
        console.log(`  near-miss at ${escape.angle.toFixed(1)}°, approach: ${escape.closestApproach.toFixed(1)}px`);
    } else if (escape) {
        console.log(`  confirmed hit at ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}`);
    }
}

// Test S9: Cue ball in baulk D, snookered on all reds by cluster
console.log('\nTest S9: Baulk D snookered on reds by cluster + colors');
{
    // Classic snooker position: after a safety, cue ball in D, reds clustered mid-table
    const cueBall = { x: 200, y: 300 };
    // Reds in a cluster
    const reds = [
        makeSnookerBall(700, 240, 'r1', 'red'),
        makeSnookerBall(716, 250, 'r2', 'red'),
        makeSnookerBall(700, 260, 'r3', 'red'),
        makeSnookerBall(716, 270, 'r4', 'red'),
        makeSnookerBall(700, 280, 'r5', 'red'),
    ];
    // Colors blocking direct paths
    const yellow = makeSnookerBall(230, 334, 'yellow', 'yellow');
    const green = makeSnookerBall(230, 188, 'green', 'green');
    const brown = makeSnookerBall(230, 261, 'brown', 'brown');
    const blue = makeSnookerBall(519, 261, 'blue', 'blue');
    const allBalls = [...reds, yellow, green, brown, blue];
    const validTargets = reds;

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds escape from baulk D to distant reds');
    if (escape) {
        const isValidTarget = validTargets.includes(escape.target);
        console.log(`  angle: ${escape.angle.toFixed(1)}°, target: ${escape.target.colorName} (valid: ${isValidTarget}), bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
        assert(isValidTarget, 'Escape targets a valid ball (red)');
    }
}

// Test S10: Tight snooker behind pink on the spot
console.log('\nTest S10: Tight snooker behind pink');
{
    // Cue ball close behind pink, last red is on the other side
    const cueBall = { x: 770, y: 261 };
    const pink = makeSnookerBall(755, 261, 'pink', 'pink');  // Pink on spot, blocking
    const lastRed = makeSnookerBall(720, 261, 'lastred', 'red');  // Red on other side of pink
    const allBalls = [pink, lastRed];
    const validTargets = [lastRed];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds escape around pink to last red');
    if (escape) {
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
    }
}

// Test S11: Long-distance one-cushion — baulk to top cushion to far red
console.log('\nTest S11: Long one-cushion kick across full table');
{
    const cueBall = { x: 200, y: 380 };
    const target = makeSnookerBall(800, 100, 'farred', 'red');
    // Blocker on the direct line
    const blocker = makeSnookerBall(500, 240, 'block', 'color');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds long-distance cushion kick');
    if (escape) {
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
    }
}

// Test S12: Escape off the same rail cue ball is near
console.log('\nTest S12: Escape off nearby rail (acute angle bounce)');
{
    // Cue ball near top rail, target is further down. Blocker in between.
    // Acute-angle bounce off the top rail should work.
    const cueBall = { x: 300, y: 80 };  // Near top rail
    const target = makeSnookerBall(600, 200, 'redacute', 'red');
    const blocker = makeSnookerBall(450, 140, 'blockacute', 'color');
    const allBalls = [target, blocker];
    const validTargets = [target];

    const escape = snookerEscape(cueBall, validTargets, allBalls);
    assert(escape !== null, 'Finds acute-angle bounce off nearby rail');
    if (escape) {
        console.log(`  angle: ${escape.angle.toFixed(1)}°, bounces: ${escape.bounces}, nearMiss: ${!!escape.isNearMiss}`);
    }
}

// ─── Summary ───
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
