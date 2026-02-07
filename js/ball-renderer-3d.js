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
        this.CACHE_VERSION = 'v2'; // Increment to invalidate old caches
        this._cacheGeneration = 0; // Incremented on clearCache() to invalidate ball-object refs

        this.init();
        // Clear corrupt cache on startup to prevent invisible balls
        try {
            localStorage.removeItem(this.CACHE_PREFIX + this.CACHE_VERSION);
        } catch (e) {
            // Ignore localStorage errors
        }
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

    // Build options object for a ball, or return null if default
    _buildBallOptions(ball) {
        const hasCustomOptions = ball.numberCircleColor || ball.numberTextColor ||
                                 ball.numberBorder || ball.stripeBackgroundColor ||
                                 ball.showNumber === false || ball.numberCircleRadialLines > 0 ||
                                 ball.stripeThickness !== 0.55 || ball.numberCircleRadius !== 0.66 ||
                                 ball.borderWidth !== 1.0 || ball.numberScale !== 1.0 ||
                                 ball.stripeOrientation === 'vertical' || ball.radialLinesColor ||
                                 (ball.numberCircleOpacity != null && ball.numberCircleOpacity !== 1.0) ||
                                 (ball.texture && ball.texture !== 'none') ||
                                 (ball.numberFont && ball.numberFont !== 'Arial');

        if (!hasCustomOptions) return null;

        return {
            showNumber: ball.showNumber !== false,
            stripeBackgroundColor: ball.stripeBackgroundColor,
            numberCircleColor: ball.numberCircleColor,
            numberTextColor: ball.numberTextColor,
            numberBorder: ball.numberBorder,
            numberBorderColor: ball.numberBorderColor,
            numberCircleRadialLines: ball.numberCircleRadialLines || 0,
            radialLinesColor: ball.radialLinesColor,
            stripeThickness: ball.stripeThickness ?? 0.55,
            numberCircleRadius: ball.numberCircleRadius ?? 0.66,
            borderWidth: ball.borderWidth ?? 1.0,
            numberScale: ball.numberScale ?? 1.0,
            stripeOrientation: ball.stripeOrientation || 'horizontal',
            numberCircleOpacity: ball.numberCircleOpacity ?? 1.0,
            texture: ball.texture || 'none',
            textureColorMode: ball.textureColorMode || 'auto',
            textureColor: ball.textureColor || '#FFFFFF',
            numberFont: ball.numberFont || 'Arial'
        };
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
            key += `-${options.radialLinesColor || ''}`;
            key += `-${options.stripeThickness ?? 0.55}`;
            key += `-${options.numberCircleRadius ?? 0.5}`;
            key += `-${options.borderWidth ?? 1.0}`;
            key += `-${options.numberScale ?? 1.0}`;
            key += `-${options.stripeOrientation || 'horizontal'}`;
            key += `-${options.numberCircleOpacity ?? 1.0}`;
            key += `-${options.texture || 'none'}`;
            key += `-${options.textureColorMode || 'auto'}`;
            key += `-${options.textureColor || ''}`;
            key += `-${options.numberFont || 'Arial'}`;
        }
        return key;
    }

    // Generate all rotation frames for a ball
    generateBallFrames(ballNumber, baseColor, isStripe, isUKBall = false, isEightBall = false, isSnookerBall = false, options = null) {
        const cacheKey = this.generateCacheKey(ballNumber, baseColor, isStripe, isUKBall, isEightBall, isSnookerBall, options);
        if (this.frameCache.has(cacheKey)) {
            return this.frameCache.get(cacheKey);
        }

        const renderOptions = options || {};

        // Check if this ball needs rotation frames
        // Only truly solid color balls without any features need just 1 frame
        const hasRadialLines = (renderOptions.numberCircleRadialLines || 0) > 0;
        const showNumber = renderOptions.showNumber !== false && ballNumber !== 0 && (!isUKBall || isEightBall) && !isSnookerBall;
        const hasTexture = renderOptions.texture && renderOptions.texture !== 'none';
        const needsRotation = (isStripe && !isSnookerBall) || hasRadialLines || showNumber || hasTexture;

        const framesToRender = needsRotation ? this.frameCount : 1;
        const frames = [];

        for (let i = 0; i < framesToRender; i++) {
            const rotation = (i / this.frameCount) * Math.PI * 2;
            const frame = this.renderBallFrame(ballNumber, baseColor, isStripe, rotation, isUKBall, isEightBall, isSnookerBall, renderOptions);
            frames.push(frame);
        }

        // If only one frame, duplicate it for all rotation angles so indexing still works
        if (framesToRender === 1) {
            const singleFrame = frames[0];
            for (let i = 1; i < this.frameCount; i++) {
                frames.push(singleFrame);
            }
        }

        this.frameCache.set(cacheKey, frames);
        return frames;
    }

    // Pre-cache all frames for a set of balls (call on game start or ball set change)
    async precacheBallSet(balls, progressCallback = null) {
        const ballsToCache = balls.filter(b => !b.pocketed);
        const totalBalls = ballsToCache.length;

        for (let i = 0; i < totalBalls; i++) {
            const ball = ballsToCache[i];
            const isUKBall = ball.isUKBall || false;
            const isEightBall = ball.isEightBall || false;
            const isSnookerBall = ball.isSnookerBall || false;
            const hasTexture = ball.texture && ball.texture !== 'none';
            const options = this._buildBallOptions(ball);

            const frames = this.generateBallFrames(
                ball.number, ball.color, ball.isStripe,
                isUKBall, isEightBall, isSnookerBall, options
            );

            // Cache on the ball object so getFrame() uses the fast path
            ball._br3dFrames = frames;
            ball._br3dFixedFrame = ((isUKBall && !isEightBall && !hasTexture) || isSnookerBall) || ball.isCueBall;
            ball._br3dGen = this._cacheGeneration;

            // Update progress
            if (progressCallback) {
                const progress = ((i + 1) / totalBalls) * 100;
                progressCallback(progress);
            }

            // Yield through a full paint cycle: first rAF fires before paint,
            // second rAF fires after paint completes, so progress bar actually updates
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
                // Convert base64 back to canvas with proper async image loading
                const frames = framesData.map(dataUrl => {
                    const canvas = document.createElement('canvas');
                    canvas.width = this.resolution;
                    canvas.height = this.resolution;
                    const ctx = canvas.getContext('2d');

                    const img = new Image();
                    // Use onload callback to ensure image is decoded before drawing
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0);
                    };
                    img.onerror = () => {
                        console.warn('Failed to load cached ball frame');
                    };
                    img.src = dataUrl;

                    return canvas;
                });

                this.frameCache.set(key, frames);
            }
        } catch (e) {
            console.warn('Failed to load ball cache from storage:', e);
            // Clear corrupt cache to prevent empty balls on page refresh
            localStorage.removeItem(this.CACHE_PREFIX + this.CACHE_VERSION);
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

        // Texture parameters
        const texture = numberOptions.texture || 'none';
        const hasTexture = texture !== 'none';
        const textureColorMode = numberOptions.textureColorMode || 'auto';
        const textureColorRgb = hasTexture ? this.hexToRgb(numberOptions.textureColor || '#FFFFFF') : null;

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
                    if (hasTexture) {
                        const tex = this.applyTexture(r, g, b, texture, textureColorMode, textureColorRgb, localX, localY, localZ);
                        r = tex.r; g = tex.g; b = tex.b;
                    }
                } else {
                    // American balls, striped balls, and UK 8-ball have number spots
                    // Number spot is at the "front" of the ball in local coords (0, 0, 1)
                    // Calculate angular distance from number spot center
                    const dotProduct = localZ; // dot((localX,localY,localZ), (0,0,1))
                    const angleFromSpot = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
                    const inNumberSpot = angleFromSpot < numberSpotAngle;
                    const numberVisible = localZ > 0; // Only if facing camera

                    // Stripe: band around equator in LOCAL ball coordinates
                    // The "equator" depends on stripe orientation:
                    // - horizontal: equator is where localY = 0, stripe goes across the ball horizontally
                    // - vertical: stripe goes around the edge of the ball as seen from the number circle
                    //             (number sits in the middle of the background, stripe is around the circumference)
                    const stripeVertical = numberOptions.stripeOrientation === 'vertical';
                    // For vertical: use |localZ| so stripe is around the edge (low Z) and background at center (high Z)
                    const latitude = stripeVertical ? Math.abs(localZ) : Math.abs(localY);
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
                        if (textColor && textColor.a == null) {
                            // Fully opaque text texture pixel
                            r = textColor.r;
                            g = textColor.g;
                            b = textColor.b;
                        } else if (inStripe) {
                            r = rgb.r;
                            g = rgb.g;
                            b = rgb.b;
                            if (hasTexture) {
                                const tex = this.applyTexture(r, g, b, texture, textureColorMode, textureColorRgb, localX, localY, localZ);
                                r = tex.r; g = tex.g; b = tex.b;
                            }
                            if (textColor && textColor.a != null) {
                                // Semi-transparent text texture - blend over ball/stripe color
                                const a = textColor.a;
                                r = Math.round(textColor.r * a + r * (1 - a));
                                g = Math.round(textColor.g * a + g * (1 - a));
                                b = Math.round(textColor.b * a + b * (1 - a));
                            }
                        } else {
                            // Stripe background color (poles)
                            r = stripeBackgroundRgb.r;
                            g = stripeBackgroundRgb.g;
                            b = stripeBackgroundRgb.b;
                            if (textColor && textColor.a != null) {
                                const a = textColor.a;
                                r = Math.round(textColor.r * a + r * (1 - a));
                                g = Math.round(textColor.g * a + g * (1 - a));
                                b = Math.round(textColor.b * a + b * (1 - a));
                            }
                        }
                    } else {
                        // Solid ball
                        if (textColor && textColor.a == null) {
                            r = textColor.r;
                            g = textColor.g;
                            b = textColor.b;
                        } else {
                            r = rgb.r;
                            g = rgb.g;
                            b = rgb.b;
                            if (hasTexture) {
                                const tex = this.applyTexture(r, g, b, texture, textureColorMode, textureColorRgb, localX, localY, localZ);
                                r = tex.r; g = tex.g; b = tex.b;
                            }
                            if (textColor && textColor.a != null) {
                                const a = textColor.a;
                                r = Math.round(textColor.r * a + r * (1 - a));
                                g = Math.round(textColor.g * a + g * (1 - a));
                                b = Math.round(textColor.b * a + b * (1 - a));
                            }
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

        // Get scale options (default to 1.0)
        const borderWidthScale = options.borderWidth ?? 1.0;
        const numberScale = options.numberScale ?? 1.0;

        // Fill with transparent
        ctx.clearRect(0, 0, textureSize, textureSize);

        // Draw border FIRST if enabled (so it's underneath)
        if (options.numberBorder) {
            const borderWidth = 32 * borderWidthScale; // Scale border width
            ctx.strokeStyle = options.numberBorderColor || '#000000';
            ctx.lineWidth = borderWidth;
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius + borderWidth / 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw circle background (on top of border) with configurable opacity
        const circleOpacity = options.numberCircleOpacity ?? 1.0;
        ctx.save();
        ctx.globalAlpha = circleOpacity;
        ctx.fillStyle = options.numberCircleColor || '#FFFFFF';
        ctx.beginPath();
        ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw radial lines if enabled (on top of border, starting from outer edge)
        if (options.numberBorder && options.numberCircleRadialLines > 0) {
            const lineCount = options.numberCircleRadialLines;
            const borderWidth = 32 * borderWidthScale;
            const outerRadius = circleRadius + borderWidth; // Outer edge of border
            const lineLength = borderWidth + circleRadius * 0.15; // Extend slightly into circle

            // Use radialLinesColor if provided, otherwise fall back to numberBorderColor
            ctx.strokeStyle = options.radialLinesColor || options.numberBorderColor || '#000000';
            ctx.lineWidth = 20 * borderWidthScale; // Scale radial line width too
            ctx.lineCap = 'round';

            for (let i = 0; i < lineCount; i++) {
                const angle = (i / lineCount) * Math.PI * 2;
                const outerX = centerX + Math.cos(angle) * outerRadius;
                const outerY = centerY + Math.sin(angle) * outerRadius;
                const innerX = centerX + Math.cos(angle) * (outerRadius - lineLength);
                const innerY = centerY + Math.sin(angle) * (outerRadius - lineLength);

                ctx.beginPath();
                ctx.moveTo(outerX, outerY);
                ctx.lineTo(innerX, innerY);
                ctx.stroke();
            }
        }

        // Draw number text (on top of everything)
        const fontFamily = options.numberFont || 'Arial';
        ctx.fillStyle = options.numberTextColor || '#000000';
        ctx.font = `bold ${textureSize * 0.50 * numberScale}px ${fontFamily}`;
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

        // If fully transparent, return null (use ball color)
        if (alpha < 2) return null;

        // If semi-transparent, blend with null to indicate partial coverage
        if (alpha < 255) {
            return {
                r: textureData[idx],
                g: textureData[idx + 1],
                b: textureData[idx + 2],
                a: alpha / 255
            };
        }

        return {
            r: textureData[idx],
            g: textureData[idx + 1],
            b: textureData[idx + 2]
        };
    }

    // Hash function for pseudo-random noise
    hash3(x, y, z) {
        // Integer lattice hash
        let ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        let fx = x - ix, fy = y - iy, fz = z - iz;
        // Smoothstep for interpolation
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        fz = fz * fz * (3 - 2 * fz);

        const h = (a, b, c) => {
            let n = a * 127.1 + b * 311.7 + c * 74.7;
            n = Math.sin(n) * 43758.5453;
            return n - Math.floor(n);
        };

        // Trilinear interpolation of 8 corner hashes
        const c000 = h(ix, iy, iz);
        const c100 = h(ix + 1, iy, iz);
        const c010 = h(ix, iy + 1, iz);
        const c110 = h(ix + 1, iy + 1, iz);
        const c001 = h(ix, iy, iz + 1);
        const c101 = h(ix + 1, iy, iz + 1);
        const c011 = h(ix, iy + 1, iz + 1);
        const c111 = h(ix + 1, iy + 1, iz + 1);

        const x0 = c000 + fx * (c100 - c000);
        const x1 = c010 + fx * (c110 - c010);
        const x2 = c001 + fx * (c101 - c001);
        const x3 = c011 + fx * (c111 - c011);
        const y0 = x0 + fy * (x1 - x0);
        const y1 = x2 + fy * (x3 - x2);
        return y0 + fz * (y1 - y0);
    }

    // Fractal Brownian Motion noise
    fbm3(x, y, z, octaves = 4) {
        let value = 0, amplitude = 0.5, frequency = 1;
        for (let i = 0; i < octaves; i++) {
            value += amplitude * this.hash3(x * frequency, y * frequency, z * frequency);
            amplitude *= 0.5;
            frequency *= 2;
        }
        return value;
    }

    // Get texture modifier for a given texture type at a local sphere position
    getTextureModifier(texture, localX, localY, localZ) {
        switch (texture) {
            case 'camouflage': {
                // FBM noise posterized to 2 hard-edge tones
                const scale = 4.0;
                const noise = this.fbm3(localX * scale, localY * scale, localZ * scale, 4);
                const dark = noise < 0.48;
                return { intensity: dark ? 0.85 : 0, factor: dark ? 0.55 : 1.0 };
            }
            case 'striped': {
                // Diagonal thin parallel lines
                const wave = Math.sin((localY) * 40);
                const inLine = wave > 0;
                return { intensity: inLine ? 0.8 : 0, factor: inLine ? 0.7 : 1.0 };
            }
            case 'marbled': {
                // Turbulent sine veins
                const t = localX * 10 + Math.sin(localY * 8 + localZ * 6) * 2 + Math.cos(localZ * 12 + localX * 4) * 1.5;
                const vein = Math.abs(Math.sin(t));
                const inVein = vein > 0.92;
                return { intensity: inVein ? 0.9 : 0, factor: inVein ? 0.6 : 1.0 };
            }
            case 'sparkly': {
                // Position hash for sparse sparkle pixels (~8%)
                const hash = Math.sin(localX * 127.1 + localY * 311.7 + localZ * 74.7) * 43758.5453;
                const fract = hash - Math.floor(hash);
                const isSparkle = fract > 0.92;
                return { intensity: isSparkle ? 1.0 : 0, factor: isSparkle ? 1.4 : 1.0 };
            }
            case 'hexagonal': {
                // Honeycomb hex cell pattern using nearest-center distance
                const hScale = 5;
                const hx = localX * hScale, hy = localY * hScale, hz = localZ * hScale;
                // Use 2 of the 3 axes for hex grid (project onto a plane)
                const q = hx * 0.6667 + hy * 0.3333;
                const r2 = hy * 0.5774;
                // Hex grid rounding
                const qi = Math.round(q), ri = Math.round(r2);
                const fq = q - qi, fr = r2 - ri;
                const edgeDist = Math.max(Math.abs(fq), Math.abs(fr), Math.abs(fq + fr));
                const onEdge = edgeDist > 0.42;
                return { intensity: onEdge ? 0.7 : 0, factor: onEdge ? 0.6 : 1.0 };
            }
            case 'crackle': {
                // Voronoi-style cracks: find distance to nearest vs second nearest random point
                const cScale = 6;
                const cx = localX * cScale, cy = localY * cScale, cz = localZ * cScale;
                const cix = Math.floor(cx), ciy = Math.floor(cy), ciz = Math.floor(cz);
                let d1 = 99, d2 = 99;
                const ch = (a, b, c) => {
                    const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
                    return n - Math.floor(n);
                };
                for (let di = -1; di <= 1; di++) {
                    for (let dj = -1; dj <= 1; dj++) {
                        for (let dk = -1; dk <= 1; dk++) {
                            const ni = cix + di, nj = ciy + dj, nk = ciz + dk;
                            const px = ni + ch(ni, nj, nk);
                            const py = nj + ch(ni + 17, nj + 31, nk + 7);
                            const pz = nk + ch(ni + 59, nj + 13, nk + 43);
                            const ddx = cx - px, ddy = cy - py, ddz = cz - pz;
                            const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
                            if (dist < d1) { d2 = d1; d1 = dist; }
                            else if (dist < d2) { d2 = dist; }
                        }
                    }
                }
                const crack = d2 - d1;
                const isCrack = crack < 0.08;
                return { intensity: isCrack ? 0.9 : 0, factor: isCrack ? 0.45 : 1.0 };
            }
            case 'galaxy': {
                // Swirling nebula: FBM with spiral distortion
                const gScale = 3.0;
                const gx = localX * gScale, gy = localY * gScale, gz = localZ * gScale;
                // Spiral twist based on distance from axis
                const dist = Math.sqrt(gx * gx + gy * gy);
                const angle = Math.atan2(gy, gx) + dist * 2.5;
                const sx = Math.cos(angle) * dist;
                const sy = Math.sin(angle) * dist;
                const noise = this.fbm3(sx * 2, sy * 2, gz * 2, 5);
                // Multi-tone: bright spots in swirl arms
                const bright = noise > 0.55;
                return { intensity: bright ? 0.8 : noise * 0.3, factor: bright ? 1.4 : 0.85 + noise * 0.3 };
            }
            case 'woodgrain': {
                // Concentric rings with FBM distortion
                const wScale = 3.0;
                const wx = localX * wScale, wy = localY * wScale, wz = localZ * wScale;
                const distortion = this.fbm3(wx * 2, wy * 2, wz * 2, 3) * 0.8;
                const ring = Math.sin((Math.sqrt(wx * wx + wz * wz) + distortion) * 18);
                const isGrain = ring > 0.5;
                return { intensity: isGrain ? 0.6 : 0, factor: isGrain ? 0.7 : 1.0 };
            }
            default:
                return { intensity: 0, factor: 1.0 };
        }
    }

    // Apply texture effect to an RGB color
    applyTexture(r, g, b, texture, textureColorMode, textureColorRgb, localX, localY, localZ) {
        const mod = this.getTextureModifier(texture, localX, localY, localZ);
        if (mod.intensity === 0 && mod.factor === 1.0) return { r, g, b };

        if (textureColorMode === 'single' && textureColorRgb) {
            // Blend toward textureColor by intensity
            const t = mod.intensity;
            return {
                r: Math.round(r * (1 - t) + textureColorRgb.r * t),
                g: Math.round(g * (1 - t) + textureColorRgb.g * t),
                b: Math.round(b * (1 - t) + textureColorRgb.b * t)
            };
        } else {
            // Auto mode: multiply by factor (lighten/darken)
            return {
                r: Math.min(255, Math.max(0, Math.round(r * mod.factor))),
                g: Math.min(255, Math.max(0, Math.round(g * mod.factor))),
                b: Math.min(255, Math.max(0, Math.round(b * mod.factor)))
            };
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
        // Fast path: if ball already has cached frame ref from this generation, skip all work
        if (ball._br3dFrames && ball._br3dGen === this._cacheGeneration) {
            if (ball._br3dFixedFrame) return ball._br3dFrames[0];
            let frameIndex = Math.floor((ball.displayRoll / (Math.PI * 2)) * this.frameCount);
            frameIndex = ((frameIndex % this.frameCount) + this.frameCount) % this.frameCount;
            return ball._br3dFrames[frameIndex];
        }

        // Slow path: first call for this ball (or after cache clear)
        const isUKBall = ball.isUKBall || false;
        const isEightBall = ball.isEightBall || false;
        const isSnookerBall = ball.isSnookerBall || false;
        const hasTexture = ball.texture && ball.texture !== 'none';
        const options = this._buildBallOptions(ball);

        const frames = this.generateBallFrames(ball.number, ball.color, ball.isStripe, isUKBall, isEightBall, isSnookerBall, options);

        // Determine if this ball uses a fixed frame (no rotation)
        const fixedFrame = ((isUKBall && !isEightBall && !hasTexture) || isSnookerBall) ||
                           ball.isCueBall;

        // Cache on the ball object
        ball._br3dFrames = frames;
        ball._br3dFixedFrame = fixedFrame;
        ball._br3dGen = this._cacheGeneration;

        if (fixedFrame) return frames[0];

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

        const frame = this.getFrame(ball);

        // Balls with visual rotation features need canvas rotation to align with travel direction
        // Fixed-frame balls (cue ball, UK solids without texture, snooker) skip rotation
        if (!ball._br3dFixedFrame) {
            ctx.rotate(ball.travelAngle - Math.PI / 2);
        }

        ctx.drawImage(frame, -drawSize / 2, -drawSize / 2, drawSize, drawSize);

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
        this._cacheGeneration++; // Invalidate all ball-object cached refs
    }
}
