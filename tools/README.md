# AI Shot Analysis Tools

Tools for collecting and analyzing AI shot data to improve aim accuracy.

## Headless ELO Tournament Runner

Run AI-vs-AI tournaments headlessly to rank the built-in personas across all game modes:

```bash
npm install
node tools/elo-tournament.mjs --games 50 --modes 8ball,9ball,uk8ball,snooker --k 24 --out elo-results.json
```

**Options**

- `--games`: Games per pairing per mode (default: 50)
- `--modes`: Comma-separated list of modes (default: `8ball,9ball,uk8ball,snooker`)
- `--k`: ELO K-factor (default: 24)
- `--seed`: Deterministic RNG seed
- `--max-shots`: Shot limit before counting a draw (default: 500)
- `--max-ticks`: Physics ticks per shot before counting a draw (default: 1500)
- `--out`: Write results JSON to a file

The script runs completely headless (no DOM or canvas) and prints overall + per-mode rankings. The `--out` file includes the full rating table and win/loss/draw records.

## Data Collection

### Option 1: Automated Bulk Generation (Recommended for Training)

Use the **Shot Data Generator** to create tens of thousands of training samples:

1. Open `tools/shot-data-generator.html` in a browser (via HTTP server)
2. Configure parameters:
   - **Cut Angles**: 1° to 75° (or any range)
   - **Power**: 5 to 25 (adjustable)
   - **SpinY**: -1 to 1 (backspin to topspin)
   - **Distance**: 50px to 400px
3. Click "Start Generation" to run simulations
4. Download results as JSON or CSV

**Default configuration generates ~9,375 shots** (75 angles × 5 power × 5 spin × 5 distance).

For large datasets (50,000+), use "Maximum" simulation speed.

### Option 2: Live Game Data Collection

1. Start the game and play against the AI
2. Let the AI take shots (the tracker automatically records AI shots only)
3. Open browser console and export data:
   ```javascript
   aiShotTracker.downloadJSON()  // Downloads ai_shot_data_<timestamp>.json
   // or
   aiShotTracker.downloadCSV()   // Downloads as CSV
   ```

## Building the Model

### Option 1: With NumPy (recommended for large datasets)

```bash
python build_angle_model.py ai_shot_data.json --degree 2 --output angle_model.js
```

### Option 2: Pure Python (no dependencies)

```bash
python build_angle_model_simple.py ai_shot_data.json --degree 2 --output angle_model.js
```

### Options

- `--degree N`: Polynomial degree (default: 2). Higher degrees capture more complex relationships but risk overfitting.
- `--output FILE`: Output JavaScript file path
- `--analyze`: (numpy version only) Show detailed analysis by cut angle ranges

## Output

The script generates a JavaScript file with:

```javascript
function predictAngleError(cutAngle, spinY, power) {
    // Returns predicted angle error in degrees
}

function calculateAimAdjustment(cutAngle, spinY, power) {
    // Same as above, for clarity
}

const ANGLE_MODEL_INFO = {
    degree: 2,
    rSquared: 0.85,
    rmse: 1.23,
    nSamples: 500,
    coefficients: { ... }
};
```

## Integrating into AI

### Method 1: Replace calculateThrowShift (Recommended)

In `ai.js`, modify the `executeShot` method to use the model instead of `calculateThrowShift`:

```javascript
// Import or paste the predictAngleError function

executeShot(shot) {
    // ... existing code ...

    // Replace the throw compensation section with:
    if (shot.cutAngle > 1) {
        // Use the trained model to predict angle error
        const predictedError = predictAngleError(shot.cutAngle, spin.y, power);

        // Convert angle adjustment to direction rotation
        const adjustmentRad = predictedError * (Math.PI / 180);

        // Rotate the direction to compensate
        direction = Vec2.rotate(direction, -adjustmentRad);
        direction = Vec2.normalize(direction);

        aiLog('Model-based adjustment:', predictedError.toFixed(2), 'degrees');
    }

    // ... rest of method ...
}
```

### Method 2: Add as Separate Module

1. Save the generated model as `js/angle-model.js`
2. Import in ai.js:
   ```javascript
   import { predictAngleError } from './angle-model.js';
   ```
3. Use in shot calculations

## Data Fields

Each shot record contains:

| Field | Description |
|-------|-------------|
| `timestamp` | When shot was taken (ms since epoch) |
| `intendedAngle` | Calculated angle from target to pocket (degrees) |
| `actualAngle` | Actual travel angle from velocity (degrees) |
| `angleError` | Difference: actual - intended (degrees) |
| `power` | Shot power |
| `spinY` | Vertical spin (+topspin, -backspin) |
| `cutAngle` | Cut angle (degrees, 0=straight) |
| `cueBallToTargetDist` | Distance in pixels |
| `difficulty` | AI difficulty setting |
| `targetBallVelocity` | {x, y} velocity after hit |

## Tips for Good Data

1. **Variety**: Collect shots across different cut angles (0-60+)
2. **Sample Size**: Aim for 200+ shots minimum for reliable models
3. **Spin Variety**: Include shots with backspin, neutral, and topspin
4. **Power Variety**: Include soft and hard shots
5. **Multiple Sessions**: Data persists in browser until cleared

## Interpreting Results

- **R-squared > 0.7**: Good fit, model explains most variance
- **R-squared 0.4-0.7**: Moderate fit, useful but noisy
- **R-squared < 0.4**: Poor fit, may need more data or different features
- **RMSE**: Average prediction error in degrees (lower is better)

## Example Workflow

```bash
# Collect 500+ shots across multiple games
# Export from browser: aiShotTracker.downloadJSON()

# Build model
python build_angle_model.py ai_shot_data_1706000000000.json -o angle_model.js

# Check output
# R-squared: 0.82
# RMSE: 1.5 degrees

# Integrate into ai.js and test!
```

## Shot Data Generator (shot-data-generator.html)

A standalone tool for generating large training datasets via physics simulation.

### Features

- **Configurable Parameters**: Set ranges for cut angle, power, spin, and distance
- **Visualization**: Watch shots in real-time or run at maximum speed
- **Progress Tracking**: See generation rate, valid samples, and average angle error
- **Export Options**: Download as JSON (for model training) or CSV (for analysis)

### Running

```bash
# From project root
python3 -m http.server 8000

# Open http://localhost:8000/tools/shot-data-generator.html
```

### Recommended Configurations

| Dataset Size | Cut Angles | Power | SpinY | Distance | Time (approx) |
|-------------|------------|-------|-------|----------|---------------|
| Quick test | 1-75 (5°) | 3 steps | 3 steps | 3 steps | ~30 sec |
| Standard | 1-75 (1°) | 5 steps | 5 steps | 5 steps | ~5 min |
| Large | 1-75 (0.5°) | 10 steps | 10 steps | 10 steps | ~30 min |
| Comprehensive | 1-75 (0.5°) | 15 steps | 15 steps | 15 steps | ~2 hours |

### How It Works

1. Sets up a target ball at table center
2. Positions cue ball at specified distance and cut angle
3. Applies shot with configured power and spin
4. Runs Planck.js physics simulation until collision
5. Records intended vs actual target ball trajectory
6. Calculates angle error for training
