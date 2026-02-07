// Custom Ball Set Manager - handles localStorage CRUD for custom ball sets

const STORAGE_KEY = 'poolGame_customBallSets';
const DELETED_DEFAULTS_KEY = 'poolGame_deletedDefaultBallSets';

// Default custom ball sets - loaded as editable defaults
const DEFAULT_CUSTOM_BALL_SETS = [
    {
        id: 'default-hot-pink',
        name: 'Hot Pink',
        style: 'solid',
        colors: {
            cue: '#FFFEF0',
            group1: '#131010',
            group2: '#ff00dd',
            eightBall: '#9e9e9e'
        },
        options: {
            hasStripes: false,
            showNumbers: false,
            striped8Ball: false,
            stripeBackgroundColor: '#FFFFFF',
            numberCircleColor: '#FFFFFF',
            numberTextColor: '#000000',
            numberBorder: true,
            numberBorderColor: '#000000',
            numberCircleRadialLines: 0,
            stripeThickness: 0.55,
            numberCircleRadius: 0.82
        },
        isPredefined: false,
        isDefault: true,
        advancedMode: false
    },
    {
        id: 'default-pro-league',
        name: 'Pro League',
        style: 'stripe',
        colors: {
            cue: '#FFFEF0',
            group1: '#e6a800',
            group2: '#7a0120',
            eightBall: '#000000'
        },
        options: {
            hasStripes: true,
            showNumbers: true,
            striped8Ball: false,
            stripeBackgroundColor: '#ffffff',
            numberCircleColor: '#ffffff',
            numberTextColor: '#000000',
            numberBorder: true,
            numberBorderColor: '#000000',
            numberCircleRadialLines: 3,
            radialLinesColor: '#000000',
            stripeThickness: 0.67,
            numberCircleRadius: 0.63,
            borderWidth: 1.7,
            numberScale: 1.05,
            stripeOrientation: 'horizontal'
        },
        isPredefined: false,
        isDefault: true,
        advancedMode: false
    },
    {
        id: 'default-pro-tournament',
        name: 'Pro Tournament',
        style: 'stripe',
        colors: {
            cue: '#FFFEF0',
            group1: '#FFD700',
            group2: '#0000CD',
            eightBall: '#000000'
        },
        options: {
            hasStripes: true,
            showNumbers: true,
            striped8Ball: false,
            stripeBackgroundColor: '#000000',
            numberCircleColor: '#FFFFFF',
            numberTextColor: '#000000',
            numberBorder: true,
            numberBorderColor: '#000000',
            numberCircleRadialLines: 2,
            radialLinesColor: '#000000',
            stripeThickness: 0.6,
            numberCircleRadius: 0.51,
            borderWidth: 2,
            numberScale: 1.1,
            stripeOrientation: 'horizontal'
        },
        isPredefined: false,
        isDefault: true,
        advancedMode: true,
        ballColors: {
            1: '#f5b400',
            2: '#0037ed',
            3: '#ff1e00',
            4: '#ff477b',
            5: '#9a2eff',
            6: '#00e39b',
            7: '#80320b',
            8: '#000000',
            9: '#f5b400',
            10: '#0037ed',
            11: '#ff1e00',
            12: '#ff477b',
            13: '#9a2eff',
            14: '#00e39b',
            15: '#80320b'
        }
    },
    {
        id: 'default-space',
        name: 'Space',
        style: 'stripe',
        colors: {
            cue: '#FFFEF0',
            group1: '#ffd700',
            group2: '#0000cd',
            eightBall: '#000000'
        },
        options: {
            hasStripes: true,
            showNumbers: true,
            striped8Ball: false,
            stripeBackgroundColor: '#948f8f',
            numberCircleColor: '#ffffff',
            numberTextColor: '#000000',
            numberBorder: true,
            numberBorderColor: '#000000',
            numberCircleRadialLines: 13,
            radialLinesColor: '#000000',
            stripeThickness: 0.39,
            numberCircleRadius: 0.77,
            borderWidth: 1,
            numberScale: 1,
            stripeOrientation: 'horizontal'
        },
        isPredefined: false,
        isDefault: true,
        advancedMode: true,
        ballColors: {
            1: '#ffd700',
            2: '#0000cd',
            3: '#ff0000',
            4: '#4b0082',
            5: '#ff8c00',
            6: '#006400',
            7: '#800000',
            8: '#000000',
            9: '#ffd700',
            10: '#0000cd',
            11: '#ff0000',
            12: '#4b0082',
            13: '#ff8c00',
            14: '#006400',
            15: '#800000'
        }
    },
    {
        id: 'default-vintage2',
        name: 'Vintage',
        style: 'stripe',
        colors: {
            cue: '#FFFEF0',
            group1: '#FFD700',
            group2: '#0000CD',
            eightBall: '#000000'
        },
        options: {
            hasStripes: true,
            showNumbers: true,
            striped8Ball: false,
            stripeBackgroundColor: '#ffe999',
            numberCircleColor: '#ffe999',
            numberTextColor: '#000000',
            numberBorder: true,
            numberBorderColor: '#383838',
            numberCircleRadialLines: 2,
            radialLinesColor: '#ffe999',
            stripeThickness: 0.58,
            numberCircleRadius: 0.64,
            borderWidth: 2,
            numberScale: 1.1,
            stripeOrientation: 'vertical'
        },
        isPredefined: false,
        isDefault: true,
        advancedMode: true,
        ballColors: {
            1: '#b88700',
            2: '#0000CD',
            3: '#FF0000',
            4: '#4B0082',
            5: '#ff7300',
            6: '#006400',
            7: '#800000',
            8: '#000000',
            9: '#b88700',
            10: '#0000CD',
            11: '#FF0000',
            12: '#4B0082',
            13: '#ff7300',
            14: '#006400',
            15: '#800000'
        }
    }
];

// Predefined ball sets
export const PREDEFINED_BALL_SETS = [
    {
        id: 'american',
        name: 'American',
        style: 'stripe',
        colors: {
            cue: '#FFFEF0',
            group1: null, // Use standard colors
            group2: null,
            eightBall: '#000000'
        },
        options: {
            hasStripes: true,
            showNumbers: true
        },
        isPredefined: true
    },
    {
        id: 'uk-red-yellow',
        name: 'UK Red/Yellow',
        style: 'solid',
        colors: {
            cue: '#FFFEF0',
            group1: '#CC0000',
            group2: '#FFD700',
            eightBall: '#000000'
        },
        options: {
            hasStripes: false,
            showNumbers: false
        },
        isPredefined: true
    },
    {
        id: 'uk-blue-yellow',
        name: 'UK Blue/Yellow',
        style: 'solid',
        colors: {
            cue: '#FFFEF0',
            group1: '#0000CC',
            group2: '#FFD700',
            eightBall: '#000000'
        },
        options: {
            hasStripes: false,
            showNumbers: false
        },
        isPredefined: true
    },
    {
        id: 'snooker',
        name: 'Snooker',
        style: 'snooker',
        colors: {
            cue: '#FFFEF0',
            red: '#CC0000',
            yellow: '#FFD700',
            green: '#228B22',
            brown: '#8B4513',
            blue: '#0066CC',
            pink: '#FF69B4',
            black: '#1a1a1a'
        },
        options: {
            hasStripes: false,
            showNumbers: false
        },
        isPredefined: true,
        isSnooker: true
    }
];

export class CustomBallSetManager {
    constructor() {
        this.deletedDefaults = this.loadDeletedDefaults();
        this.customSets = this.load();
    }

    // Load the list of deleted default set IDs
    loadDeletedDefaults() {
        try {
            const data = localStorage.getItem(DELETED_DEFAULTS_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    // Save the list of deleted default set IDs
    saveDeletedDefaults() {
        try {
            localStorage.setItem(DELETED_DEFAULTS_KEY, JSON.stringify(this.deletedDefaults));
        } catch (e) {
            console.warn('Failed to save deleted defaults list:', e);
        }
    }

    // Load custom sets from localStorage, merging with defaults
    load() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            const storedSets = data ? JSON.parse(data) : [];

            // Create a map of stored set IDs for quick lookup
            const storedIds = new Set(storedSets.map(s => s.id));

            // Add any default sets that aren't already in storage and haven't been deleted
            const mergedSets = [...storedSets];
            for (const defaultSet of DEFAULT_CUSTOM_BALL_SETS) {
                if (!storedIds.has(defaultSet.id) && !this.deletedDefaults.includes(defaultSet.id)) {
                    mergedSets.push({ ...defaultSet });
                }
            }

            return mergedSets;
        } catch (e) {
            console.warn('Failed to load custom ball sets:', e);
            // Return defaults on error (excluding deleted ones)
            return DEFAULT_CUSTOM_BALL_SETS
                .filter(s => !this.deletedDefaults.includes(s.id))
                .map(s => ({ ...s }));
        }
    }

    // Save custom sets to localStorage
    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customSets));
        } catch (e) {
            console.warn('Failed to save custom ball sets:', e);
        }
    }

    // Get all ball sets (predefined + custom)
    getAllSets() {
        return [...PREDEFINED_BALL_SETS, ...this.customSets];
    }

    // Get only custom sets
    getCustomSets() {
        return this.customSets;
    }

    // Get a set by ID
    getSet(id) {
        return this.getAllSets().find(set => set.id === id);
    }

    // Create a new custom set
    create(setData) {
        const newSet = {
            id: `custom-${Date.now()}`,
            name: setData.name || 'Custom Set',
            style: setData.style || 'solid',
            colors: {
                cue: '#FFFEF0',
                group1: setData.colors?.group1 || '#CC0000',
                group2: setData.colors?.group2 || '#FFD700',
                eightBall: setData.colors?.eightBall || '#000000'
            },
            options: {
                hasStripes: setData.style === 'stripe',
                showNumbers: setData.options?.showNumbers ?? (setData.style === 'stripe'),
                striped8Ball: setData.options?.striped8Ball || false,
                stripeBackgroundColor: setData.options?.stripeBackgroundColor || '#FFFFFF',
                numberCircleColor: setData.options?.numberCircleColor || '#FFFFFF',
                numberTextColor: setData.options?.numberTextColor || '#000000',
                numberBorder: setData.options?.numberBorder || false,
                numberBorderColor: setData.options?.numberBorderColor || '#000000',
                numberCircleRadialLines: setData.options?.numberCircleRadialLines || 0,
                radialLinesColor: setData.options?.radialLinesColor || '#000000',
                stripeThickness: setData.options?.stripeThickness ?? 0.55,
                numberCircleRadius: setData.options?.numberCircleRadius ?? 0.5,
                borderWidth: setData.options?.borderWidth ?? 1.0,
                numberScale: setData.options?.numberScale ?? 1.0,
                stripeOrientation: setData.options?.stripeOrientation || 'horizontal',
                numberCircleOpacity: setData.options?.numberCircleOpacity ?? 1.0,
                texture: setData.options?.texture || 'none',
                textureColorMode: setData.options?.textureColorMode || 'auto',
                textureColor: setData.options?.textureColor || '#FFFFFF',
                textureSeed: setData.options?.textureSeed || 0,
                numberFont: setData.options?.numberFont || 'Arial'
            },
            isPredefined: false,
            createdAt: Date.now()
        };

        // Advanced mode: individual ball colors
        if (setData.advancedMode && setData.ballColors) {
            newSet.advancedMode = true;
            newSet.ballColors = { ...setData.ballColors };
        }

        this.customSets.push(newSet);
        this.save();
        return newSet;
    }

    // Update an existing custom set
    update(id, setData) {
        const index = this.customSets.findIndex(set => set.id === id);
        if (index === -1) return null;

        const existingSet = this.customSets[index];

        // Build the updated set
        const updatedSet = {
            id: id, // Preserve ID
            name: setData.name || existingSet.name,
            style: setData.style || existingSet.style,
            colors: {
                cue: '#FFFEF0',
                group1: setData.colors?.group1 || '#CC0000',
                group2: setData.colors?.group2 || '#FFD700',
                eightBall: setData.colors?.eightBall || '#000000'
            },
            options: {
                hasStripes: setData.style === 'stripe',
                showNumbers: setData.options?.showNumbers ?? (setData.style === 'stripe'),
                striped8Ball: setData.options?.striped8Ball || false,
                stripeBackgroundColor: setData.options?.stripeBackgroundColor || '#FFFFFF',
                numberCircleColor: setData.options?.numberCircleColor || '#FFFFFF',
                numberTextColor: setData.options?.numberTextColor || '#000000',
                numberBorder: setData.options?.numberBorder || false,
                numberBorderColor: setData.options?.numberBorderColor || '#000000',
                numberCircleRadialLines: setData.options?.numberCircleRadialLines || 0,
                radialLinesColor: setData.options?.radialLinesColor || '#000000',
                stripeThickness: setData.options?.stripeThickness ?? 0.55,
                numberCircleRadius: setData.options?.numberCircleRadius ?? 0.5,
                borderWidth: setData.options?.borderWidth ?? 1.0,
                numberScale: setData.options?.numberScale ?? 1.0,
                stripeOrientation: setData.options?.stripeOrientation || 'horizontal',
                numberCircleOpacity: setData.options?.numberCircleOpacity ?? 1.0,
                texture: setData.options?.texture || 'none',
                textureColorMode: setData.options?.textureColorMode || 'auto',
                textureColor: setData.options?.textureColor || '#FFFFFF',
                textureSeed: setData.options?.textureSeed || 0,
                numberFont: setData.options?.numberFont || 'Arial'
            },
            isPredefined: false,
            createdAt: existingSet.createdAt,
            updatedAt: Date.now()
        };

        // Handle advanced mode
        if (setData.advancedMode && setData.ballColors) {
            updatedSet.advancedMode = true;
            updatedSet.ballColors = { ...setData.ballColors };
        } else {
            updatedSet.advancedMode = false;
            delete updatedSet.ballColors;
        }

        this.customSets[index] = updatedSet;
        this.save();
        return updatedSet;
    }

    // Delete a custom set
    delete(id) {
        const index = this.customSets.findIndex(set => set.id === id);
        if (index === -1) return false;

        // Track if this is a default set being deleted
        const isDefaultSet = id.startsWith('default-');
        if (isDefaultSet && !this.deletedDefaults.includes(id)) {
            this.deletedDefaults.push(id);
            this.saveDeletedDefaults();
        }

        this.customSets.splice(index, 1);
        this.save();
        return true;
    }

    // Import a single ball set from external data (generates new ID)
    importSet(setData) {
        // Strip existing IDs and metadata to avoid conflicts
        const { id, isPredefined, createdAt, updatedAt, ...cleanData } = setData;
        return this.create(cleanData);
    }

    // Restore all deleted default sets
    restoreDefaults() {
        this.deletedDefaults = [];
        this.saveDeletedDefaults();
        this.customSets = this.load();
        return this.customSets;
    }

    // Check if a set is a default set
    isDefaultSet(id) {
        return id.startsWith('default-');
    }

    // Convert a ball set to game-compatible color configuration
    toGameColors(ballSet) {
        if (!ballSet) return null;

        // American standard colors
        const standardColors = {
            0: '#FFFEF0',   // Cue ball
            1: '#FFD700',   // Yellow
            2: '#0000CD',   // Blue
            3: '#FF0000',   // Red
            4: '#4B0082',   // Purple
            5: '#FF8C00',   // Orange
            6: '#006400',   // Green
            7: '#800000',   // Maroon
            8: '#000000',   // Black
            9: '#FFD700',   // Yellow stripe
            10: '#0000CD',  // Blue stripe
            11: '#FF0000',  // Red stripe
            12: '#4B0082',  // Purple stripe
            13: '#FF8C00',  // Orange stripe
            14: '#006400',  // Green stripe
            15: '#800000'   // Maroon stripe
        };

        // If it's the American set or colors are null, use standard
        if (ballSet.id === 'american' ||
            (ballSet.colors.group1 === null && ballSet.colors.group2 === null)) {
            return standardColors;
        }

        // For UK-style or custom solid color sets
        const colors = {
            0: ballSet.colors.cue || '#FFFEF0',
            8: ballSet.colors.eightBall || '#000000'
        };

        // Group 1 (balls 1-7)
        for (let i = 1; i <= 7; i++) {
            colors[i] = ballSet.colors.group1;
        }

        // Group 2 (balls 9-15)
        for (let i = 9; i <= 15; i++) {
            colors[i] = ballSet.colors.group2;
        }

        return colors;
    }

    // Get ball configuration for a specific ball number
    getBallConfig(ballSet, ballNumber) {
        if (!ballSet) return null;

        const isCue = ballNumber === 0;

        // Handle snooker ball sets
        if (ballSet.isSnooker) {
            let color;
            if (isCue) {
                color = ballSet.colors.cue || '#FFFEF0';
            } else if (ballNumber >= 1 && ballNumber <= 15) {
                // Red balls (1-6 for mini, 1-15 for full)
                color = ballSet.colors.red || '#CC0000';
            } else {
                // Colored balls - map ball number to color name
                // Mini snooker: 7=yellow, 8=green, 9=brown, 10=blue, 11=pink, 12=black
                // Full snooker: 16=yellow, 17=green, 18=brown, 19=blue, 20=pink, 21=black
                const colorMap = {
                    7: 'yellow', 16: 'yellow',
                    8: 'green', 17: 'green',
                    9: 'brown', 18: 'brown',
                    10: 'blue', 19: 'blue',
                    11: 'pink', 20: 'pink',
                    12: 'black', 21: 'black'
                };
                const colorName = colorMap[ballNumber];
                color = colorName ? ballSet.colors[colorName] : '#CC0000';
            }

            return {
                color: color,
                isStripe: false,
                isUKBall: false,
                isSnookerBall: true,
                showNumber: false
            };
        }

        // Handle non-snooker ball sets
        const isGroup1 = ballNumber >= 1 && ballNumber <= 7;
        const isGroup2 = ballNumber >= 9 && ballNumber <= 15;
        const isEightBall = ballNumber === 8;

        let color;

        // Advanced mode: use individual ball colors
        if (ballSet.advancedMode && ballSet.ballColors && ballSet.ballColors[ballNumber]) {
            color = ballSet.ballColors[ballNumber];
        } else if (isCue) {
            color = ballSet.colors.cue || '#FFFEF0';
        } else if (isEightBall) {
            color = ballSet.colors.eightBall || '#000000';
        } else if (isGroup1) {
            color = ballSet.colors.group1;
        } else if (isGroup2) {
            color = ballSet.colors.group2;
        }

        // For American set, use standard colors
        if (ballSet.id === 'american' || color === null || color === undefined) {
            const standardColors = {
                0: '#FFFEF0', 1: '#FFD700', 2: '#0000CD', 3: '#FF0000',
                4: '#4B0082', 5: '#FF8C00', 6: '#006400', 7: '#800000',
                8: '#000000', 9: '#FFD700', 10: '#0000CD', 11: '#FF0000',
                12: '#4B0082', 13: '#FF8C00', 14: '#006400', 15: '#800000'
            };
            color = standardColors[ballNumber];
        }

        // Determine if this ball should be striped
        let isStripe = ballSet.style === 'stripe' && isGroup2;
        // Special case: striped 8-ball option for both solid and stripe sets
        if (isEightBall && ballSet.options?.striped8Ball) {
            isStripe = true;
        }

        // For solid style sets, balls are like UK balls (no number circle except for striped 8-ball)
        const isSolidStyle = ballSet.style === 'solid' && !ballSet.advancedMode;
        const isUKBall = isSolidStyle && !isStripe;

        // Determine if number should be shown
        let showNumber = false;
        if (ballSet.style === 'stripe') {
            // Stripe mode: show numbers on all numbered balls
            showNumber = ballNumber !== 0;
        } else if (isEightBall) {
            // Solid mode with striped 8-ball: show number on 8-ball
            showNumber = true;
        }

        // For striped 8-ball in stripe sets, use black as the stripe color
        let stripeColor = color;
        if (isEightBall && ballSet.style === 'stripe' && ballSet.options?.striped8Ball) {
            stripeColor = '#000000';
        }

        return {
            color: stripeColor,
            isStripe: isStripe,
            isUKBall: isUKBall,
            isSnookerBall: false,
            showNumber: showNumber,
            stripeBackgroundColor: ballSet.options?.stripeBackgroundColor || '#FFFFFF',
            numberCircleColor: ballSet.options?.numberCircleColor || '#FFFFFF',
            numberTextColor: ballSet.options?.numberTextColor || '#000000',
            numberBorder: ballSet.options?.numberBorder || false,
            numberBorderColor: ballSet.options?.numberBorderColor || '#000000',
            numberCircleRadialLines: ballSet.options?.numberCircleRadialLines || 0,
            radialLinesColor: ballSet.options?.radialLinesColor || '#000000',
            stripeThickness: ballSet.options?.stripeThickness ?? 0.55,
            numberCircleRadius: ballSet.options?.numberCircleRadius ?? 0.66,
            borderWidth: ballSet.options?.borderWidth ?? 1.0,
            numberScale: ballSet.options?.numberScale ?? 1.0,
            stripeOrientation: ballSet.options?.stripeOrientation || 'horizontal',
            numberCircleOpacity: ballSet.options?.numberCircleOpacity ?? 1.0,
            texture: ballSet.options?.texture || 'none',
            textureColorMode: ballSet.options?.textureColorMode || 'auto',
            textureColor: ballSet.options?.textureColor || '#FFFFFF',
            textureSeed: ballSet.options?.textureSeed || 0,
            numberFont: ballSet.options?.numberFont || 'Arial'
        };
    }

    // Get representative balls for preview (12 balls for standard, 6 for snooker)
    getPreviewBalls(ballSet) {
        if (ballSet.isSnooker) {
            // Snooker preview: cue (0), red (1), yellow (7), green (8), blue (10), black (12)
            // Using mini snooker ball numbers
            return [0, 1, 7, 8, 10, 12];
        }

        // Standard preview: cue (0), all low balls (1-7), 8-ball, and high balls (9, 11, 13, 15)
        return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    }
}
