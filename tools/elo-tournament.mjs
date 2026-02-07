#!/usr/bin/env node

import { AI } from '../js/ai.js';
import { AI_PERSONAS, getPersonaById } from '../js/ai-personas.js';
import { Game, GameMode, GameState } from '../js/game.js';
import { PlanckPhysics as Physics } from '../js/planck-physics.js';
import { Table } from '../js/table.js';
import { Vec2 } from '../js/utils.js';

const DEFAULT_MODES = ['8ball', '9ball', 'uk8ball', 'snooker'];

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
    const index = args.indexOf(flag);
    if (index === -1 || index === args.length - 1) {
        return fallback;
    }
    return args[index + 1];
};

const parseNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const gamesPerPair = parseNumber(getArg('--games'), 50);
const kFactor = parseNumber(getArg('--k'), 24);
const maxShots = parseNumber(getArg('--max-shots'), 500);
const maxTicksPerShot = parseNumber(getArg('--max-ticks'), 1500);
const seed = getArg('--seed');
const outputFile = getArg('--out');
const modes = (getArg('--modes', DEFAULT_MODES.join(',')) || '')
    .split(',')
    .map(mode => mode.trim())
    .filter(Boolean);

const MODE_MAP = {
    '8ball': GameMode.EIGHT_BALL,
    '9ball': GameMode.NINE_BALL,
    'uk8ball': GameMode.UK_EIGHT_BALL,
    'snooker': GameMode.SNOOKER
};

const selectedModes = modes.filter(mode => MODE_MAP[mode]);
if (selectedModes.length === 0) {
    console.error('No valid modes supplied. Use --modes 8ball,9ball,uk8ball,snooker');
    process.exit(1);
}

if (seed !== null && seed !== undefined) {
    const seedValue = Number(seed);
    if (!Number.isFinite(seedValue)) {
        console.error(`Invalid --seed value: ${seed}`);
        process.exit(1);
    }
    const random = mulberry32(seedValue);
    Math.random = random;
}

globalThis.setTimeout = (fn) => {
    fn();
    return 0;
};
globalThis.clearTimeout = () => {};

function mulberry32(seedValue) {
    let t = seedValue;
    return function () {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function clonePersona(persona) {
    return {
        ...persona,
        thinkingDelay: 0
    };
}

function createRatings() {
    const ratings = {};
    for (const persona of AI_PERSONAS) {
        ratings[persona.id] = 1500;
    }
    return ratings;
}

function expectedScore(ratingA, ratingB) {
    return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function updateElo(ratings, playerA, playerB, scoreA, k) {
    const ratingA = ratings[playerA];
    const ratingB = ratings[playerB];
    const expectedA = expectedScore(ratingA, ratingB);
    const expectedB = expectedScore(ratingB, ratingA);
    ratings[playerA] = ratingA + k * (scoreA - expectedA);
    ratings[playerB] = ratingB + k * ((1 - scoreA) - expectedB);
}

function createStats() {
    const stats = {};
    for (const persona of AI_PERSONAS) {
        stats[persona.id] = { wins: 0, losses: 0, draws: 0 };
    }
    return stats;
}

function applyMatchResult(stats, winnerId, loserId, isDraw) {
    if (isDraw) {
        stats[winnerId].draws += 1;
        stats[loserId].draws += 1;
        return;
    }
    stats[winnerId].wins += 1;
    stats[loserId].losses += 1;
}

function runSingleGame(modeKey, personaA, personaB, startingPlayer) {
    const table = new Table();
    const physics = new Physics(table);
    physics.setSpeedMultiplier(3);
    const game = new Game(table);
    const ai = new AI();

    const personaAConfig = clonePersona(personaA);
    const personaBConfig = clonePersona(personaB);

    ai.trainingMode = true;
    ai.setPersona(personaBConfig);
    ai.setPersona2(personaAConfig);
    ai.setEnabled(true);
    ai.setPhysics(physics);
    ai.setGameReferences(game, table);

    ai.onShot = (direction, power, spin) => executeShot(game, direction, power, spin);
    ai.onBallPlacement = (position) => placeCueBall(game, table, position);

    game.onNominationRequired = () => {
        const nomination = ai.chooseColorNomination(game.balls);
        game.setNominatedColor(nomination);
    };
    game.onFreeBallAwarded = () => {
        ai.nominateFreeBall();
    };

    game.startGame(MODE_MAP[modeKey], { startingPlayer });

    let shotCount = 0;
    let safetyCounter = 0;
    while (game.state !== GameState.GAME_OVER && shotCount < maxShots && safetyCounter < maxShots * 3) {
        if (game.state === GameState.BALL_IN_HAND || game.state === GameState.PLAYING || game.state === GameState.AWAITING_DECISION) {
            ai.takeTurn();
        }

        if (game.state === GameState.BALLS_MOVING) {
            const completed = simulateShot(game, physics, maxTicksPerShot);
            if (!completed) {
                return { winner: null, reason: 'tick_limit' };
            }
            shotCount += 1;
        } else {
            safetyCounter += 1;
        }
    }

    if (game.state !== GameState.GAME_OVER) {
        return { winner: null, reason: shotCount >= maxShots ? 'shot_limit' : 'safety_limit' };
    }

    return { winner: game.winner, reason: game.gameOverReason };
}

function simulateShot(game, physics, tickLimit) {
    for (let tick = 0; tick < tickLimit; tick += 1) {
        const events = physics.update(game.balls, 16.67);
        for (const event of events) {
            if (event.type === 'ball') {
                game.onBallCollision(event.ballA, event.ballB);
            } else if (event.type === 'pocket') {
                game.onBallPocket(event.ball);
            }
        }
        if (!physics.areBallsMoving(game.balls)) {
            game.onBallsStopped();
            return true;
        }
    }
    return false;
}

function executeShot(game, direction, power, spin) {
    if (game.state !== GameState.PLAYING) return;
    if (!game.cueBall || game.cueBall.pocketed) return;

    const cueBall = game.cueBall;
    const velocity = Vec2.multiply(direction, power);
    cueBall.velocity.x = velocity.x;
    cueBall.velocity.y = velocity.y;

    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    const naturalOmega = speed / cueBall.radius;

    cueBall.spinZ = -spin.x * naturalOmega * 2.0 * 60;

    const perpX = -direction.y;
    const perpY = direction.x;

    const rollingSpinX = perpX * naturalOmega * 60;
    const rollingSpinY = perpY * naturalOmega * 60;

    const spinFactor = spin.y * 5;
    cueBall.spin.x = rollingSpinX * spinFactor;
    cueBall.spin.y = rollingSpinY * spinFactor;

    cueBall.forceSync = true;
    cueBall.isSliding = true;

    game.onShotTaken();
}

function placeCueBall(game, table, position) {
    let placementMode = 'anywhere';
    if (game.mode === GameMode.SNOOKER) {
        placementMode = 'dzone';
    } else if (game.isBreakShot || game.mode === GameMode.UK_EIGHT_BALL) {
        placementMode = 'kitchen';
    }

    if (!game.canPlaceCueBall(position, placementMode)) {
        if (placementMode === 'dzone') {
            position = table.findValidDPosition(game.balls, table.center.y);
        } else if (placementMode === 'kitchen') {
            position = table.findValidKitchenPosition(game.balls, table.center.y);
        } else {
            position = table.findValidCueBallPosition(game.balls, table.center.y);
        }
    }

    game.placeCueBall(position, placementMode);
}

function toRankingTable(ratings, stats) {
    return Object.entries(ratings)
        .map(([id, rating]) => ({
            id,
            name: getPersonaById(id).name,
            rating: Math.round(rating),
            record: stats[id]
        }))
        .sort((a, b) => b.rating - a.rating);
}

function printRanking(title, rankings) {
    console.log(`\n${title}`);
    console.log('-'.repeat(title.length));
    for (const entry of rankings) {
        const record = `${entry.record.wins}-${entry.record.losses}-${entry.record.draws}`;
        console.log(`${entry.name.padEnd(20)} ${String(entry.rating).padStart(4)} ELO  (${record})`);
    }
}

const overallRatings = createRatings();
const overallStats = createStats();
const modeRatings = {};
const modeStats = {};

for (const modeKey of selectedModes) {
    modeRatings[modeKey] = createRatings();
    modeStats[modeKey] = createStats();
}

const personas = AI_PERSONAS.map(persona => persona.id);
let totalGames = 0;
let draws = 0;

for (const modeKey of selectedModes) {
    console.log(`\nRunning mode: ${modeKey} (${gamesPerPair} games per pairing)`);
    for (let i = 0; i < personas.length; i += 1) {
        for (let j = i + 1; j < personas.length; j += 1) {
            const personaA = getPersonaById(personas[i]);
            const personaB = getPersonaById(personas[j]);

            for (let gameIndex = 0; gameIndex < gamesPerPair; gameIndex += 1) {
                const startingPlayer = gameIndex % 2 === 0 ? 1 : 2;
                const result = runSingleGame(modeKey, personaA, personaB, startingPlayer);

                totalGames += 1;
                if (!result.winner) {
                    draws += 1;
                    applyMatchResult(overallStats, personaA.id, personaB.id, true);
                    applyMatchResult(modeStats[modeKey], personaA.id, personaB.id, true);
                    updateElo(overallRatings, personaA.id, personaB.id, 0.5, kFactor);
                    updateElo(modeRatings[modeKey], personaA.id, personaB.id, 0.5, kFactor);
                    continue;
                }

                const winnerId = result.winner === 1 ? personaA.id : personaB.id;
                const loserId = result.winner === 1 ? personaB.id : personaA.id;
                applyMatchResult(overallStats, winnerId, loserId, false);
                applyMatchResult(modeStats[modeKey], winnerId, loserId, false);

                const scoreA = result.winner === 1 ? 1 : 0;
                updateElo(overallRatings, personaA.id, personaB.id, scoreA, kFactor);
                updateElo(modeRatings[modeKey], personaA.id, personaB.id, scoreA, kFactor);
            }
        }
    }
}

printRanking('Overall ELO', toRankingTable(overallRatings, overallStats));
for (const modeKey of selectedModes) {
    printRanking(`${modeKey.toUpperCase()} ELO`, toRankingTable(modeRatings[modeKey], modeStats[modeKey]));
}

console.log(`\nCompleted ${totalGames} games. Draws: ${draws}.`);

if (outputFile) {
    const fs = await import('node:fs/promises');
    const payload = {
        gamesPerPair,
        kFactor,
        maxShots,
        maxTicksPerShot,
        modes: selectedModes,
        totalGames,
        draws,
        overall: toRankingTable(overallRatings, overallStats),
        byMode: Object.fromEntries(
            selectedModes.map(modeKey => [modeKey, toRankingTable(modeRatings[modeKey], modeStats[modeKey])])
        )
    };
    await fs.writeFile(outputFile, JSON.stringify(payload, null, 2));
    console.log(`Saved results to ${outputFile}`);
}
