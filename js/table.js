// Table class - defines the pool table geometry, pockets, and rails

import { Vec2, Constants } from './utils.js';

export class Table {
    constructor() {
        // Playing surface dimensions
        this.width = Constants.TABLE_WIDTH;
        this.height = Constants.TABLE_HEIGHT;
        this.padding = Constants.TABLE_PADDING;

        // Total canvas size
        this.canvasWidth = this.width + this.padding * 2;
        this.canvasHeight = this.height + this.padding * 2;

        // Playing area bounds (inner felt area)
        this.bounds = {
            left: this.padding,
            right: this.padding + this.width,
            top: this.padding,
            bottom: this.padding + this.height + 2  // Offset to align with table images
        };

        // Center of the table
        this.center = Vec2.create(
            this.padding + this.width / 2,
            this.padding + this.height / 2
        );

        // Rail cushion width
        this.railWidth = 20;

        // Create pockets - must be at corners and sides
        this.tableStyle = 1; // Default table style
        this.pockets = this.createPockets();

        // Diamond sight markers positions
        this.diamonds = this.createDiamonds();

        // Kitchen line (for cue ball placement after scratch) - 1/4 from left
        this.kitchenLine = this.bounds.left + this.width / 4;

        // Head spot (where cue ball starts)
        this.headSpot = Vec2.create(this.kitchenLine, this.center.y);

        // Foot spot (apex of rack)
        this.footSpot = Vec2.create(this.bounds.right - this.width / 4, this.center.y);
    }

    setTableStyle(tableStyle) {
        this.tableStyle = tableStyle;
        this.pockets = this.createPockets();
    }

    createPockets() {
        const pockets = [];
        // Use table-specific pocket radius if available
        const tableConfig = Constants.TABLE_CONFIGS ? Constants.TABLE_CONFIGS[this.tableStyle] : null;
        const pocketRadius = (tableConfig && tableConfig.pocketRadius) ? tableConfig.pocketRadius : Constants.POCKET_RADIUS;
        const offset = (tableConfig && tableConfig.boundsOffset) ? tableConfig.boundsOffset : null;

        // Apply bounds offset for tables like full-size snooker
        let b;
        if (!offset) {
            b = this.bounds;
        } else if (typeof offset === 'number') {
            b = {
                left: this.bounds.left - offset,
                right: this.bounds.right + offset,
                top: this.bounds.top - offset,
                bottom: this.bounds.bottom + offset
            };
        } else {
            b = {
                left: this.bounds.left - (offset.left || 0),
                right: this.bounds.right + (offset.right || 0),
                top: this.bounds.top - (offset.top || 0),
                bottom: this.bounds.bottom + (offset.bottom || 0)
            };
        }

        // Corner pockets - offset diagonally into the pocket holes
        const cornerOffset = 5;
        // Top-left
        pockets.push({
            position: Vec2.create(b.left - cornerOffset, b.top - cornerOffset),
            radius: pocketRadius,
            type: 'corner'
        });
        // Top-right
        pockets.push({
            position: Vec2.create(b.right + cornerOffset, b.top - cornerOffset),
            radius: pocketRadius,
            type: 'corner'
        });
        // Bottom-left
        pockets.push({
            position: Vec2.create(b.left - cornerOffset, b.bottom + cornerOffset),
            radius: pocketRadius,
            type: 'corner'
        });
        // Bottom-right
        pockets.push({
            position: Vec2.create(b.right + cornerOffset, b.bottom + cornerOffset),
            radius: pocketRadius,
            type: 'corner'
        });

        // Side pockets - offset into the cushions
        const sidePocketRadius = pocketRadius * 0.9;
        const sideOffset = 20; // Move pocket centers back into cushions
        pockets.push({
            position: Vec2.create(this.center.x, b.top - sideOffset),
            radius: sidePocketRadius,
            type: 'side'
        });
        pockets.push({
            position: Vec2.create(this.center.x, b.bottom + sideOffset),
            radius: sidePocketRadius,
            type: 'side'
        });

        return pockets;
    }

    createDiamonds() {
        const diamonds = [];
        const b = this.bounds;

        // Diamonds along the rails
        const longSideDiamonds = 7;
        const shortSideDiamonds = 3;

        // Long sides (top and bottom)
        for (let i = 1; i <= longSideDiamonds; i++) {
            const x = b.left + (this.width / (longSideDiamonds + 1)) * i;
            diamonds.push(Vec2.create(x, b.top - 10));
            diamonds.push(Vec2.create(x, b.bottom + 10));
        }

        // Short sides (left and right)
        for (let i = 1; i <= shortSideDiamonds; i++) {
            const y = b.top + (this.height / (shortSideDiamonds + 1)) * i;
            diamonds.push(Vec2.create(b.left - 10, y));
            diamonds.push(Vec2.create(b.right + 10, y));
        }

        return diamonds;
    }

    isInKitchen(x, y) {
        return x <= this.kitchenLine &&
               x >= this.bounds.left &&
               y >= this.bounds.top &&
               y <= this.bounds.bottom;
    }

    isOnTable(x, y) {
        return x >= this.bounds.left &&
               x <= this.bounds.right &&
               y >= this.bounds.top &&
               y <= this.bounds.bottom;
    }

    checkPocket(ballPos, ballRadius) {
        for (const pocket of this.pockets) {
            const dist = Vec2.distance(ballPos, pocket.position);
            if (dist < pocket.radius - ballRadius * 0.3) {
                return pocket;
            }
        }
        return null;
    }

    closestPointOnRail(pos, rail) {
        const v = Vec2.subtract(rail.end, rail.start);
        const w = Vec2.subtract(pos, rail.start);
        const t = Math.max(0, Math.min(1, Vec2.dot(w, v) / Vec2.dot(v, v)));
        return Vec2.add(rail.start, Vec2.multiply(v, t));
    }

    getBallRadius() {
        // Use table-specific ball radius if available
        const tableConfig = Constants.TABLE_CONFIGS ? Constants.TABLE_CONFIGS[this.tableStyle] : null;
        return (tableConfig && tableConfig.ballRadius) ? tableConfig.ballRadius : Constants.BALL_RADIUS;
    }

    findValidKitchenPosition(balls, preferredY = null) {
        const ballRadius = this.getBallRadius();
        const startX = this.kitchenLine - ballRadius * 2;
        const startY = preferredY || this.center.y;

        if (this.isPositionValid(startX, startY, balls, ballRadius)) {
            return Vec2.create(startX, startY);
        }

        for (let r = ballRadius; r < this.height / 2; r += ballRadius) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                const x = startX + Math.cos(angle) * r;
                const y = startY + Math.sin(angle) * r;

                if (this.isInKitchen(x, y) && this.isPositionValid(x, y, balls, ballRadius)) {
                    return Vec2.create(x, y);
                }
            }
        }

        return Vec2.clone(this.headSpot);
    }

    // Find valid cue ball position anywhere on table (for ball in hand)
    findValidCueBallPosition(balls, preferredY = null) {
        const ballRadius = this.getBallRadius();
        const startX = this.center.x;
        const startY = preferredY || this.center.y;

        if (this.isPositionValid(startX, startY, balls, ballRadius)) {
            return Vec2.create(startX, startY);
        }

        // Spiral search outward from center
        for (let r = ballRadius; r < this.width / 2; r += ballRadius) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                const x = startX + Math.cos(angle) * r;
                const y = startY + Math.sin(angle) * r;

                if (this.isOnTable(x, y) && this.isPositionValid(x, y, balls, ballRadius)) {
                    return Vec2.create(x, y);
                }
            }
        }

        return Vec2.clone(this.center);
    }

    isPositionValid(x, y, balls, radius) {
        for (const ball of balls) {
            if (ball.pocketed || ball.number === 0) continue;
            const dist = Vec2.distance(Vec2.create(x, y), ball.position);
            // Use ball's actual radius for proper collision check
            const checkRadius = ball.radius || radius;
            if (dist < radius + checkRadius + 1) {
                return false;
            }
        }
        return true;
    }
}
