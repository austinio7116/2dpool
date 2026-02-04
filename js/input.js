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

        // Bind event handlers - mouse
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleRightClick = this.handleRightClick.bind(this);

        // Bind event handlers - touch
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        this.attachEvents();
    }

    attachEvents() {
        // Mouse events - mousedown on canvas, move on canvas for ball placement
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('contextmenu', this.handleRightClick);

        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
    }

    detachEvents() {
        // Mouse events
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('contextmenu', this.handleRightClick);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        // Touch events
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
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

            // Update validity using the validation callback
            if (this.placementValidation) {
                this.placementValid = this.placementValidation(this.mousePos);
            }

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

        // Add document-level listeners for dragging outside canvas
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        // Check if clicking on spin indicator
        if (this.canShoot && !this.ballInHandMode && this.isOverSpinIndicator(this.mousePos)) {
            this.isSettingSpin = true;
            this.updateSpin();
            return;
        }

        // Ball placement mode - validate the ACTUAL click position, not stale placementValid
        if (this.ballInHandMode && this.placementBall) {
            // Validate using the click position (mousePos was just updated above)
            const isValidPosition = !this.placementValidation || this.placementValidation(this.mousePos);

            if (isValidPosition) {
                // Remove document listeners we just added
                document.removeEventListener('mousemove', this.handleMouseMove);
                document.removeEventListener('mouseup', this.handleMouseUp);

                this.ballInHandMode = false;
                this.placementBall = null;
                this.isMouseDown = false;

                if (this.onBallPlaced) {
                    this.onBallPlaced(this.mousePos);
                }
            }
            // Always return when in ball-in-hand mode to prevent aiming
            return;
        }

        // Start aiming (only when NOT in ball-in-hand mode)
        if (this.cueBall && !this.cueBall.pocketed && this.canShoot) {
            this.isDragging = true;
            this.dragStart = Vec2.clone(this.mousePos);
            this.updateAim();
        }
    }

    handleMouseUp(event) {
        if (event.button !== 0) return;

        // Remove document-level listeners
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        if (this.isSettingSpin) {
            this.isSettingSpin = false;
            this.isMouseDown = false;
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

    handleRightClick(event) {
        event.preventDefault();

        // Cancel shot if currently aiming
        if (this.isDragging) {
            // Remove document-level listeners
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('mouseup', this.handleMouseUp);

            this.resetAim();
            this.isMouseDown = false;
            this.isDragging = false;
        }
    }

    // Touch event handlers
    getTouchPosition(touch) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return Vec2.create(
            (touch.clientX - rect.left) * scaleX,
            (touch.clientY - rect.top) * scaleY
        );
    }

    handleTouchStart(event) {
        event.preventDefault();

        // Hide touch hint on first interaction
        const touchHint = document.getElementById('touch-hint');
        if (touchHint && !touchHint.classList.contains('fade-out')) {
            touchHint.classList.add('fade-out');
            setTimeout(() => touchHint.style.display = 'none', 500);
        }

        // Second touch cancels current shot
        if (event.touches.length > 1) {
            if (this.isDragging) {
                this.resetAim();
                this.isMouseDown = false;
                this.isDragging = false;
            }
            return;
        }
        const touch = event.touches[0];

        this.isMouseDown = true;
        this.mousePos = this.getTouchPosition(touch);

        // Check if touching spin indicator
        if (this.canShoot && !this.ballInHandMode && this.isOverSpinIndicator(this.mousePos)) {
            this.isSettingSpin = true;
            this.updateSpin();
            return;
        }

        // Ball placement mode - on touch, start moving the ball (place on touch end)
        if (this.ballInHandMode && this.placementBall) {
            // Move ball to touch position immediately
            this.placementBall.position.x = this.mousePos.x;
            this.placementBall.position.y = this.mousePos.y;

            if (this.onBallInHand) {
                this.onBallInHand(this.mousePos);
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

    handleTouchMove(event) {
        event.preventDefault();

        if (event.touches.length !== 1) return;
        const touch = event.touches[0];

        this.mousePos = this.getTouchPosition(touch);

        // Handle spin adjustment
        if (this.isSettingSpin) {
            this.updateSpin();
            return;
        }

        // Ball placement mode
        if (this.ballInHandMode && this.placementBall) {
            this.placementBall.position.x = this.mousePos.x;
            this.placementBall.position.y = this.mousePos.y;

            // Update validity using the validation callback
            if (this.placementValidation) {
                this.placementValid = this.placementValidation(this.mousePos);
            }

            if (this.onBallInHand) {
                this.onBallInHand(this.mousePos);
            }
            return;
        }

        // Update aim while dragging
        if (this.isDragging && this.cueBall && !this.cueBall.pocketed) {
            this.updateAim();
        }
    }

    handleTouchEnd(event) {
        event.preventDefault();

        if (this.isSettingSpin) {
            this.isSettingSpin = false;
            this.isMouseDown = false;
            return;
        }

        // Ball placement mode - validate the ACTUAL position before placing
        if (this.ballInHandMode && this.placementBall) {
            // Validate using current position
            const isValidPosition = !this.placementValidation || this.placementValidation(this.mousePos);

            if (isValidPosition) {
                this.ballInHandMode = false;
                this.placementBall = null;

                if (this.onBallPlaced) {
                    this.onBallPlaced(this.mousePos);
                }
            }
            this.isMouseDown = false;
            return;
        }

        // Execute shot if we were aiming with enough power
        if (this.isDragging && this.power > Constants.MIN_POWER) {
            if (this.onShot) {
                this.onShot(this.aimDirection, this.power, this.spin);
            }
        }

        this.resetAim();
        this.isMouseDown = false;
        this.isDragging = false;
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
        // Start with valid placement (will be updated on mouse move)
        this.placementValid = true;
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
