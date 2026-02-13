// Ball class - represents a pool ball with position, velocity, and properties

import { Vec2, Constants } from './utils.js';

export class Ball {
    constructor(x, y, number = 0) {
        this.position = Vec2.create(x, y);
        this.velocity = Vec2.create(0, 0);
        this.radius = Constants.BALL_RADIUS;
        this.number = number;
        this.pocketed = false;
        this.sinking = false;
        this.sinkProgress = 0;
        this.sinkPocket = null;

        this.isCueBall = number === 0;
        this.isSolid = number >= 1 && number <= 7;
        this.isStripe = number >= 9 && number <= 15;
        this.isEightBall = number === 8;
        this.isUKBall = false;
        this.isSnookerBall = false;
        this.color = Constants.BALL_COLORS[number];

        // Custom styling (for custom ball sets)
        this.showNumber = true;  // Whether to show number on ball
        this.stripeBackgroundColor = null;  // Custom stripe background color
        this.numberCircleColor = null;
        this.numberTextColor = null;
        this.numberBorder = false;
        this.numberBorderColor = null;
        this.numberCircleRadialLines = 0;  // Number of radial lines inside number circle
        this.radialLinesColor = null;  // Custom color for radial lines (defaults to border color)
        this.stripeThickness = 0.55;  // Stripe thickness (latitude, default 0.55)
        this.numberCircleRadius = 0.66;  // Number circle radius (angular radius, default 0.66)
        this.borderWidth = 1.0;  // Border width scale (default 1.0)
        this.numberScale = 1.0;  // Number text scale (default 1.0)
        this.stripeOrientation = 'horizontal';  // Stripe orientation: 'horizontal' or 'vertical'
        this.numberCircleOpacity = 1.0;  // Number circle background opacity
        this.texture = 'none';  // Procedural texture: 'none', 'camouflage', 'striped', 'marbled', 'sparkly'
        this.textureColorMode = 'auto';  // 'auto' or 'single'
        this.textureColor = '#FFFFFF';  // Custom texture color
        this.textureSeed = 0;  // Seed offset for procedural texture variation
        this.numberFont = 'Arial';  // Font for number text

        // VISUALS
        this.rotation = 0; // Legacy 2D rotation (can map to Z-spin)
        this.rollAngle = 0;
        this.travelAngle = 0;
        this.displayRoll = 0;
        
        // PHYSICS STATE
        // spin: Rotation around horizontal axes (Vector3 X/Y components)
        // x: Rotation around global X axis (tumble forward/back if moving Y)
        // y: Rotation around global Y axis (tumble left/right if moving X)
        // This handles Draw, Follow, and Swerve (Magnus)
        this.spin = { x: 0, y: 0 }; 

        // spinZ: Rotation around vertical Z axis (English)
        // Handled natively by Planck, mirrored here for access
        this.spinZ = 0;

        this.isSliding = false;
        this.forceSync = false; // Flag to push state to physics engine
    }

    update() {
        if (this.sinking) {
            this.sinkProgress += 0.1;
            if (this.sinkProgress >= 1) {
                this.pocketed = true;
                this.sinking = false;
            }
        }
    }

    // Update visual rotation based on velocity
    // dt = delta time in seconds (e.g., 0.016 for 60fps)
    updateVisualRotation(dt) {
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
        const minSpeed = 0.01;

        if (speed > minSpeed) {
            this.isRolling = true;
            this.shouldResetRotation = false;

            this.travelAngle = Math.atan2(this.velocity.y, this.velocity.x);

            // Calculate angular velocity (radians per second, assuming velocity is pixels/sec)
            // If velocity is pixels/frame (at 60fps), you need to normalize.
            // Assuming standard scaling:
            const rotationSpeed = speed / this.radius;

            // KEY FIX: Multiply by dt (or a timeScale factor)
            // If your velocity is "pixels per tick" targeting 60FPS:
            // use: rotationSpeed * (dt / (1/60));
            // If velocity is "pixels per second":
            // use: rotationSpeed * dt;

            // Assuming velocity is pixels-per-frame @ 60hz baseline:
            const timeScale = dt * 60; // Normalize so 1/60s = 1.0
            this.rollAngle += rotationSpeed * timeScale;

            this.rollAngle = this.rollAngle % (Math.PI * 2);
            this.displayRoll = this.rollAngle;
        } else {
            // Ball is stopped
            if (this.shouldResetRotation) {
                // Animate displayRoll to 0 smoothly over 0.5 seconds
                const resetDuration = 0.5;
                const resetSpeed = (Math.PI * 2) / resetDuration;

                if (Math.abs(this.displayRoll) > 0.01) {
                    // Find shortest path to 0
                    let diff = this.displayRoll;
                    if (diff > Math.PI) {
                        diff = diff - Math.PI * 2;
                    } else if (diff < -Math.PI) {
                        diff = diff + Math.PI * 2;
                    }

                    // Animate towards 0
                    const timeScale = dt * 60;
                    const step = resetSpeed * timeScale;

                    if (Math.abs(diff) < step) {
                        this.displayRoll = 0;
                        this.shouldResetRotation = false;
                    } else if (diff > 0) {
                        this.displayRoll -= step;
                    } else {
                        this.displayRoll += step;
                    }
                } else {
                    this.displayRoll = 0;
                    this.shouldResetRotation = false;
                }
            } else {
                this.isRolling = false;
            }
        }
    }

    // Called at turn end to trigger face-up animation
    resetRotation() {
        this.shouldResetRotation = true;
    }

    isMoving() {
        return Vec2.lengthSquared(this.velocity) > Constants.MIN_VELOCITY * Constants.MIN_VELOCITY;
    }

    stop() {
        this.velocity.x = 0;
        this.velocity.y = 0;
    }

    setPosition(x, y) {
        this.position.x = x;
        this.position.y = y;
    }

    setVelocity(vx, vy) {
        this.velocity.x = vx;
        this.velocity.y = vy;
    }

    applyImpulse(impulse) {
        this.velocity.x += impulse.x;
        this.velocity.y += impulse.y;
    }

    startSinking(pocket) {
        this.sinking = true;
        this.sinkProgress = 0;
        this.sinkPocket = pocket;
        this.velocity.x = 0;
        this.velocity.y = 0;
    }

    reset(x, y) {
        this.position.x = x;
        this.position.y = y;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.pocketed = false;
        this.sinking = false;
        this.sinkProgress = 0;
        this.sinkPocket = null;
        this.rotation = 0;
        this.angularVel = { x: 0, y: 0 };
        this.isSliding = false;
        this.lastDirX = undefined;
        this.lastDirY = undefined;
        this.rollAngle = 0;
        this.travelAngle = 0;
        this.displayRoll = 0;
        this.isRolling = false;
        this.shouldResetRotation = false;
    }

    // Get ball type as string for game logic
    getType() {
        if (this.isCueBall) return 'cue';
        if (this.isEightBall) return 'eight';
        if (this.isSolid) return 'solid';
        if (this.isStripe) return 'stripe';
        return 'unknown';
    }

    // Clone ball state for prediction
    clone() {
        const ball = new Ball(this.position.x, this.position.y, this.number);
        ball.velocity = Vec2.clone(this.velocity);
        ball.angularVel = { x: this.angularVel.x, y: this.angularVel.y };
        ball.isSliding = this.isSliding;
        ball.pocketed = this.pocketed;
        return ball;
    }
}

// Factory function to create a standard set of pool balls
export function createBallSet() {
    const balls = [];

    // Create balls 0-15 (0 = cue ball)
    for (let i = 0; i <= 15; i++) {
        const ball = new Ball(0, 0, i);

        // Add UK 8-ball group properties (for compatibility)
        if (i >= 1 && i <= 7) {
            ball.isGroup1 = true;
            ball.isGroup2 = false;
        } else if (i >= 9 && i <= 15) {
            ball.isGroup1 = false;
            ball.isGroup2 = true;
        }

        balls.push(ball);
    }

    return balls;
}

// Factory function to create UK 8-ball set (7 red/blue + 7 yellow + black + cue)
export function createUKBallSet(colorScheme = 'red-yellow') {
    const balls = [];
    const colors = Constants.UK_BALL_COLORS[colorScheme];

    // Cue ball (number 0)
    const cueBall = new Ball(0, 0, 0);
    cueBall.color = colors.cue;
    cueBall.isUKBall = true;
    balls.push(cueBall);

    // Group 1 balls (1-7) - Red or Blue
    for (let i = 1; i <= 7; i++) {
        const ball = new Ball(0, 0, i);
        ball.color = colors.group1;
        ball.isGroup1 = true;
        ball.isGroup2 = false;
        ball.isSolid = false;
        ball.isStripe = false;
        ball.isUKBall = true;
        balls.push(ball);
    }

    // Black ball (number 8)
    const blackBall = new Ball(0, 0, 8);
    blackBall.color = colors.black;
    blackBall.isUKBall = true;
    balls.push(blackBall);

    // Group 2 balls (9-15) - Yellow
    for (let i = 9; i <= 15; i++) {
        const ball = new Ball(0, 0, i);
        ball.color = colors.group2;
        ball.isGroup1 = false;
        ball.isGroup2 = true;
        ball.isSolid = false;
        ball.isStripe = false;
        ball.isUKBall = true;
        balls.push(ball);
    }

    return balls;
}

// Rack configurations
export const RackPatterns = {
    // 8-ball: triangle rack with 8-ball in center
    eightBall: {
        // Rows from front to back
        // Row 1: 1 ball (apex)
        // Row 2: 2 balls
        // Row 3: 3 balls (8-ball in center)
        // Row 4: 4 balls
        // Row 5: 5 balls
        // One solid in each back corner, one stripe in each back corner
        arrangement: [
            [1],           // Any ball at apex (using 1)
            [9, 2],        // Stripe, solid
            [3, 8, 10],    // Solid, 8-ball, stripe
            [11, 4, 5, 12], // Mixed
            [6, 13, 14, 7, 15]  // Solid corners, mixed middle
        ]
    },

    // 9-ball: diamond rack with 1 at apex, 9 in center
    nineBall: {
        arrangement: [
            [1],
            [2, 3],
            [4, 9, 5],
            [6, 7],
            [8]
        ]
    },

    // UK 8-ball: triangle rack with black in center, alternating colors
    // Group 1 (1-7) = red/blue, Group 2 (9-15) = yellow
    ukEightBall: {
        arrangement: [
            [1],              // Group 1 at apex
            [9, 2],           // Alternating
            [3, 8, 10],       // Black in center
            [11, 4, 5, 12],   // Alternating
            [6, 13, 14, 7, 15] // Alternating, group 1 in corners
        ]
    }
};

// Position balls in rack formation
export function rackBalls(balls, pattern, tableCenter, ballRadius) {
    const spacing = ballRadius * 2 + 0.5;  // Slight gap for collision detection
    const startX = tableCenter.x + 150;    // Rack position to the right
    const startY = tableCenter.y;

    let ballIndex = 0;
    const arrangement = pattern.arrangement;

    // Find max row width for centering
    const maxRowWidth = Math.max(...arrangement.map(row => row.length));

    arrangement.forEach((row, rowIndex) => {
        const rowWidth = row.length;
        const rowStartY = startY - (rowWidth - 1) * spacing / 2;

        row.forEach((ballNumber, colIndex) => {
            const ball = balls.find(b => b.number === ballNumber);
            if (ball) {
                ball.setPosition(
                    startX + rowIndex * spacing * Math.cos(Math.PI / 6),
                    rowStartY + colIndex * spacing
                );
                ball.pocketed = false;
                ball.sinking = false;

                // Add random orientations for natural appearance
                ball.displayRoll = Math.random() * Math.PI * 2;  // Random visual rotation
            }
        });
    });

    // Position cue ball
    const cueBall = balls.find(b => b.number === 0);
    if (cueBall) {
        cueBall.setPosition(tableCenter.x - 200, tableCenter.y);
        cueBall.pocketed = false;
        cueBall.sinking = false;
    }
}

// Factory function to create 6-red snooker ball set
export function createSnookerBallSet() {
    const balls = [];
    const colors = Constants.SNOOKER_BALL_COLORS;

    // Cue ball (number 0)
    const cueBall = new Ball(0, 0, 0);
    cueBall.color = colors.cue;
    cueBall.isSnookerBall = true;
    balls.push(cueBall);

    // 6 Red balls (numbers 1-6)
    for (let i = 1; i <= 6; i++) {
        const ball = new Ball(0, 0, i);
        ball.color = colors.red;
        ball.isRed = true;
        ball.isSnookerBall = true;
        ball.pointValue = 1;
        balls.push(ball);
    }

    // Colored balls (numbers 7-12)
    const coloredBalls = [
        { num: 7, name: 'yellow', points: 2 },
        { num: 8, name: 'green', points: 3 },
        { num: 9, name: 'brown', points: 4 },
        { num: 10, name: 'blue', points: 5 },
        { num: 11, name: 'pink', points: 6 },
        { num: 12, name: 'black', points: 7 }
    ];

    for (const c of coloredBalls) {
        const ball = new Ball(0, 0, c.num);
        ball.color = colors[c.name];
        ball.colorName = c.name;
        ball.isColor = true;
        ball.isSnookerBall = true;
        ball.pointValue = c.points;
        balls.push(ball);
    }

    return balls;
}

// Position snooker balls on table
export function positionSnookerBalls(balls, tableCenter, ballRadius, spots) {

    // Position colored balls on their spots
    const colorMap = { 7: 'yellow', 8: 'green', 9: 'brown', 10: 'blue', 11: 'pink', 12: 'black' };

    for (const [num, name] of Object.entries(colorMap)) {
        const ball = balls.find(b => b.number === parseInt(num));
        if (ball) {
            ball.setPosition(tableCenter.x + spots[name].x, tableCenter.y + spots[name].y);
            ball.spotPosition = { x: tableCenter.x + spots[name].x, y: tableCenter.y + spots[name].y };
            ball.pocketed = false;
            ball.sinking = false;
        }
    }

    // Position 6 reds in small triangle behind pink (touching the pink ball)
    const redBalls = balls.filter(b => b.isRed);
    const pinkSpot = spots.pink;
    const startX = tableCenter.x + pinkSpot.x + ballRadius * 2;
    const spacing = ballRadius * 2 + 0.5;

    // Triangle: 1, 2, 3 rows (total 6 balls)
    const redArrangement = [[0], [1, 2], [3, 4, 5]];
    redArrangement.forEach((row, rowIndex) => {
        const rowWidth = row.length;
        const rowStartY = tableCenter.y - (rowWidth - 1) * spacing / 2;
        row.forEach((redIndex, colIndex) => {
            if (redBalls[redIndex]) {
                // Micro jitter (±0.3px) for natural rack variation
                const jitterX = (Math.random() - 0.5) * 0.6;
                const jitterY = (Math.random() - 0.5) * 0.6;
                redBalls[redIndex].setPosition(
                    startX + rowIndex * spacing * Math.cos(Math.PI / 6) + jitterX,
                    rowStartY + colIndex * spacing + jitterY
                );
                redBalls[redIndex].pocketed = false;
                redBalls[redIndex].sinking = false;
            }
        });
    });

    // Cue ball in baulk area (behind the baulk line)
    const cueBall = balls.find(b => b.number === 0);
    if (cueBall) {
        cueBall.setPosition(tableCenter.x - 250, tableCenter.y);
        cueBall.pocketed = false;
        cueBall.sinking = false;
    }
}

// Factory function to create 15-red full snooker ball set
export function createFullSnookerBallSet(ballRadius = 8) {
    const balls = [];
    const colors = Constants.SNOOKER_BALL_COLORS;

    // Cue ball (number 0)
    const cueBall = new Ball(0, 0, 0);
    cueBall.color = colors.cue;
    cueBall.isSnookerBall = true;
    cueBall.radius = ballRadius;
    balls.push(cueBall);

    // 15 Red balls (numbers 1-15)
    for (let i = 1; i <= 15; i++) {
        const ball = new Ball(0, 0, i);
        ball.color = colors.red;
        ball.isRed = true;
        ball.isSnookerBall = true;
        ball.pointValue = 1;
        ball.radius = ballRadius;
        balls.push(ball);
    }

    // Colored balls (numbers 16-21)
    const coloredBalls = [
        { num: 16, name: 'yellow', points: 2 },
        { num: 17, name: 'green', points: 3 },
        { num: 18, name: 'brown', points: 4 },
        { num: 19, name: 'blue', points: 5 },
        { num: 20, name: 'pink', points: 6 },
        { num: 21, name: 'black', points: 7 }
    ];

    for (const c of coloredBalls) {
        const ball = new Ball(0, 0, c.num);
        ball.color = colors[c.name];
        ball.colorName = c.name;
        ball.isColor = true;
        ball.isSnookerBall = true;
        ball.pointValue = c.points;
        ball.radius = ballRadius;
        balls.push(ball);
    }

    return balls;
}

// Position 15-red full snooker balls on table
export function positionFullSnookerBalls(balls, tableCenter, ballRadius, spots) {

    // Position colored balls on their spots (numbers 16-21)
    const colorMap = { 16: 'yellow', 17: 'green', 18: 'brown', 19: 'blue', 20: 'pink', 21: 'black' };

    for (const [num, name] of Object.entries(colorMap)) {
        const ball = balls.find(b => b.number === parseInt(num));
        if (ball) {
            ball.setPosition(tableCenter.x + spots[name].x, tableCenter.y + spots[name].y);
            ball.spotPosition = { x: tableCenter.x + spots[name].x, y: tableCenter.y + spots[name].y };
            ball.pocketed = false;
            ball.sinking = false;
        }
    }

    // Position 15 reds in triangle behind pink (touching the pink ball)
    const redBalls = balls.filter(b => b.isRed);
    const pinkSpot = spots.pink;
    const startX = tableCenter.x + pinkSpot.x + ballRadius * 2;
    const spacing = ballRadius * 2 + 0.5;

    // Triangle: 1, 2, 3, 4, 5 rows (total 15 balls)
    const redArrangement = [
        [0],
        [1, 2],
        [3, 4, 5],
        [6, 7, 8, 9],
        [10, 11, 12, 13, 14]
    ];

    redArrangement.forEach((row, rowIndex) => {
        const rowWidth = row.length;
        const rowStartY = tableCenter.y - (rowWidth - 1) * spacing / 2;
        row.forEach((redIndex, colIndex) => {
            if (redBalls[redIndex]) {
                // Micro jitter (±0.3px) for natural rack variation
                const jitterX = (Math.random() - 0.5) * 0.6;
                const jitterY = (Math.random() - 0.5) * 0.6;
                redBalls[redIndex].setPosition(
                    startX + rowIndex * spacing * Math.cos(Math.PI / 6) + jitterX,
                    rowStartY + colIndex * spacing + jitterY
                );
                redBalls[redIndex].pocketed = false;
                redBalls[redIndex].sinking = false;
            }
        });
    });

    // Cue ball in baulk area (behind the baulk line)
    const cueBall = balls.find(b => b.number === 0);
    if (cueBall) {
        cueBall.setPosition(tableCenter.x - 250, tableCenter.y);
        cueBall.pocketed = false;
        cueBall.sinking = false;
    }
}
