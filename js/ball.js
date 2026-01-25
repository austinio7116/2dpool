// Ball class - represents a pool ball with position, velocity, and properties

import { Vec2, Constants } from './utils.js';

export class Ball {
    constructor(x, y, number = 0) {
        this.position = Vec2.create(x, y);
        this.velocity = Vec2.create(0, 0);
        this.radius = Constants.BALL_RADIUS;
        this.number = number;
        this.pocketed = false;
        this.sinking = false;  // Animation state for sinking
        this.sinkProgress = 0;
        this.sinkPocket = null;

        // Determine ball type
        this.isCueBall = number === 0;
        this.isSolid = number >= 1 && number <= 7;
        this.isStripe = number >= 9 && number <= 15;
        this.isEightBall = number === 8;

        // Visual properties
        this.color = Constants.BALL_COLORS[number];
        this.rotation = 0;  // For visual spin effect

        // Angular velocity (spin) - continuous physics property
        // angularVel.x = sidespin (english) - rotation around vertical axis
        //   positive = clockwise when viewed from above (right english)
        //   negative = counter-clockwise (left english)
        // angularVel.y = forward/back spin - rotation around horizontal axis perpendicular to travel
        //   positive = topspin (ball surface moving in direction of travel)
        //   negative = backspin (ball surface moving opposite to travel)
        this.angularVel = { x: 0, y: 0 };

        // Track if ball is sliding (spin not matching natural roll)
        this.isSliding = false;
    }

    update() {
        // Only handle sinking animation - physics handles movement
        if (this.sinking) {
            this.sinkProgress += 0.1;
            if (this.sinkProgress >= 1) {
                this.pocketed = true;
                this.sinking = false;
            }
        }
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
        balls.push(new Ball(0, 0, i));
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
