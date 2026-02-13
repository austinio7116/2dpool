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
        this.tableImagesLoaded = [false, false, false, false, false, false, false, false, false];
        this.currentTableIndex = 0;
        this.allAssetsLoaded = false;
        this.onAssetsLoaded = null;

        let loadedCount = 0;
        const totalImages = 9;

        for (let i = 0; i < totalImages; i++) {
            const img = new Image();
            const index = i;
            img.onload = () => {
                this.tableImagesLoaded[index] = true;
                loadedCount++;
                if (loadedCount >= totalImages) {
                    this.allAssetsLoaded = true;
                    if (this.onAssetsLoaded) {
                        this.onAssetsLoaded();
                    }
                }
            };
            img.onerror = () => {
                // Count errors as "loaded" to not block forever
                loadedCount++;
                if (loadedCount >= totalImages) {
                    this.allAssetsLoaded = true;
                    if (this.onAssetsLoaded) {
                        this.onAssetsLoaded();
                    }
                }
            };
            // Table 9 uses fullsizesnooker.png
            if (i === 8) {
                img.src = 'assets/pooltable9.png';
            } else {
                img.src = `assets/pooltable${i === 0 ? '' : i + 1}.png`;
            }
            this.tableImages.push(img);
        }

        // Load colorize overlays for tables 1, 2, 3, 4, 7, 8, 9
        this.colorizeOverlays = {};
        this.colorizeOverlaysLoaded = {};
        const overlayTables = [1, 2, 3, 4, 7, 8, 9];
        for (const tableNum of overlayTables) {
            const img = new Image();
            img.onload = () => {
                this.colorizeOverlaysLoaded[tableNum] = true;
            };
            img.onerror = () => {
                console.warn(`Failed to load colorize overlay for table ${tableNum}`);
            };
            img.src = `assets/Table${tableNum}-colorize.png`;
            this.colorizeOverlays[tableNum] = img;
        }

        this.cueImage = new Image();
        this.cueImage.src = 'assets/cue.png';

        // HSB adjustments for current table
        this.currentHSBAdjustments = null;

        // 3D ball renderer (alternative rendering mode)
        this.ballRenderer3D = new BallRenderer3D(Constants.BALL_RADIUS);
        this.use3DBalls = true; // 3D ball rendering enabled by default
    }

    setUse3DBalls(enabled) {
        this.use3DBalls = enabled;
    }

    setTableStyle(tableNum, hsbAdjustments = null) {
        // tableNum is 1-x, convert to 0-(x-1) index
        this.currentTableIndex = Math.max(0, Math.min(this.tableImages.length - 1, tableNum - 1));

        // Store HSB adjustments for this table
        this.currentHSBAdjustments = hsbAdjustments;

        // Update canvas size if table dimensions changed
        if (this.canvas.width !== this.table.canvasWidth || this.canvas.height !== this.table.canvasHeight) {
            this.canvas.width = this.table.canvasWidth;
            this.canvas.height = this.table.canvasHeight;
        }
    }

    render(state) {
        this.clear();

        // Draw table image overlay (if loaded)
        if (this.tableImagesLoaded[this.currentTableIndex]) {
            this.ctx.drawImage(this.tableImages[this.currentTableIndex], 0, 0, this.canvas.width, this.canvas.height);
        }

        // Draw colorize overlay with HSB filters (if available)
        this.drawColorizeOverlay();

        // Draw D zone for snooker ball-in-hand
        if (state.showDZone) {
            this.drawDZone();
        }

        // DEBUG: Draw pocket detection circles (uncomment to visualize)
        // this.drawPocketDebug();

        // DEBUG: Draw cushion collision boundaries (uncomment to visualize)
        // this.drawCushionDebug();

        this.drawBalls(state.balls);

        // Draw AI visualization overlay (if present)
        if (state.aiVisualization) {
            if (state.aiVisualization.candidates) {
                this.drawAIShotCandidates(state.aiVisualization.candidates);
            }
            if (state.aiVisualization.safetyCandidates) {
                this.drawAISafetyCandidates(state.aiVisualization.safetyCandidates);
            }
            if (state.aiVisualization.chosenEndPos) {
                this.drawChosenEndPos(state.aiVisualization.chosenEndPos);
            }
            if (state.aiVisualization.main) {
                this.drawAIVisualization(state.aiVisualization.main);
            }
        }

        if (state.showSpinIndicator) {
            this.drawSpinIndicator(state.spinIndicator, state.spin, state.isSettingSpin, state.isTouchSpin);
        }

        if (state.aiming && state.cueBall && !state.cueBall.pocketed) {
            this.drawAimLine(state.cueBall, state.aimDirection, state.power, state.trajectory);
            this.drawCueStick(state.cueBall, state.aimDirection, state.power, state.pullBack);
            this.drawPowerMeter(state.power, state.isTouchDevice, state.powerOverrideActive);

            if (state.isTouchDevice && state.shootButton) {
                this.drawShootButton(state.shootButton, state.power);
            }
        }
    }

    clear() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw colorize overlay with HSB adjustments
    drawColorizeOverlay() {
        if (!this.currentHSBAdjustments) return;

        const tableNum = this.currentTableIndex + 1;
        const overlay = this.colorizeOverlays[tableNum];

        if (!overlay || !this.colorizeOverlaysLoaded[tableNum]) return;

        const ctx = this.ctx;
        const { hue, saturation, brightness } = this.currentHSBAdjustments;

        // Apply CSS filter for HSB adjustments
        ctx.save();
        const filterString = `hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${brightness}%)`;
        ctx.filter = filterString;

        ctx.drawImage(overlay, 0, 0, this.canvas.width, this.canvas.height);

        ctx.restore();
    }

    // Draw the D zone for snooker ball-in-hand placement
    drawDZone() {
        const dGeometry = this.table.getDGeometry();
        if (!dGeometry) return;

        const ctx = this.ctx;
        const { baulkX, centerY, radius } = dGeometry;

        ctx.save();

        // Draw baulk line (full vertical line)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(baulkX, this.table.bounds.top);
        ctx.lineTo(baulkX, this.table.bounds.bottom);
        ctx.stroke();

        // Draw the D (semicircle opening towards baulk cushion)
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        // Arc from bottom to top, opening to the left (towards baulk cushion)
        ctx.arc(baulkX, centerY, radius, Math.PI / 2, -Math.PI / 2, false);
        ctx.stroke();

        // Fill the D zone with a subtle highlight
        ctx.fillStyle = 'rgba(100, 200, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(baulkX, centerY, radius, Math.PI / 2, -Math.PI / 2, false);
        ctx.lineTo(baulkX, centerY - radius);
        ctx.closePath();
        ctx.fill();

        // Draw the color spots on the baulk line (yellow, brown, green)
        const spots = this.table.spots;
        if (spots) {
            const spotColors = {
                yellow: '#FFD700',
                brown: '#8B4513',
                green: '#228B22'
            };

            for (const [name, color] of Object.entries(spotColors)) {
                const spot = spots[name];
                if (spot) {
                    const spotX = this.table.center.x + spot.x;
                    const spotY = this.table.center.y + spot.y;

                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(spotX, spotY, 4, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }

    drawCushions() {
        const ctx = this.ctx;
        const t = this.table;
        const b = t.bounds;
        const cushionWidth = 18;
        // Use pocket radius from table pockets (which already uses table-specific config)
        const pocketRadius = t.pockets[0]?.radius || Constants.POCKET_RADIUS;

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
        // Use pocket radius from table pockets (which already uses table-specific config)
        const pocketRadius = t.pockets[0]?.radius || Constants.POCKET_RADIUS;
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

    setPhysics(physics) {
        this.physics = physics;
    }

    // DEBUG: Temporary visualization of cushion collision boundaries
    drawCushionDebug() {
        // Ensure physics engine is initialized
        if (!this.physics || !this.physics.railBodies) return;

        const ctx = this.ctx;
        const PHYSICS_SCALE = 100; // Must match SCALE in PlanckPhysics

        ctx.save();
        
        // 1. Draw the Chain Lines
        ctx.strokeStyle = '#00ff00'; // Bright Green
        ctx.lineWidth = 1;           // Much thinner
        ctx.setLineDash([]);         // Solid lines for physics boundaries

        for (const body of this.physics.railBodies) {
            let fixture = body.getFixtureList();
            
            // Iterate through all fixtures on the rail body
            while (fixture) {
                const shape = fixture.getShape();
                const type = shape.getType();

                if (type === 'chain') {
                    // Planck.js ChainShape stores vertices in m_vertices
                    const vertices = shape.m_vertices;
                    
                    if (vertices && vertices.length > 0) {
                        ctx.beginPath();
                        
                        // Transform physics coordinates (meters) back to screen pixels
                        // Note: Rail bodies are static at 0,0, so vertices are world coords
                        ctx.moveTo(vertices[0].x * PHYSICS_SCALE, vertices[0].y * PHYSICS_SCALE);
                        
                        for (let i = 1; i < vertices.length; i++) {
                            ctx.lineTo(vertices[i].x * PHYSICS_SCALE, vertices[i].y * PHYSICS_SCALE);
                        }
                        
                        ctx.stroke();
                    }
                }
                fixture = fixture.getNext();
            }
        }

        // 2. Draw Vertices (Dots) to visualize curve resolution
        ctx.fillStyle = '#ffff00'; // Yellow dots
        
        for (const body of this.physics.railBodies) {
            let fixture = body.getFixtureList();
            while (fixture) {
                const shape = fixture.getShape();
                if (shape.getType() === 'chain') {
                    const vertices = shape.m_vertices;
                    if (vertices) {
                        for (const v of vertices) {
                            ctx.beginPath();
                            ctx.arc(v.x * PHYSICS_SCALE, v.y * PHYSICS_SCALE, 1.5, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
                fixture = fixture.getNext();
            }
        }

        ctx.restore();
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

            // Draw number - skip for UK balls except 8-ball, and skip for snooker balls
            if (!ball.isCueBall && !(ball.isUKBall && !ball.isEightBall) && !ball.isSnookerBall) {
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
        whiteGradient.addColorStop(0, '#FFFEF0');
        whiteGradient.addColorStop(0.5, '#F5F5E8');
        whiteGradient.addColorStop(1, '#D0D0C8');

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

            // Draw pole as solid ivory circle with hard edge
            ctx.fillStyle = '#FFFEF0';
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

            ctx.fillStyle = '#FFFEF0';
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

    drawSpinIndicator(indicator, spin, isSettingSpin, isTouchSpin) {
        const ctx = this.ctx;
        const x = indicator.x;
        const y = indicator.y;
        const r = indicator.radius;

        // Background circle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.fill();

        // Cue ball representation (ivory)
        const ballGradient = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
        ballGradient.addColorStop(0, '#FFFEF0');
        ballGradient.addColorStop(0.5, '#F0F0E0');
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

        // Draw enlarged floating indicator when actively adjusting spin on touch
        if (isSettingSpin && isTouchSpin) {
            this.drawFloatingSpinIndicator(indicator, spin);
        }
    }

    drawFloatingSpinIndicator(indicator, spin) {
        const ctx = this.ctx;
        const scale = 2.5;
        const fr = indicator.radius * scale; // Floating indicator radius

        // Position: above and to the right of the original, clear of the thumb
        const fx = indicator.x + fr + 20;
        const fy = indicator.y - fr - 40;

        ctx.save();

        // Connecting line from original indicator to floating one
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(indicator.x, indicator.y);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Drop shadow for the floating indicator
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(fx + 3, fy + 3, fr + 8, 0, Math.PI * 2);
        ctx.fill();

        // Background circle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.arc(fx, fy, fr + 8, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Cue ball face (ivory gradient)
        const ballGradient = ctx.createRadialGradient(
            fx - fr * 0.2, fy - fr * 0.2, 0,
            fx, fy, fr
        );
        ballGradient.addColorStop(0, '#FFFEF0');
        ballGradient.addColorStop(0.5, '#F0F0E0');
        ballGradient.addColorStop(1, '#C0C0B0');

        ctx.fillStyle = ballGradient;
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Crosshairs
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx - fr, fy);
        ctx.lineTo(fx + fr, fy);
        ctx.moveTo(fx, fy - fr);
        ctx.lineTo(fx, fy + fr);
        ctx.stroke();

        // Spin dot (larger, more visible)
        const dotX = fx + spin.x * fr * 0.7;
        const dotY = fy + spin.y * fr * 0.7;
        const dotRadius = 10;

        // Dot glow
        const glowGradient = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotRadius * 2.5);
        glowGradient.addColorStop(0, 'rgba(255, 50, 50, 0.4)');
        glowGradient.addColorStop(1, 'rgba(255, 50, 50, 0)');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Dot itself
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#cc0000';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // White center highlight on dot
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(dotX - 2, dotY - 2, dotRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
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

        // Exit if image isn't ready
        if (!direction || !this.cueImage.complete) return;

        const angle = Vec2.angle(direction);
        
        // 1. SCALING: 
        // Your image is very tall (1146px). We scale it to a reasonable game size (~400px).
        // We maintain the aspect ratio (32/1146) so it doesn't look stretched.
        const cueLength = 400; 
        const aspectRatio = 32 / 1146; // approx 0.028
        const cueWidth = cueLength * aspectRatio; // approx 11px wide
        
        // Distance from ball center to cue tip
        const backDistance = cueBall.radius + 4 + (pullBack || 0);

        ctx.save();
        
        // 2. POSITIONING: Move to ball center
        ctx.translate(cueBall.position.x, cueBall.position.y);
        
        // 3. ROTATION:
        // Your image is Vertical (Tip=Top).
        // Aiming East (0 rad) -> We want cue West.
        // Canvas +Y is Down. Rotation of +90deg (PI/2) makes +Y point Left (West).
        // So 'angle + Math.PI / 2' aligns the image's vertical axis behind the ball.
        ctx.rotate(angle + Math.PI / 2);

        // 4. DRAWING:
        // Tip is at y=0 in the image.
        // We draw at y = backDistance (positive Y is now "behind" the ball).
        // We offset x by half width to center it.
        ctx.drawImage(
            this.cueImage, 
            -cueWidth / 2,   // X: Center horizontally
            backDistance,    // Y: Start drawing at the offset distance
            cueWidth, 
            cueLength
        );

        ctx.restore();
    }

    drawPowerMeter(power, isTouchDevice = false, powerOverrideActive = false) {
        const ctx = this.ctx;

        // Position power meter above the spin indicator, centered on it
        const spinCenterX = 35; // matches spin indicator x
        const spinTop = this.table.canvasHeight / 2 - 35; // spin indicator top edge
        const meterWidth = 18;
        const meterHeight = 100;
        const meterX = spinCenterX - meterWidth / 2;
        const meterY = spinTop - meterHeight - 20; // 20px gap above spin indicator

        // Draw wider touch target area on touch devices
        if (isTouchDevice) {
            const touchWidth = 40;
            const touchX = spinCenterX - touchWidth / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.beginPath();
            ctx.roundRect(touchX, meterY - 2, touchWidth, meterHeight + 4, 6);
            ctx.fill();

            // Small drag arrows on each side
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('\u25B2', spinCenterX, meterY + 8);   // up arrow at top
            ctx.fillText('\u25BC', spinCenterX, meterY + meterHeight - 2); // down arrow at bottom
        }

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

        // Draw marker line when power override is active
        if (powerOverrideActive) {
            const markerY = meterY + meterHeight - fillHeight;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(meterX - 4, markerY);
            ctx.lineTo(meterX + meterWidth + 4, markerY);
            ctx.stroke();
        }

        ctx.fillStyle = '#fff';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('POWER', meterX + meterWidth / 2, meterY - 6);
    }

    drawShootButton(button, power) {
        const ctx = this.ctx;
        const x = button.x;
        const y = button.y;
        const w = button.width;
        const h = button.height;
        const ready = power > Constants.MIN_POWER;

        // Button background with 3D effect
        const bgColor = ready ? 'rgba(0, 180, 80, 0.85)' : 'rgba(80, 80, 80, 0.6)';
        const borderColor = ready ? '#00cc55' : '#555';

        ctx.save();

        // Shadow for depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.roundRect(x - w / 2 + 2, y - h / 2 + 2, w, h, 8);
        ctx.fill();

        // Main button
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Top highlight for 3D effect
        if (ready) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.roundRect(x - w / 2 + 2, y - h / 2 + 1, w - 4, h / 2 - 1, { tl: 6, tr: 6, bl: 0, br: 0 });
            ctx.fill();
        }

        // Label
        ctx.fillStyle = ready ? '#fff' : '#999';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SHOOT', x, y);

        ctx.restore();
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

    // Convert pot score (0-100) to a colour: red → yellow → green
    scoreToColor(score, alpha = 0.7) {
        const t = Math.max(0, Math.min(100, score)) / 100;
        let r, g, b;
        if (t < 0.5) {
            const u = t / 0.5;
            r = 255;
            g = Math.round(60 + (220 - 60) * u);
            b = Math.round(60 + (50 - 60) * u);
        } else {
            const u = (t - 0.5) / 0.5;
            r = Math.round(255 + (50 - 255) * u);
            g = Math.round(220 + (220 - 220) * u);
            b = 50;
        }
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // Draw all candidate pot options the AI is considering
    drawAIShotCandidates(candidates) {
        const ctx = this.ctx;
        ctx.save();
        for (const c of candidates) {
            const color = this.scoreToColor(c.potScore, 0.6);

            // Line from target ball to pocket
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(c.targetPos.x, c.targetPos.y);
            ctx.lineTo(c.pocketPos.x, c.pocketPos.y);
            ctx.stroke();

            // Small filled circle at target ball position
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(c.targetPos.x, c.targetPos.y, 5, 0, Math.PI * 2);
            ctx.fill();

            // Score label near target ball
            ctx.fillStyle = this.scoreToColor(c.potScore, 0.9);
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(c.potScore).toString(), c.targetPos.x, c.targetPos.y - 10);
        }
        ctx.restore();
    }

    // Draw all safety shot candidates the AI considered, coloured by score
    drawAISafetyCandidates(candidates) {
        const ctx = this.ctx;
        ctx.save();

        for (const c of candidates) {
            const color = this.scoreToColor(c.score, 0.45);
            const labelColor = this.scoreToColor(c.score, 0.85);

            // Dashed line from target ball to predicted cue ball end position
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(c.targetPos.x, c.targetPos.y);
            ctx.lineTo(c.cueBallEndPos.x, c.cueBallEndPos.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Small "x" at predicted cue ball end position
            const sz = 4;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(c.cueBallEndPos.x - sz, c.cueBallEndPos.y - sz);
            ctx.lineTo(c.cueBallEndPos.x + sz, c.cueBallEndPos.y + sz);
            ctx.moveTo(c.cueBallEndPos.x + sz, c.cueBallEndPos.y - sz);
            ctx.lineTo(c.cueBallEndPos.x - sz, c.cueBallEndPos.y + sz);
            ctx.stroke();

            // Score label near the end position
            ctx.fillStyle = labelColor;
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(c.score).toString(), c.cueBallEndPos.x, c.cueBallEndPos.y - 8);
        }

        ctx.restore();
    }

    // Draw crosshair at predicted cue ball end position
    drawChosenEndPos(endPos) {
        const ctx = this.ctx;
        ctx.save();

        // Outer dashed circle
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(endPos.x, endPos.y, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cross lines
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(endPos.x - 10, endPos.y);
        ctx.lineTo(endPos.x + 10, endPos.y);
        ctx.moveTo(endPos.x, endPos.y - 10);
        ctx.lineTo(endPos.x, endPos.y + 10);
        ctx.stroke();

        // Inner dot
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(endPos.x, endPos.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(0, 220, 255, 0.8)';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('CUE', endPos.x, endPos.y + 24);

        ctx.restore();
    }

    // Draw AI visualization overlay showing aiming calculations
    drawAIVisualization(vis) {
        const ctx = this.ctx;
        const lineLength = 300; // Length to extend aim lines
        const ballRadius = this.currentTableIndex == 8 ? 8 : 12; // Ensure we have radius

        // 1. Draw The "Ball Path" (Solid line with thickness of ball)
        // This helps visualize if the ball physically fits through the jaw gap
        const dist = Vec2.distance(vis.targetBallPos, vis.pocketAimPoint);
        const angle = Math.atan2(vis.pocketAimPoint.y - vis.targetBallPos.y, vis.pocketAimPoint.x - vis.targetBallPos.x);
        
        ctx.save();
        
        // Draw the "Swath" (The area the ball occupies)
        ctx.lineWidth = ballRadius * 2; // Full ball diameter
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.15)'; // Faint yellow
        ctx.beginPath();
        ctx.moveTo(vis.targetBallPos.x, vis.targetBallPos.y);
        ctx.lineTo(vis.pocketAimPoint.x, vis.pocketAimPoint.y);
        ctx.stroke();

        // Draw the "Whiskers" (The edges of the ball path)
        // This makes it very obvious if an edge hits a rail
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.beginPath();
        
        // Left Whisker
        const wx = Math.cos(angle + Math.PI/2) * ballRadius;
        const wy = Math.sin(angle + Math.PI/2) * ballRadius;
        ctx.moveTo(vis.targetBallPos.x + wx, vis.targetBallPos.y + wy);
        ctx.lineTo(vis.pocketAimPoint.x + wx, vis.pocketAimPoint.y + wy);
        
        // Right Whisker
        ctx.moveTo(vis.targetBallPos.x - wx, vis.targetBallPos.y - wy);
        ctx.lineTo(vis.pocketAimPoint.x - wx, vis.pocketAimPoint.y - wy);
        ctx.stroke();
        
        // Centerline (The precision aim path)
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(vis.targetBallPos.x, vis.targetBallPos.y);
        ctx.lineTo(vis.pocketAimPoint.x, vis.pocketAimPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 2. Draw pocket aim point (The Calculated Sweet Spot)
        ctx.fillStyle = '#ff00ff'; // Magenta
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(vis.pocketAimPoint.x, vis.pocketAimPoint.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Label for pocket aim point
        ctx.fillStyle = '#ff00ff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('OPTIMAL', vis.pocketAimPoint.x, vis.pocketAimPoint.y - 10);

        // 3. Draw original ghost ball position (before throw adjustment)
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(vis.ghostBall.x, vis.ghostBall.y, ballRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // 4. Draw adjusted ghost ball (after throw compensation)
        if (vis.adjustedGhostBall) {
            ctx.fillStyle = 'rgba(255, 165, 0, 0.3)'; // Orange
            ctx.strokeStyle = '#ffa500';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(vis.adjustedGhostBall.x, vis.adjustedGhostBall.y, ballRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Label for adjusted ghost ball
            ctx.fillStyle = '#ffa500';
            ctx.fillText('THROW ADJ', vis.adjustedGhostBall.x, vis.adjustedGhostBall.y - 18);
        } else {
            ctx.fillStyle = '#00ffff';
            ctx.fillText('GHOST', vis.ghostBall.x, vis.ghostBall.y - 18);
        }

        // 5. Draw initial aim line (before throw compensation) - WHITE
        const initialEnd = {
            x: vis.cueBallPos.x + vis.initialAimLine.x * lineLength,
            y: vis.cueBallPos.y + vis.initialAimLine.y * lineLength
        };
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(vis.cueBallPos.x, vis.cueBallPos.y);
        ctx.lineTo(initialEnd.x, initialEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // 6. Draw throw-adjusted aim line - ORANGE
        const throwEnd = {
            x: vis.cueBallPos.x + vis.throwAdjustedLine.x * lineLength,
            y: vis.cueBallPos.y + vis.throwAdjustedLine.y * lineLength
        };
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(vis.cueBallPos.x, vis.cueBallPos.y);
        ctx.lineTo(throwEnd.x, throwEnd.y);
        ctx.stroke();

        // 7. Draw final aim line (with error applied) - GREEN
        const finalEnd = {
            x: vis.cueBallPos.x + vis.finalAimLine.x * lineLength,
            y: vis.cueBallPos.y + vis.finalAimLine.y * lineLength
        };
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(vis.cueBallPos.x, vis.cueBallPos.y);
        ctx.lineTo(finalEnd.x, finalEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // 8. Legend
        this.drawAILegend(vis);
    }

    drawAILegend(vis) {
        const ctx = this.ctx;
        const legendX = 20;
        const legendY = this.table.canvasHeight - 80;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(legendX - 5, legendY - 15, 140, 70);

        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'left';

        // Initial Aim
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(legendX, legendY);
        ctx.lineTo(legendX + 25, legendY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Initial Aim', legendX + 30, legendY + 4);

        // Throw Adj
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(legendX, legendY + 18);
        ctx.lineTo(legendX + 25, legendY + 18);
        ctx.stroke();
        ctx.lineWidth = 1; // Reset
        ctx.fillStyle = '#ffa500';
        ctx.fillText('Throw Adj', legendX + 30, legendY + 22);

        // Final
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(legendX, legendY + 36);
        ctx.lineTo(legendX + 25, legendY + 36);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#00ff00';
        ctx.fillText('Final (w/error)', legendX + 30, legendY + 40);

        // Cut Angle
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Cut: ${vis.cutAngle.toFixed(1)}°`, legendX, legendY + 55);
    }
}
