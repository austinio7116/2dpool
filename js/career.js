// Career Mode - Core logic: state management, ELO, leagues, fixtures, simulation, achievements, save/load

import { AI_PERSONAS } from './ai-personas.js';

const STORAGE_KEY = 'poolGame_career';

const GAME_MODES = ['8ball', 'uk8ball', '9ball', 'snooker'];

const MODE_LABELS = {
    '8ball': '8-Ball (US)',
    'uk8ball': '8-Ball (UK)',
    '9ball': '9-Ball',
    'snooker': 'Snooker'
};

const ACHIEVEMENTS = [
    // Beat each persona
    ...AI_PERSONAS.map(p => ({
        id: `beat_${p.id}`,
        name: `Beat ${p.name}`,
        description: `Win a match against ${p.name}`,
        icon: p.initial,
        color: p.color
    })),
    // Win in each mode
    { id: 'win_8ball', name: '8-Ball Victor', description: 'Win any 8-ball match', icon: '8', color: '#4CAF50' },
    { id: 'win_uk8ball', name: 'UK Rules', description: 'Win any UK 8-ball match', icon: 'UK', color: '#E91E63' },
    { id: 'win_9ball', name: '9-Ball Victor', description: 'Win any 9-ball match', icon: '9', color: '#FF9800' },
    { id: 'win_snooker', name: 'Snooker Victor', description: 'Win any snooker match', icon: 'S', color: '#9C27B0' },
    // League champions
    ...GAME_MODES.map(m => ({
        id: `league_lower_${m}`,
        name: `${MODE_LABELS[m]} Amateur Champion`,
        description: `Win the amateur league in ${MODE_LABELS[m]}`,
        icon: 'A',
        color: '#CD7F32'
    })),
    ...GAME_MODES.map(m => ({
        id: `league_upper_${m}`,
        name: `${MODE_LABELS[m]} Pro Champion`,
        description: `Win the pro league in ${MODE_LABELS[m]}`,
        icon: 'P',
        color: '#FFD700'
    })),
    // Milestones
    { id: 'promotion_first', name: 'Moving Up', description: 'First promotion to pro division', icon: '^', color: '#2196F3' },
    { id: 'snooker_break_30', name: 'Solid Break', description: 'Score a snooker break of 30+', icon: '30', color: '#4CAF50' },
    { id: 'snooker_break_50', name: 'Half Century', description: 'Score a snooker break of 50+', icon: '50', color: '#FF9800' },
    { id: 'snooker_century', name: 'Century Break', description: 'Score a snooker break of 100+', icon: '100', color: '#F44336' },
    { id: 'clean_sweep', name: 'Clean Sweep', description: 'Win a match without losing a frame', icon: '!', color: '#E91E63' },
    { id: 'season_complete', name: 'Season Veteran', description: 'Complete an entire season', icon: 'SV', color: '#9C27B0' },
    { id: 'all_upper', name: 'Top Flight', description: 'All 4 leagues in pro division', icon: 'TF', color: '#FFD700' },
    { id: 'grand_champion', name: 'Grand Champion', description: 'Win all 4 pro leagues', icon: 'GC', color: '#FFD700' },
    // Pool break achievements
    { id: 'pool_break_2', name: 'Double Pot', description: 'Pot 2 balls in one visit', icon: '2', color: '#8BC34A' },
    { id: 'pool_break_3', name: 'Hat Trick', description: 'Pot 3 balls in one visit', icon: '3', color: '#4CAF50' },
    { id: 'pool_break_5', name: 'On Fire', description: 'Pot 5 balls in one visit', icon: '5', color: '#FF5722' },
    // Clearance achievements
    { id: 'clearance_8ball', name: '8-Ball Clearance', description: 'Clear all your balls and pot the 8-ball', icon: '8C', color: '#2196F3' },
    { id: 'clearance_9ball', name: '9-Ball Run Out', description: 'Run the table in 9-ball', icon: '9C', color: '#FF9800' },
    { id: 'clearance_8ball_break', name: '8-Ball Perfect Game', description: 'Clear from the break in 8-ball', icon: '8P', color: '#1565C0' },
    { id: 'clearance_9ball_break', name: '9-Ball Perfect Game', description: 'Clear from the break in 9-ball', icon: '9P', color: '#E65100' },
    // Special shot achievements
    { id: 'bank_shot', name: 'Off the Cushion', description: 'Pot a ball via a cushion', icon: 'BK', color: '#00BCD4' },
    { id: 'combo_shot', name: 'Plant Master', description: 'Pot a ball via another ball', icon: 'PL', color: '#9C27B0' },
    // Snooker clearance achievements
    { id: 'snooker_clear_colours', name: 'Colour Clearance', description: 'Pot yellow to black consecutively', icon: 'CC', color: '#E91E63' },
    { id: 'clearance_mini_snooker', name: 'Mini Maximum', description: 'Full clearance in mini snooker', icon: 'MM', color: '#4CAF50' },
    { id: 'clearance_full_snooker', name: 'Full Clearance', description: 'Full clearance in full snooker', icon: 'FC', color: '#F44336' },
    { id: 'snooker_75_break', name: 'Mini Max Break', description: '75 break in mini snooker', icon: '75', color: '#FF9800' },
    { id: 'snooker_147', name: 'Maximum Break', description: '147 in full snooker', icon: '147', color: '#FFD700' }
];

function calculateElo(playerElo, opponentElo, won) {
    const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const actual = won ? 1 : 0;
    return Math.round(playerElo + 32 * (actual - expected));
}

function simulateMatch(playerA_Elo, playerB_Elo, bestOf) {
    const winProb = 1 / (1 + Math.pow(10, (playerB_Elo - playerA_Elo) / 400));
    let framesA = 0, framesB = 0;
    const target = Math.ceil(bestOf / 2);
    while (framesA < target && framesB < target) {
        Math.random() < winProb ? framesA++ : framesB++;
    }
    return {
        winnerFrames: Math.max(framesA, framesB),
        loserFrames: Math.min(framesA, framesB),
        aWon: framesA > framesB
    };
}

function generateRoundRobinFixtures(players) {
    const fixtures = [];
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            fixtures.push({
                home: players[i],
                away: players[j],
                result: null,
                played: false,
                simulated: false
            });
        }
    }
    // Shuffle fixture order
    for (let i = fixtures.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fixtures[i], fixtures[j]] = [fixtures[j], fixtures[i]];
    }
    return fixtures;
}

export class Career {
    constructor() {
        this.state = null;
        this.onLeagueAchievement = null; // callback: (achievementId) => void
        this.load();
    }

    isActive() {
        return this.state !== null;
    }

    getState() {
        return this.state;
    }

    newCareer(playerName) {
        // Initialize AI ELO from persona defaults
        const aiElo = {};
        for (const p of AI_PERSONAS) {
            aiElo[p.id] = p.elo;
        }

        this.state = {
            version: 1,
            playerName: playerName || 'Player',
            playerElo: 1500,
            season: 1,
            leagues: {},
            aiElo,
            matchHistory: [],
            stats: {
                totalWins: 0,
                totalLosses: 0,
                highestBreak: 0,
                leaguesWon: 0
            }
        };

        // All leagues start in lower division
        for (const mode of GAME_MODES) {
            this.state.leagues[mode] = {
                division: 'lower',
                seasonData: null
            };
        }

        this.generateSeason();
        this.save();
        return this.state;
    }

    // Get sorted AI players by ELO
    getSortedAI() {
        return AI_PERSONAS.map(p => ({
            id: p.id,
            elo: this.state.aiElo[p.id] || p.elo
        })).sort((a, b) => a.elo - b.elo);
    }

    // Get 4 AI players for a league division
    getLeaguePlayers(mode) {
        const division = this.state.leagues[mode].division;
        const sorted = this.getSortedAI();

        // Lower = bottom 4 ELO, Upper = top 4 ELO
        const aiPlayers = division === 'lower'
            ? sorted.slice(0, 4).map(p => p.id)
            : sorted.slice(4).map(p => p.id);

        return ['player', ...aiPlayers];
    }

    generateSeason() {
        for (const mode of GAME_MODES) {
            const players = this.getLeaguePlayers(mode);
            const fixtures = generateRoundRobinFixtures(players);
            const standings = players.map(id => ({
                id,
                played: 0,
                won: 0,
                lost: 0,
                points: 0,
                framesFor: 0,
                framesAgainst: 0,
                elo: id === 'player' ? this.state.playerElo : (this.state.aiElo[id] || 1500)
            }));

            this.state.leagues[mode].seasonData = {
                season: this.state.season,
                players,
                fixtures,
                standings,
                complete: false
            };
        }
    }

    // Get the best of format for a league
    getBestOf(mode) {
        const division = this.state.leagues[mode].division;
        return division === 'lower' ? 3 : 5;
    }

    // Get next user fixture in a league
    getNextUserFixture(mode) {
        const sd = this.state.leagues[mode].seasonData;
        if (!sd) return null;
        return sd.fixtures.find(f =>
            !f.played && (f.home === 'player' || f.away === 'player')
        );
    }

    // Get next user fixture across all leagues
    getNextFixtureAnyLeague() {
        for (const mode of GAME_MODES) {
            const fixture = this.getNextUserFixture(mode);
            if (fixture) return { mode, fixture };
        }
        return null;
    }

    // Get opponent ID from a user fixture
    getOpponentId(fixture) {
        return fixture.home === 'player' ? fixture.away : fixture.home;
    }

    // Record a match result (called after user plays a career match)
    recordMatchResult(mode, opponentId, userWon, userFrames, opponentFrames, gameInfo) {
        if (!this.state) return;

        const sd = this.state.leagues[mode].seasonData;
        if (!sd) return;

        // Find and update the fixture
        const fixture = sd.fixtures.find(f =>
            !f.played &&
            ((f.home === 'player' && f.away === opponentId) ||
             (f.away === 'player' && f.home === opponentId))
        );

        if (!fixture) return;

        const winner = userWon ? 'player' : opponentId;
        const loser = userWon ? opponentId : 'player';

        fixture.played = true;
        fixture.result = {
            winner,
            loser,
            frames: userWon ? [userFrames, opponentFrames] : [opponentFrames, userFrames],
            bestOf: this.getBestOf(mode)
        };

        // Update ELO
        const playerElo = this.state.playerElo;
        const oppElo = this.state.aiElo[opponentId] || 1500;

        this.state.playerElo = calculateElo(playerElo, oppElo, userWon);
        this.state.aiElo[opponentId] = calculateElo(oppElo, playerElo, !userWon);

        // Update stats
        if (userWon) {
            this.state.stats.totalWins++;
        } else {
            this.state.stats.totalLosses++;
        }

        // Update match history (keep last 20)
        this.state.matchHistory.unshift({
            mode,
            opponentId,
            userWon,
            userFrames,
            opponentFrames,
            date: Date.now(),
            eloChange: this.state.playerElo - playerElo
        });
        if (this.state.matchHistory.length > 20) {
            this.state.matchHistory.pop();
        }

        // Update snooker highest break
        if (mode === 'snooker' && gameInfo) {
            const highBreak = gameInfo.highestBreak || 0;
            if (highBreak > this.state.stats.highestBreak) {
                this.state.stats.highestBreak = highBreak;
            }
        }

        // Update standings
        this.updateStandings(mode);

        // Simulate one AI vs AI match in this league
        this.simulateNextAIMatch(mode);

        // Check if this league is complete
        this.checkLeagueComplete(mode);

        // Check if season is complete
        if (this.checkSeasonComplete()) {
            this.advanceSeason();
        }

        this.save();
    }

    updateStandings(mode) {
        const sd = this.state.leagues[mode].seasonData;
        if (!sd) return;

        // Reset standings
        for (const s of sd.standings) {
            s.played = 0;
            s.won = 0;
            s.lost = 0;
            s.points = 0;
            s.framesFor = 0;
            s.framesAgainst = 0;
            s.elo = s.id === 'player' ? this.state.playerElo : (this.state.aiElo[s.id] || 1500);
        }

        // Recalculate from fixtures
        for (const f of sd.fixtures) {
            if (!f.played || !f.result) continue;

            const winnerStanding = sd.standings.find(s => s.id === f.result.winner);
            const loserStanding = sd.standings.find(s => s.id === f.result.loser);

            if (winnerStanding) {
                winnerStanding.played++;
                winnerStanding.won++;
                winnerStanding.points += 2; // 2 points for a win
                winnerStanding.framesFor += f.result.frames[0];
                winnerStanding.framesAgainst += f.result.frames[1];
            }

            if (loserStanding) {
                loserStanding.played++;
                loserStanding.lost++;
                loserStanding.framesFor += f.result.frames[1];
                loserStanding.framesAgainst += f.result.frames[0];
            }
        }

        // Sort standings by points, then frame difference, then frames for
        sd.standings.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const aDiff = a.framesFor - a.framesAgainst;
            const bDiff = b.framesFor - b.framesAgainst;
            if (bDiff !== aDiff) return bDiff - aDiff;
            return b.framesFor - a.framesFor;
        });
    }

    simulateNextAIMatch(mode) {
        const sd = this.state.leagues[mode].seasonData;
        if (!sd) return;

        // Find next unplayed AI vs AI fixture
        const fixture = sd.fixtures.find(f =>
            !f.played && f.home !== 'player' && f.away !== 'player'
        );

        if (!fixture) return;

        const bestOf = this.getBestOf(mode);
        const eloA = this.state.aiElo[fixture.home] || 1500;
        const eloB = this.state.aiElo[fixture.away] || 1500;

        const result = simulateMatch(eloA, eloB, bestOf);

        const winner = result.aWon ? fixture.home : fixture.away;
        const loser = result.aWon ? fixture.away : fixture.home;

        fixture.played = true;
        fixture.simulated = true;
        fixture.result = {
            winner,
            loser,
            frames: [result.winnerFrames, result.loserFrames],
            bestOf
        };

        // Update AI ELOs
        this.state.aiElo[fixture.home] = calculateElo(eloA, eloB, result.aWon);
        this.state.aiElo[fixture.away] = calculateElo(eloB, eloA, !result.aWon);

        // Recalculate standings
        this.updateStandings(mode);
    }

    checkLeagueComplete(mode) {
        const sd = this.state.leagues[mode].seasonData;
        if (!sd) return;

        const allPlayed = sd.fixtures.every(f => f.played);
        if (allPlayed) {
            sd.complete = true;

            // Check if user won the league (1st place)
            if (sd.standings[0].id === 'player') {
                const division = this.state.leagues[mode].division;
                this.state.stats.leaguesWon++;

                // Fire league champion achievement via callback
                if (this.onLeagueAchievement) {
                    this.onLeagueAchievement(`league_${division}_${mode}`);
                }

                // If lower division, promote
                if (division === 'lower') {
                    this.state.leagues[mode].division = 'upper';

                    // Fire first promotion achievement via callback
                    if (this.onLeagueAchievement) {
                        this.onLeagueAchievement('promotion_first');
                    }
                }
            }
        }
    }

    checkSeasonComplete() {
        return GAME_MODES.every(mode => {
            const sd = this.state.leagues[mode].seasonData;
            return sd && sd.complete;
        });
    }

    advanceSeason() {
        this.state.season++;

        // Fire season complete achievement via callback
        if (this.onLeagueAchievement) {
            this.onLeagueAchievement('season_complete');

            // Check if all leagues are upper
            const allUpper = GAME_MODES.every(m => this.state.leagues[m].division === 'upper');
            if (allUpper) {
                this.onLeagueAchievement('all_upper');
            }

            // Check grand champion (all 4 upper leagues won)
            const achievements = this._loadAchievements();
            const allUpperWon = GAME_MODES.every(m => {
                return achievements.some(a => a.id === `league_upper_${m}`);
            });
            if (allUpperWon) {
                this.onLeagueAchievement('grand_champion');
            }
        }

        // Generate new season fixtures
        this.generateSeason();
        this.save();
    }

    // Get persona display name
    getDisplayName(id) {
        if (id === 'player') return this.state?.playerName || 'Player';
        const persona = AI_PERSONAS.find(p => p.id === id);
        return persona ? persona.name : id;
    }

    // Get persona info
    getPersonaInfo(id) {
        if (id === 'player') {
            return {
                id: 'player',
                name: this.state?.playerName || 'Player',
                color: '#FFFFFF',
                initial: (this.state?.playerName || 'P')[0].toUpperCase(),
                elo: this.state?.playerElo || 1500
            };
        }
        const persona = AI_PERSONAS.find(p => p.id === id);
        if (!persona) return null;
        return {
            ...persona,
            elo: this.state?.aiElo[id] || persona.elo || 1500
        };
    }

    // Get ELO for any player
    getElo(id) {
        if (id === 'player') return this.state?.playerElo || 1500;
        return this.state?.aiElo[id] || 1500;
    }

    // Save/Load
    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch (e) {
            console.warn('Failed to save career:', e);
        }
    }

    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data && data.version === 1) {
                    // Migrate: move any legacy achievements from career state to single store
                    if (data.achievements && Array.isArray(data.achievements) && data.achievements.length > 0) {
                        this._mergeAchievements(data.achievements);
                        delete data.achievements;
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                    }
                    this.state = data;
                    return true;
                }
            }
        } catch (e) {
            console.warn('Failed to load career:', e);
        }
        this.state = null;
        return false;
    }

    // Export to JSON file (includes achievements, custom balls & tables)
    exportToFile() {
        if (!this.state) return;
        const exportData = {
            career: this.state,
            achievements: this._loadAchievements(),
            customBallSets: this._loadJSON('poolGame_customBallSets'),
            deletedDefaultBallSets: this._loadJSON('poolGame_deletedDefaultBallSets'),
            customTables: this._loadJSON('poolGame_customTables')
        };
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `career-save-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Import from JSON (supports old and new formats)
    importFromFile(json) {
        try {
            const data = JSON.parse(json);

            // New format: { career: {...}, achievements: [...] }
            if (data.career && data.career.version === 1) {
                this.state = data.career;
                // Remove legacy achievements array from career state if present
                delete this.state.achievements;
                this.save();
                // Restore achievements to single store, merging with existing
                if (data.achievements || data.standaloneAchievements) {
                    const imported = data.achievements || data.standaloneAchievements;
                    this._mergeAchievements(imported);
                }
                // Migrate any achievements from old career state format
                if (data.career.achievements && Array.isArray(data.career.achievements)) {
                    this._mergeAchievements(data.career.achievements);
                }
                // Restore custom ball sets and tables
                this._restoreCustomData(data);
                return true;
            }

            // Old format: direct career state object
            if (data && data.version === 1) {
                // Migrate achievements from career state to single store
                const careerAchievements = data.achievements || [];
                delete data.achievements;
                this.state = data;
                this.save();
                if (careerAchievements.length > 0) {
                    this._mergeAchievements(careerAchievements);
                }
                return true;
            }

            throw new Error('Invalid career save file');
        } catch (e) {
            console.warn('Failed to import career:', e);
            return false;
        }
    }

    // Load achievements from the single localStorage store
    _loadAchievements() {
        return this._loadJSON('poolGame_achievements');
    }

    // Load a JSON array from localStorage (returns [] on failure)
    _loadJSON(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    // Restore custom ball sets and tables from import data
    _restoreCustomData(data) {
        if (data.customBallSets) {
            localStorage.setItem('poolGame_customBallSets', JSON.stringify(data.customBallSets));
        }
        if (data.deletedDefaultBallSets) {
            localStorage.setItem('poolGame_deletedDefaultBallSets', JSON.stringify(data.deletedDefaultBallSets));
        }
        if (data.customTables) {
            localStorage.setItem('poolGame_customTables', JSON.stringify(data.customTables));
        }
    }

    // Merge imported achievements into the single store (no duplicates)
    _mergeAchievements(imported) {
        try {
            const existing = this._loadAchievements();
            for (const a of imported) {
                if (!existing.some(e => e.id === a.id)) {
                    existing.push(a);
                }
            }
            localStorage.setItem('poolGame_achievements', JSON.stringify(existing));
        } catch (e) {
            console.warn('Failed to merge achievements:', e);
        }
    }

    // Delete career
    deleteCareer() {
        this.state = null;
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('Failed to delete career:', e);
        }
    }

    // Update player name
    setPlayerName(name) {
        if (!this.state) return;
        this.state.playerName = name;
        this.save();
    }
}

export { ACHIEVEMENTS, GAME_MODES, MODE_LABELS };
