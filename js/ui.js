// UI system - handles menus, HUD, and game state display

import { GameMode, GameState } from './game.js';
import { CustomBallSetManager, PREDEFINED_BALL_SETS } from './custom-ball-sets.js';
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

        // Ball set manager
        this.ballSetManager = new CustomBallSetManager();
        this.ballRenderer = new BallRenderer3D(Constants.BALL_RADIUS);

        // Selection state - load from localStorage or use defaults
        this.selectedTable = this.loadSelectedTable();
        this.selectedBallSet = this.loadSelectedBallSet();
        this.creatorStyle = 'solid';
        this.editingSetId = null; // Track which set is being edited

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
            this.borderColorField?.classList.toggle('hidden', !this.numberBorderCheckbox.checked);
            this.updateCreatorPreview();
        });
        this.colorNumberBorder?.addEventListener('input', () => this.updateCreatorPreview());

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
    }

    // Initialize table selection grid
    initializeTableGrid() {
        if (!this.tableGrid) return;

        this.tableGrid.innerHTML = '';

        for (let i = 1; i <= 9; i++) {
            const option = document.createElement('div');
            option.className = 'table-option' + (i === this.selectedTable ? ' selected' : '');
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
    }

    // Initialize modals
    initializeModals() {
        // Any additional modal initialization
    }

    // Update table preview in main menu
    updateTablePreview() {
        if (!this.tablePreview || !this.tableName) return;

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
            numberBorderColor: config.numberBorderColor
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

    // Select a table
    selectTable(tableNum) {
        this.selectedTable = tableNum;

        // Save to localStorage
        this.saveSelectedTable(tableNum);

        // Update visual selection
        const options = this.tableGrid?.querySelectorAll('.table-option');
        options?.forEach(opt => {
            opt.classList.toggle('selected', parseInt(opt.dataset.table) === tableNum);
        });

        // Update main menu preview
        this.updateTablePreview();

        // Trigger table change callback
        this.tableSelect.value = tableNum;
        if (this.onTableChange) {
            this.onTableChange(tableNum);
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

            const nameDiv = document.createElement('div');
            nameDiv.className = 'set-name';
            nameDiv.textContent = set.name;
            option.appendChild(nameDiv);

            // Add edit and delete buttons for custom sets
            if (!set.isPredefined) {
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'set-buttons';

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-set';
                editBtn.textContent = '\u270E'; // Pencil icon
                editBtn.title = 'Edit set';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editCustomBallSet(set);
                });
                buttonContainer.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-set';
                deleteBtn.textContent = '\u00D7';
                deleteBtn.title = 'Delete set';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteCustomBallSet(set.id);
                });
                buttonContainer.appendChild(deleteBtn);

                option.appendChild(buttonContainer);
            }

            option.addEventListener('click', () => {
                this.selectBallSet(set);
            });

            this.ballSetGrid.appendChild(option);
        }
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

            // Load number styling
            this.setColorValue(this.colorNumberCircle, set.options?.numberCircleColor || '#FFFFFF');
            this.setColorValue(this.colorNumberText, set.options?.numberTextColor || '#000000');
            if (this.numberBorderCheckbox) this.numberBorderCheckbox.checked = set.options?.numberBorder || false;
            this.setColorValue(this.colorNumberBorder, set.options?.numberBorderColor || '#000000');
            this.borderColorField?.classList.toggle('hidden', !set.options?.numberBorder);

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
                    stripeBackgroundColor: this.colorStripeBg?.value || '#FFFFFF',
                    numberCircleColor: this.colorNumberCircle?.value || '#FFFFFF',
                    numberTextColor: this.colorNumberText?.value || '#000000',
                    numberBorder: this.numberBorderCheckbox?.checked || false,
                    numberBorderColor: this.colorNumberBorder?.value || '#000000'
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
                    stripeBackgroundColor: this.colorStripeBg?.value || '#FFFFFF',
                    numberCircleColor: this.colorNumberCircle?.value || '#FFFFFF',
                    numberTextColor: this.colorNumberText?.value || '#000000',
                    numberBorder: this.numberBorderCheckbox?.checked || false,
                    numberBorderColor: this.colorNumberBorder?.value || '#000000'
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
                const tableNum = parseInt(saved);
                if (tableNum >= 1 && tableNum <= 9) {
                    return tableNum;
                }
            }
        } catch (e) {
            console.warn('Failed to load selected table:', e);
        }
        return 1; // Default to Classic Green
    }

    // Save selected table to localStorage
    saveSelectedTable(tableNum) {
        try {
            localStorage.setItem('poolGame_selectedTable', tableNum.toString());
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

    // Show main menu
    showMainMenu() {
        this.mainMenu.classList.remove('hidden');
        this.gameHud.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.freeplayControls.classList.add('hidden');
        if (this.snookerHud) this.snookerHud.classList.add('hidden');
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
            if (this.snookerHud) this.snookerHud.classList.add('hidden');
        } else if (mode === GameMode.SNOOKER) {
            this.freeplayControls.classList.add('hidden');
            if (this.snookerHud) this.snookerHud.classList.remove('hidden');
            this.updatePlayerIndicator(1);
        } else {
            this.freeplayControls.classList.add('hidden');
            if (this.snookerHud) this.snookerHud.classList.add('hidden');
            this.updatePlayerIndicator(1);
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
        } else if (this.currentMode === GameMode.SNOOKER) {
            // Snooker shows turn info in main player indicator
            text = `Player ${player}'s Turn - Snooker`;
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

        // Update snooker HUD
        if (info.mode === GameMode.SNOOKER) {
            this.updateSnookerHUD(info);
        }

        // Ball in hand message
        if (info.state === GameState.BALL_IN_HAND) {
            let message;
            if (info.isBreakShot) {
                message = 'Place cue ball behind the line to break';
            } else if (info.mode === GameMode.UK_EIGHT_BALL) {
                message = 'Place ball behind the line - 2 shots';
            } else if (info.mode === GameMode.SNOOKER) {
                message = 'Ball in hand - Click anywhere to place';
            } else {
                message = 'Ball in hand - Click anywhere to place';
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

    // Get sound enabled state
    isSoundEnabled() {
        return this.soundToggle.checked;
    }
}
