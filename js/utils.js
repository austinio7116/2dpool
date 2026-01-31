// Vector math utilities and helper functions

export const Vec2 = {
    create(x = 0, y = 0) {
        return { x, y };
    },

    add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y };
    },

    subtract(a, b) {
        return { x: a.x - b.x, y: a.y - b.y };
    },

    multiply(v, scalar) {
        return { x: v.x * scalar, y: v.y * scalar };
    },

    divide(v, scalar) {
        if (scalar === 0) return { x: 0, y: 0 };
        return { x: v.x / scalar, y: v.y / scalar };
    },

    dot(a, b) {
        return a.x * b.x + a.y * b.y;
    },

    length(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    },

    lengthSquared(v) {
        return v.x * v.x + v.y * v.y;
    },

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

    distanceSquared(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return dx * dx + dy * dy;
    },

    angle(v) {
        return Math.atan2(v.y, v.x);
    },

    fromAngle(angle, length = 1) {
        return {
            x: Math.cos(angle) * length,
            y: Math.sin(angle) * length
        };
    },

    rotate(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: v.x * cos - v.y * sin,
            y: v.x * sin + v.y * cos
        };
    },

    reflect(v, normal) {
        const dot = Vec2.dot(v, normal);
        return {
            x: v.x - 2 * dot * normal.x,
            y: v.y - 2 * dot * normal.y
        };
    },

    lerp(a, b, t) {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
        };
    },

    clone(v) {
        return { x: v.x, y: v.y };
    },

    set(target, source) {
        target.x = source.x;
        target.y = source.y;
        return target;
    }
};

// Clamp a value between min and max
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Linear interpolation
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Random number between min and max
export function random(min, max) {
    return min + Math.random() * (max - min);
}

// Random integer between min and max (inclusive)
export function randomInt(min, max) {
    return Math.floor(random(min, max + 1));
}

// Convert degrees to radians
export function degToRad(degrees) {
    return degrees * (Math.PI / 180);
}

// Convert radians to degrees
export function radToDeg(radians) {
    return radians * (180 / Math.PI);
}

// Check if two circles overlap
export function circlesOverlap(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distSq = dx * dx + dy * dy;
    const radiusSum = r1 + r2;
    return distSq < radiusSum * radiusSum;
}

// Ease in out quad
export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Ease out quad
export function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
}

// Ease in quad
export function easeInQuad(t) {
    return t * t;
}

// Game constants
export const Constants = {
    // Table dimensions (in pixels)
    TABLE_WIDTH: 800,
    TABLE_HEIGHT: 400,
    TABLE_PADDING: 60,  // Space for wood frame

    // Ball properties
    BALL_RADIUS: 12,
    CUE_BALL_RADIUS: 12,

    // Pocket properties
    POCKET_RADIUS: 26,  // Larger pockets for easier gameplay

    // Physics
    FRICTION: 0.992,       // Rolling friction (when not sliding)
    SLIDING_FRICTION: 0.998, // Low friction when sliding - ball skids a lot before spin takes effect
    RESTITUTION: 0.96,     // Nearly elastic ball collisions
    RAIL_RESTITUTION: 0.75, // Rails absorb more energy
    MIN_VELOCITY: 0.05,    // Lower threshold before stopping
    MIN_ANGULAR_VEL: 0.01, // Minimum angular velocity before stopping spin

    // Spin physics
    SPIN_TRANSFER_RATE: 0.15,  // How fast spin converts to linear motion while sliding
    SIDESPIN_CURVE_FACTOR: 0.008, // How much sidespin curves the ball path
    SPIN_DECAY: 0.995,         // Natural spin decay per frame
    BALL_MASS: 1.0,            // Normalized ball mass

    // Controls
    MAX_POWER: 50,
    MIN_POWER: 1,
    AIM_LINE_LENGTH: 350,
    POWER_SCALE: 0.08,  // Drag distance to power multiplier

    // Colors
    FELT_COLOR: '#0d5c2e',
    FELT_DARK: '#0a4a24',
    WOOD_COLOR: '#8B4513',
    WOOD_DARK: '#5D2E0C',
    RAIL_COLOR: '#1a7a3c',

    // Ball colors (standard pool ball colors)
    BALL_COLORS: {
        0: '#FFFEF0',   // Cue ball (off-white)
        1: '#FFD700',   // Yellow
        2: '#0000CD',   // Blue
        3: '#FF0000',   // Red
        4: '#4B0082',   // Purple
        5: '#FF8C00',   // Orange (more yellow-orange)
        6: '#006400',   // Green
        7: '#800000',   // Maroon
        8: '#000000',   // Black (8-ball)
        9: '#FFD700',   // Yellow stripe
        10: '#0000CD',  // Blue stripe
        11: '#FF0000',  // Red stripe
        12: '#4B0082',  // Purple stripe
        13: '#FF8C00',  // Orange stripe (more yellow-orange)
        14: '#006400',  // Green stripe
        15: '#800000',  // Maroon stripe
    },

    // UK 8-ball color schemes
    UK_BALL_COLORS: {
        'red-yellow': {
            group1: '#CC0000',  // Red
            group2: '#FFD700',  // Yellow
            black: '#000000',
            cue: '#FFFEF0'
        },
        'blue-yellow': {
            group1: '#0000CC',  // Blue
            group2: '#FFD700',  // Yellow
            black: '#000000',
            cue: '#FFFEF0'
        }
    },

    // Snooker ball colors
    SNOOKER_BALL_COLORS: {
        cue: '#FFFEF0',
        red: '#CC0000',
        yellow: '#FFD700',
        green: '#228B22',
        brown: '#8B4513',
        blue: '#0066CC',
        pink: '#FF69B4',
        black: '#1a1a1a'
    },

    // Snooker point values
    SNOOKER_POINTS: {
        red: 1,
        yellow: 2,
        green: 3,
        brown: 4,
        blue: 5,
        pink: 6,
        black: 7
    },

    // Snooker color spot positions (relative to table center)
    SNOOKER_SPOTS: {
        yellow: { x: -260, y: 73 },   // Left of D
        green: { x: -260, y: -73 },     // Right of D
        brown: { x: -260, y: 0 },      // Center of baulk line
        blue: { x: 0, y: 0 },          // Center spot
        pink: { x: 208, y: 0 },        // Between center and reds
        black: { x: 340, y: 0 }        // Behind reds
    },

    // Table-specific configurations (for tables with non-standard ball/pocket sizes)
    TABLE_CONFIGS: {
        9: {  // Full-size snooker
            ballRadius: 8,      // Smaller than standard 12px
            pocketRadius: 18,   // Much tighter than standard 26px
            useCurvedPockets: true,
            isSnooker: true,
            redCount: 15,
            boundsOffset: { top: 17, bottom: 15, left: 20, right: 20}  // Move cushions/pockets outward
        }
    }
};
