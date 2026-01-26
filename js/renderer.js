// Renderer - handles all canvas drawing and visual effects

import { Vec2, Constants, lerp } from './utils.js';
import { BallRenderer3D } from './ball-renderer-3d.js';

// Polyfill for roundRect if not supported
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        if (typeof radius === 'number') {
            radius = { tl: radius, tr: radius, br: radius, bl: radius };
        }
        this.beginPath();
        this.moveTo(x + radius.tl, y);
        this.lineTo(x + width - radius.tr, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        this.lineTo(x + width, y + height - radius.br);
        this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        this.lineTo(x + radius.bl, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        this.lineTo(x, y + radius.tl);
        this.quadraticCurveTo(x, y, x + radius.tl, y);
        this.closePath();
    };
}

export class Renderer {
    constructor(canvas, table) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.table = table;

        this.canvas.width = table.canvasWidth;
        this.canvas.height = table.canvasHeight;

        // Load table images
        this.tableImages = [];
        this.tableImagesLoaded = [false, false, false, false, false];
        this.currentTableIndex = 0;

        for (let i = 0; i < 6; i++) {
            const img = new Image();
            const index = i;
            img.onload = () => {
                this.tableImagesLoaded[index] = true;
            };
            img.src = `assets/pooltable${i === 0 ? '' : i + 1}.png`;
            this.tableImages.push(img);
        }

        // 3D ball renderer (alternative rendering mode)
        this.ballRenderer3D = new BallRenderer3D(Constants.BALL_RADIUS);
        this.use3DBalls = true; // 3D ball rendering enabled by default
    }

    setUse3DBalls(enabled) {
        this.use3DBalls = enabled;
    }

    setTableStyle(tableNum) {
        // tableNum is 1-4, convert to 0-3 index
        this.currentTableIndex = Math.max(0, Math.min(5, tableNum - 1));
    }

    render(state) {
        this.clear();
        this.drawTable();

        // Draw table image overlay (if loaded)
        if (this.tableImagesLoaded[this.currentTableIndex]) {
            this.ctx.drawImage(this.tableImages[this.currentTableIndex], 0, 0, this.canvas.width, this.canvas.height);
        }

        // DEBUG: Draw pocket detection circles (uncomment to visualize)
        // this.drawPocketDebug();

        // DEBUG: Draw cushion collision boundaries (uncomment to visualize)
        // this.drawCushionDebug();

        this.drawBalls(state.balls);

        if (state.showSpinIndicator) {
            this.drawSpinIndicator(state.spinIndicator, state.spin);
        }

        if (state.aiming && state.cueBall && !state.cueBall.pocketed) {
            this.drawAimLine(state.cueBall, state.aimDirection, state.power, state.trajectory);
            this.drawCueStick(state.cueBall, state.aimDirection, state.power, state.pullBack);
            this.drawPowerMeter(state.power);
        }
    }

    clear() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawTable() {
        const ctx = this.ctx;
        const t = this.table;
        const b = t.bounds;

        // Outer wood frame
        ctx.fillStyle = this.createWoodGradient(0, 0, t.canvasWidth, t.canvasHeight);
        ctx.fillRect(0, 0, t.canvasWidth, t.canvasHeight);

        // Inner wood border
        const railOuter = 25;
        ctx.fillStyle = '#5D2E0C';
        ctx.fillRect(
            b.left - railOuter,
            b.top - railOuter,
            t.width + railOuter * 2,
            t.height + railOuter * 2
        );

        // Green felt playing surface
        ctx.fillStyle = this.createFeltGradient();
        ctx.fillRect(b.left, b.top, t.width, t.height);
        this.drawFeltTexture();

        // Draw cushions with pocket cutouts
        this.drawCushions();

        // Draw pockets
        for (const pocket of t.pockets) {
            this.drawPocket(pocket);
        }

        // Draw diamond sights
        for (const diamond of t.diamonds) {
            this.drawDiamond(diamond);
        }

        // Kitchen line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(t.kitchenLine, b.top);
        ctx.lineTo(t.kitchenLine, b.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Foot spot
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(t.footSpot.x, t.footSpot.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCushions() {
        const ctx = this.ctx;
        const t = this.table;
        const b = t.bounds;
        const cushionWidth = 18;
        const pocketRadius = Constants.POCKET_RADIUS;

        // Cushion color with gradient for 3D effect
        const cushionColor = '#1a8a4a';
        const cushionDark = '#0f5c2e';
        const cushionLight = '#2aaa6a';

        // Corner pocket mouth size
        const cornerMouth = pocketRadius * 1.4;
        // Side pocket mouth size
        const sideMouth = pocketRadius * 1.1;

        // Draw each cushion segment with angled pocket entries

        // Top-left cushion (from left pocket to center pocket)
        this.drawCushionSegment(
            b.left + cornerMouth, b.top,
            t.center.x - sideMouth, b.top,
            cushionWidth, 'top'
        );

        // Top-right cushion (from center pocket to right pocket)
        this.drawCushionSegment(
            t.center.x + sideMouth, b.top,
            b.right - cornerMouth, b.top,
            cushionWidth, 'top'
        );

        // Bottom-left cushion
        this.drawCushionSegment(
            b.left + cornerMouth, b.bottom,
            t.center.x - sideMouth, b.bottom,
            cushionWidth, 'bottom'
        );

        // Bottom-right cushion
        this.drawCushionSegment(
            t.center.x + sideMouth, b.bottom,
            b.right - cornerMouth, b.bottom,
            cushionWidth, 'bottom'
        );

        // Left cushion
        this.drawCushionSegment(
            b.left, b.top + cornerMouth,
            b.left, b.bottom - cornerMouth,
            cushionWidth, 'left'
        );

        // Right cushion
        this.drawCushionSegment(
            b.right, b.top + cornerMouth,
            b.right, b.bottom - cornerMouth,
            cushionWidth, 'right'
        );

        // Draw pocket jaws (angled cushion entries)
        this.drawPocketJaws();
    }

    drawCushionSegment(x1, y1, x2, y2, width, side) {
        const ctx = this.ctx;

        ctx.save();

        // Create gradient for 3D effect
        let gradient;
        if (side === 'top') {
            gradient = ctx.createLinearGradient(0, y1 - width, 0, y1);
            gradient.addColorStop(0, '#0f5c2e');
            gradient.addColorStop(0.5, '#1a8a4a');
            gradient.addColorStop(1, '#2aaa6a');
        } else if (side === 'bottom') {
            gradient = ctx.createLinearGradient(0, y1, 0, y1 + width);
            gradient.addColorStop(0, '#2aaa6a');
            gradient.addColorStop(0.5, '#1a8a4a');
            gradient.addColorStop(1, '#0f5c2e');
        } else if (side === 'left') {
            gradient = ctx.createLinearGradient(x1 - width, 0, x1, 0);
            gradient.addColorStop(0, '#0f5c2e');
            gradient.addColorStop(0.5, '#1a8a4a');
            gradient.addColorStop(1, '#2aaa6a');
        } else {
            gradient = ctx.createLinearGradient(x1, 0, x1 + width, 0);
            gradient.addColorStop(0, '#2aaa6a');
            gradient.addColorStop(0.5, '#1a8a4a');
            gradient.addColorStop(1, '#0f5c2e');
        }

        ctx.fillStyle = gradient;

        // Draw cushion shape
        ctx.beginPath();
        if (side === 'top') {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y1);
            ctx.lineTo(x2 - 5, y1 - width);
            ctx.lineTo(x1 + 5, y1 - width);
        } else if (side === 'bottom') {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y1);
            ctx.lineTo(x2 - 5, y1 + width);
            ctx.lineTo(x1 + 5, y1 + width);
        } else if (side === 'left') {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1, y2);
            ctx.lineTo(x1 - width, y2 - 5);
            ctx.lineTo(x1 - width, y1 + 5);
        } else {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1, y2);
            ctx.lineTo(x1 + width, y2 - 5);
            ctx.lineTo(x1 + width, y1 + 5);
        }
        ctx.closePath();
        ctx.fill();

        // Add highlight edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    drawPocketJaws() {
        const ctx = this.ctx;
        const t = this.table;
        const b = t.bounds;
        const pocketRadius = Constants.POCKET_RADIUS;
        const jawLength = pocketRadius * 1.2;
        const jawWidth = 12;

        ctx.fillStyle = '#1a8a4a';

        // Corner pockets - draw angled jaws
        const corners = [
            { x: b.left, y: b.top, ax: 1, ay: 1 },
            { x: b.right, y: b.top, ax: -1, ay: 1 },
            { x: b.left, y: b.bottom, ax: 1, ay: -1 },
            { x: b.right, y: b.bottom, ax: -1, ay: -1 }
        ];

        for (const corner of corners) {
            // Horizontal jaw
            const gradient1 = ctx.createLinearGradient(
                corner.x, corner.y,
                corner.x + corner.ax * jawLength, corner.y
            );
            gradient1.addColorStop(0, 'rgba(26, 138, 74, 0)');
            gradient1.addColorStop(1, '#1a8a4a');

            ctx.fillStyle = gradient1;
            ctx.beginPath();
            ctx.moveTo(corner.x, corner.y + corner.ay * pocketRadius * 0.8);
            ctx.lineTo(corner.x + corner.ax * jawLength, corner.y + corner.ay * jawWidth);
            ctx.lineTo(corner.x + corner.ax * jawLength, corner.y + corner.ay * (jawWidth + 8));
            ctx.lineTo(corner.x, corner.y + corner.ay * (pocketRadius * 0.8 + 8));
            ctx.fill();

            // Vertical jaw
            const gradient2 = ctx.createLinearGradient(
                corner.x, corner.y,
                corner.x, corner.y + corner.ay * jawLength
            );
            gradient2.addColorStop(0, 'rgba(26, 138, 74, 0)');
            gradient2.addColorStop(1, '#1a8a4a');

            ctx.fillStyle = gradient2;
            ctx.beginPath();
            ctx.moveTo(corner.x + corner.ax * pocketRadius * 0.8, corner.y);
            ctx.lineTo(corner.x + corner.ax * jawWidth, corner.y + corner.ay * jawLength);
            ctx.lineTo(corner.x + corner.ax * (jawWidth + 8), corner.y + corner.ay * jawLength);
            ctx.lineTo(corner.x + corner.ax * (pocketRadius * 0.8 + 8), corner.y);
            ctx.fill();
        }

        // Side pockets - draw curved jaws
        const sidePockets = [
            { x: t.center.x, y: b.top, ay: 1 },
            { x: t.center.x, y: b.bottom, ay: -1 }
        ];

        for (const side of sidePockets) {
            const sideRadius = pocketRadius * 0.9;

            // Left jaw
            ctx.fillStyle = '#1a8a4a';
            ctx.beginPath();
            ctx.moveTo(side.x - sideRadius, side.y);
            ctx.quadraticCurveTo(
                side.x - sideRadius - 10, side.y + side.ay * 15,
                side.x - sideRadius - 5, side.y + side.ay * jawWidth
            );
            ctx.lineTo(side.x - sideRadius + 5, side.y + side.ay * jawWidth);
            ctx.quadraticCurveTo(
                side.x - sideRadius + 5, side.y + side.ay * 5,
                side.x - sideRadius + 10, side.y
            );
            ctx.fill();

            // Right jaw
            ctx.beginPath();
            ctx.moveTo(side.x + sideRadius, side.y);
            ctx.quadraticCurveTo(
                side.x + sideRadius + 10, side.y + side.ay * 15,
                side.x + sideRadius + 5, side.y + side.ay * jawWidth
            );
            ctx.lineTo(side.x + sideRadius - 5, side.y + side.ay * jawWidth);
            ctx.quadraticCurveTo(
                side.x + sideRadius - 5, side.y + side.ay * 5,
                side.x + sideRadius - 10, side.y
            );
            ctx.fill();
        }
    }

    drawPocket(pocket) {
        const ctx = this.ctx;
        const x = pocket.position.x;
        const y = pocket.position.y;
        const r = pocket.radius;

        // Outer shadow
        const shadowGradient = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.3);
        shadowGradient.addColorStop(0, '#000000');
        shadowGradient.addColorStop(0.6, '#1a1a1a');
        shadowGradient.addColorStop(1, 'rgba(26, 26, 26, 0)');

        ctx.fillStyle = shadowGradient;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Pocket hole with depth effect
        const holeGradient = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
        holeGradient.addColorStop(0, '#0a0a0a');
        holeGradient.addColorStop(0.7, '#000000');
        holeGradient.addColorStop(1, '#1a1a1a');

        ctx.fillStyle = holeGradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Inner rim highlight
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
        ctx.stroke();

        // Pocket net/depth illusion
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    // DEBUG: Temporary visualization of pocket detection circles
    drawPocketDebug() {
        const ctx = this.ctx;

        for (const pocket of this.table.pockets) {
            const x = pocket.position.x;
            const y = pocket.position.y;
            const r = pocket.radius;

            // Draw detection circle outline
            ctx.strokeStyle = pocket.type === 'side' ? '#ff00ff' : '#00ffff';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw center point
            ctx.fillStyle = pocket.type === 'side' ? '#ff00ff' : '#00ffff';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // DEBUG: Temporary visualization of cushion collision boundaries
    drawCushionDebug() {
        const ctx = this.ctx;
        const b = this.table.bounds;
        const pocketRadius = Constants.POCKET_RADIUS;
        const ballRadius = Constants.BALL_RADIUS;
        const gap = pocketRadius + ballRadius * 0.5;
        const segmentLength = 20;

        // Angles (must match physics)
        const sidePocketAngle = 70;
        const cornerPocketAngle = 45;
        const sideRad = sidePocketAngle * Math.PI / 180;
        const cornerRad = cornerPocketAngle * Math.PI / 180;

        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);

        // Top rail segments
        ctx.beginPath();
        ctx.moveTo(b.left + gap, b.top);
        ctx.lineTo(this.table.center.x - gap, b.top);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.table.center.x + gap, b.top);
        ctx.lineTo(b.right - gap, b.top);
        ctx.stroke();

        // Bottom rail segments
        ctx.beginPath();
        ctx.moveTo(b.left + gap, b.bottom);
        ctx.lineTo(this.table.center.x - gap, b.bottom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.table.center.x + gap, b.bottom);
        ctx.lineTo(b.right - gap, b.bottom);
        ctx.stroke();

        // Left rail
        ctx.beginPath();
        ctx.moveTo(b.left, b.top + gap);
        ctx.lineTo(b.left, b.bottom - gap);
        ctx.stroke();

        // Right rail
        ctx.beginPath();
        ctx.moveTo(b.right, b.top + gap);
        ctx.lineTo(b.right, b.bottom - gap);
        ctx.stroke();

        ctx.setLineDash([]);

        // Draw angled pocket entry segments (solid green for visibility)
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;

        // Side pocket entries (top)
        ctx.beginPath();
        ctx.moveTo(this.table.center.x - gap, b.top);
        ctx.lineTo(this.table.center.x - gap + Math.cos(sideRad) * segmentLength, b.top - Math.sin(sideRad) * segmentLength);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.table.center.x + gap, b.top);
        ctx.lineTo(this.table.center.x + gap - Math.cos(sideRad) * segmentLength, b.top - Math.sin(sideRad) * segmentLength);
        ctx.stroke();

        // Side pocket entries (bottom)
        ctx.beginPath();
        ctx.moveTo(this.table.center.x - gap, b.bottom);
        ctx.lineTo(this.table.center.x - gap + Math.cos(sideRad) * segmentLength, b.bottom + Math.sin(sideRad) * segmentLength);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.table.center.x + gap, b.bottom);
        ctx.lineTo(this.table.center.x + gap - Math.cos(sideRad) * segmentLength, b.bottom + Math.sin(sideRad) * segmentLength);
        ctx.stroke();

        // Corner pocket entries
        // Top-left
        ctx.beginPath();
        ctx.moveTo(b.left + gap, b.top);
        ctx.lineTo(b.left + gap - Math.cos(cornerRad) * segmentLength, b.top - Math.sin(cornerRad) * segmentLength);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.left, b.top + gap);
        ctx.lineTo(b.left - Math.sin(cornerRad) * segmentLength, b.top + gap - Math.cos(cornerRad) * segmentLength);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(b.right - gap, b.top);
        ctx.lineTo(b.right - gap + Math.cos(cornerRad) * segmentLength, b.top - Math.sin(cornerRad) * segmentLength);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.right, b.top + gap);
        ctx.lineTo(b.right + Math.sin(cornerRad) * segmentLength, b.top + gap - Math.cos(cornerRad) * segmentLength);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(b.left + gap, b.bottom);
        ctx.lineTo(b.left + gap - Math.cos(cornerRad) * segmentLength, b.bottom + Math.sin(cornerRad) * segmentLength);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.left, b.bottom - gap);
        ctx.lineTo(b.left - Math.sin(cornerRad) * segmentLength, b.bottom - gap + Math.cos(cornerRad) * segmentLength);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(b.right - gap, b.bottom);
        ctx.lineTo(b.right - gap + Math.cos(cornerRad) * segmentLength, b.bottom + Math.sin(cornerRad) * segmentLength);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.right, b.bottom - gap);
        ctx.lineTo(b.right + Math.sin(cornerRad) * segmentLength, b.bottom - gap + Math.cos(cornerRad) * segmentLength);
        ctx.stroke();

        // Draw gap endpoints as circles
        ctx.fillStyle = '#ffff00';
        const endpoints = [
            // Top rail gaps
            { x: b.left + gap, y: b.top },
            { x: this.table.center.x - gap, y: b.top },
            { x: this.table.center.x + gap, y: b.top },
            { x: b.right - gap, y: b.top },
            // Bottom rail gaps
            { x: b.left + gap, y: b.bottom },
            { x: this.table.center.x - gap, y: b.bottom },
            { x: this.table.center.x + gap, y: b.bottom },
            { x: b.right - gap, y: b.bottom },
            // Left rail gaps
            { x: b.left, y: b.top + gap },
            { x: b.left, y: b.bottom - gap },
            // Right rail gaps
            { x: b.right, y: b.top + gap },
            { x: b.right, y: b.bottom - gap }
        ];

        for (const pt of endpoints) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    createWoodGradient(x, y, w, h) {
        const gradient = this.ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, '#8B5A2B');
        gradient.addColorStop(0.3, '#A0522D');
        gradient.addColorStop(0.7, '#8B4513');
        gradient.addColorStop(1, '#654321');
        return gradient;
    }

    createFeltGradient() {
        const b = this.table.bounds;
        const gradient = this.ctx.createRadialGradient(
            this.table.center.x, this.table.center.y, 0,
            this.table.center.x, this.table.center.y, this.table.width / 2
        );
        gradient.addColorStop(0, '#0f6b35');
        gradient.addColorStop(1, Constants.FELT_COLOR);
        return gradient;
    }

    drawFeltTexture() {
        const ctx = this.ctx;
        const b = this.table.bounds;

        ctx.globalAlpha = 0.02;
        for (let i = 0; i < 300; i++) {
            const x = b.left + Math.random() * this.table.width;
            const y = b.top + Math.random() * this.table.height;
            ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#0a0';
            ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    drawDiamond(pos) {
        const ctx = this.ctx;
        const size = 5;

        ctx.fillStyle = '#f5f5dc';
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - size);
        ctx.lineTo(pos.x + size / 2, pos.y);
        ctx.lineTo(pos.x, pos.y + size);
        ctx.lineTo(pos.x - size / 2, pos.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#c0a000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    drawBalls(balls) {
        const sortedBalls = [...balls].sort((a, b) => a.position.y - b.position.y);

        for (const ball of sortedBalls) {
            if (!ball.pocketed) {
                this.drawBall(ball);
            }
        }
    }

    drawBall(ball) {
        const ctx = this.ctx;
        let x = ball.position.x;
        let y = ball.position.y;
        let radius = ball.radius;
        let alpha = 1;

        if (ball.sinking) {
            const progress = ball.sinkProgress;
            const pocket = ball.sinkPocket;
            x = lerp(ball.position.x, pocket.position.x, progress);
            y = lerp(ball.position.y, pocket.position.y, progress);
            radius = ball.radius * (1 - progress * 0.5);
            alpha = 1 - progress;
        }

        ctx.globalAlpha = alpha;

        this.drawBallShadow(x, y, radius);

        // Use 3D renderer if enabled, otherwise use simple 2D rendering
        if (this.use3DBalls) {
            this.ballRenderer3D.drawBall(ctx, ball, x, y, radius, alpha);
        } else {
            if (ball.isStripe) {
                this.drawStripeBall(x, y, radius, ball);
            } else {
                this.drawSolidBall(x, y, radius, ball);
            }

            // Draw number - skip for UK balls except 8-ball
            if (!ball.isCueBall && !(ball.isUKBall && !ball.isEightBall)) {
                this.drawBallNumber(x, y, radius, ball.number, ball);
            }

            this.drawBallHighlight(x, y, radius);
        }

        ctx.globalAlpha = 1;
    }

    drawBallShadow(x, y, radius) {
        const ctx = this.ctx;

        // Shadow offset (light from top-left)
        const offsetX = radius * 0.3;
        const offsetY = radius * 0.3;
        const shadowX = x + offsetX;
        const shadowY = y + offsetY;

        // Multiple layered ellipses for soft shadow effect
        const layers = [
            { scale: 1.4, opacity: 0.06 },
            { scale: 1.2, opacity: 0.08 },
            { scale: 1.0, opacity: 0.10 },
            { scale: 0.8, opacity: 0.12 },
            { scale: 0.6, opacity: 0.14 },
        ];

        for (const layer of layers) {
            ctx.fillStyle = `rgba(0, 0, 0, ${layer.opacity})`;
            ctx.beginPath();
            ctx.ellipse(
                shadowX,
                shadowY,
                radius * layer.scale,
                radius * layer.scale * 0.5,
                0.3,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }

    drawSolidBall(x, y, radius, ball) {
        const ctx = this.ctx;
        const gradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
        const baseColor = ball.color;
        gradient.addColorStop(0, this.lightenColor(baseColor, 40));
        gradient.addColorStop(0.5, baseColor);
        gradient.addColorStop(1, this.darkenColor(baseColor, 30));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    drawStripeBall(x, y, radius, ball) {
        const ctx = this.ctx;

        const whiteGradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
        whiteGradient.addColorStop(0, '#FFFFFF');
        whiteGradient.addColorStop(0.5, '#F5F5F0');
        whiteGradient.addColorStop(1, '#D0D0D0');

        ctx.fillStyle = whiteGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();

        // Slow down visual rotation for stripes to reduce strobing effect
        const visualRoll = ball.displayRoll * 0.5;

        // cos(visualRoll) tells us if stripe faces camera (>0) or is on back (<0)
        const facingCamera = Math.cos(visualRoll);
        const baseStripeWidth = radius * 1.2;

        // Transition threshold - switch between stripe mode and ring/pole mode
        const transitionThreshold = 0.5;
        const isStripeMode = Math.abs(facingCamera) > transitionThreshold;

        if (isStripeMode) {
            // STRIPE MODE: Draw the stripe band across the ball
            const drawStripe = (offset, width, opacity) => {
                const offsetX = Math.cos(ball.travelAngle) * offset;
                const offsetY = Math.sin(ball.travelAngle) * offset;

                ctx.save();
                ctx.translate(x + offsetX, y + offsetY);
                ctx.rotate(ball.travelAngle + Math.PI / 2);
                ctx.globalAlpha = ctx.globalAlpha * opacity;
                ctx.fillStyle = ball.color;
                ctx.fillRect(-radius * 1.5, -width / 2, radius * 3, width);
                ctx.restore();
            };

            // Draw back stripe (dimmer)
            const backFacing = -facingCamera;
            if (backFacing > transitionThreshold) {
                const backOffset = -Math.sin(visualRoll) * radius * 0.8;
                const backWidth = baseStripeWidth * Math.max(0.1, backFacing) * 0.7;
                const backOpacity = Math.min(0.4, backFacing * 0.5);
                drawStripe(backOffset, backWidth, backOpacity);
            }

            // Draw front stripe (brighter)
            if (facingCamera > transitionThreshold) {
                const frontOffset = Math.sin(visualRoll) * radius * 0.8;
                const frontWidth = baseStripeWidth * facingCamera;
                drawStripe(frontOffset, frontWidth, 1);
            }
        } else {
            // RING/POLE MODE: Show colored ring with white pole moving across

            // Draw the stripe color as a solid ring around the edge
            ctx.fillStyle = ball.color;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Calculate pole position - moves across the ball during this phase
            // facingCamera goes from +threshold through 0 to -threshold (or vice versa)
            // Map this to pole traveling from one side to the other
            // Normalize facingCamera within the threshold range to -1 to +1
            const poleTravel = -facingCamera / transitionThreshold;
            const poleOffset = poleTravel * radius * 0.85;
            const poleX = x + Math.cos(ball.travelAngle) * poleOffset;
            const poleY = y + Math.sin(ball.travelAngle) * poleOffset;
            const poleRadius = radius * 0.7;

            // Draw pole as solid white circle with hard edge
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(poleX, poleY, poleRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawBallNumber(x, y, radius, number, ball) {
        const ctx = this.ctx;
        const circleRadius = radius * 0.45;

        // Calculate number position offset based on roll
        // Number moves in the direction of travel (parallel)
        const rollOffset = Math.sin(ball.displayRoll) * radius * 0.6;
        const offsetX = Math.cos(ball.travelAngle) * rollOffset;
        const offsetY = Math.sin(ball.travelAngle) * rollOffset;

        // Calculate visibility - number fades when "on the back" of the ball
        // cos(displayRoll) gives us how much the number faces the camera
        const visibility = Math.cos(ball.displayRoll);

        // Only draw if number is facing forward (visibility > 0)
        if (visibility > 0.1) {
            // Scale circle based on 3D perspective (smaller when tilted)
            const scale = 0.5 + visibility * 0.5;
            const scaledRadius = circleRadius * scale;

            ctx.save();
            ctx.globalAlpha = ctx.globalAlpha * visibility;

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(x + offsetX, y + offsetY, scaledRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000000';
            ctx.font = `bold ${radius * 0.6 * scale}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(number.toString(), x + offsetX, y + offsetY + 1);

            ctx.restore();
        }
    }

    drawBallHighlight(x, y, radius) {
        const ctx = this.ctx;

        const highlightGradient = ctx.createRadialGradient(
            x - radius * 0.4, y - radius * 0.4, 0,
            x - radius * 0.4, y - radius * 0.4, radius * 0.5
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    drawSpinIndicator(indicator, spin) {
        const ctx = this.ctx;
        const x = indicator.x;
        const y = indicator.y;
        const r = indicator.radius;

        // Background circle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.fill();

        // Cue ball representation
        const ballGradient = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
        ballGradient.addColorStop(0, '#FFFFFF');
        ballGradient.addColorStop(0.5, '#F0F0E8');
        ballGradient.addColorStop(1, '#C0C0B0');

        ctx.fillStyle = ballGradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Crosshairs
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
        ctx.stroke();

        // Spin position indicator (red dot)
        const spinX = x + spin.x * r * 0.7;
        const spinY = y + spin.y * r * 0.7;

        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(spinX, spinY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#aa0000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SPIN', x, y + r + 18);
    }

    drawAimLine(cueBall, direction, power, trajectory) {
        const ctx = this.ctx;

        if (!direction || power === 0) return;

        const lineLength = Constants.AIM_LINE_LENGTH * (power / Constants.MAX_POWER);
        const endPoint = Vec2.add(cueBall.position, Vec2.multiply(direction, lineLength));

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(cueBall.position.x, cueBall.position.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (trajectory && trajectory.firstHit) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(trajectory.firstHit.position.x, trajectory.firstHit.position.y, cueBall.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (trajectory.targetPath.length > 0) {
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.3)';
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(trajectory.firstHit.position.x, trajectory.firstHit.position.y);

                for (let i = 0; i < Math.min(trajectory.targetPath.length, 50); i++) {
                    ctx.lineTo(trajectory.targetPath[i].x, trajectory.targetPath[i].y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    drawCueStick(cueBall, direction, power, pullBack) {
        const ctx = this.ctx;

        if (!direction) return;

        const angle = Vec2.angle(direction);
        const cueLength = 280;
        const cueWidth = 8;
        const backDistance = cueBall.radius + 8 + (pullBack || 0);

        ctx.save();
        ctx.translate(cueBall.position.x, cueBall.position.y);
        ctx.rotate(angle + Math.PI);

        const gradient = ctx.createLinearGradient(backDistance, 0, backDistance + cueLength, 0);
        gradient.addColorStop(0, '#F5DEB3');
        gradient.addColorStop(0.05, '#DEB887');
        gradient.addColorStop(0.1, '#8B4513');
        gradient.addColorStop(0.6, '#654321');
        gradient.addColorStop(1, '#1a1a1a');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(backDistance, -cueWidth / 4);
        ctx.lineTo(backDistance + cueLength, -cueWidth);
        ctx.lineTo(backDistance + cueLength, cueWidth);
        ctx.lineTo(backDistance, cueWidth / 4);
        ctx.closePath();
        ctx.fill();

        // Ferrule
        ctx.fillStyle = '#FFFFF0';
        ctx.fillRect(backDistance, -cueWidth / 4, 10, cueWidth / 2);

        // Tip with chalk
        ctx.fillStyle = '#4169E1';
        ctx.beginPath();
        ctx.arc(backDistance, 0, cueWidth / 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawPowerMeter(power) {
        const ctx = this.ctx;

        // Position power meter to the right of the spin indicator
        const meterX = 90;
        const meterY = this.table.canvasHeight / 2 - 50;
        const meterWidth = 18;
        const meterHeight = 100;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(meterX, meterY, meterWidth, meterHeight, 4);
        ctx.fill();
        ctx.stroke();

        const fillPercent = power / Constants.MAX_POWER;
        const fillHeight = meterHeight * fillPercent;

        const gradient = ctx.createLinearGradient(0, meterY + meterHeight, 0, meterY);
        gradient.addColorStop(0, '#00ff00');
        gradient.addColorStop(0.5, '#ffff00');
        gradient.addColorStop(1, '#ff0000');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(meterX + 2, meterY + meterHeight - fillHeight + 2, meterWidth - 4, Math.max(0, fillHeight - 4), 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('POWER', meterX + meterWidth / 2, meterY + meterHeight + 14);
    }

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return `rgb(${R},${G},${B})`;
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return `rgb(${R},${G},${B})`;
    }
}
