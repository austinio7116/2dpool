// UI system - handles menus, HUD, and game state display

import { GameMode, GameState } from './game.js';
import { CustomBallSetManager, PREDEFINED_BALL_SETS } from './custom-ball-sets.js';
import { CustomTableManager } from './custom-tables.js';
import { BallRenderer3D } from './ball-renderer-3d.js';
import { Constants } from './utils.js';

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

        // Snooker HUD elements
        this.snookerHud = document.getElementById('snooker-hud');
        this.snookerScoreDisplay = document.getElementById('snooker-score');
        this.snookerBreakDisplay = document.getElementById('snooker-break');
        this.snookerTargetDisplay = document.getElementById('snooker-target');

        // New unified HUD elements
        this.hudInfoPanel = document.getElementById('hud-info-panel');
        this.hudPlayersPanel = document.getElementById('hud-players-panel');
        this.hudModeName = document.getElementById('hud-mode-name');
        this.hudTurnIndicator = document.getElementById('hud-turn-indicator');
        this.hudTwoShot = document.getElementById('hud-two-shot');
        this.hudSnookerBreak = document.getElementById('hud-snooker-break');
        this.hudSnookerTarget = document.getElementById('hud-snooker-target');
        this.hudPlayer1 = document.getElementById('hud-player-1');
        this.hudPlayer2 = document.getElementById('hud-player-2');
        this.p1BallGroup = document.getElementById('p1-ball-group');
        this.p2BallGroup = document.getElementById('p2-ball-group');
        this.p1PointScore = document.getElementById('p1-point-score');
        this.p2PointScore = document.getElementById('p2-point-score');
        this.hudScores = document.getElementById('hud-scores');
        this.p1Frames = document.getElementById('p1-frames');
        this.p2Frames = document.getElementById('p2-frames');
        this.scoreBestof = document.getElementById('score-bestof');

        // Match format elements
        this.matchFormatSelect = document.getElementById('match-format');
        this.btnResumeMatch = document.getElementById('btn-resume-match');
        this.resumeInfo = this.btnResumeMatch?.querySelector('.resume-info');

        // Frame score display (game over)
        this.frameScoreDisplay = document.getElementById('frame-score-display');
        this.frameP1Score = document.getElementById('frame-p1-score');
        this.frameP2Score = document.getElementById('frame-p2-score');
        this.btnNextFrame = document.getElementById('btn-next-frame');

        // Buttons
        this.btn8Ball = document.getElementById('btn-8ball');
        this.btnUK8Ball = document.getElementById('btn-uk8ball');
        this.btn9Ball = document.getElementById('btn-9ball');
        this.btnSnooker = document.getElementById('btn-snooker');
        this.btnFreePlay = document.getElementById('btn-freeplay');
        this.btnPlayAgain = document.getElementById('btn-play-again');
        this.btnMainMenu = document.getElementById('btn-main-menu');
        this.btnRerack = document.getElementById('btn-rerack');
        this.btnExitFreeplay = document.getElementById('btn-exit-freeplay');
        this.btnGameMenu = document.getElementById('btn-game-menu');
        this.gameMenuDropdown = document.getElementById('game-menu-dropdown');
        this.btnQuitGame = document.getElementById('btn-quit-game');
        this.soundToggle = document.getElementById('sound-toggle');
        this.speedSlider = document.getElementById('speed-slider');
        this.speedValue = document.getElementById('speed-value');
        this.tableSelect = document.getElementById('table-select');
        this.btnFullscreen = document.getElementById('btn-fullscreen');
        this.ukColorScheme = document.getElementById('uk-color-scheme');

        // Modal elements
        this.tableModal = document.getElementById('table-modal');
        this.ballModal = document.getElementById('ball-modal');
        this.creatorModal = document.getElementById('creator-modal');
        this.tableCreatorModal = document.getElementById('table-creator-modal');
        this.tableGrid = document.getElementById('table-grid');
        this.ballSetGrid = document.getElementById('ball-set-grid');

        // Card elements
        this.tablePreview = document.getElementById('table-preview');
        this.tableName = document.getElementById('table-name');
        this.ballSetPreview = document.getElementById('ball-set-preview');
        this.ballSetName = document.getElementById('ball-set-name');

        // Creator elements
        this.customSetNameInput = document.getElementById('custom-set-name');
        this.styleSolidBtn = document.getElementById('style-solid');
        this.styleStripeBtn = document.getElementById('style-stripe');
        this.creatorPreviewBalls = document.getElementById('creator-preview-balls');

        // Solid mode elements
        this.solidOptions = document.getElementById('solid-options');
        this.colorGroup1 = document.getElementById('color-group1');
        this.colorGroup2 = document.getElementById('color-group2');
        this.color8Ball = document.getElementById('color-8ball');
        this.striped8BallCheckbox = document.getElementById('striped-8ball');
        this.striped8BallStripeCheckbox = document.getElementById('striped-8ball-stripe');

        // Stripe mode elements
        this.stripeModeOptions = document.getElementById('stripe-mode-options');
        this.simpleColorPickers = document.getElementById('simple-color-pickers');
        this.colorSolids = document.getElementById('color-solids');
        this.colorStripes = document.getElementById('color-stripes');
        this.color8BallStripe = document.getElementById('color-8ball-stripe');
        this.colorStripeBg = document.getElementById('color-stripe-bg');

        // Advanced mode elements (stripe mode only)
        this.advancedModeCheckbox = document.getElementById('advanced-mode');
        this.advancedColorPickers = document.getElementById('advanced-color-pickers');
        this.colorNumberCircle = document.getElementById('color-number-circle');
        this.colorNumberText = document.getElementById('color-number-text');
        this.numberBorderCheckbox = document.getElementById('number-border');
        this.borderColorField = document.getElementById('border-color-field');
        this.colorNumberBorder = document.getElementById('color-number-border');
        this.radialLinesSlider = document.getElementById('radial-lines');
        this.radialLinesValue = document.getElementById('radial-lines-value');
        this.stripeThicknessSlider = document.getElementById('stripe-thickness');
        this.stripeThicknessValue = document.getElementById('stripe-thickness-value');
        this.circleRadiusSlider = document.getElementById('circle-radius');
        this.circleRadiusValue = document.getElementById('circle-radius-value');

        // Table creator elements
        this.customTableNameInput = document.getElementById('custom-table-name');
        this.baseTableSelect = document.getElementById('base-table-select');
        this.tableCreatorPreview = document.getElementById('table-creator-preview');
        this.tableHueSlider = document.getElementById('table-hue');
        this.tableSaturationSlider = document.getElementById('table-saturation');
        this.tableBrightnessSlider = document.getElementById('table-brightness');
        this.tableHueValue = document.getElementById('table-hue-value');
        this.tableSaturationValue = document.getElementById('table-saturation-value');
        this.tableBrightnessValue = document.getElementById('table-brightness-value');

        // Callbacks
        this.onGameStart = null;
        this.onPlayAgain = null;
        this.onMainMenu = null;
        this.onRerack = null;
        this.onSoundToggle = null;
        this.onSpeedChange = null;
        this.onTableChange = null;
        this.onNextFrame = null;
        this.onResumeMatch = null;

        // Current game mode
        this.currentMode = null;

        // Ball set manager
        this.ballSetManager = new CustomBallSetManager();
        this.ballRenderer = new BallRenderer3D(Constants.BALL_RADIUS);

        // Table manager
        this.tableManager = new CustomTableManager();

        // Selection state - load from localStorage or use defaults
        this.selectedTable = this.loadSelectedTable();
        this.selectedBallSet = this.loadSelectedBallSet();
        this.creatorStyle = 'solid';
        this.editingSetId = null; // Track which set is being edited
        this.editingTableId = null; // Track which table is being edited

        // Table names
        this.tableNames = [
            'Classic Green', 'Blue Felt', 'Red Felt', 'Tournament',
            'Luxury', 'Glass', 'UK Pub', 'Mini Snooker', 'Full-Size Snooker'
        ];

        // Apply loaded table selection to the hidden select element
        this.tableSelect.value = this.selectedTable;

        // Initialize modals and previews
        this.initializeModals();
        this.initializeTableGrid();
        this.updateTablePreview();
        this.updateBallSetPreview();

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

        this.btnSnooker.addEventListener('click', () => {
            if (this.onGameStart) {
                this.onGameStart(GameMode.SNOOKER);
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

        // Next frame button
        this.btnNextFrame?.addEventListener('click', () => {
            if (this.onNextFrame) {
                this.onNextFrame();
            }
        });

        // Resume match button
        this.btnResumeMatch?.addEventListener('click', () => {
            if (this.onResumeMatch) {
                this.onResumeMatch();
            }
        });

        // Game menu dropdown toggle
        this.btnGameMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleGameMenu();
        });

        this.btnQuitGame.addEventListener('click', () => {
            this.closeGameMenu();
            if (this.onMainMenu) {
                this.onMainMenu();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.gameMenuDropdown.classList.contains('hidden') &&
                !this.btnGameMenu.contains(e.target) &&
                !this.gameMenuDropdown.contains(e.target)) {
                this.closeGameMenu();
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

        // Modal buttons
        document.getElementById('btn-change-table')?.addEventListener('click', () => {
            this.showTableModal();
        });

        document.getElementById('btn-change-balls')?.addEventListener('click', () => {
            this.showBallModal();
        });

        document.getElementById('close-table-modal')?.addEventListener('click', () => {
            this.hideTableModal();
        });

        document.getElementById('close-ball-modal')?.addEventListener('click', () => {
            this.hideBallModal();
        });

        document.getElementById('close-creator-modal')?.addEventListener('click', () => {
            this.hideCreatorModal();
        });

        document.getElementById('btn-create-custom')?.addEventListener('click', () => {
            this.showCreatorModal();
        });

        document.getElementById('btn-cancel-creator')?.addEventListener('click', () => {
            this.hideCreatorModal();
        });

        document.getElementById('btn-save-custom')?.addEventListener('click', () => {
            this.saveCustomBallSet();
        });

        // Table creator buttons
        document.getElementById('btn-create-custom-table')?.addEventListener('click', () => {
            this.showTableCreatorModal();
        });

        document.getElementById('close-table-creator-modal')?.addEventListener('click', () => {
            this.hideTableCreatorModal();
        });

        document.getElementById('btn-cancel-table-creator')?.addEventListener('click', () => {
            this.hideTableCreatorModal();
        });

        document.getElementById('btn-save-table')?.addEventListener('click', () => {
            this.saveCustomTable();
        });

        // Style toggle buttons
        this.styleSolidBtn?.addEventListener('click', () => {
            this.setCreatorStyle('solid');
        });

        this.styleStripeBtn?.addEventListener('click', () => {
            this.setCreatorStyle('stripe');
        });

        // Solid mode color picker changes
        this.colorGroup1?.addEventListener('input', () => this.updateCreatorPreview());
        this.colorGroup2?.addEventListener('input', () => this.updateCreatorPreview());
        this.color8Ball?.addEventListener('input', () => this.updateCreatorPreview());
        this.striped8BallCheckbox?.addEventListener('change', () => this.updateCreatorPreview());
        this.striped8BallStripeCheckbox?.addEventListener('change', () => this.updateCreatorPreview());

        // Stripe mode color picker changes
        this.colorSolids?.addEventListener('input', () => this.updateCreatorPreview());
        this.colorStripes?.addEventListener('input', () => this.updateCreatorPreview());
        this.color8BallStripe?.addEventListener('input', () => this.updateCreatorPreview());
        this.colorStripeBg?.addEventListener('input', () => this.updateCreatorPreview());

        // Advanced mode toggle (stripe mode only)
        this.advancedModeCheckbox?.addEventListener('change', () => {
            this.toggleAdvancedMode(this.advancedModeCheckbox.checked);
        });

        // Advanced ball color pickers (paired)
        document.querySelectorAll('#advanced-color-pickers input[type="color"]').forEach(input => {
            input.addEventListener('input', () => this.updateCreatorPreview());
        });

        // Number styling options
        this.colorNumberCircle?.addEventListener('input', () => this.updateCreatorPreview());
        this.colorNumberText?.addEventListener('input', () => this.updateCreatorPreview());
        this.numberBorderCheckbox?.addEventListener('change', () => {
            const borderEnabled = this.numberBorderCheckbox.checked;
            this.borderColorField?.classList.toggle('hidden', !borderEnabled);
            // Enable/disable radial lines slider based on border checkbox
            if (this.radialLinesSlider) {
                this.radialLinesSlider.disabled = !borderEnabled;
            }
            this.updateCreatorPreview();
        });
        this.colorNumberBorder?.addEventListener('input', () => this.updateCreatorPreview());

        // Ball customization sliders
        this.radialLinesSlider?.addEventListener('input', (e) => {
            if (this.radialLinesValue) this.radialLinesValue.textContent = e.target.value;
            this.updateCreatorPreview();
        });
        this.stripeThicknessSlider?.addEventListener('input', (e) => {
            if (this.stripeThicknessValue) this.stripeThicknessValue.textContent = parseFloat(e.target.value).toFixed(2);
            this.updateCreatorPreview();
        });
        this.circleRadiusSlider?.addEventListener('input', (e) => {
            if (this.circleRadiusValue) this.circleRadiusValue.textContent = parseFloat(e.target.value).toFixed(2);
            this.updateCreatorPreview();
        });

        // Table creator sliders
        this.baseTableSelect?.addEventListener('change', () => this.updateTablePreviewInCreator());
        this.tableHueSlider?.addEventListener('input', () => {
            this.tableHueValue.textContent = `${this.tableHueSlider.value}°`;
            this.updateTablePreviewInCreator();
        });
        this.tableSaturationSlider?.addEventListener('input', () => {
            this.tableSaturationValue.textContent = `${this.tableSaturationSlider.value}%`;
            this.updateTablePreviewInCreator();
        });
        this.tableBrightnessSlider?.addEventListener('input', () => {
            this.tableBrightnessValue.textContent = `${this.tableBrightnessSlider.value}%`;
            this.updateTablePreviewInCreator();
        });

        // Close modals on backdrop click
        this.tableModal?.addEventListener('click', (e) => {
            if (e.target === this.tableModal) this.hideTableModal();
        });
        this.ballModal?.addEventListener('click', (e) => {
            if (e.target === this.ballModal) this.hideBallModal();
        });
        this.creatorModal?.addEventListener('click', (e) => {
            if (e.target === this.creatorModal) this.hideCreatorModal();
        });
        this.tableCreatorModal?.addEventListener('click', (e) => {
            if (e.target === this.tableCreatorModal) this.hideTableCreatorModal();
        });
    }

    // Initialize table selection grid
    initializeTableGrid() {
        if (!this.tableGrid) return;

        this.tableGrid.innerHTML = '';

        // Add predefined tables (1-9)
        for (let i = 1; i <= 9; i++) {
            const option = document.createElement('div');
            const isSelected = !this.tableManager.isCustomTable(this.selectedTable) && i === this.selectedTable;
            option.className = 'table-option' + (isSelected ? ' selected' : '');
            option.dataset.table = i;

            // Use actual table images
            const imgSrc = i === 1 ? 'assets/pooltable.png' : `assets/pooltable${i}.png`;

            option.innerHTML = `
                <img src="${imgSrc}" alt="${this.tableNames[i - 1]}">
                <div class="table-label">${this.tableNames[i - 1]}</div>
            `;

            option.addEventListener('click', () => {
                this.selectTable(i);
            });

            this.tableGrid.appendChild(option);
        }

        // Add custom tables
        const customTables = this.tableManager.getAll();
        for (const table of customTables) {
            const option = document.createElement('div');
            option.className = 'table-option custom-table' + (this.selectedTable === table.id ? ' selected' : '');
            option.dataset.tableId = table.id;

            // Create preview canvas for custom table
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = 200;
            previewCanvas.height = 100;
            this.renderTablePreviewToCanvas(previewCanvas, table.baseTable, {
                hue: table.hue,
                saturation: table.saturation,
                brightness: table.brightness
            });

            // Label and menu container (for alignment)
            const labelRow = document.createElement('div');
            labelRow.className = 'table-label-row';

            const labelDiv = document.createElement('div');
            labelDiv.className = 'table-label';
            labelDiv.textContent = table.name;
            labelRow.appendChild(labelDiv);

            // Add ellipsis menu for custom tables
            const menuContainer = document.createElement('div');
            menuContainer.className = 'table-menu-container';

            const menuBtn = document.createElement('button');
            menuBtn.className = 'table-menu-btn';
            menuBtn.innerHTML = '&#8942;'; // Vertical ellipsis
            menuBtn.title = 'Options';
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle this menu and close others
                const allMenus = this.tableGrid.querySelectorAll('.table-menu-dropdown');
                allMenus.forEach(m => {
                    if (m !== dropdown) m.classList.add('hidden');
                });
                dropdown.classList.toggle('hidden');
            });
            menuContainer.appendChild(menuBtn);

            const dropdown = document.createElement('div');
            dropdown.className = 'table-menu-dropdown hidden';

            const editOption = document.createElement('button');
            editOption.className = 'menu-option';
            editOption.textContent = 'Edit';
            editOption.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.add('hidden');
                this.editCustomTable(table);
            });
            dropdown.appendChild(editOption);

            const deleteOption = document.createElement('button');
            deleteOption.className = 'menu-option delete-option';
            deleteOption.textContent = 'Delete';
            deleteOption.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.add('hidden');
                this.deleteCustomTable(table.id);
            });
            dropdown.appendChild(deleteOption);

            menuContainer.appendChild(dropdown);
            labelRow.appendChild(menuContainer);

            option.appendChild(previewCanvas);
            option.appendChild(labelRow);

            option.addEventListener('click', () => {
                this.selectTable(table.id);
            });

            this.tableGrid.appendChild(option);
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.table-menu-container')) {
                const allMenus = this.tableGrid?.querySelectorAll('.table-menu-dropdown');
                allMenus?.forEach(m => m.classList.add('hidden'));
            }
        });
    }

    // Initialize modals
    initializeModals() {
        // Any additional modal initialization
    }

    // Update table preview in main menu
    updateTablePreview() {
        if (!this.tablePreview || !this.tableName) return;

        if (this.tableManager.isCustomTable(this.selectedTable)) {
            const customTable = this.tableManager.get(this.selectedTable);
            if (customTable) {
                this.renderTablePreviewToCanvas(this.tablePreview, customTable.baseTable, {
                    hue: customTable.hue,
                    saturation: customTable.saturation,
                    brightness: customTable.brightness
                });
                this.tableName.textContent = customTable.name;
            }
        } else {
            const ctx = this.tablePreview.getContext('2d');
            const img = new Image();
            const imgSrc = this.selectedTable === 1 ? 'assets/pooltable.png' : `assets/pooltable${this.selectedTable}.png`;

            img.onload = () => {
                ctx.clearRect(0, 0, this.tablePreview.width, this.tablePreview.height);
                ctx.drawImage(img, 0, 0, this.tablePreview.width, this.tablePreview.height);
            };
            img.src = imgSrc;

            this.tableName.textContent = this.tableNames[this.selectedTable - 1];
        }
    }

    // Update ball set preview in main menu
    updateBallSetPreview() {
        if (!this.ballSetPreview || !this.ballSetName) return;

        this.ballSetPreview.innerHTML = '';
        this.ballSetName.textContent = this.selectedBallSet.name;

        // Get preview balls for the selected set
        const previewBalls = this.ballSetManager.getPreviewBalls(this.selectedBallSet);

        for (const ballNum of previewBalls) {
            const canvas = this.renderBallPreviewCanvas(ballNum, this.selectedBallSet, 24);
            if (canvas) {
                this.ballSetPreview.appendChild(canvas);
            }
        }
    }

    // Render a single ball preview to a canvas
    renderBallPreviewCanvas(ballNumber, ballSet, size = 24) {
        const config = this.ballSetManager.getBallConfig(ballSet, ballNumber);
        if (!config) return null;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        // Render options including number styling
        const renderOptions = {
            showNumber: config.showNumber,
            stripeBackgroundColor: config.stripeBackgroundColor,
            numberCircleColor: config.numberCircleColor,
            numberTextColor: config.numberTextColor,
            numberBorder: config.numberBorder,
            numberBorderColor: config.numberBorderColor,
            numberCircleRadialLines: config.numberCircleRadialLines,
            stripeThickness: config.stripeThickness,
            numberCircleRadius: config.numberCircleRadius
        };

        const frame = this.ballRenderer.renderBallFrame(
            ballNumber,
            config.color,
            config.isStripe,
            0, // rotation = 0 for static preview
            config.isUKBall,
            ballNumber === 8,
            config.isSnookerBall,
            renderOptions
        );

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(frame, 0, 0, size, size);

        return canvas;
    }

    // Show table selection modal
    showTableModal() {
        if (!this.tableModal) return;

        // Update selection state
        const options = this.tableGrid.querySelectorAll('.table-option');
        options.forEach(opt => {
            opt.classList.toggle('selected', parseInt(opt.dataset.table) === this.selectedTable);
        });

        this.tableModal.classList.remove('hidden');
    }

    // Hide table selection modal
    hideTableModal() {
        if (this.tableModal) {
            this.tableModal.classList.add('hidden');
        }
    }

    // Select a table (handles both predefined tables and custom table IDs)
    selectTable(tableId) {
        this.selectedTable = tableId;

        // Save to localStorage
        this.saveSelectedTable(tableId);

        // Update visual selection
        const options = this.tableGrid?.querySelectorAll('.table-option');
        options?.forEach(opt => {
            const optTableId = opt.dataset.tableId || parseInt(opt.dataset.table);
            opt.classList.toggle('selected', optTableId === tableId);
        });

        // Update main menu preview
        this.updateTablePreview();

        // Trigger table change callback
        // For predefined tables, set the hidden select value (for compatibility)
        if (!this.tableManager.isCustomTable(tableId)) {
            this.tableSelect.value = tableId;
        }

        if (this.onTableChange) {
            this.onTableChange(tableId);
        }

        this.hideTableModal();
    }

    // Show ball set selection modal
    showBallModal() {
        if (!this.ballModal) return;

        this.populateBallSetGrid();
        this.ballModal.classList.remove('hidden');
    }

    // Hide ball set selection modal
    hideBallModal() {
        if (this.ballModal) {
            this.ballModal.classList.add('hidden');
        }
    }

    // Populate ball set grid
    populateBallSetGrid() {
        if (!this.ballSetGrid) return;

        this.ballSetGrid.innerHTML = '';
        // Filter out snooker set - it's automatically used for snooker mode
        const allSets = this.ballSetManager.getAllSets().filter(set => !set.isSnooker);

        for (const set of allSets) {
            const option = document.createElement('div');
            option.className = 'ball-set-option' +
                (this.selectedBallSet.id === set.id ? ' selected' : '') +
                (!set.isPredefined ? ' custom-set' : '');
            option.dataset.setId = set.id;

            // Create preview balls
            const previewDiv = document.createElement('div');
            previewDiv.className = 'set-preview';

            const previewBalls = this.ballSetManager.getPreviewBalls(set);
            for (const ballNum of previewBalls) {
                const canvas = this.renderBallPreviewCanvas(ballNum, set, 22);
                if (canvas) {
                    previewDiv.appendChild(canvas);
                }
            }

            option.appendChild(previewDiv);

            // Name and menu container (for alignment)
            const nameRow = document.createElement('div');
            nameRow.className = 'set-name-row';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'set-name';
            nameDiv.textContent = set.name;
            nameRow.appendChild(nameDiv);

            // Add ellipsis menu for custom sets
            if (!set.isPredefined) {
                const menuContainer = document.createElement('div');
                menuContainer.className = 'set-menu-container';

                const menuBtn = document.createElement('button');
                menuBtn.className = 'set-menu-btn';
                menuBtn.innerHTML = '&#8942;'; // Vertical ellipsis
                menuBtn.title = 'Options';
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Toggle this menu and close others
                    const allMenus = this.ballSetGrid.querySelectorAll('.set-menu-dropdown');
                    allMenus.forEach(m => {
                        if (m !== dropdown) m.classList.add('hidden');
                    });
                    dropdown.classList.toggle('hidden');
                });
                menuContainer.appendChild(menuBtn);

                const dropdown = document.createElement('div');
                dropdown.className = 'set-menu-dropdown hidden';

                const editOption = document.createElement('button');
                editOption.className = 'menu-option';
                editOption.textContent = 'Edit';
                editOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.add('hidden');
                    this.editCustomBallSet(set);
                });
                dropdown.appendChild(editOption);

                const deleteOption = document.createElement('button');
                deleteOption.className = 'menu-option delete-option';
                deleteOption.textContent = 'Delete';
                deleteOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.add('hidden');
                    this.deleteCustomBallSet(set.id);
                });
                dropdown.appendChild(deleteOption);

                menuContainer.appendChild(dropdown);
                nameRow.appendChild(menuContainer);
            }

            option.appendChild(nameRow);

            option.addEventListener('click', () => {
                this.selectBallSet(set);
            });

            this.ballSetGrid.appendChild(option);
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.set-menu-container')) {
                const allMenus = this.ballSetGrid?.querySelectorAll('.set-menu-dropdown');
                allMenus?.forEach(m => m.classList.add('hidden'));
            }
        });
    }

    // Select a ball set
    selectBallSet(set) {
        this.selectedBallSet = set;

        // Save to localStorage
        this.saveSelectedBallSet(set.id);

        // Update visual selection
        const options = this.ballSetGrid?.querySelectorAll('.ball-set-option');
        options?.forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.setId === set.id);
        });

        // Update main menu preview
        this.updateBallSetPreview();

        // Update UK color scheme if applicable
        if (set.id === 'uk-red-yellow') {
            this.ukColorScheme.value = 'red-yellow';
        } else if (set.id === 'uk-blue-yellow') {
            this.ukColorScheme.value = 'blue-yellow';
        }

        this.hideBallModal();
    }

    // Delete a custom ball set
    deleteCustomBallSet(setId) {
        if (!confirm('Delete this custom ball set?')) return;

        this.ballSetManager.delete(setId);

        // If deleted set was selected, switch to American
        if (this.selectedBallSet.id === setId) {
            this.selectedBallSet = PREDEFINED_BALL_SETS[0];
            this.saveSelectedBallSet(this.selectedBallSet.id);
            this.updateBallSetPreview();
        }

        this.populateBallSetGrid();
    }

    // Edit a custom ball set
    editCustomBallSet(set) {
        this.editingSetId = set.id;
        this.hideBallModal();

        // FIX: Show the modal FIRST, so the inputs are live in the DOM
        this.creatorModal?.classList.remove('hidden');

        // Load the set's data into creator fields
        if (this.customSetNameInput) this.customSetNameInput.value = set.name || '';

        if (set.style === 'solid') {
            // Load solid mode values
            this.setColorValue(this.colorGroup1, set.colors?.group1 || '#CC0000');
            this.setColorValue(this.colorGroup2, set.colors?.group2 || '#FFD700');
            this.setColorValue(this.color8Ball, set.colors?.eightBall || '#000000');
            if (this.striped8BallCheckbox) this.striped8BallCheckbox.checked = set.options?.striped8Ball || false;
        } else {
            // Load stripe mode values
            this.setColorValue(this.colorSolids, set.colors?.group1 || '#FFD700');
            this.setColorValue(this.colorStripes, set.colors?.group2 || '#0000CD');
            this.setColorValue(this.color8BallStripe, set.colors?.eightBall || '#000000');
            this.setColorValue(this.colorStripeBg, set.options?.stripeBackgroundColor || '#FFFFFF');
            if (this.striped8BallStripeCheckbox) this.striped8BallStripeCheckbox.checked = set.options?.striped8Ball || false;

            // Load number styling
            this.setColorValue(this.colorNumberCircle, set.options?.numberCircleColor || '#FFFFFF');
            this.setColorValue(this.colorNumberText, set.options?.numberTextColor || '#000000');
            if (this.numberBorderCheckbox) this.numberBorderCheckbox.checked = set.options?.numberBorder || false;
            this.setColorValue(this.colorNumberBorder, set.options?.numberBorderColor || '#000000');
            this.borderColorField?.classList.toggle('hidden', !set.options?.numberBorder);

            // Load sliders
            if (this.radialLinesSlider) {
                this.radialLinesSlider.value = set.options?.numberCircleRadialLines || 0;
                if (this.radialLinesValue) this.radialLinesValue.textContent = set.options?.numberCircleRadialLines || 0;
                // Disable radial lines if border is not enabled
                this.radialLinesSlider.disabled = !set.options?.numberBorder;
            }
            if (this.stripeThicknessSlider) {
                this.stripeThicknessSlider.value = set.options?.stripeThickness ?? 0.55;
                if (this.stripeThicknessValue) this.stripeThicknessValue.textContent = (set.options?.stripeThickness ?? 0.55).toFixed(2);
            }
            if (this.circleRadiusSlider) {
                this.circleRadiusSlider.value = set.options?.numberCircleRadius ?? 0.5;
                if (this.circleRadiusValue) this.circleRadiusValue.textContent = (set.options?.numberCircleRadius ?? 0.5).toFixed(2);
            }

            // Load advanced mode
            if (set.advancedMode && set.ballColors) {
                if (this.advancedModeCheckbox) this.advancedModeCheckbox.checked = true;
                this.creatorAdvancedMode = true;
                this.simpleColorPickers?.classList.add('hidden');
                this.advancedColorPickers?.classList.remove('hidden');

                // Load individual ball colors
                document.querySelectorAll('#advanced-color-pickers input[type="color"]').forEach(input => {
                    const pairNum = parseInt(input.dataset.pair);
                    if (!isNaN(pairNum) && set.ballColors[pairNum]) {
                        this.setColorValue(input, set.ballColors[pairNum]);
                    }
                });
            } else {
                if (this.advancedModeCheckbox) this.advancedModeCheckbox.checked = false;
                this.creatorAdvancedMode = false;
                this.simpleColorPickers?.classList.remove('hidden');
                this.advancedColorPickers?.classList.add('hidden');
            }
        }

        this.setCreatorStyle(set.style || 'solid');
        this.updateCreatorPreview();

        // Update modal title and button text
        const modalTitle = this.creatorModal?.querySelector('.modal-header h2');
        if (modalTitle) modalTitle.textContent = 'Edit Ball Set';
        const saveBtn = document.getElementById('btn-save-custom');
        if (saveBtn) saveBtn.textContent = 'Save Changes';
    }

    // Show custom ball set creator modal
    showCreatorModal() {
        if (!this.creatorModal) return;

        this.hideBallModal();
        this.editingSetId = null; // Not editing, creating new

        // FIX: Show modal FIRST
        this.creatorModal.classList.remove('hidden');

        // Reset creator fields
        if (this.customSetNameInput) this.customSetNameInput.value = '';

        // Reset solid mode fields
        this.setColorValue(this.colorGroup1, '#CC0000');
        this.setColorValue(this.colorGroup2, '#FFD700');
        this.setColorValue(this.color8Ball, '#000000');
        if (this.striped8BallCheckbox) this.striped8BallCheckbox.checked = false;

        // Reset stripe mode fields
        this.setColorValue(this.colorSolids, '#FFD700');
        this.setColorValue(this.colorStripes, '#0000CD');
        this.setColorValue(this.color8BallStripe, '#000000');
        this.setColorValue(this.colorStripeBg, '#FFFFFF');
        if (this.striped8BallStripeCheckbox) this.striped8BallStripeCheckbox.checked = false;

        // Reset advanced mode
        if (this.advancedModeCheckbox) this.advancedModeCheckbox.checked = false;
        this.creatorAdvancedMode = false;
        this.simpleColorPickers?.classList.remove('hidden');
        this.advancedColorPickers?.classList.add('hidden');

        // Reset advanced ball colors to defaults (paired: 1&9, 2&10, etc.)
        const defaultPairColors = {
            1: '#FFD700', 2: '#0000CD', 3: '#FF0000', 4: '#4B0082',
            5: '#FF8C00', 6: '#006400', 7: '#800000', 8: '#000000'
        };
        document.querySelectorAll('#advanced-color-pickers input[type="color"]').forEach(input => {
            const pairNum = input.dataset.pair;
            if (pairNum && defaultPairColors[pairNum]) {
                this.setColorValue(input, defaultPairColors[pairNum]);
            }
        });

        // Reset number styling
        this.setColorValue(this.colorNumberCircle, '#FFFFFF');
        this.setColorValue(this.colorNumberText, '#000000');
        if (this.numberBorderCheckbox) this.numberBorderCheckbox.checked = false;
        this.setColorValue(this.colorNumberBorder, '#000000');
        this.borderColorField?.classList.add('hidden');

        // Reset sliders
        if (this.radialLinesSlider) {
            this.radialLinesSlider.value = 0;
            if (this.radialLinesValue) this.radialLinesValue.textContent = '0';
            this.radialLinesSlider.disabled = true; // Disabled by default since border is unchecked
        }
        if (this.stripeThicknessSlider) {
            this.stripeThicknessSlider.value = 0.55;
            if (this.stripeThicknessValue) this.stripeThicknessValue.textContent = '0.55';
        }
        if (this.circleRadiusSlider) {
            this.circleRadiusSlider.value = 0.5;
            if (this.circleRadiusValue) this.circleRadiusValue.textContent = '0.50';
        }

        // Reset modal title and button text for create mode
        const modalTitle = this.creatorModal.querySelector('.modal-header h2');
        if (modalTitle) modalTitle.textContent = 'Create Custom Ball Set';
        const saveBtn = document.getElementById('btn-save-custom');
        if (saveBtn) saveBtn.textContent = 'Save Ball Set';

        this.setCreatorStyle('solid');
        this.updateCreatorPreview();
    }

    // Hide creator modal
    hideCreatorModal() {
        if (this.creatorModal) {
            this.creatorModal.classList.add('hidden');
        }
    }

    // Set creator style (solid or stripe)
    setCreatorStyle(style) {
        this.creatorStyle = style;

        this.styleSolidBtn?.classList.toggle('active', style === 'solid');
        this.styleStripeBtn?.classList.toggle('active', style === 'stripe');

        // Toggle solid/stripe options visibility
        this.solidOptions?.classList.toggle('hidden', style !== 'solid');
        this.stripeModeOptions?.classList.toggle('hidden', style !== 'stripe');

        this.updateCreatorPreview();
    }

    // Toggle advanced mode
    toggleAdvancedMode(enabled) {
        this.creatorAdvancedMode = enabled;

        this.simpleColorPickers?.classList.toggle('hidden', enabled);
        this.advancedColorPickers?.classList.toggle('hidden', !enabled);

        this.updateCreatorPreview();
    }

    // Update creator preview
    updateCreatorPreview() {
        if (!this.creatorPreviewBalls) return;

        this.creatorPreviewBalls.innerHTML = '';

        // Create a temporary ball set config for preview based on current mode
        let tempSet;

        if (this.creatorStyle === 'solid') {
            // Solid mode: group colors, no numbers (except possibly striped 8-ball)
            tempSet = {
                id: 'preview',
                style: 'solid',
                colors: {
                    cue: '#FFFEF0',
                    group1: this.colorGroup1?.value || '#CC0000',
                    group2: this.colorGroup2?.value || '#FFD700',
                    eightBall: this.color8Ball?.value || '#000000'
                },
                options: {
                    hasStripes: false,
                    showNumbers: false,  // Solid balls have no numbers
                    striped8Ball: this.striped8BallCheckbox?.checked || false
                }
            };
        } else {
            // Stripe mode: solids/stripes colors with numbers
            tempSet = {
                id: 'preview',
                style: 'stripe',
                colors: {
                    cue: '#FFFEF0',
                    group1: this.colorSolids?.value || '#FFD700',
                    group2: this.colorStripes?.value || '#0000CD',
                    eightBall: this.color8BallStripe?.value || '#000000'
                },
                options: {
                    hasStripes: true,
                    showNumbers: true,
                    striped8Ball: this.striped8BallStripeCheckbox?.checked || false,
                    stripeBackgroundColor: this.colorStripeBg?.value || '#FFFFFF',
                    numberCircleColor: this.colorNumberCircle?.value || '#FFFFFF',
                    numberTextColor: this.colorNumberText?.value || '#000000',
                    numberBorder: this.numberBorderCheckbox?.checked || false,
                    numberBorderColor: this.colorNumberBorder?.value || '#000000',
                    numberCircleRadialLines: parseInt(this.radialLinesSlider?.value || '0'),
                    stripeThickness: parseFloat(this.stripeThicknessSlider?.value || '0.55'),
                    numberCircleRadius: parseFloat(this.circleRadiusSlider?.value || '0.5')
                }
            };

            // Advanced mode: collect paired ball colors
            if (this.creatorAdvancedMode) {
                tempSet.advancedMode = true;
                tempSet.ballColors = {};
                document.querySelectorAll('#advanced-color-pickers input[type="color"]').forEach(input => {
                    const pairNum = parseInt(input.dataset.pair);
                    if (!isNaN(pairNum)) {
                        if (pairNum === 8) {
                            // 8-ball is unique
                            tempSet.ballColors[8] = input.value;
                        } else {
                            // Paired balls: 1&9, 2&10, 3&11, 4&12, 5&13, 6&14, 7&15
                            tempSet.ballColors[pairNum] = input.value;
                            tempSet.ballColors[pairNum + 8] = input.value;
                        }
                    }
                });
            }
        }

        // NEW: Sync input backgrounds to their values
        // This ensures the "button" color matches the selection while dragging
        const colorInputs = [
            this.colorGroup1, this.colorGroup2, this.color8Ball,
            this.colorSolids, this.colorStripes, this.color8BallStripe, 
            this.colorStripeBg, this.colorNumberCircle, this.colorNumberText, 
            this.colorNumberBorder
        ];

        colorInputs.forEach(input => {
            if (input && input.value) {
                input.style.backgroundColor = input.value;
            }
        });

        // Also handle advanced color pickers
        document.querySelectorAll('#advanced-color-pickers input[type="color"]').forEach(input => {
            input.style.backgroundColor = input.value;
        });

        // Show all 16 balls (cue + 15 numbered) in creator preview
        const previewBalls = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

        for (const ballNum of previewBalls) {
            const canvas = this.renderBallPreviewCanvas(ballNum, tempSet, 22);
            if (canvas) {
                this.creatorPreviewBalls.appendChild(canvas);
            }
        }
    }

    // Save custom ball set
    saveCustomBallSet() {
        const name = this.customSetNameInput?.value?.trim() || 'Custom Set';

        let setData;

        if (this.creatorStyle === 'solid') {
            // Solid mode: group colors, no numbers
            setData = {
                name: name,
                style: 'solid',
                colors: {
                    group1: this.colorGroup1?.value || '#CC0000',
                    group2: this.colorGroup2?.value || '#FFD700',
                    eightBall: this.color8Ball?.value || '#000000'
                },
                options: {
                    showNumbers: false,
                    striped8Ball: this.striped8BallCheckbox?.checked || false
                }
            };
        } else {
            // Stripe mode: solids/stripes with numbers
            setData = {
                name: name,
                style: 'stripe',
                colors: {
                    group1: this.colorSolids?.value || '#FFD700',
                    group2: this.colorStripes?.value || '#0000CD',
                    eightBall: this.color8BallStripe?.value || '#000000'
                },
                options: {
                    showNumbers: true,
                    striped8Ball: this.striped8BallStripeCheckbox?.checked || false,
                    stripeBackgroundColor: this.colorStripeBg?.value || '#FFFFFF',
                    numberCircleColor: this.colorNumberCircle?.value || '#FFFFFF',
                    numberTextColor: this.colorNumberText?.value || '#000000',
                    numberBorder: this.numberBorderCheckbox?.checked || false,
                    numberBorderColor: this.colorNumberBorder?.value || '#000000',
                    numberCircleRadialLines: parseInt(this.radialLinesSlider?.value || '0'),
                    stripeThickness: parseFloat(this.stripeThicknessSlider?.value || '0.55'),
                    numberCircleRadius: parseFloat(this.circleRadiusSlider?.value || '0.5')
                }
            };

            // Advanced mode: collect paired ball colors
            if (this.creatorAdvancedMode) {
                setData.advancedMode = true;
                setData.ballColors = {};
                document.querySelectorAll('#advanced-color-pickers input[type="color"]').forEach(input => {
                    const pairNum = parseInt(input.dataset.pair);
                    if (!isNaN(pairNum)) {
                        if (pairNum === 8) {
                            setData.ballColors[8] = input.value;
                        } else {
                            // Paired: 1&9, 2&10, etc.
                            setData.ballColors[pairNum] = input.value;
                            setData.ballColors[pairNum + 8] = input.value;
                        }
                    }
                });
            }
        }

        let savedSet;
        if (this.editingSetId) {
            // Update existing set
            savedSet = this.ballSetManager.update(this.editingSetId, setData);
        } else {
            // Create new set
            savedSet = this.ballSetManager.create(setData);
        }

        // Select the saved set and save to localStorage
        this.selectedBallSet = savedSet;
        this.saveSelectedBallSet(savedSet.id);
        this.updateBallSetPreview();

        this.editingSetId = null;
        this.hideCreatorModal();
        this.showBallModal();
    }

    // Get selected ball set for game
    getSelectedBallSet() {
        return this.selectedBallSet;
    }

    // Get selected table number
    getSelectedTable() {
        return this.selectedTable;
    }

    // Load selected table from localStorage
    loadSelectedTable() {
        try {
            const saved = localStorage.getItem('poolGame_selectedTable');
            if (saved) {
                // Check if it's a custom table ID
                if (saved.startsWith('custom_')) {
                    // Verify the custom table still exists
                    if (this.tableManager.get(saved)) {
                        return saved;
                    }
                } else {
                    const tableNum = parseInt(saved);
                    if (tableNum >= 1 && tableNum <= 9) {
                        return tableNum;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load selected table:', e);
        }
        return 1; // Default to Classic Green
    }

    // Save selected table to localStorage
    saveSelectedTable(tableId) {
        try {
            localStorage.setItem('poolGame_selectedTable', tableId.toString());
        } catch (e) {
            console.warn('Failed to save selected table:', e);
        }
    }

    // Load selected ball set from localStorage
    loadSelectedBallSet() {
        try {
            const savedId = localStorage.getItem('poolGame_selectedBallSet');
            if (savedId) {
                const set = this.ballSetManager.getSet(savedId);
                // Return the set if found and not snooker (snooker is auto-selected for snooker mode)
                if (set && !set.isSnooker) {
                    return set;
                }
            }
        } catch (e) {
            console.warn('Failed to load selected ball set:', e);
        }
        return PREDEFINED_BALL_SETS[0]; // Default to American
    }

    // Save selected ball set to localStorage
    saveSelectedBallSet(setId) {
        try {
            localStorage.setItem('poolGame_selectedBallSet', setId);
        } catch (e) {
            console.warn('Failed to save selected ball set:', e);
        }
    }

    // Helper to set color picker value and ensure visual update (mobile fix)
    setColorValue(element, value) {
        if (!element) return;
        
        // 1. Sanitize the value to ensure strict 7-character hex (#RRGGBB)
        let safeColor = value || '#000000';
        
        // Handle "rgb(r, g, b)" format
        if (safeColor.startsWith('rgb')) {
            const rgb = safeColor.match(/\d+/g);
            if (rgb) {
                safeColor = '#' + 
                    parseInt(rgb[0]).toString(16).padStart(2, '0') +
                    parseInt(rgb[1]).toString(16).padStart(2, '0') +
                    parseInt(rgb[2]).toString(16).padStart(2, '0');
            }
        }
        // Handle short hex "#F00" -> "#FF0000"
        else if (safeColor.length === 4 && safeColor.startsWith('#')) {
            safeColor = '#' + safeColor[1] + safeColor[1] + 
                              safeColor[2] + safeColor[2] + 
                              safeColor[3] + safeColor[3];
        }

        // 2. Set the value
        element.value = safeColor;
        
        // 3. Force the visual update (important for your customized link UI)
        element.style.backgroundColor = safeColor;
        
        // 4. Dispatch events to ensure other listeners (like your 3D preview) update
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Toggle fullscreen mode
    toggleFullscreen() {
        const elem = document.documentElement;

        // Check if the API is supported at all
        const isApiSupported = elem.requestFullscreen || elem.webkitRequestFullscreen;

        if (isApiSupported) {
            // STANDARD ANDROID / DESKTOP LOGIC
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen().catch(err => console.log(err));
                } else if (elem.webkitRequestFullscreen) {
                    elem.webkitRequestFullscreen();
                }
                
                // Try to lock orientation (Android only)
                if (screen.orientation && screen.orientation.lock) {
                    try {
                        screen.orientation.lock('landscape').catch(() => {});
                    } catch (e) {}
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        } else {
            // IPHONE / UNSUPPORTED FALLBACK
            // Toggle a CSS class on the body instead
            document.body.classList.toggle('ios-fullscreen-fix');
            
            // Scroll to top to help hide address bar
            window.scrollTo(0, 1);
        }
    }

    // Toggle game menu dropdown
    toggleGameMenu() {
        const isHidden = this.gameMenuDropdown.classList.contains('hidden');
        if (isHidden) {
            this.gameMenuDropdown.classList.remove('hidden');
            this.btnGameMenu.classList.add('active');
        } else {
            this.closeGameMenu();
        }
    }

    // Close game menu dropdown
    closeGameMenu() {
        this.gameMenuDropdown.classList.add('hidden');
        this.btnGameMenu.classList.remove('active');
    }

    // Show main menu
    showMainMenu() {
        this.closeGameMenu();
        this.mainMenu.classList.remove('hidden');
        this.gameHud.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.freeplayControls.classList.add('hidden');
        if (this.snookerHud) this.snookerHud.classList.add('hidden');
        if (this.playerIndicator) this.playerIndicator.classList.add('hidden');
        this.currentMode = null;

        // Check for saved match
        this.checkForSavedMatch();
    }

    // Show game HUD
    showGameHUD(mode, matchInfo = null) {
        this.mainMenu.classList.add('hidden');
        this.gameHud.classList.remove('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.currentMode = mode;

        // RESET: Clear mode-specific classes AND Styles
        this.ballGroups.className = '';
        this.ballGroups.style.cssText = '';
        this.ballGroups.innerHTML = ''; // Clear previous content
        this.last9BallState = null;

        // Initialize new unified HUD
        if (this.hudInfoPanel) {
            // Set mode name
            const modeNames = {
                '8ball': '8-Ball',
                'uk8ball': 'UK 8-Ball',
                '9ball': '9-Ball',
                'snooker': 'Snooker',
                'freeplay': 'Free Play'
            };
            if (this.hudModeName) {
                this.hudModeName.textContent = modeNames[mode] || mode;
            }

            // Reset turn indicator
            if (this.hudTurnIndicator) {
                this.hudTurnIndicator.textContent = "Player 1's Turn";
            }

            // Reset two-shot badge
            if (this.hudTwoShot) {
                this.hudTwoShot.classList.add('hidden');
            }

            // Reset snooker elements
            if (this.hudSnookerBreak) this.hudSnookerBreak.classList.add('hidden');
            if (this.hudSnookerTarget) this.hudSnookerTarget.classList.add('hidden');

            // Reset player states
            if (this.hudPlayer1) this.hudPlayer1.classList.add('active');
            if (this.hudPlayer2) this.hudPlayer2.classList.remove('active');

            // Clear ball group indicators
            if (this.p1BallGroup) this.p1BallGroup.innerHTML = '';
            if (this.p2BallGroup) this.p2BallGroup.innerHTML = '';

            // Reset point scores (hidden by default)
            if (this.p1PointScore) {
                this.p1PointScore.textContent = '0';
                this.p1PointScore.style.display = 'none';
            }
            if (this.p2PointScore) {
                this.p2PointScore.textContent = '0';
                this.p2PointScore.style.display = 'none';
            }

            // Reset frame scores and bestOf
            if (this.p1Frames) this.p1Frames.textContent = matchInfo?.player1Frames || '0';
            if (this.p2Frames) this.p2Frames.textContent = matchInfo?.player2Frames || '0';
            if (this.scoreBestof) this.scoreBestof.textContent = `(${matchInfo?.bestOf || 1})`;
        }

        // Hide/show players panel based on mode
        if (this.hudPlayersPanel) {
            this.hudPlayersPanel.classList.toggle('hidden-freeplay', mode === GameMode.FREE_PLAY);
        }

        // Always hide legacy elements - we use the unified HUD now
        if (this.snookerHud) this.snookerHud.classList.add('hidden');
        if (this.playerIndicator) this.playerIndicator.classList.add('hidden');

        if (mode === GameMode.FREE_PLAY) {
            this.freeplayControls.classList.remove('hidden');
            this.ballGroups.innerHTML = '';
        } else {
            this.freeplayControls.classList.add('hidden');
        }

        this.hideMessage();
        this.hideFoul();
    }

    // Show game over screen
    showGameOver(winner, reason) {
        this.gameOverScreen.classList.remove('hidden');
        this.freeplayControls.classList.add('hidden');
        if (this.snookerHud) this.snookerHud.classList.add('hidden');

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
            //text += ` (${group === 'solid' ? 'Solids' : 'Stripes'})`;
        } else if (this.currentMode === GameMode.UK_EIGHT_BALL && group && gameInfo) {
            //const colorName = this.getUKGroupName(group, gameInfo.ukColorScheme);
            //text += ` (${colorName})`;
            // Show shots remaining if using two-shot rule
            if (gameInfo.shotsRemaining > 1) {
                text += ` - ${gameInfo.shotsRemaining} shots`;
            }
        } else if (this.currentMode === GameMode.NINE_BALL) {
            // Will be updated with lowest ball info
        } else if (this.currentMode === GameMode.SNOOKER) {
            // Snooker shows turn info in main player indicator
            text = `Player ${player}'s Turn`;
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

    // Update ball groups (8-ball)
    updateBallGroups(player1Group, player2Group, remaining, currentPlayer) {
        if (this.currentMode !== GameMode.EIGHT_BALL) {
            this.ballGroups.innerHTML = '';
            return;
        }

        this.ballGroups.innerHTML = '';
        // APPLY LAYOUT CLASS: Moves container to top-right rail
        this.ballGroups.className = 'ball-groups-8ball'; 

        if (!player1Group) {
            // Simple open table message
            this.ballGroups.innerHTML = '<div class="ball-group"><span>Table Open</span></div>';
            return;
        }

        const createGroupDisplay = (playerNum, groupType, count, isActive) => {
            const container = document.createElement('div');
            container.className = `ball-group ${isActive ? 'active-turn' : ''}`;
            
            const repBallNum = groupType === 'solid' ? 1 : 9;
            const canvas = this.renderBallPreviewCanvas(repBallNum, this.selectedBallSet, 22);
            
            if (canvas) {
                container.appendChild(canvas);
            }

            const textSpan = document.createElement('span');
            textSpan.textContent = `P${playerNum}: ${count}`;
            
            if (isActive) {
                textSpan.style.color = '#ffd700';
            }

            container.appendChild(textSpan);
            return container;
        };

        const p1Count = player1Group === 'solid' ? remaining.solids : remaining.stripes;
        const p1El = createGroupDisplay(1, player1Group, p1Count, currentPlayer === 1);
        this.ballGroups.appendChild(p1El);

        const p2Count = player2Group === 'solid' ? remaining.solids : remaining.stripes;
        const p2El = createGroupDisplay(2, player2Group, p2Count, currentPlayer === 2);
        this.ballGroups.appendChild(p2El);
    }

    // Update 9-ball display: Target ball + Remaining sequence
    update9BallHUD(lowestBall, remainingBalls) {
        if (this.currentMode !== GameMode.NINE_BALL) return;

        // 1. DATA PREPARATION
        let onTable = [];
        
        // Strict check: Only populate if we have a valid array
        if (remainingBalls && Array.isArray(remainingBalls) && remainingBalls.length > 0) {
            onTable = [...remainingBalls].sort((a, b) => a - b);
        } else {
            // If data is missing, we prefer to show NOTHING in the rail rather than "ghost balls"
            // We only assume the lowest ball exists
            onTable = [lowestBall]; 
        }

        // Filter: The rail should show everything on the table EXCEPT the target ball
        const railSequence = onTable.filter(b => b !== lowestBall);

        // 2. STATE CHECK
        const stateSignature = `9ball-${lowestBall}-${railSequence.join(',')}`;
        if (this.last9BallState === stateSignature) return;
        this.last9BallState = stateSignature;

        // 3. LAYOUT & POSITIONING
        this.ballGroups.innerHTML = '';
        this.ballGroups.className = 'ball-groups-9ball';

        // Position at bottom right, centered at 75% (matching right HUD panel)
        this.ballGroups.style.position = 'absolute';
        this.ballGroups.style.bottom = '8px';
        this.ballGroups.style.top = 'auto';
        this.ballGroups.style.left = '75%';
        this.ballGroups.style.right = 'auto';
        this.ballGroups.style.transform = 'translateX(-50%)';

        this.ballGroups.style.display = 'flex';
        this.ballGroups.style.flexDirection = 'row';
        this.ballGroups.style.alignItems = 'center';
        this.ballGroups.style.width = 'auto';

        // --- PART A: TARGET INDICATOR ---
        const targetWrapper = document.createElement('div');
        targetWrapper.style.display = 'flex';
        targetWrapper.style.alignItems = 'center';
        targetWrapper.style.padding = '2px 8px';
        targetWrapper.style.background = 'rgba(0,0,0,0.6)';
        targetWrapper.style.borderRadius = '12px';
        targetWrapper.style.border = '1px solid rgba(255, 215, 0, 0.3)';
        targetWrapper.style.marginRight = '8px';

        const targetLabel = document.createElement('span');
        targetLabel.textContent = 'TARGET';
        targetLabel.style.fontSize = '10px';
        targetLabel.style.color = '#ffd700';
        targetLabel.style.fontWeight = 'bold';
        targetLabel.style.marginRight = '6px';
        targetLabel.style.letterSpacing = '0.5px';

        // Target Ball Size 24px
        const targetCanvas = this.renderBallPreviewCanvas(lowestBall, this.selectedBallSet, 24);
        
        targetWrapper.appendChild(targetLabel);
        if (targetCanvas) {
            targetCanvas.style.filter = 'drop-shadow(0 0 3px rgba(255, 215, 0, 0.4))';
            targetWrapper.appendChild(targetCanvas);
        }
        this.ballGroups.appendChild(targetWrapper);

        // --- PART B: THE RAIL ---
        if (railSequence.length > 0) {
            const railWrapper = document.createElement('div');
            railWrapper.style.display = 'flex';
            railWrapper.style.alignItems = 'center';
            railWrapper.style.gap = '2px';
            railWrapper.style.padding = '2px 6px';
            railWrapper.style.background = 'rgba(0,0,0,0.3)';
            railWrapper.style.borderRadius = '10px';

            for (const ballNum of railSequence) {
                // Rail Ball Size 16px
                const smallCanvas = this.renderBallPreviewCanvas(ballNum, this.selectedBallSet, 16);
                if (smallCanvas) {
                    smallCanvas.style.opacity = '0.7';
                    railWrapper.appendChild(smallCanvas);
                }
            }
            this.ballGroups.appendChild(railWrapper);
        }
    }

    // Update ball groups display for UK 8-ball
    updateUKBallGroups(player1Group, player2Group, remaining, colorScheme, currentPlayer) {
        if (this.currentMode !== GameMode.UK_EIGHT_BALL) {
            return;
        }

        this.ballGroups.innerHTML = '';
        // APPLY LAYOUT CLASS: Moves container to top-right rail
        this.ballGroups.className = 'ball-groups-8ball';

        if (!player1Group) {
            this.ballGroups.innerHTML = '<div class="ball-group"><span>Table Open</span></div>';
            return;
        }

        const createGroupDisplay = (playerNum, group, count, isActive) => {
            const container = document.createElement('div');
            container.className = `ball-group ${isActive ? 'active-turn' : ''}`;

            const repBallNum = group === 'group1' ? 1 : 9;
            const canvas = this.renderBallPreviewCanvas(repBallNum, this.selectedBallSet, 22);
            
            if (canvas) {
                container.appendChild(canvas);
            }

            const textSpan = document.createElement('span');
            textSpan.textContent = `P${playerNum}: ${count}`;

            if (isActive) {
                textSpan.style.color = '#ffd700';
            }

            container.appendChild(textSpan);
            return container;
        };

        const p1Count = player1Group === 'group1' ? remaining.group1 : remaining.group2;
        const p1El = createGroupDisplay(1, player1Group, p1Count, currentPlayer === 1);
        this.ballGroups.appendChild(p1El);

        const p2Count = player2Group === 'group1' ? remaining.group1 : remaining.group2;
        const p2El = createGroupDisplay(2, player2Group, p2Count, currentPlayer === 2);
        this.ballGroups.appendChild(p2El);
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
            this.showGameOverWithMatch(info.winner, info.gameOverReason, info.match);
            return;
        }

        // Update the new unified HUD
        this.updateUnifiedHUD(info, info.match);

        // --- 9-BALL LOGIC FIX ---
        if (info.mode === GameMode.NINE_BALL) {
            // CRITICAL: We prioritize info.remainingBalls (the array)
            // If that is missing, we pass empty array [] to prevent the fallback loop from showing ghost balls
            const remaining = Array.isArray(info.remainingBalls) ? info.remainingBalls : [];
            this.update9BallHUD(info.lowestBall, remaining);
            this.hideSnookerPointsInfo();
        } else if (info.mode === GameMode.SNOOKER) {
            // Show snooker points remaining info
            this.updateSnookerPointsInfo(info);
        } else {
            this.hideSnookerPointsInfo();
        }

        // Snooker HUD is now handled in updateUnifiedHUD

        // Ball in hand message
        if (info.state === GameState.BALL_IN_HAND) {
            let message = 'Ball in hand - Click anywhere to place';
            if (info.isBreakShot) {
                message = 'Place cue ball behind the line to break';
            } else if (info.mode === GameMode.UK_EIGHT_BALL) {
                message = 'Place ball behind the line - 2 shots';
            }
            this.showMessage(message);
        } else {
            this.hideMessage();
        }
    }

    // Update snooker HUD
    updateSnookerHUD(info) {
        if (!this.snookerScoreDisplay) return;

        // Update scores
        this.snookerScoreDisplay.innerHTML = `
            <span class="snooker-p1${info.currentPlayer === 1 ? ' active' : ''}">P1: ${info.player1Score}</span>
            <span class="snooker-p2${info.currentPlayer === 2 ? ' active' : ''}">P2: ${info.player2Score}</span>
        `;

        // Update break
        if (this.snookerBreakDisplay) {
            if (info.currentBreak > 0) {
                this.snookerBreakDisplay.textContent = `Break: ${info.currentBreak}`;
                this.snookerBreakDisplay.classList.remove('hidden');
            } else {
                this.snookerBreakDisplay.classList.add('hidden');
            }
        }

        // Update target indicator
        if (this.snookerTargetDisplay) {
            if (info.snookerTarget === 'red') {
                this.snookerTargetDisplay.innerHTML = '<span class="target-dot target-red"></span> Red';
                this.snookerTargetDisplay.className = 'snooker-target-red';
            } else if (info.snookerTarget === 'color') {
                // Show all color options
                this.snookerTargetDisplay.innerHTML =
                    '<span class="target-dot target-yellow"></span>' +
                    '<span class="target-dot target-green"></span>' +
                    '<span class="target-dot target-brown"></span>' +
                    '<span class="target-dot target-blue"></span>' +
                    '<span class="target-dot target-pink"></span>' +
                    '<span class="target-dot target-black"></span>';
                this.snookerTargetDisplay.className = 'snooker-target-any';
            } else {
                // Specific color in sequence
                const colorName = info.snookerTarget.charAt(0).toUpperCase() + info.snookerTarget.slice(1);
                this.snookerTargetDisplay.innerHTML = `<span class="target-dot target-${info.snookerTarget}"></span> ${colorName}`;
                this.snookerTargetDisplay.className = `snooker-target-${info.snookerTarget}`;
            }
        }
    }

    // Update snooker points remaining info (bottom right at 75%)
    updateSnookerPointsInfo(info) {
        if (!this.ballGroups) return;

        // Position at bottom right, centered at 75% (same as 9-ball)
        this.ballGroups.innerHTML = '';
        this.ballGroups.className = 'ball-groups-snooker-info';
        this.ballGroups.style.position = 'absolute';
        this.ballGroups.style.bottom = '8px';
        this.ballGroups.style.top = 'auto';
        this.ballGroups.style.left = '75%';
        this.ballGroups.style.right = 'auto';
        this.ballGroups.style.transform = 'translateX(-50%)';
        this.ballGroups.style.display = 'flex';
        this.ballGroups.style.flexDirection = 'row';
        this.ballGroups.style.alignItems = 'center';
        this.ballGroups.style.gap = '10px';
        this.ballGroups.style.padding = '4px 12px';
        this.ballGroups.style.background = 'rgba(0, 0, 0, 0.75)';
        this.ballGroups.style.borderRadius = '4px';
        this.ballGroups.style.border = '1px solid rgba(255, 215, 0, 0.3)';
        this.ballGroups.style.fontSize = '0.75rem';
        this.ballGroups.style.color = '#fff';

        // Remaining points indicator
        const remainingDiv = document.createElement('div');
        remainingDiv.style.display = 'flex';
        remainingDiv.style.alignItems = 'center';
        remainingDiv.style.gap = '4px';

        const remainingLabel = document.createElement('span');
        remainingLabel.textContent = 'Available:';
        remainingLabel.style.color = '#aaa';
        remainingLabel.style.fontSize = '0.7rem';

        const remainingValue = document.createElement('span');
        remainingValue.textContent = info.remainingPoints || 0;
        remainingValue.style.color = '#ffd700';
        remainingValue.style.fontWeight = 'bold';

        remainingDiv.appendChild(remainingLabel);
        remainingDiv.appendChild(remainingValue);

        this.ballGroups.appendChild(remainingDiv);

        // Calculate lead/deficit
        const p1Score = info.player1Score || 0;
        const p2Score = info.player2Score || 0;
        const currentPlayer = info.currentPlayer;

        let leadDeficit = 0;
        let isAhead = false;

        if (currentPlayer === 1) {
            leadDeficit = p1Score - p2Score;
        } else {
            leadDeficit = p2Score - p1Score;
        }

        isAhead = leadDeficit > 0;

        // Show lead (green) or deficit (red) if not tied
        if (leadDeficit !== 0) {
            const separator = document.createElement('span');
            separator.textContent = '|';
            separator.style.color = '#444';

            const statusDiv = document.createElement('div');
            statusDiv.style.display = 'flex';
            statusDiv.style.alignItems = 'center';
            statusDiv.style.gap = '4px';

            const statusLabel = document.createElement('span');
            statusLabel.textContent = isAhead ? 'Ahead:' : 'Behind:';
            statusLabel.style.color = '#aaa';
            statusLabel.style.fontSize = '0.7rem';

            const statusValue = document.createElement('span');
            statusValue.textContent = Math.abs(leadDeficit);
            statusValue.style.color = isAhead ? '#00ff00' : '#ff6b6b';
            statusValue.style.fontWeight = 'bold';

            statusDiv.appendChild(statusLabel);
            statusDiv.appendChild(statusValue);

            this.ballGroups.appendChild(separator);
            this.ballGroups.appendChild(statusDiv);
        }
    }

    // Hide snooker points info
    hideSnookerPointsInfo() {
        if (!this.ballGroups) return;
        if (this.ballGroups.className === 'ball-groups-snooker-info') {
            this.ballGroups.innerHTML = '';
            this.ballGroups.className = '';
            this.ballGroups.style.cssText = '';
        }
    }

    // Get sound enabled state
    isSoundEnabled() {
        return this.soundToggle.checked;
    }

    // Get selected match format (bestOf value)
    getMatchFormat() {
        return parseInt(this.matchFormatSelect?.value || '1');
    }

    // Check for saved match and show resume button if found
    checkForSavedMatch() {
        try {
            const saved = localStorage.getItem('poolGame_savedMatch');
            if (saved) {
                const data = JSON.parse(saved);
                if (data && data.version === 1) {
                    // Show resume button with match info
                    if (this.btnResumeMatch) {
                        this.btnResumeMatch.classList.remove('hidden');
                        const modeNames = {
                            '8ball': '8-Ball',
                            'uk8ball': 'UK 8-Ball',
                            '9ball': '9-Ball',
                            'snooker': 'Snooker'
                        };
                        const modeName = modeNames[data.gameMode] || data.gameMode;
                        if (this.resumeInfo) {
                            this.resumeInfo.textContent = `(${modeName} ${data.player1Frames}-${data.player2Frames})`;
                        }
                    }
                    return data;
                }
            }
        } catch (e) {
            console.warn('Failed to check for saved match:', e);
        }

        // No valid saved match
        if (this.btnResumeMatch) {
            this.btnResumeMatch.classList.add('hidden');
        }
        return null;
    }

    // Update the unified HUD with game and match info
    updateUnifiedHUD(gameInfo, matchInfo) {
        if (!this.hudInfoPanel) return;

        // Update mode name
        const modeNames = {
            '8ball': '8-Ball',
            'uk8ball': 'UK 8-Ball',
            '9ball': '9-Ball',
            'snooker': 'Snooker',
            'freeplay': 'Free Play'
        };
        if (this.hudModeName) {
            this.hudModeName.textContent = modeNames[gameInfo.mode] || gameInfo.mode;
        }

        // Update turn indicator
        if (this.hudTurnIndicator) {
            this.hudTurnIndicator.textContent = `Player ${gameInfo.currentPlayer}'s Turn`;
        }

        // Show/hide two-shot badge for UK 8-ball
        if (this.hudTwoShot) {
            if (gameInfo.mode === GameMode.UK_EIGHT_BALL && gameInfo.shotsRemaining > 1) {
                this.hudTwoShot.classList.remove('hidden');
                this.hudTwoShot.textContent = `${gameInfo.shotsRemaining} shots`;
            } else {
                this.hudTwoShot.classList.add('hidden');
            }
        }

        // Show snooker break and target in left panel
        if (gameInfo.mode === GameMode.SNOOKER) {
            // Show break
            if (this.hudSnookerBreak) {
                if (gameInfo.currentBreak > 0) {
                    this.hudSnookerBreak.textContent = `Break: ${gameInfo.currentBreak}`;
                    this.hudSnookerBreak.classList.remove('hidden');
                } else {
                    this.hudSnookerBreak.classList.add('hidden');
                }
            }

            // Show target
            if (this.hudSnookerTarget) {
                this.hudSnookerTarget.classList.remove('hidden');
                if (gameInfo.snookerTarget === 'red') {
                    this.hudSnookerTarget.innerHTML = '<span class="target-dot target-red"></span> Red';
                } else if (gameInfo.snookerTarget === 'color') {
                    // Show compact multi-color striped indicator
                    this.hudSnookerTarget.innerHTML = '<span class="target-dot target-multi-color"></span> Color';
                } else {
                    const colorName = gameInfo.snookerTarget.charAt(0).toUpperCase() + gameInfo.snookerTarget.slice(1);
                    this.hudSnookerTarget.innerHTML = `<span class="target-dot target-${gameInfo.snookerTarget}"></span> ${colorName}`;
                }
            }
        } else {
            // Hide snooker elements for non-snooker modes
            if (this.hudSnookerBreak) this.hudSnookerBreak.classList.add('hidden');
            if (this.hudSnookerTarget) this.hudSnookerTarget.classList.add('hidden');
        }

        // Update player active states
        if (this.hudPlayer1) {
            this.hudPlayer1.classList.toggle('active', gameInfo.currentPlayer === 1);
        }
        if (this.hudPlayer2) {
            this.hudPlayer2.classList.toggle('active', gameInfo.currentPlayer === 2);
        }

        // Update scores display
        if (matchInfo && this.hudScores) {
            // Update bestOf display in center
            if (this.scoreBestof) {
                this.scoreBestof.textContent = `(${matchInfo.bestOf})`;
            }

            if (gameInfo.mode === GameMode.SNOOKER) {
                // Snooker: show point scores next to players, frame scores in middle
                if (this.p1PointScore) {
                    this.p1PointScore.textContent = gameInfo.player1Score || 0;
                    this.p1PointScore.style.display = 'inline';
                }
                if (this.p2PointScore) {
                    this.p2PointScore.textContent = gameInfo.player2Score || 0;
                    this.p2PointScore.style.display = 'inline';
                }
                // Show frame scores in middle
                if (this.p1Frames) this.p1Frames.textContent = matchInfo.player1Frames;
                if (this.p2Frames) this.p2Frames.textContent = matchInfo.player2Frames;
            } else {
                // Other modes: hide point scores, show frame scores in middle
                if (this.p1PointScore) this.p1PointScore.style.display = 'none';
                if (this.p2PointScore) this.p2PointScore.style.display = 'none';
                if (this.p1Frames) this.p1Frames.textContent = matchInfo.player1Frames;
                if (this.p2Frames) this.p2Frames.textContent = matchInfo.player2Frames;
            }
        }

        // Hide players panel for free play
        if (this.hudPlayersPanel) {
            this.hudPlayersPanel.classList.toggle('hidden-freeplay', gameInfo.mode === GameMode.FREE_PLAY);
        }

        // Update ball group indicators
        this.updateBallGroupIndicators(gameInfo);
    }

    // Update ball group indicators for each player
    updateBallGroupIndicators(gameInfo) {
        if (!this.p1BallGroup || !this.p2BallGroup) return;

        // Clear existing indicators
        this.p1BallGroup.innerHTML = '';
        this.p2BallGroup.innerHTML = '';

        // Only show ball groups for 8-ball games after groups are assigned
        if (gameInfo.mode !== GameMode.EIGHT_BALL && gameInfo.mode !== GameMode.UK_EIGHT_BALL) {
            return;
        }

        if (!gameInfo.player1Group) {
            return; // Table is open, no groups assigned yet
        }

        // Render ball indicator for player 1
        const p1GroupType = gameInfo.player1Group;
        const p2GroupType = gameInfo.player2Group;

        if (gameInfo.mode === GameMode.EIGHT_BALL) {
            // US 8-ball: solid (1) or stripe (9)
            const p1BallNum = p1GroupType === 'solid' ? 1 : 9;
            const p2BallNum = p2GroupType === 'solid' ? 1 : 9;

            const p1Canvas = this.renderBallPreviewCanvas(p1BallNum, this.selectedBallSet, 18);
            const p2Canvas = this.renderBallPreviewCanvas(p2BallNum, this.selectedBallSet, 18);

            if (p1Canvas) this.p1BallGroup.appendChild(p1Canvas);
            if (p2Canvas) this.p2BallGroup.appendChild(p2Canvas);
        } else if (gameInfo.mode === GameMode.UK_EIGHT_BALL) {
            // UK 8-ball: group1 (1) or group2 (9)
            const p1BallNum = p1GroupType === 'group1' ? 1 : 9;
            const p2BallNum = p2GroupType === 'group1' ? 1 : 9;

            const p1Canvas = this.renderBallPreviewCanvas(p1BallNum, this.selectedBallSet, 18);
            const p2Canvas = this.renderBallPreviewCanvas(p2BallNum, this.selectedBallSet, 18);

            if (p1Canvas) this.p1BallGroup.appendChild(p1Canvas);
            if (p2Canvas) this.p2BallGroup.appendChild(p2Canvas);
        }
    }

    // Show game over with match context
    showGameOverWithMatch(winner, reason, matchInfo) {
        this.gameOverScreen.classList.remove('hidden');
        this.freeplayControls.classList.add('hidden');
        if (this.snookerHud) this.snookerHud.classList.add('hidden');

        // Update winner text
        if (matchInfo && matchInfo.matchComplete) {
            // Match is complete - show match winner
            this.winnerText.textContent = `Player ${matchInfo.matchWinner} Wins the Match!`;
            this.winnerText.style.color = '#ffd700';
        } else if (winner) {
            // Single frame or multi-frame in progress
            if (matchInfo && matchInfo.bestOf > 1) {
                this.winnerText.textContent = `Player ${winner} Wins the Frame!`;
            } else {
                this.winnerText.textContent = `Player ${winner} Wins!`;
            }
            this.winnerText.style.color = '#ffd700';
        } else {
            this.winnerText.textContent = reason || 'Game Over';
            this.winnerText.style.color = '#fff';
        }

        // Update frame score display
        if (matchInfo && matchInfo.bestOf > 1 && this.frameScoreDisplay) {
            this.frameScoreDisplay.classList.remove('hidden');
            if (this.frameP1Score) this.frameP1Score.textContent = matchInfo.player1Frames;
            if (this.frameP2Score) this.frameP2Score.textContent = matchInfo.player2Frames;
        } else if (this.frameScoreDisplay) {
            this.frameScoreDisplay.classList.add('hidden');
        }

        // Show/hide next frame button
        if (this.btnNextFrame) {
            if (matchInfo && matchInfo.bestOf > 1 && !matchInfo.matchComplete) {
                this.btnNextFrame.classList.remove('hidden');
            } else {
                this.btnNextFrame.classList.add('hidden');
            }
        }
    }

    // Show table creator modal
    showTableCreatorModal() {
        if (!this.tableCreatorModal) return;

        this.hideTableModal();
        this.editingTableId = null;

        this.tableCreatorModal.classList.remove('hidden');

        // Reset form
        if (this.customTableNameInput) this.customTableNameInput.value = '';
        if (this.baseTableSelect) this.baseTableSelect.value = '1';
        if (this.tableHueSlider) this.tableHueSlider.value = '0';
        if (this.tableSaturationSlider) this.tableSaturationSlider.value = '100';
        if (this.tableBrightnessSlider) this.tableBrightnessSlider.value = '100';

        // Update value displays
        if (this.tableHueValue) this.tableHueValue.textContent = '0°';
        if (this.tableSaturationValue) this.tableSaturationValue.textContent = '100%';
        if (this.tableBrightnessValue) this.tableBrightnessValue.textContent = '100%';

        // Update modal title and button text
        const modalTitle = this.tableCreatorModal.querySelector('.modal-header h2');
        if (modalTitle) modalTitle.textContent = 'Create Custom Table';
        const saveBtn = document.getElementById('btn-save-table');
        if (saveBtn) saveBtn.textContent = 'Save Table';

        this.updateTablePreviewInCreator();
    }

    // Hide table creator modal
    hideTableCreatorModal() {
        if (this.tableCreatorModal) {
            this.tableCreatorModal.classList.add('hidden');
        }
    }

    // Edit a custom table
    editCustomTable(table) {
        this.editingTableId = table.id;
        this.hideTableModal();

        this.tableCreatorModal?.classList.remove('hidden');

        // Load table data into form
        if (this.customTableNameInput) this.customTableNameInput.value = table.name || '';
        if (this.baseTableSelect) this.baseTableSelect.value = table.baseTable.toString();
        if (this.tableHueSlider) this.tableHueSlider.value = table.hue.toString();
        if (this.tableSaturationSlider) this.tableSaturationSlider.value = table.saturation.toString();
        if (this.tableBrightnessSlider) this.tableBrightnessSlider.value = table.brightness.toString();

        // Update value displays
        if (this.tableHueValue) this.tableHueValue.textContent = `${table.hue}°`;
        if (this.tableSaturationValue) this.tableSaturationValue.textContent = `${table.saturation}%`;
        if (this.tableBrightnessValue) this.tableBrightnessValue.textContent = `${table.brightness}%`;

        // Update modal title and button text
        const modalTitle = this.tableCreatorModal.querySelector('.modal-header h2');
        if (modalTitle) modalTitle.textContent = 'Edit Custom Table';
        const saveBtn = document.getElementById('btn-save-table');
        if (saveBtn) saveBtn.textContent = 'Save Changes';

        this.updateTablePreviewInCreator();
    }

    // Delete a custom table
    deleteCustomTable(tableId) {
        if (!confirm('Delete this custom table?')) return;

        this.tableManager.delete(tableId);

        // If deleted table was selected, switch to default
        if (this.selectedTable === tableId) {
            this.selectedTable = 1;
            this.saveSelectedTable(1);
            this.updateTablePreview();

            // Trigger table change callback
            if (this.onTableChange) {
                this.onTableChange(1);
            }
        }

        this.initializeTableGrid();
    }

    // Save custom table
    saveCustomTable() {
        const name = this.customTableNameInput?.value?.trim() || 'Custom Table';
        const baseTable = parseInt(this.baseTableSelect?.value || '1');
        const hue = parseInt(this.tableHueSlider?.value || '0');
        const saturation = parseInt(this.tableSaturationSlider?.value || '100');
        const brightness = parseInt(this.tableBrightnessSlider?.value || '100');

        const config = {
            name,
            baseTable,
            hue,
            saturation,
            brightness
        };

        let savedTable;
        if (this.editingTableId) {
            // Update existing table
            savedTable = this.tableManager.update(this.editingTableId, config);
        } else {
            // Create new table
            savedTable = this.tableManager.create(config);
        }

        // Select the saved table
        this.selectedTable = savedTable.id;
        this.saveSelectedTable(savedTable.id);
        this.updateTablePreview();

        // Trigger table change callback
        if (this.onTableChange) {
            this.onTableChange(savedTable.id);
        }

        this.editingTableId = null;
        this.hideTableCreatorModal();
        this.initializeTableGrid();
        this.showTableModal();
    }

    // Update table preview in creator modal
    updateTablePreviewInCreator() {
        if (!this.tableCreatorPreview || !this.baseTableSelect) return;

        const baseTable = parseInt(this.baseTableSelect.value);
        const hue = parseInt(this.tableHueSlider?.value || '0');
        const saturation = parseInt(this.tableSaturationSlider?.value || '100');
        const brightness = parseInt(this.tableBrightnessSlider?.value || '100');

        this.renderTablePreviewToCanvas(this.tableCreatorPreview, baseTable, {
            hue,
            saturation,
            brightness
        });
    }

    // Render table preview to canvas with HSB adjustments
    renderTablePreviewToCanvas(canvas, baseTable, hsbAdjustments = null) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Load base table image
        const baseImg = new Image();
        const imgSrc = baseTable === 1 ? 'assets/pooltable.png' : `assets/pooltable${baseTable}.png`;

        baseImg.onload = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(baseImg, 0, 0, width, height);

            // Check if this table has a colorize overlay
            const hasOverlay = this.tableManager.hasColorizeOverlay(baseTable);

            if (hasOverlay && hsbAdjustments) {
                // Load and apply colorize overlay with HSB filters
                const overlayImg = new Image();
                overlayImg.src = `assets/Table${baseTable}-colorize.png`;

                overlayImg.onload = () => {
                    // Apply HSB adjustments via CSS filter
                    ctx.save();

                    // Calculate filter values
                    const hue = hsbAdjustments.hue || 0;
                    const saturation = hsbAdjustments.saturation || 100;
                    const brightness = hsbAdjustments.brightness || 100;

                    // Build CSS filter string
                    const filterString = `hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${brightness}%)`;
                    ctx.filter = filterString;

                    ctx.drawImage(overlayImg, 0, 0, width, height);

                    ctx.restore();
                };

                overlayImg.onerror = () => {
                    console.warn(`Colorize overlay not found for table ${baseTable}`);
                };
            }
        };

        baseImg.src = imgSrc;
    }

    // Get the actual table number for rendering (resolves custom tables to base table)
    getTableNumberForRendering(tableId) {
        if (this.tableManager.isCustomTable(tableId)) {
            return this.tableManager.getBaseTableNumber(tableId);
        }
        return tableId;
    }

    // Get HSB adjustments for a table (null if no adjustments needed)
    getTableHSBAdjustments(tableId) {
        return this.tableManager.getHSBAdjustments(tableId);
    }
}
