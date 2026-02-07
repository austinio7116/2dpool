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
        this.isTouchSpin = false;
        this.spinTouchStart = null;
        this.spinAtTouchStart = null;

        // Spin indicator position and size (positioned in bottom-left corner, away from pockets)
        this.spinIndicator = {
            x: 35,  // radius(30) + background padding(5), flush with left edge
            y: 0,   // Will be set based on canvas height
            radius: 30
        };

        // Shoot button (positioned below spin indicator)
        this.shootButton = { x: 35, y: 0, width: 50, height: 36 };  // y set in setCanvasSize

        // Touch power override
        this.powerOverrideActive = false;
        this.powerTouchId = null;
        this.isTouchDevice = false;

        // Power meter geometry (matches renderer positioning)
        this.powerMeter = { x: 0, y: 0, width: 18, height: 100 };  // set in setCanvasSize

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
        // Position spin indicator flush with left edge
        this.spinIndicator.x = this.spinIndicator.radius + 5;  // radius + background padding
        this.spinIndicator.y = height / 2;  // Center vertically, away from pockets

        // Shoot button: centered on spin indicator X, below the "SPIN" label
        this.shootButton.x = this.spinIndicator.x;
        this.shootButton.y = this.spinIndicator.y + this.spinIndicator.radius + 28 + 10;  // below SPIN label + gap

        // Power meter: above spin indicator, centered on it (mirrors renderer)
        const spinTop = height / 2 - this.spinIndicator.radius - 5;  // top of spin bg circle
        this.powerMeter.x = this.spinIndicator.x - this.powerMeter.width / 2;
        this.powerMeter.y = spinTop - this.powerMeter.height - 20;  // 20px gap above spin
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
        // Use a larger hit area (1.5x radius) for easier touch targeting
        const hitRadius = this.spinIndicator.radius * 1.5;
        return (dx * dx + dy * dy) < (hitRadius * hitRadius);
    }

    isOverShootButton(pos) {
        const b = this.shootButton;
        const pad = 10; // extra touch padding
        return pos.x >= (b.x - b.width / 2 - pad) && pos.x <= (b.x + b.width / 2 + pad) &&
               pos.y >= (b.y - b.height / 2 - pad) && pos.y <= (b.y + b.height / 2 + pad);
    }

    isOverPowerMeter(pos) {
        const m = this.powerMeter;
        const touchWidth = 40; // wider hit area for touch
        const cx = m.x + m.width / 2;
        return pos.x >= (cx - touchWidth / 2) && pos.x <= (cx + touchWidth / 2) &&
               pos.y >= m.y && pos.y <= (m.y + m.height);
    }

    getPowerFromTouchY(pos) {
        const m = this.powerMeter;
        // Bottom of meter = 0 power, top = max power
        const ratio = 1 - clamp((pos.y - m.y) / m.height, 0, 1);
        return ratio * Constants.MAX_POWER;
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
        this.isTouchDevice = true;

        // Hide touch hint on first interaction
        const touchHint = document.getElementById('touch-hint');
        if (touchHint && !touchHint.classList.contains('fade-out')) {
            touchHint.classList.add('fade-out');
            setTimeout(() => touchHint.style.display = 'none', 500);
        }

        // Second touch: shoot button, power bar, or cancel
        if (event.touches.length > 1 && this.isDragging) {
            const newTouch = event.changedTouches[0];
            const touchPos = this.getTouchPosition(newTouch);

            if (this.isOverShootButton(touchPos) && this.power > Constants.MIN_POWER) {
                // Fire shot immediately
                if (this.onShot) {
                    this.onShot(this.aimDirection, this.power, this.spin);
                }
                this.resetAim();
                this.isMouseDown = false;
                this.isDragging = false;
                return;
            }

            if (this.isOverPowerMeter(touchPos)) {
                // Start power override
                this.powerOverrideActive = true;
                this.powerTouchId = newTouch.identifier;
                this.power = this.getPowerFromTouchY(touchPos);
                this.pullBack = Math.min((this.power / Constants.MAX_POWER) * 100, 100);
                if (this.onAimUpdate) {
                    this.onAimUpdate(this.aimDirection, this.power);
                }
                return;
            }

            // Elsewhere: cancel shot
            this.resetAim();
            this.isMouseDown = false;
            this.isDragging = false;
            return;
        }

        if (event.touches.length > 1) return;

        const touch = event.touches[0];

        this.isMouseDown = true;
        this.mousePos = this.getTouchPosition(touch);

        // Check if touching spin indicator
        if (this.canShoot && !this.ballInHandMode && this.isOverSpinIndicator(this.mousePos)) {
            this.isSettingSpin = true;
            this.isTouchSpin = true;
            this.spinTouchStart = Vec2.clone(this.mousePos);
            this.spinAtTouchStart = Vec2.create(this.spin.x, this.spin.y);
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

        // Handle power override touch
        if (this.powerTouchId !== null) {
            for (let i = 0; i < event.touches.length; i++) {
                if (event.touches[i].identifier === this.powerTouchId) {
                    const powerPos = this.getTouchPosition(event.touches[i]);
                    this.power = this.getPowerFromTouchY(powerPos);
                    this.pullBack = Math.min((this.power / Constants.MAX_POWER) * 100, 100);
                    if (this.onAimUpdate) {
                        this.onAimUpdate(this.aimDirection, this.power);
                    }
                    break;
                }
            }
        }

        // Find the primary aiming touch (first touch, not power touch)
        let aimTouch = null;
        for (let i = 0; i < event.touches.length; i++) {
            if (event.touches[i].identifier !== this.powerTouchId) {
                aimTouch = event.touches[i];
                break;
            }
        }
        if (!aimTouch) return;

        this.mousePos = this.getTouchPosition(aimTouch);

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

        // Check if the ended touch is the power override touch
        for (let i = 0; i < event.changedTouches.length; i++) {
            if (event.changedTouches[i].identifier === this.powerTouchId) {
                // Power touch lifted — keep powerOverrideActive, clear touch tracking
                this.powerTouchId = null;
                // Don't return — there may be other touches ending too
            }
        }

        // If there are still touches active (e.g. aiming finger still down), don't end
        if (event.touches.length > 0 && this.isDragging) {
            // Check if the aiming touch is still present
            let aimTouchStillDown = false;
            for (let i = 0; i < event.touches.length; i++) {
                if (event.touches[i].identifier !== this.powerTouchId) {
                    aimTouchStillDown = true;
                    break;
                }
            }
            if (aimTouchStillDown) return;
        }

        if (this.isSettingSpin) {
            this.isSettingSpin = false;
            this.isTouchSpin = false;
            this.spinTouchStart = null;
            this.spinAtTouchStart = null;
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
        if (this.isTouchSpin && this.spinTouchStart && this.spinAtTouchStart) {
            // Touch: delta-based movement for precision (thumb doesn't obscure)
            const dx = this.mousePos.x - this.spinTouchStart.x;
            const dy = this.mousePos.y - this.spinTouchStart.y;
            const sensitivity = this.spinIndicator.radius * 0.7;

            this.spin.x = clamp(this.spinAtTouchStart.x + dx / sensitivity, -1, 1);
            this.spin.y = clamp(this.spinAtTouchStart.y + dy / sensitivity, -1, 1);
        } else {
            // Mouse: absolute positioning within the indicator
            const dx = this.mousePos.x - this.spinIndicator.x;
            const dy = this.mousePos.y - this.spinIndicator.y;
            const maxOffset = this.spinIndicator.radius * 0.7;

            this.spin.x = clamp(dx / maxOffset, -1, 1);
            this.spin.y = clamp(dy / maxOffset, -1, 1);
        }
    }

    updateAim() {
        if (!this.cueBall) return;

        const toCueBall = Vec2.subtract(this.cueBall.position, this.mousePos);
        const distFromCueBall = Vec2.length(toCueBall);

        if (distFromCueBall > 5) {
            this.aimDirection = Vec2.normalize(Vec2.multiply(toCueBall, -1));

            // Skip power/pullBack calculation when power override is active
            if (!this.powerOverrideActive) {
                const dragDist = Vec2.distance(this.mousePos, this.cueBall.position);
                this.power = clamp(dragDist * Constants.POWER_SCALE, 0, Constants.MAX_POWER);
                this.pullBack = Math.min(dragDist * 0.5, 100);
            }
        } else if (!this.powerOverrideActive) {
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
        this.powerOverrideActive = false;
        this.powerTouchId = null;

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
            isSettingSpin: this.isSettingSpin,
            isTouchSpin: this.isTouchSpin,
            shootButton: this.shootButton,
            powerOverrideActive: this.powerOverrideActive,
            isTouchDevice: this.isTouchDevice
        };
    }

    isAiming() {
        return this.isDragging;
    }

    isPlacingBall() {
        return this.ballInHandMode;
    }
}
