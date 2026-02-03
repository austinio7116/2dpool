# AI Shot Analysis Tools

Tools for collecting and analyzing AI shot data to improve aim accuracy.

## Data Collection

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
