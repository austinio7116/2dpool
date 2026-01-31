// 3D Ball Renderer - Pre-rendered sphere rotations for realistic ball visuals

export class BallRenderer3D {
    constructor(ballRadius = 14) {
        this.ballRadius = ballRadius;
        this.frameCount = 64; // More frames for smoother animation
        this.renderScale = 4; // Render at 4x resolution for quality
        this.resolution = ballRadius * 2 * this.renderScale;
        this.sphereRadius = ballRadius * this.renderScale; // Match original ball size

        // Pre-computed sphere data
        this.sphereNormals = null;  // Normal vectors for each pixel
        this.sphereMask = null;     // Which pixels are inside the sphere
        this.sphereShading = null;  // Pre-computed lighting

        // Cached rendered frames for each ball type (downsampled)
        this.frameCache = new Map();

        this.init();
    }

    init() {
        const size = this.resolution;
        const radius = this.sphereRadius;
        const centerX = size / 2;
        const centerY = size / 2;

        // Pre-compute sphere geometry
        this.sphereNormals = [];
        this.sphereMask = [];
        this.sphereShading = [];

        // Light direction (from top-left, pointing into screen)
        const lightDir = this.normalize({ x: -0.4, y: -0.4, z: 0.8 });

        for (let y = 0; y < size; y++) {
            const row = [];
            const maskRow = [];
            const shadingRow = [];

            for (let x = 0; x < size; x++) {
                const dx = x - centerX;
                const dy = y - centerY;
                const distSq = dx * dx + dy * dy;

                if (distSq <= radius * radius) {
                    // Point is on sphere - calculate normal (z points toward viewer)
                    const z = Math.sqrt(radius * radius - distSq);
                    const normal = this.normalize({ x: dx, y: dy, z: z });
                    row.push(normal);
                    maskRow.push(true);

                    // Calculate shading (diffuse + ambient)
                    const diffuse = Math.max(0, this.dot(normal, lightDir));
                    const ambient = 0.3;
                    const shading = Math.min(1, ambient + diffuse * 0.7);
                    shadingRow.push(shading);
                } else {
                    row.push(null);
                    maskRow.push(false);
                    shadingRow.push(0);
                }
            }

            this.sphereNormals.push(row);
            this.sphereMask.push(maskRow);
            this.sphereShading.push(shadingRow);
        }
    }

    // Generate all rotation frames for a ball
    generateBallFrames(ballNumber, baseColor, isStripe, isUKBall = false, isEightBall = false, isSnookerBall = false) {
        const cacheKey = `${ballNumber}-${baseColor}-${isStripe}-${isUKBall}-${isEightBall}-${isSnookerBall}`;
        if (this.frameCache.has(cacheKey)) {
            return this.frameCache.get(cacheKey);
        }

        const frames = [];
        for (let i = 0; i < this.frameCount; i++) {
            const rotation = (i / this.frameCount) * Math.PI * 2;
            const frame = this.renderBallFrame(ballNumber, baseColor, isStripe, rotation, isUKBall, isEightBall, isSnookerBall);
            frames.push(frame);
        }

        this.frameCache.set(cacheKey, frames);
        return frames;
    }

    // Render a single frame of the ball at a specific rotation
    renderBallFrame(ballNumber, baseColor, isStripe, rotation, isUKBall = false, isEightBall = false, isSnookerBall = false, numberOptions = {}) {
        const size = this.resolution;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;

        const rgb = this.hexToRgb(baseColor);
        const numberCircleRgb = this.hexToRgb(numberOptions.numberCircleColor || '#FFFFFF');
        const stripeBackgroundRgb = this.hexToRgb(numberOptions.stripeBackgroundColor || '#FFFFFF');
        const radius = this.sphereRadius;

        // Stripe is a band around the equator - latitude based
        // stripeHalfWidth is in terms of latitude (0 = equator, 1 = pole)
        const stripeLatitude = 0.55; // Stripe covers from equator toward poles

        // Number spot - angular radius on sphere surface
        const numberSpotAngle = 0.5; // Bigger white circle for number

        // Precompute rotation
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);

        // Determine if this ball should show a number
        const showNumber = numberOptions.showNumber !== false && ballNumber !== 0 && (!isUKBall || isEightBall) && !isSnookerBall;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;

                if (!this.sphereMask[y][x]) {
                    data[idx] = 0;
                    data[idx + 1] = 0;
                    data[idx + 2] = 0;
                    data[idx + 3] = 0;
                    continue;
                }

                const normal = this.sphereNormals[y][x];
                const shading = this.sphereShading[y][x];

                // Rotate the ball around X axis (horizontal) to simulate rolling
                // This makes the stripe band roll "over" the ball
                // Un-rotate current normal to get position in ball's local frame
                // Note: reversed rotation direction to match number movement
                const localX = normal.x;
                const localY = normal.y * cosR - normal.z * sinR;
                const localZ = normal.y * sinR + normal.z * cosR;

                let r, g, b;

                if (ballNumber === 0) {
                    // Cue ball - pure white
                    r = g = b = 255;
                } else if ((isUKBall && !isEightBall) || isSnookerBall) {
                    // UK balls (except 8-ball) and snooker balls - pure solid color, no number spot
                    r = rgb.r;
                    g = rgb.g;
                    b = rgb.b;
                } else {
                    // American balls, striped balls, and UK 8-ball have number spots
                    // Number spot is at the "front" of the ball in local coords (0, 0, 1)
                    // Calculate angular distance from number spot center
                    const dotProduct = localZ; // dot((localX,localY,localZ), (0,0,1))
                    const angleFromSpot = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
                    const inNumberSpot = angleFromSpot < numberSpotAngle;
                    const numberVisible = localZ > 0; // Only if facing camera

                    // Stripe: band around equator in LOCAL ball coordinates
                    // The "equator" is where localY = 0
                    // Latitude is |localY| (0 at equator, 1 at poles)
                    const latitude = Math.abs(localY);
                    const inStripe = latitude < stripeLatitude;

                    if (isStripe) {
                        if (showNumber && inNumberSpot && numberVisible) {
                            r = numberCircleRgb.r;
                            g = numberCircleRgb.g;
                            b = numberCircleRgb.b;
                        } else if (inStripe) {
                            r = rgb.r;
                            g = rgb.g;
                            b = rgb.b;
                        } else {
                            // Stripe background color (poles)
                            r = stripeBackgroundRgb.r;
                            g = stripeBackgroundRgb.g;
                            b = stripeBackgroundRgb.b;
                        }
                    } else {
                        // Solid ball
                        if (showNumber && inNumberSpot && numberVisible) {
                            r = numberCircleRgb.r;
                            g = numberCircleRgb.g;
                            b = numberCircleRgb.b;
                        } else {
                            r = rgb.r;
                            g = rgb.g;
                            b = rgb.b;
                        }
                    }
                }

                // Apply shading
                r = Math.round(r * shading);
                g = Math.round(g * shading);
                b = Math.round(b * shading);

                // Add specular highlight
                const specular = this.calculateSpecular(normal);
                r = Math.min(255, r + specular);
                g = Math.min(255, g + specular);
                b = Math.min(255, b + specular);

                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Draw the number text on top of the number spot
        if (showNumber) {
            this.drawNumber(ctx, ballNumber, size, rotation, radius, numberOptions);
        }

        return canvas;
    }

    // Draw the number at 3D rotated position
    drawNumber(ctx, number, size, rotation, radius, options = {}) {
        const centerX = size / 2;
        const centerY = size / 2;

        // Number is at (0, 0, 1) in local coords
        // After rotation around X axis: (0, sin(R), cos(R))
        const spotY = Math.sin(rotation) * radius * 0.85;
        const spotZ = Math.cos(rotation);

        // Only draw if number is on front of ball (facing camera)
        if (spotZ > 0.1) {
            const screenX = centerX;
            const screenY = centerY + spotY;

            // Scale based on Z (perspective effect)
            const scale = 0.4 + spotZ * 0.6;
            const fontSize = size * 0.42 * scale; // Readable numbers
            const alpha = Math.pow(spotZ, 0.5); // Fade near edges
            const circleRadius = size * 0.22 * scale;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Draw border around number circle if enabled
            if (options.numberBorder) {
                ctx.strokeStyle = options.numberBorderColor || '#000000';
                ctx.lineWidth = this.renderScale * 1.5;
                ctx.beginPath();
                ctx.arc(screenX, screenY, circleRadius + this.renderScale, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Draw number text
            ctx.fillStyle = options.numberTextColor || '#000000';
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Offset down slightly for better centering
            ctx.fillText(number.toString(), screenX, screenY + this.renderScale);
            ctx.restore();
        }
    }

    calculateSpecular(normal) {
        // Primary specular highlight from main light source
        const lightDir = this.normalize({ x: -0.5, y: -0.5, z: 0.7 });
        const viewDir = { x: 0, y: 0, z: 1 };

        // Reflect light around normal
        const dot = this.dot(normal, lightDir);
        const reflect = {
            x: 2 * dot * normal.x - lightDir.x,
            y: 2 * dot * normal.y - lightDir.y,
            z: 2 * dot * normal.z - lightDir.z
        };

        // Sharp specular highlight
        const spec1 = Math.pow(Math.max(0, this.dot(reflect, viewDir)), 64);

        // Broader, softer highlight for glossy look
        const spec2 = Math.pow(Math.max(0, this.dot(reflect, viewDir)), 16);

        // Combine sharp and soft highlights
        return Math.round(spec1 * 220 + spec2 * 60);
    }

    // Add a glossy reflection overlay after drawing the ball
    drawReflection(ctx, x, y, radius) {
        // Primary highlight - sharp white spot
        const highlightX = x - radius * 0.35;
        const highlightY = y - radius * 0.35;
        const highlightRadius = radius * 0.25;

        const gradient = ctx.createRadialGradient(
            highlightX, highlightY, 0,
            highlightX, highlightY, highlightRadius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(highlightX, highlightY, highlightRadius, 0, Math.PI * 2);
        ctx.fill();

        // Secondary softer highlight
        const highlight2X = x - radius * 0.2;
        const highlight2Y = y - radius * 0.2;
        const highlight2Radius = radius * 0.5;

        const gradient2 = ctx.createRadialGradient(
            highlight2X, highlight2Y, 0,
            highlight2X, highlight2Y, highlight2Radius
        );
        gradient2.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient2.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
        gradient2.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient2;
        ctx.beginPath();
        ctx.arc(highlight2X, highlight2Y, highlight2Radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Get the appropriate frame for a ball's current rotation
    getFrame(ball) {
        const isStripe = ball.isStripe;
        const baseColor = ball.color;
        const isUKBall = ball.isUKBall || false;
        const isEightBall = ball.isEightBall || false;
        const isSnookerBall = ball.isSnookerBall || false;

        // Check for custom rendering options
        const hasCustomOptions = ball.numberCircleColor || ball.numberTextColor ||
                                 ball.numberBorder || ball.stripeBackgroundColor ||
                                 ball.showNumber === false;

        // If ball has custom options, render fresh frame (bypass cache)
        if (hasCustomOptions) {
            const renderOptions = {
                showNumber: ball.showNumber !== false,
                stripeBackgroundColor: ball.stripeBackgroundColor,
                numberCircleColor: ball.numberCircleColor,
                numberTextColor: ball.numberTextColor,
                numberBorder: ball.numberBorder,
                numberBorderColor: ball.numberBorderColor
            };

            // UK balls (except 8-ball) and snooker balls - use fixed rotation
            if ((isUKBall && !isEightBall) || isSnookerBall) {
                return this.renderBallFrame(ball.number, baseColor, isStripe, 0, isUKBall, isEightBall, isSnookerBall, renderOptions);
            }

            // Map displayRoll to rotation
            const rotation = ball.displayRoll;
            return this.renderBallFrame(ball.number, baseColor, isStripe, rotation, isUKBall, isEightBall, isSnookerBall, renderOptions);
        }

        // Use cached frames for standard balls
        const frames = this.generateBallFrames(ball.number, baseColor, isStripe, isUKBall, isEightBall, isSnookerBall);

        // UK balls (except 8-ball) and snooker balls are solid color - use fixed frame so lighting stays consistent
        if ((isUKBall && !isEightBall) || isSnookerBall) {
            return frames[0];
        }

        // Map displayRoll to frame index
        let frameIndex = Math.floor((ball.displayRoll / (Math.PI * 2)) * this.frameCount);
        frameIndex = ((frameIndex % this.frameCount) + this.frameCount) % this.frameCount;

        return frames[frameIndex];
    }

    // Draw a ball using pre-rendered frames
    drawBall(ctx, ball, x, y, radius, alpha = 1) {
        // Draw at the correct size (downsampling from high-res render)
        const drawSize = this.ballRadius * 2;
        const scale = radius / this.ballRadius; // For sinking animation

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);

        if (scale !== 1) {
            ctx.scale(scale, scale);
        }

        // Enable smooth downsampling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (ball.isCueBall) {
            const frames = this.generateBallFrames(0, '#FFFFFF', false);
            ctx.drawImage(frames[0], -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        } else if ((ball.isUKBall && !ball.isEightBall) || ball.isSnookerBall) {
            // UK solid balls and snooker balls - no rotation so they all look identical
            const frame = this.getFrame(ball);
            ctx.drawImage(frame, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        } else {
            // Pre-render rotates around X axis (stripe rolls in Y direction)
            // Rotate image to align Y direction with travel direction
            ctx.rotate(ball.travelAngle - Math.PI / 2);
            const frame = this.getFrame(ball);
            ctx.drawImage(frame, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        }

        ctx.restore();

        // Add glossy reflection overlay (drawn in screen space, not rotated)
        ctx.save();
        ctx.globalAlpha = alpha;
        this.drawReflection(ctx, x, y, radius);
        ctx.restore();
    }

    // Utility functions
    normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    // Clear cache if needed (e.g., when ball radius changes)
    clearCache() {
        this.frameCache.clear();
    }
}
