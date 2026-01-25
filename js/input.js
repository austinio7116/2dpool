// Input handling - mouse controls for aiming, shooting, and spin

import { Vec2, Constants, clamp } from './utils.js';

export class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.mousePos = Vec2.create(0, 0);
        this.isMouseDown = false;
        this.isDragging = false;
        this.dragStart = Vec2.create(0, 0);

        // Aiming state
        this.aimDirection = null;
        this.power = 0;
        this.pullBack = 0;

        // Spin state (english)
        // x: -1 (left) to 1 (right)
        // y: -1 (bottom/draw) to 1 (top/follow)
        this.spin = Vec2.create(0, 0);
        this.isSettingSpin = false;

        // Spin indicator position and size (positioned in bottom-left corner, away from pockets)
        this.spinIndicator = {
            x: 50,
            y: 0,  // Will be set based on canvas height
            radius: 30
        };

        // Callbacks
        this.onShot = null;
        this.onAimUpdate = null;
        this.onBallInHand = null;
        this.onBallPlaced = null;

        // Ball placement mode (after scratch)
        this.ballInHandMode = false;
        this.placementBall = null;
        this.placementValid = true;

        // Bind event handlers
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);

        this.attachEvents();
    }

    attachEvents() {
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    detachEvents() {
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    setCanvasSize(width, height) {
        // Position spin indicator at bottom left, but away from corner pocket
        this.spinIndicator.x = 50;
        this.spinIndicator.y = height / 2;  // Center vertically, away from pockets
    }

    getMousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return Vec2.create(
            (event.clientX - rect.left) * scaleX,
            (event.clientY - rect.top) * scaleY
        );
    }

    isOverSpinIndicator(pos) {
        const dx = pos.x - this.spinIndicator.x;
        const dy = pos.y - this.spinIndicator.y;
        return (dx * dx + dy * dy) < (this.spinIndicator.radius * this.spinIndicator.radius);
    }

    handleMouseMove(event) {
        this.mousePos = this.getMousePosition(event);

        // Handle spin adjustment
        if (this.isSettingSpin) {
            this.updateSpin();
            return;
        }

        if (this.ballInHandMode && this.placementBall) {
            this.placementBall.position.x = this.mousePos.x;
            this.placementBall.position.y = this.mousePos.y;

            if (this.onBallInHand) {
                this.onBallInHand(this.mousePos);
            }
            return;
        }

        if (this.isDragging && this.cueBall && !this.cueBall.pocketed) {
            this.updateAim();
        }
    }

    handleMouseDown(event) {
        if (event.button !== 0) return;

        this.isMouseDown = true;
        this.mousePos = this.getMousePosition(event);

        // Check if clicking on spin indicator
        if (this.canShoot && !this.ballInHandMode && this.isOverSpinIndicator(this.mousePos)) {
            this.isSettingSpin = true;
            this.updateSpin();
            return;
        }

        if (this.ballInHandMode && this.placementBall && this.placementValid) {
            this.ballInHandMode = false;
            this.placementBall = null;

            if (this.onBallPlaced) {
                this.onBallPlaced(this.mousePos);
            }
            return;
        }

        // Start aiming
        if (this.cueBall && !this.cueBall.pocketed && this.canShoot) {
            this.isDragging = true;
            this.dragStart = Vec2.clone(this.mousePos);
            this.updateAim();
        }
    }

    handleMouseUp(event) {
        if (event.button !== 0) return;

        if (this.isSettingSpin) {
            this.isSettingSpin = false;
            return;
        }

        if (this.isDragging && this.power > Constants.MIN_POWER) {
            if (this.onShot) {
                this.onShot(this.aimDirection, this.power, this.spin);
            }
        }

        this.resetAim();
        this.isMouseDown = false;
        this.isDragging = false;
    }

    handleMouseLeave(event) {
        if (this.isDragging) {
            this.resetAim();
            this.isDragging = false;
        }
        this.isSettingSpin = false;
        this.isMouseDown = false;
    }

    updateSpin() {
        const dx = this.mousePos.x - this.spinIndicator.x;
        const dy = this.mousePos.y - this.spinIndicator.y;
        const maxOffset = this.spinIndicator.radius * 0.7;

        this.spin.x = clamp(dx / maxOffset, -1, 1);
        this.spin.y = clamp(dy / maxOffset, -1, 1);
    }

    updateAim() {
        if (!this.cueBall) return;

        const toCueBall = Vec2.subtract(this.cueBall.position, this.mousePos);
        const distFromCueBall = Vec2.length(toCueBall);

        if (distFromCueBall > 5) {
            this.aimDirection = Vec2.normalize(Vec2.multiply(toCueBall, -1));
            const dragDist = Vec2.distance(this.mousePos, this.cueBall.position);
            this.power = clamp(dragDist * Constants.POWER_SCALE, 0, Constants.MAX_POWER);
            this.pullBack = Math.min(dragDist * 0.5, 100);
        } else {
            this.power = 0;
            this.pullBack = 0;
        }

        if (this.onAimUpdate) {
            this.onAimUpdate(this.aimDirection, this.power);
        }
    }

    resetAim() {
        this.aimDirection = null;
        this.power = 0;
        this.pullBack = 0;

        if (this.onAimUpdate) {
            this.onAimUpdate(null, 0);
        }
    }

    resetSpin() {
        this.spin.x = 0;
        this.spin.y = 0;
    }

    setCueBall(cueBall) {
        this.cueBall = cueBall;
    }

    setCanShoot(canShoot) {
        this.canShoot = canShoot;
        if (!canShoot) {
            this.resetAim();
        }
    }

    enterBallInHandMode(ball, validationCallback) {
        this.ballInHandMode = true;
        this.placementBall = ball;
        this.placementValidation = validationCallback;
    }

    exitBallInHandMode() {
        this.ballInHandMode = false;
        this.placementBall = null;
    }

    getAimState() {
        return {
            aiming: this.isDragging,
            direction: this.aimDirection,
            power: this.power,
            pullBack: this.pullBack,
            mousePos: this.mousePos,
            spin: this.spin,
            spinIndicator: this.spinIndicator,
            isSettingSpin: this.isSettingSpin
        };
    }

    isAiming() {
        return this.isDragging;
    }

    isPlacingBall() {
        return this.ballInHandMode;
    }
}
