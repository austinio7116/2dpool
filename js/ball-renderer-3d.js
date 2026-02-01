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
        this.CACHE_PREFIX = 'ballFrames_';
        this.CACHE_VERSION = 'v1'; // Increment to invalidate old caches

        this.init();
        this.loadCacheFromStorage();
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

    // Generate cache key for a ball (includes custom options)
    generateCacheKey(ballNumber, baseColor, isStripe, isUKBall = false, isEightBall = false, isSnookerBall = false, options = null) {
        let key = `${ballNumber}-${baseColor}-${isStripe}-${isUKBall}-${isEightBall}-${isSnookerBall}`;
        if (options) {
            // Include custom options in cache key
            key += `-${options.showNumber !== false}`;
            key += `-${options.stripeBackgroundColor || ''}`;
            key += `-${options.numberCircleColor || ''}`;
            key += `-${options.numberTextColor || ''}`;
            key += `-${options.numberBorder || false}`;
            key += `-${options.numberBorderColor || ''}`;
            key += `-${options.numberCircleRadialLines || 0}`;
            key += `-${options.stripeThickness ?? 0.55}`;
            key += `-${options.numberCircleRadius ?? 0.5}`;
        }
        return key;
    }

    // Generate all rotation frames for a ball
    generateBallFrames(ballNumber, baseColor, isStripe, isUKBall = false, isEightBall = false, isSnookerBall = false, options = null) {
        const cacheKey = this.generateCacheKey(ballNumber, baseColor, isStripe, isUKBall, isEightBall, isSnookerBall, options);
        if (this.frameCache.has(cacheKey)) {
            return this.frameCache.get(cacheKey);
        }

        const frames = [];
        const renderOptions = options || {};
        for (let i = 0; i < this.frameCount; i++) {
            const rotation = (i / this.frameCount) * Math.PI * 2;
            const frame = this.renderBallFrame(ballNumber, baseColor, isStripe, rotation, isUKBall, isEightBall, isSnookerBall, renderOptions);
            frames.push(frame);
        }

        this.frameCache.set(cacheKey, frames);
        return frames;
    }

    // Pre-cache all frames for a set of balls (call on game start or ball set change)
    async precacheBallSet(balls) {
        const ballsToCache = [];

        for (const ball of balls) {
            if (ball.pocketed) continue;

            const hasCustomOptions = ball.numberCircleColor || ball.numberTextColor ||
                                     ball.numberBorder || ball.stripeBackgroundColor ||
                                     ball.showNumber === false || ball.numberCircleRadialLines > 0 ||
                                     ball.stripeThickness !== 0.55 || ball.numberCircleRadius !== 0.66;

            if (hasCustomOptions) {
                const options = {
                    showNumber: ball.showNumber !== false,
                    stripeBackgroundColor: ball.stripeBackgroundColor,
                    numberCircleColor: ball.numberCircleColor,
                    numberTextColor: ball.numberTextColor,
                    numberBorder: ball.numberBorder,
                    numberBorderColor: ball.numberBorderColor,
                    numberCircleRadialLines: ball.numberCircleRadialLines || 0,
                    stripeThickness: ball.stripeThickness ?? 0.55,
                    numberCircleRadius: ball.numberCircleRadius ?? 0.66
                };

                ballsToCache.push({
                    number: ball.number,
                    color: ball.color,
                    isStripe: ball.isStripe,
                    isUKBall: ball.isUKBall || false,
                    isEightBall: ball.isEightBall || false,
                    isSnookerBall: ball.isSnookerBall || false,
                    options
                });
            }
        }

        // Pre-generate frames for custom balls, yielding control periodically
        for (let i = 0; i < ballsToCache.length; i++) {
            const ball = ballsToCache[i];
            this.generateBallFrames(
                ball.number,
                ball.color,
                ball.isStripe,
                ball.isUKBall,
                ball.isEightBall,
                ball.isSnookerBall,
                ball.options
            );

            // Yield control every few balls to keep UI responsive
            if (i % 3 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // Save to localStorage
        this.saveCacheToStorage();
    }

    // Load cache from localStorage
    loadCacheFromStorage() {
        try {
            const cacheData = localStorage.getItem(this.CACHE_PREFIX + this.CACHE_VERSION);
            if (!cacheData) return;

            const cached = JSON.parse(cacheData);
            for (const [key, framesData] of Object.entries(cached)) {
                // Convert base64 back to canvas
                const frames = framesData.map(dataUrl => {
                    const img = new Image();
                    const canvas = document.createElement('canvas');
                    canvas.width = this.resolution;
                    canvas.height = this.resolution;
                    const ctx = canvas.getContext('2d');

                    // Synchronously load the data URL
                    img.src = dataUrl;
                    if (img.complete) {
                        ctx.drawImage(img, 0, 0);
                    }

                    return canvas;
                });

                this.frameCache.set(key, frames);
            }
        } catch (e) {
            console.warn('Failed to load ball cache from storage:', e);
        }
    }

    // Save cache to localStorage
    saveCacheToStorage() {
        try {
            const cacheData = {};
            let totalSize = 0;
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit

            for (const [key, frames] of this.frameCache.entries()) {
                // Convert every 4th frame to base64 (reduce storage size)
                const framesData = frames.filter((_, i) => i % 4 === 0).map(canvas => {
                    const dataUrl = canvas.toDataURL('image/webp', 0.8);
                    totalSize += dataUrl.length;
                    return dataUrl;
                });

                if (totalSize > MAX_SIZE) break; // Stop if too large

                cacheData[key] = framesData;
            }

            localStorage.setItem(this.CACHE_PREFIX + this.CACHE_VERSION, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Failed to save ball cache to storage:', e);
        }
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
        // Default to ivory/off-white for number circles and stripe backgrounds
        const ivoryDefault = '#FFFEF0';
        const numberCircleRgb = this.hexToRgb(numberOptions.numberCircleColor || ivoryDefault);
        const stripeBackgroundRgb = this.hexToRgb(numberOptions.stripeBackgroundColor || ivoryDefault);
        const numberTextRgb = this.hexToRgb(numberOptions.numberTextColor || '#000000');
        const numberBorderRgb = this.hexToRgb(numberOptions.numberBorderColor || '#000000');
        const radius = this.sphereRadius;

        // Stripe is a band around the equator - latitude based
        // stripeHalfWidth is in terms of latitude (0 = equator, 1 = pole)
        const stripeLatitude = numberOptions.stripeThickness ?? 0.55; // Stripe covers from equator toward poles

        // Number spot - angular radius on sphere surface
        const numberSpotAngle = numberOptions.numberCircleRadius ?? 0.66; // Configurable circle size (larger default)

        // Determine if this ball should show a number
        const showNumber = numberOptions.showNumber !== false && ballNumber !== 0 && (!isUKBall || isEightBall) && !isSnookerBall;

        // Pre-render the number text as a texture map
        let textTexture = null;
        let textTextureSize = 0;
        if (showNumber) {
            const textureResult = this.createTextTexture(ballNumber, numberOptions);
            textTexture = textureResult.imageData;
            textTextureSize = textureResult.size;
        }

        // Precompute rotation
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);

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
                    // Cue ball - ivory/off-white (matches Constants.BALL_COLORS[0])
                    r = 255; g = 254; b = 240;
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

                    // Check if we should sample from text texture
                    let textColor = null;
                    if (showNumber && textTexture && inNumberSpot && numberVisible) {
                        textColor = this.sampleTextTexture(
                            localX, localY, localZ,
                            textTexture, textTextureSize,
                            numberSpotAngle, numberOptions
                        );
                    }

                    if (isStripe) {
                        if (textColor) {
                            // Use color from text texture (text, border, or circle background)
                            r = textColor.r;
                            g = textColor.g;
                            b = textColor.b;
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
                        if (textColor) {
                            // Use color from text texture (text, border, or circle background)
                            r = textColor.r;
                            g = textColor.g;
                            b = textColor.b;
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

        return canvas;
    }

    // Create a texture map for the number text, border, and radial lines
    createTextTexture(number, options = {}) {
        // Create a high-resolution texture for the number
        const textureSize = 512; // High resolution for quality
        const canvas = document.createElement('canvas');
        canvas.width = textureSize;
        canvas.height = textureSize;
        const ctx = canvas.getContext('2d');

        const centerX = textureSize / 2;
        const centerY = textureSize / 2;
        const circleRadius = textureSize * 0.38; // Slightly larger circle

        // Fill with transparent
        ctx.clearRect(0, 0, textureSize, textureSize);

        // Draw border FIRST if enabled (so it's underneath)
        if (options.numberBorder) {
            const borderWidth = 32; // Even thicker border
            ctx.strokeStyle = options.numberBorderColor || '#000000';
            ctx.lineWidth = borderWidth;
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius + borderWidth / 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw circle background (on top of border)
        ctx.fillStyle = options.numberCircleColor || '#FFFFFF';
        ctx.beginPath();
        ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw radial lines if enabled (on top of circle)
        if (options.numberBorder && options.numberCircleRadialLines > 0) {
            const lineCount = options.numberCircleRadialLines;
            const lineLength = circleRadius / 5;

            ctx.strokeStyle = options.numberBorderColor || '#000000';
            ctx.lineWidth = 20; // Even thicker radial lines
            ctx.lineCap = 'round';

            for (let i = 0; i < lineCount; i++) {
                const angle = (i / lineCount) * Math.PI * 2;
                const outerX = centerX + Math.cos(angle) * circleRadius;
                const outerY = centerY + Math.sin(angle) * circleRadius;
                const innerX = centerX + Math.cos(angle) * (circleRadius - lineLength);
                const innerY = centerY + Math.sin(angle) * (circleRadius - lineLength);

                ctx.beginPath();
                ctx.moveTo(outerX, outerY);
                ctx.lineTo(innerX, innerY);
                ctx.stroke();
            }
        }

        // Draw number text (on top of everything)
        ctx.fillStyle = options.numberTextColor || '#000000';
        ctx.font = `bold ${textureSize * 0.50}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(number.toString(), centerX, centerY + textureSize * 0.02);

        // Get image data for sampling
        const imageData = ctx.getImageData(0, 0, textureSize, textureSize);

        return {
            imageData: imageData.data,
            size: textureSize
        };
    }

    // Sample color from text texture based on sphere position
    sampleTextTexture(localX, localY, localZ, textureData, textureSize, spotAngle, options) {
        // Map 3D position on sphere to 2D texture coordinates
        // The number spot is centered at (0, 0, 1) in local coords

        // Calculate position relative to spot center
        const dx = localX;
        const dy = localY;

        // Calculate angular distance to determine radius on texture
        const dotProduct = localZ;
        const angleFromCenter = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

        // If outside the number spot, return null
        if (angleFromCenter >= spotAngle) return null;

        // Map angle to texture radius (0 at center, 1 at edge of spot)
        const normalizedRadius = angleFromCenter / spotAngle;

        // Calculate texture coordinates
        // Use atan2 to get angle around the spot
        const textureAngle = Math.atan2(dy, dx);

        // Convert polar to cartesian on texture
        // Use 0.52 to include border area (circle is 0.38 + thick border)
        const texX = 0.5 + normalizedRadius * Math.cos(textureAngle) * 0.52;
        const texY = 0.5 + normalizedRadius * Math.sin(textureAngle) * 0.52;

        // Sample from texture
        const pixelX = Math.floor(texX * textureSize);
        const pixelY = Math.floor(texY * textureSize);

        if (pixelX < 0 || pixelX >= textureSize || pixelY < 0 || pixelY >= textureSize) {
            return null;
        }

        const idx = (pixelY * textureSize + pixelX) * 4;
        const alpha = textureData[idx + 3];

        // If transparent, return null (use ball color)
        if (alpha < 128) return null;

        return {
            r: textureData[idx],
            g: textureData[idx + 1],
            b: textureData[idx + 2]
        };
    }

    // Old 2D overlay methods removed - text is now properly rendered onto the 3D sphere

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
                                 ball.showNumber === false || ball.numberCircleRadialLines > 0 ||
                                 ball.stripeThickness !== 0.55 || ball.numberCircleRadius !== 0.66;

        // Build options object for custom balls
        const options = hasCustomOptions ? {
            showNumber: ball.showNumber !== false,
            stripeBackgroundColor: ball.stripeBackgroundColor,
            numberCircleColor: ball.numberCircleColor,
            numberTextColor: ball.numberTextColor,
            numberBorder: ball.numberBorder,
            numberBorderColor: ball.numberBorderColor,
            numberCircleRadialLines: ball.numberCircleRadialLines || 0,
            stripeThickness: ball.stripeThickness ?? 0.55,
            numberCircleRadius: ball.numberCircleRadius ?? 0.66
        } : null;

        // Use cached frames (works for both standard and custom balls now)
        const frames = this.generateBallFrames(ball.number, baseColor, isStripe, isUKBall, isEightBall, isSnookerBall, options);

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
