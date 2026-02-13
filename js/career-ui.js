// Career Mode UI - Modal rendering, tab navigation, event binding

import { Career, ACHIEVEMENTS, GAME_MODES, MODE_LABELS } from './career.js';
import { AI_PERSONAS, getPersonaById } from './ai-personas.js';

export class CareerUI {
    constructor(career) {
        this.career = career;
        this.onPlayMatch = null; // callback: (mode, opponentId, bestOf) => void

        // Cache DOM elements
        this.modal = document.getElementById('career-modal');
        this.closeBtn = document.getElementById('close-career-modal');
        this.btnCareer = document.getElementById('btn-career');
        this.activeTab = 'dashboard';
        this.activeLeagueMode = '8ball';

        this.bindEvents();

        // Achievement notification callback
        this.career.onAchievementUnlocked = (def) => this.showAchievementNotification(def);
    }

    bindEvents() {
        // Open career modal
        if (this.btnCareer) {
            this.btnCareer.addEventListener('click', () => this.open());
        }

        // Close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
        }

        // Close on backdrop click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.hide();
            });
        }

        // Tab switching
        if (this.modal) {
            this.modal.querySelectorAll('.career-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    this.switchTab(tab.dataset.careerTab);
                });
            });
        }
    }

    open() {
        if (!this.career.isActive()) {
            this.showNewCareerDialog();
            return;
        }
        this.show();
    }

    show() {
        if (!this.modal) return;
        this.modal.classList.remove('hidden');
        this.preloadTrophyImages();
        this.renderActiveTab();
    }

    preloadTrophyImages() {
        if (this._trophiesPreloaded) return;
        this._trophiesPreloaded = true;

        const trophyFiles = [
            ...AI_PERSONAS.map(p => `beat_${p.id}`),
            'win_8ball', 'win_uk8ball', 'win_9ball', 'win_snooker',
            'league_lower', 'league_upper',
            'promotion_first', 'snooker_break_30', 'snooker_break_50',
            'snooker_century', 'clean_sweep', 'season_complete',
            'all_upper', 'grand_champion'
        ];
        for (const name of trophyFiles) {
            const img = new Image();
            img.src = `assets/trophies/${name}.png`;
        }
    }

    hide() {
        if (!this.modal) return;
        this.modal.classList.add('hidden');
    }

    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        this.modal.querySelectorAll('.career-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.careerTab === tabName);
        });

        // Update tab panels
        this.modal.querySelectorAll('.career-tab-panel').forEach(p => {
            p.classList.toggle('active', p.dataset.careerPanel === tabName);
        });

        this.renderActiveTab();
    }

    renderActiveTab() {
        switch (this.activeTab) {
            case 'dashboard': this.renderDashboard(); break;
            case 'leagues': this.renderLeagues(); break;
            case 'fixtures': this.renderFixtures(); break;
            case 'achievements': this.renderAchievements(); break;
            case 'profile': this.renderProfile(); break;
        }
    }

    // ─── Dashboard ──────────────────────────────────────────────────

    renderDashboard() {
        const panel = document.getElementById('career-dashboard');
        if (!panel) return;
        const state = this.career.getState();
        if (!state) return;

        let html = `<div class="career-dashboard">`;

        // Header
        html += `<div class="career-header">
            <h3>Season ${state.season}</h3>
            <div class="career-elo">ELO: <strong>${state.playerElo}</strong></div>
        </div>`;

        // Mini league tables (2x2 grid)
        html += `<div class="career-mini-leagues">`;
        for (const mode of GAME_MODES) {
            const league = state.leagues[mode];
            const sd = league.seasonData;
            if (!sd) continue;

            const divLabel = league.division === 'upper' ? 'Upper' : 'Lower';
            html += `<div class="career-mini-league">
                <div class="mini-league-header">
                    <span class="mini-league-title">${MODE_LABELS[mode]}</span>
                    <span class="mini-league-div ${league.division}">${divLabel}</span>
                    ${sd.complete ? '<span class="mini-league-complete">Complete</span>' : ''}
                </div>
                <table class="mini-league-table">
                    <thead><tr><th>#</th><th>Player</th><th>P</th><th>Pts</th></tr></thead>
                    <tbody>`;

            // Show top 3 + user if not in top 3
            const userIdx = sd.standings.findIndex(s => s.id === 'player');
            const shown = new Set();

            for (let i = 0; i < Math.min(3, sd.standings.length); i++) {
                const s = sd.standings[i];
                const isUser = s.id === 'player';
                shown.add(i);
                html += `<tr class="${isUser ? 'career-user-row' : ''}">
                    <td>${i + 1}</td>
                    <td>${this.career.getDisplayName(s.id)}</td>
                    <td>${s.played}</td>
                    <td>${s.points}</td>
                </tr>`;
            }

            if (userIdx >= 3) {
                html += `<tr class="career-ellipsis"><td colspan="4">...</td></tr>`;
                const s = sd.standings[userIdx];
                html += `<tr class="career-user-row">
                    <td>${userIdx + 1}</td>
                    <td>${this.career.getDisplayName(s.id)}</td>
                    <td>${s.played}</td>
                    <td>${s.points}</td>
                </tr>`;
            }

            html += `</tbody></table></div>`;
        }
        html += `</div>`;

        // Next match
        const next = this.career.getNextFixtureAnyLeague();
        if (next) {
            const oppId = this.career.getOpponentId(next.fixture);
            const persona = this.career.getPersonaInfo(oppId);
            const bestOf = this.career.getBestOf(next.mode);
            html += `<div class="career-next-match">
                <h4>Next Match</h4>
                <div class="next-match-info">
                    <div class="next-match-mode">${MODE_LABELS[next.mode]}</div>
                    <div class="next-match-opponent">
                        <div class="persona-avatar-mini" style="background:url(assets/avatars/${persona?.initial}.png) center center / cover;"></div>
                        <span>${persona?.name || oppId}</span>
                        <span class="opponent-elo">(${persona?.elo || '?'})</span>
                    </div>
                    <div class="next-match-format">Best of ${bestOf}</div>
                    <button class="career-play-btn" data-mode="${next.mode}" data-opponent="${oppId}" data-bestof="${bestOf}">Play</button>
                </div>
            </div>`;
        } else if (this.career.checkSeasonComplete()) {
            html += `<div class="career-season-complete">
                <h4>Season Complete!</h4>
                <p>All leagues finished. A new season will begin.</p>
            </div>`;
        }

        html += `</div>`;
        panel.innerHTML = html;

        // Bind play button
        panel.querySelectorAll('.career-play-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                const opponent = btn.dataset.opponent;
                const bestOf = parseInt(btn.dataset.bestof);
                if (this.onPlayMatch) {
                    this.onPlayMatch(mode, opponent, bestOf);
                }
            });
        });
    }

    // ─── Leagues ────────────────────────────────────────────────────

    renderLeagues() {
        const panel = document.getElementById('career-leagues');
        if (!panel) return;
        const state = this.career.getState();
        if (!state) return;

        let html = `<div class="career-leagues">`;

        // Mode sub-tabs
        html += `<div class="league-mode-tabs">`;
        for (const mode of GAME_MODES) {
            const active = mode === this.activeLeagueMode ? 'active' : '';
            html += `<button class="league-mode-tab ${active}" data-league-mode="${mode}">${MODE_LABELS[mode]}</button>`;
        }
        html += `</div>`;

        // Full standings for active mode
        const league = state.leagues[this.activeLeagueMode];
        const sd = league?.seasonData;
        if (sd) {
            const divLabel = league.division === 'upper' ? 'Upper Division' : 'Lower Division';
            html += `<div class="league-division-badge ${league.division}">${divLabel}</div>`;

            html += `<table class="league-table">
                <thead><tr>
                    <th>Pos</th><th>Player</th><th>P</th><th>W</th><th>L</th>
                    <th>Pts</th><th>F+</th><th>F-</th><th>ELO</th>
                </tr></thead><tbody>`;

            sd.standings.forEach((s, i) => {
                const isUser = s.id === 'player';
                html += `<tr class="${isUser ? 'career-user-row' : ''}">
                    <td>${i + 1}</td>
                    <td>${this.career.getDisplayName(s.id)}</td>
                    <td>${s.played}</td>
                    <td>${s.won}</td>
                    <td>${s.lost}</td>
                    <td><strong>${s.points}</strong></td>
                    <td>${s.framesFor}</td>
                    <td>${s.framesAgainst}</td>
                    <td>${s.elo}</td>
                </tr>`;
            });

            html += `</tbody></table>`;
        }

        html += `</div>`;
        panel.innerHTML = html;

        // Bind mode tabs
        panel.querySelectorAll('.league-mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeLeagueMode = tab.dataset.leagueMode;
                this.renderLeagues();
            });
        });
    }

    // ─── Fixtures ───────────────────────────────────────────────────

    renderFixtures() {
        const panel = document.getElementById('career-fixtures');
        if (!panel) return;
        const state = this.career.getState();
        if (!state) return;

        let html = `<div class="career-fixtures">`;

        for (const mode of GAME_MODES) {
            const sd = state.leagues[mode].seasonData;
            if (!sd) continue;

            const userFixtures = sd.fixtures.filter(f =>
                f.home === 'player' || f.away === 'player'
            );

            html += `<div class="fixture-mode-group">
                <h4>${MODE_LABELS[mode]} <span class="fixture-div">${state.leagues[mode].division === 'upper' ? 'Upper' : 'Lower'}</span></h4>`;

            const bestOf = this.career.getBestOf(mode);

            for (const f of userFixtures) {
                const oppId = this.career.getOpponentId(f);
                const persona = this.career.getPersonaInfo(oppId);

                let statusClass = 'upcoming';
                let statusText = 'Upcoming';
                let frameText = '';

                if (f.played && f.result) {
                    const userWon = f.result.winner === 'player';
                    statusClass = userWon ? 'won' : 'lost';
                    statusText = userWon ? 'Won' : 'Lost';
                    frameText = `${f.result.frames[0]}-${f.result.frames[1]}`;
                }

                html += `<div class="fixture-row ${statusClass}">
                    <div class="fixture-opponent">
                        <div class="persona-avatar-mini" style="background:url(assets/avatars/${persona?.initial}.png) center center / cover;"></div>
                        <span>${persona?.name || oppId}</span>
                    </div>
                    <div class="fixture-format">Bo${bestOf}</div>
                    <div class="fixture-result">${frameText}</div>
                    <div class="fixture-status ${statusClass}">${statusText}</div>`;

                if (!f.played) {
                    const isNext = this.career.getNextUserFixture(mode) === f;
                    if (isNext) {
                        html += `<button class="career-play-btn fixture-play-btn" data-mode="${mode}" data-opponent="${oppId}" data-bestof="${bestOf}">Play</button>`;
                    }
                }

                html += `</div>`;
            }

            html += `</div>`;
        }

        html += `</div>`;
        panel.innerHTML = html;

        // Bind play buttons
        panel.querySelectorAll('.career-play-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                const opponent = btn.dataset.opponent;
                const bestOf = parseInt(btn.dataset.bestof);
                if (this.onPlayMatch) {
                    this.onPlayMatch(mode, opponent, bestOf);
                }
            });
        });
    }

    // ─── Achievements ───────────────────────────────────────────────

    renderAchievements() {
        const panel = document.getElementById('career-achievements');
        if (!panel) return;
        const state = this.career.getState();
        if (!state) return;

        let html = `<div class="career-achievements-grid">`;

        for (const def of ACHIEVEMENTS) {
            const unlocked = state.achievements.find(a => a.id === def.id);
            const lockedClass = unlocked ? 'unlocked' : 'locked';
            const date = unlocked ? new Date(unlocked.unlockedAt).toLocaleDateString() : '';

            // 1. Determine Image Filename (handling league prefixes)
            let imageFilename = def.id;
            if (def.id.startsWith('league_lower')) imageFilename = 'league_lower';
            else if (def.id.startsWith('league_upper')) imageFilename = 'league_upper';
            const imgSrc = `assets/trophies/${imageFilename}.png`;

            // 2. Image Style: Grayscale + Dark if locked
            const imgStyle = unlocked ? '' : 'filter: grayscale(100%) brightness(40%); opacity: 0.8;';

            // 3. Icon Style: Hidden by default (display:none). 
            //    It matches the old logic (background color) if it ends up being revealed.
            const iconBg = unlocked ? def.color : '#444';
            const iconStyle = `display: none; background: ${iconBg}`;

            html += `<div class="achievement-card ${lockedClass}">
                
                <img 
                    src="${imgSrc}" 
                    class="achievement-image" 
                    style="${imgStyle}" 
                    alt="${def.name}"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display=''"
                >

                <div class="achievement-icon" style="${iconStyle}">${def.icon}</div>

                <div class="achievement-info">
                    <div class="achievement-name">${def.name}</div>
                    <div class="achievement-desc">${def.description}</div>
                    ${unlocked ? `<div class="achievement-date">${date}</div>` : ''}
                </div>
            </div>`;
        }

        html += `</div>`;
        panel.innerHTML = html;
    }

    // ─── Profile ────────────────────────────────────────────────────

    renderProfile() {
        const panel = document.getElementById('career-profile');
        if (!panel) return;
        const state = this.career.getState();
        if (!state) return;

        const achieveCount = state.achievements.length;
        const totalAchieve = ACHIEVEMENTS.length;

        let html = `<div class="career-profile">
            <div class="profile-section">
                <h4>Player</h4>
                <div class="profile-name-row">
                    <input type="text" class="profile-name-input" id="career-player-name" value="${this.escapeHtml(state.playerName)}" maxlength="20">
                    <button class="profile-save-name-btn" id="career-save-name">Save</button>
                </div>
            </div>
            <div class="profile-section">
                <h4>Stats</h4>
                <div class="profile-stats">
                    <div class="stat-item"><span class="stat-label">ELO</span><span class="stat-value">${state.playerElo}</span></div>
                    <div class="stat-item"><span class="stat-label">Season</span><span class="stat-value">${state.season}</span></div>
                    <div class="stat-item"><span class="stat-label">Wins</span><span class="stat-value">${state.stats.totalWins}</span></div>
                    <div class="stat-item"><span class="stat-label">Losses</span><span class="stat-value">${state.stats.totalLosses}</span></div>
                    <div class="stat-item"><span class="stat-label">Leagues Won</span><span class="stat-value">${state.stats.leaguesWon}</span></div>
                    <div class="stat-item"><span class="stat-label">Highest Break</span><span class="stat-value">${state.stats.highestBreak}</span></div>
                    <div class="stat-item"><span class="stat-label">Achievements</span><span class="stat-value">${achieveCount}/${totalAchieve}</span></div>
                </div>
            </div>
            <div class="profile-section">
                <h4>Recent Matches</h4>
                <div class="profile-history">`;

        if (state.matchHistory.length === 0) {
            html += `<p class="no-history">No matches played yet.</p>`;
        } else {
            for (const m of state.matchHistory.slice(0, 10)) {
                const persona = AI_PERSONAS.find(p => p.id === m.opponentId);
                const eloSign = m.eloChange >= 0 ? '+' : '';
                html += `<div class="history-row ${m.userWon ? 'won' : 'lost'}">
                    <span class="history-mode">${MODE_LABELS[m.mode] || m.mode}</span>
                    <span class="history-opponent">${persona?.name || m.opponentId}</span>
                    <span class="history-score">${m.userFrames}-${m.opponentFrames}</span>
                    <span class="history-result">${m.userWon ? 'W' : 'L'}</span>
                    <span class="history-elo">${eloSign}${m.eloChange}</span>
                </div>`;
            }
        }

        html += `</div></div>
            <div class="profile-section profile-actions">
                <h4>Data Management</h4>
                <div class="profile-buttons">
                    <button class="career-action-btn" id="career-export">Export Save</button>
                    <button class="career-action-btn" id="career-import">Import Save</button>
                    <input type="file" id="career-import-input" accept=".json" style="display:none">
                    <button class="career-action-btn career-danger-btn" id="career-delete">New Career</button>
                </div>
            </div>
        </div>`;

        panel.innerHTML = html;

        // Bind profile events
        const saveNameBtn = document.getElementById('career-save-name');
        const nameInput = document.getElementById('career-player-name');
        if (saveNameBtn && nameInput) {
            saveNameBtn.addEventListener('click', () => {
                const name = nameInput.value.trim();
                if (name) {
                    this.career.setPlayerName(name);
                    this.renderActiveTab();
                }
            });
        }

        const exportBtn = document.getElementById('career-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.career.exportToFile());
        }

        const importBtn = document.getElementById('career-import');
        const importInput = document.getElementById('career-import-input');
        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (this.career.importFromFile(ev.target.result)) {
                        this.renderActiveTab();
                    }
                };
                reader.readAsText(file);
                importInput.value = '';
            });
        }

        const deleteBtn = document.getElementById('career-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm('Start a new career? This will delete your current progress.')) {
                    this.career.deleteCareer();
                    this.hide();
                    this.showNewCareerDialog();
                }
            });
        }
    }

    // ─── New Career Dialog ──────────────────────────────────────────

    showNewCareerDialog() {
        if (!this.modal) return;
        this.modal.classList.remove('hidden');

        // Hide tabs, show name entry
        const tabPanels = this.modal.querySelector('.career-tab-panels');
        const tabs = this.modal.querySelector('.career-tabs');
        if (tabs) tabs.style.display = 'none';

        if (tabPanels) {
            tabPanels.innerHTML = `
                <div class="career-new-dialog">
                    <h3>Start Career Mode</h3>
                    <p>Enter your name and begin your journey through the leagues.</p>
                    <div class="career-name-entry">
                        <label for="career-new-name">Player Name</label>
                        <input type="text" id="career-new-name" placeholder="Your Name" maxlength="20" autofocus>
                    </div>
                    <div class="career-new-info">
                        <p>You'll compete in 4 leagues (8-Ball, UK 8-Ball, 9-Ball, Snooker) starting in the lower division.</p>
                        <p>Win your league to get promoted to the upper division!</p>
                    </div>
                    <button class="career-start-btn" id="career-start-btn">Start Career</button>
                </div>`;

            const startBtn = document.getElementById('career-start-btn');
            const nameInput = document.getElementById('career-new-name');

            if (startBtn) {
                startBtn.addEventListener('click', () => {
                    const name = nameInput?.value.trim() || 'Player';
                    this.career.newCareer(name);
                    // Restore tabs and rebuild panel divs (destroyed by innerHTML override)
                    if (tabs) tabs.style.display = '';
                    tabPanels.innerHTML = `
                        <div class="career-tab-panel active" data-career-panel="dashboard" id="career-dashboard"></div>
                        <div class="career-tab-panel" data-career-panel="leagues" id="career-leagues"></div>
                        <div class="career-tab-panel" data-career-panel="fixtures" id="career-fixtures"></div>
                        <div class="career-tab-panel" data-career-panel="achievements" id="career-achievements"></div>
                        <div class="career-tab-panel" data-career-panel="profile" id="career-profile"></div>`;
                    this.switchTab('dashboard');
                });
            }

            // Enter key to start
            if (nameInput) {
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') startBtn?.click();
                });
            }
        }
    }

    // ─── Achievement Notification ───────────────────────────────────

    showAchievementNotification(def) {
        const notif = document.createElement('div');
        notif.className = 'career-achievement-notif';
        notif.innerHTML = `
            <div class="achievement-notif-icon" style="background:${def.color}">${def.icon}</div>
            <div class="achievement-notif-text">
                <div class="achievement-notif-title">Achievement Unlocked!</div>
                <div class="achievement-notif-name">${def.name}</div>
            </div>`;
        document.body.appendChild(notif);

        // Animate in
        requestAnimationFrame(() => notif.classList.add('show'));

        // Remove after 4s
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 500);
        }, 4000);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
