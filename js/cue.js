// Cue stick - manages shot mechanics and animations

import { Vec2, Constants } from './utils.js';

export class Cue {
    constructor() {
        // Cue position and angle
        this.position = Vec2.create(0, 0);
        this.angle = 0;

        // Shot state
        this.isCharging = false;
        this.power = 0;
        this.pullBack = 0;

        // Animation state
        this.isAnimating = false;
        this.animationProgress = 0;
        this.shotDirection = null;
        this.shotPower = 0;

        // Spin/English (optional feature)
        this.spin = Vec2.create(0, 0);  // -1 to 1 for left/right, top/bottom

        // Visual properties
        this.length = 300;
        this.tipWidth = 4;
        this.buttWidth = 16;
    }

    // Prepare a shot
    prepareShot(cueBallPos, aimDirection, power) {
        this.position = Vec2.clone(cueBallPos);
        this.shotDirection = Vec2.clone(aimDirection);
        this.power = power;
        this.angle = Vec2.angle(aimDirection);
    }

    // Execute the shot
    executeShot(cueBall, direction, power) {
        if (!cueBall || cueBall.pocketed) return false;

        // Start strike animation
        this.isAnimating = true;
        this.animationProgress = 0;
        this.shotDirection = Vec2.clone(direction);
        this.shotPower = power;

        // Apply velocity to cue ball
        const velocity = Vec2.multiply(direction, power);
        cueBall.setVelocity(velocity.x, velocity.y);

        // Apply spin effects (if implemented)
        // This could affect the velocity based on this.spin

        return true;
    }

    // Update cue animation
    update() {
        if (this.isAnimating) {
            this.animationProgress += 0.15;

            if (this.animationProgress >= 1) {
                this.isAnimating = false;
                this.animationProgress = 0;
            }
        }
    }

    // Reset cue state
    reset() {
        this.isCharging = false;
        this.power = 0;
        this.pullBack = 0;
        this.isAnimating = false;
        this.animationProgress = 0;
        this.spin = Vec2.create(0, 0);
    }

    // Set spin/english (for future enhancement)
    setSpin(x, y) {
        this.spin.x = Math.max(-1, Math.min(1, x));
        this.spin.y = Math.max(-1, Math.min(1, y));
    }

    // Get the current animation state for rendering
    getAnimationState() {
        if (!this.isAnimating) return null;

        // Ease out the strike animation
        const ease = 1 - Math.pow(1 - this.animationProgress, 3);

        return {
            progress: ease,
            direction: this.shotDirection,
            power: this.shotPower
        };
    }

    // Calculate the strike position on cue ball based on spin
    getStrikePoint(cueBallPos, cueBallRadius) {
        // Center strike by default
        const strikeOffset = Vec2.create(
            this.spin.x * cueBallRadius * 0.8,
            this.spin.y * cueBallRadius * 0.8
        );

        return Vec2.add(cueBallPos, strikeOffset);
    }
}

// Shot types for different effects (future enhancement)
export const ShotTypes = {
    NORMAL: 'normal',
    DRAW: 'draw',       // Backspin
    FOLLOW: 'follow',   // Topspin
    ENGLISH_LEFT: 'english_left',
    ENGLISH_RIGHT: 'english_right',
    JUMP: 'jump',       // Elevate cue for jump shot
    MASSE: 'masse'      // Curved shot
};
