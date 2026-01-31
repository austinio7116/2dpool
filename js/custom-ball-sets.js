// Custom Ball Set Manager - handles localStorage CRUD for custom ball sets

const STORAGE_KEY = 'poolGame_customBallSets';

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
        this.customSets = this.load();
    }

    // Load custom sets from localStorage
    load() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('Failed to load custom ball sets:', e);
            return [];
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
                showNumbers: setData.options?.showNumbers ?? true
            },
            isPredefined: false,
            createdAt: Date.now()
        };

        this.customSets.push(newSet);
        this.save();
        return newSet;
    }

    // Update an existing custom set
    update(id, setData) {
        const index = this.customSets.findIndex(set => set.id === id);
        if (index === -1) return null;

        this.customSets[index] = {
            ...this.customSets[index],
            ...setData,
            id: id // Preserve ID
        };
        this.save();
        return this.customSets[index];
    }

    // Delete a custom set
    delete(id) {
        const index = this.customSets.findIndex(set => set.id === id);
        if (index === -1) return false;

        this.customSets.splice(index, 1);
        this.save();
        return true;
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

        const isGroup1 = ballNumber >= 1 && ballNumber <= 7;
        const isGroup2 = ballNumber >= 9 && ballNumber <= 15;
        const isCue = ballNumber === 0;
        const isEightBall = ballNumber === 8;

        let color;
        if (isCue) {
            color = ballSet.colors.cue || '#FFFEF0';
        } else if (isEightBall) {
            color = ballSet.colors.eightBall || '#000000';
        } else if (isGroup1) {
            color = ballSet.colors.group1;
        } else if (isGroup2) {
            color = ballSet.colors.group2;
        }

        // For American set, use standard colors
        if (ballSet.id === 'american' || color === null) {
            const standardColors = {
                0: '#FFFEF0', 1: '#FFD700', 2: '#0000CD', 3: '#FF0000',
                4: '#4B0082', 5: '#FF8C00', 6: '#006400', 7: '#800000',
                8: '#000000', 9: '#FFD700', 10: '#0000CD', 11: '#FF0000',
                12: '#4B0082', 13: '#FF8C00', 14: '#006400', 15: '#800000'
            };
            color = standardColors[ballNumber];
        }

        return {
            color: color,
            isStripe: ballSet.style === 'stripe' && isGroup2,
            isUKBall: ballSet.style === 'solid' && !ballSet.isSnooker,
            isSnookerBall: ballSet.isSnooker || false,
            showNumber: ballSet.options?.showNumbers !== false && !ballSet.isSnooker &&
                       (ballSet.style === 'stripe' || isEightBall)
        };
    }

    // Get representative balls for preview (6 balls)
    getPreviewBalls(ballSet) {
        if (ballSet.isSnooker) {
            // Snooker preview: cue, red, yellow, green, blue, black
            return [0, 1, 7, 8, 10, 12]; // Using snooker ball numbers
        }

        // Standard preview: cue, 2 group1, 8-ball, 2 group2
        return [0, 1, 3, 8, 9, 11];
    }
}
