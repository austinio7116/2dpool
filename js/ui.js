// UI system - handles menus, HUD, and game state display

import { GameMode, GameState } from './game.js';

export class UI {
    constructor() {
        // Get UI elements
        this.mainMenu = document.getElementById('main-menu');
        this.gameHud = document.getElementById('game-hud');
        this.gameOverScreen = document.getElementById('game-over');
        this.freeplayControls = document.getElementById('freeplay-controls');

        // HUD elements
        this.playerIndicator = document.getElementById('player-indicator');
        this.ballGroups = document.getElementById('ball-groups');
        this.foulIndicator = document.getElementById('foul-indicator');
        this.gameMessage = document.getElementById('game-message');
        this.winnerText = document.getElementById('winner-text');

        // Buttons
        this.btn8Ball = document.getElementById('btn-8ball');
        this.btnUK8Ball = document.getElementById('btn-uk8ball');
        this.btn9Ball = document.getElementById('btn-9ball');
        this.btnFreePlay = document.getElementById('btn-freeplay');
        this.btnPlayAgain = document.getElementById('btn-play-again');
        this.btnMainMenu = document.getElementById('btn-main-menu');
        this.btnRerack = document.getElementById('btn-rerack');
        this.btnExitFreeplay = document.getElementById('btn-exit-freeplay');
        this.soundToggle = document.getElementById('sound-toggle');
        this.speedSlider = document.getElementById('speed-slider');
        this.speedValue = document.getElementById('speed-value');
        this.tableSelect = document.getElementById('table-select');
        this.btnFullscreen = document.getElementById('btn-fullscreen');
        this.ukColorScheme = document.getElementById('uk-color-scheme');

        // Callbacks
        this.onGameStart = null;
        this.onPlayAgain = null;
        this.onMainMenu = null;
        this.onRerack = null;
        this.onSoundToggle = null;
        this.onSpeedChange = null;
        this.onTableChange = null;

        // Current game mode
        this.currentMode = null;

        // Bind button events
        this.bindEvents();
    }

    bindEvents() {
        this.btn8Ball.addEventListener('click', () => {
            if (this.onGameStart) {
                this.onGameStart(GameMode.EIGHT_BALL);
            }
        });

        this.btn9Ball.addEventListener('click', () => {
            if (this.onGameStart) {
                this.onGameStart(GameMode.NINE_BALL);
            }
        });

        this.btnUK8Ball.addEventListener('click', () => {
            if (this.onGameStart) {
                const colorScheme = this.ukColorScheme.value;
                this.onGameStart(GameMode.UK_EIGHT_BALL, { colorScheme });
            }
        });

        this.btnFreePlay.addEventListener('click', () => {
            if (this.onGameStart) {
                this.onGameStart(GameMode.FREE_PLAY);
            }
        });

        this.btnPlayAgain.addEventListener('click', () => {
            if (this.onPlayAgain) {
                this.onPlayAgain();
            }
        });

        this.btnMainMenu.addEventListener('click', () => {
            if (this.onMainMenu) {
                this.onMainMenu();
            }
        });

        this.btnRerack.addEventListener('click', () => {
            if (this.onRerack) {
                this.onRerack();
            }
        });

        this.btnExitFreeplay.addEventListener('click', () => {
            if (this.onMainMenu) {
                this.onMainMenu();
            }
        });

        this.soundToggle.addEventListener('change', () => {
            if (this.onSoundToggle) {
                this.onSoundToggle(this.soundToggle.checked);
            }
        });

        this.speedSlider.addEventListener('input', () => {
            const speed = parseFloat(this.speedSlider.value);
            this.speedValue.textContent = speed.toFixed(1) + 'x';
            if (this.onSpeedChange) {
                this.onSpeedChange(speed);
            }
        });

        this.tableSelect.addEventListener('change', () => {
            const tableNum = parseInt(this.tableSelect.value);
            if (this.onTableChange) {
                this.onTableChange(tableNum);
            }
        });

        // Fullscreen buttons for mobile
        if (this.btnFullscreen) {
            this.btnFullscreen.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }

        const btnFullscreenFloat = document.getElementById('btn-fullscreen-float');
        if (btnFullscreenFloat) {
            btnFullscreenFloat.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }

        // Set initial display value
        this.speedValue.textContent = this.speedSlider.value + 'x';
    }

    // Toggle fullscreen mode
    toggleFullscreen() {
        const elem = document.documentElement;

        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            // Enter fullscreen
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }

            // Lock orientation to landscape if supported
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {
                    // Orientation lock not supported or failed
                });
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    // Show main menu
    showMainMenu() {
        this.mainMenu.classList.remove('hidden');
        this.gameHud.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.freeplayControls.classList.add('hidden');
        this.currentMode = null;
    }

    // Show game HUD
    showGameHUD(mode) {
        this.mainMenu.classList.add('hidden');
        this.gameHud.classList.remove('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.currentMode = mode;

        if (mode === GameMode.FREE_PLAY) {
            this.freeplayControls.classList.remove('hidden');
            this.playerIndicator.textContent = 'Free Play';
            this.ballGroups.innerHTML = '';
        } else {
            this.freeplayControls.classList.add('hidden');
            this.updatePlayerIndicator(1);
        }

        this.hideMessage();
        this.hideFoul();
    }

    // Show game over screen
    showGameOver(winner, reason) {
        this.gameOverScreen.classList.remove('hidden');
        this.freeplayControls.classList.add('hidden');

        if (winner) {
            this.winnerText.textContent = `Player ${winner} Wins!`;
            this.winnerText.style.color = '#ffd700';
        } else {
            this.winnerText.textContent = reason || 'Game Over';
            this.winnerText.style.color = '#fff';
        }
    }

    // Update player indicator
    updatePlayerIndicator(player, group = null, gameInfo = null) {
        if (this.currentMode === GameMode.FREE_PLAY) return;

        let text = `Player ${player}'s Turn`;

        if (this.currentMode === GameMode.EIGHT_BALL && group) {
            text += ` (${group === 'solid' ? 'Solids' : 'Stripes'})`;
        } else if (this.currentMode === GameMode.UK_EIGHT_BALL && group && gameInfo) {
            const colorName = this.getUKGroupName(group, gameInfo.ukColorScheme);
            text += ` (${colorName})`;
            // Show shots remaining if using two-shot rule
            if (gameInfo.shotsRemaining > 1) {
                text += ` - ${gameInfo.shotsRemaining} shots`;
            }
        } else if (this.currentMode === GameMode.NINE_BALL) {
            // Will be updated with lowest ball info
        }

        this.playerIndicator.textContent = text;
    }

    // Get the display name for a UK 8-ball group
    getUKGroupName(group, colorScheme) {
        if (colorScheme === 'red-yellow') {
            return group === 'group1' ? 'Reds' : 'Yellows';
        } else {
            return group === 'group1' ? 'Blues' : 'Yellows';
        }
    }

    // Update ball groups display (8-ball)
    updateBallGroups(player1Group, player2Group, remaining) {
        if (this.currentMode !== GameMode.EIGHT_BALL) {
            this.ballGroups.innerHTML = '';
            return;
        }

        this.ballGroups.innerHTML = '';

        if (!player1Group) {
            // Groups not yet assigned
            return;
        }

        // Player 1 group
        const p1Div = document.createElement('div');
        p1Div.className = 'ball-group';
        p1Div.innerHTML = `
            <div class="mini-ball ${player1Group}"></div>
            <span>P1: ${player1Group === 'solid' ? remaining.solids : remaining.stripes}</span>
        `;

        // Player 2 group
        const p2Div = document.createElement('div');
        p2Div.className = 'ball-group';
        p2Div.innerHTML = `
            <div class="mini-ball ${player2Group}"></div>
            <span>P2: ${player2Group === 'solid' ? remaining.solids : remaining.stripes}</span>
        `;

        this.ballGroups.appendChild(p1Div);
        this.ballGroups.appendChild(p2Div);
    }

    // Update 9-ball lowest ball indicator
    updateLowestBall(lowestBall) {
        if (this.currentMode !== GameMode.NINE_BALL) return;

        this.ballGroups.innerHTML = `
            <div class="ball-group">
                <span>Target: ${lowestBall}-Ball</span>
            </div>
        `;
    }

    // Update ball groups display for UK 8-ball
    updateUKBallGroups(player1Group, player2Group, remaining, colorScheme) {
        if (this.currentMode !== GameMode.UK_EIGHT_BALL) {
            return;
        }

        this.ballGroups.innerHTML = '';

        if (!player1Group) {
            // Groups not yet assigned
            return;
        }

        // Determine CSS class based on color scheme and group
        const getColorClass = (group) => {
            if (colorScheme === 'red-yellow') {
                return group === 'group1' ? 'uk-red' : 'uk-yellow';
            } else {
                return group === 'group1' ? 'uk-blue' : 'uk-yellow';
            }
        };

        const p1ColorClass = getColorClass(player1Group);
        const p2ColorClass = getColorClass(player2Group);
        const p1Name = this.getUKGroupName(player1Group, colorScheme);
        const p2Name = this.getUKGroupName(player2Group, colorScheme);
        const p1Count = player1Group === 'group1' ? remaining.group1 : remaining.group2;
        const p2Count = player2Group === 'group1' ? remaining.group1 : remaining.group2;

        // Player 1 group
        const p1Div = document.createElement('div');
        p1Div.className = 'ball-group';
        p1Div.innerHTML = `
            <div class="mini-ball ${p1ColorClass}"></div>
            <span>P1 (${p1Name}): ${p1Count}</span>
        `;

        // Player 2 group
        const p2Div = document.createElement('div');
        p2Div.className = 'ball-group';
        p2Div.innerHTML = `
            <div class="mini-ball ${p2ColorClass}"></div>
            <span>P2 (${p2Name}): ${p2Count}</span>
        `;

        this.ballGroups.appendChild(p1Div);
        this.ballGroups.appendChild(p2Div);
    }

    // Show foul indicator
    showFoul(reason) {
        this.foulIndicator.classList.remove('hidden');
        this.foulIndicator.textContent = 'FOUL';

        // Show reason as message
        this.showMessage(reason, 3000);

        // Auto-hide foul indicator after delay
        setTimeout(() => {
            this.hideFoul();
        }, 2000);
    }

    // Hide foul indicator
    hideFoul() {
        this.foulIndicator.classList.add('hidden');
    }

    // Show a message
    showMessage(text, duration = 0) {
        this.gameMessage.textContent = text;
        this.gameMessage.style.display = 'block';

        if (duration > 0) {
            setTimeout(() => {
                this.hideMessage();
            }, duration);
        }
    }

    // Hide message
    hideMessage() {
        this.gameMessage.style.display = 'none';
    }

    // Update UI based on game state
    updateFromGameInfo(info) {
        if (info.state === GameState.MENU) {
            this.showMainMenu();
            return;
        }

        if (info.state === GameState.GAME_OVER) {
            this.showGameOver(info.winner, info.gameOverReason);
            return;
        }

        // Update player indicator
        const currentGroup = info.currentPlayer === 1 ? info.player1Group : info.player2Group;
        this.updatePlayerIndicator(info.currentPlayer, currentGroup, info);

        // Update ball groups (8-ball US)
        if (info.mode === GameMode.EIGHT_BALL) {
            this.updateBallGroups(info.player1Group, info.player2Group, info.remaining);
        }

        // Update ball groups (UK 8-ball)
        if (info.mode === GameMode.UK_EIGHT_BALL) {
            this.updateUKBallGroups(info.player1Group, info.player2Group, info.remainingUK, info.ukColorScheme);
        }

        // Update lowest ball (9-ball)
        if (info.mode === GameMode.NINE_BALL) {
            this.updateLowestBall(info.lowestBall);
        }

        // Ball in hand message
        if (info.state === GameState.BALL_IN_HAND) {
            let message = 'Ball in hand - Click anywhere to place';
            if (info.mode === GameMode.UK_EIGHT_BALL && info.twoShotRule) {
                message += ` (2-shot rule: ${info.shotsRemaining} remaining)`;
            }
            this.showMessage(message);
        } else {
            this.hideMessage();
        }
    }

    // Get sound enabled state
    isSoundEnabled() {
        return this.soundToggle.checked;
    }
}
