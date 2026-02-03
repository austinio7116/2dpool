/**
 * AI Angle Error Prediction Model
 *
 * Generated from 47 shot samples
 * Polynomial degree: 2
 * R-squared: 0.4131
 * RMSE: 16.8503 degrees
 *
 * Predicts the angle error (in degrees) based on cut angle, spin, and power.
 * Use this to adjust aim: subtract the predicted error from your aim angle.
 */

/**
 * Predict the angle error for a shot
 * @param {number} cutAngle - Cut angle in degrees (0 = straight, 90 = max)
 * @param {number} spinY - Vertical spin (-1 to 1, positive = topspin)
 * @param {number} power - Shot power
 * @returns {number} Predicted angle error in degrees
 */
function predictAngleError(cutAngle, spinY, power) {
    return (
        -14.6437795913
        + 0.7306913095 * cutAngle
        + -5.8185298278 * spinY
        + 1.2270730209 * power
        + 0.0018567301 * cutAngle * cutAngle
        + 1.1980734970 * cutAngle * spinY
        + -0.0399789903 * cutAngle * power
        + -12.7273485385 * spinY * spinY
        + -0.4544287829 * spinY * power
        + -0.0106316877 * power * power
    );
}

/**
 * Calculate aim adjustment to compensate for predicted angle error
 * @param {number} cutAngle - Cut angle in degrees
 * @param {number} spinY - Vertical spin
 * @param {number} power - Shot power
 * @returns {number} Angle adjustment in degrees (subtract from aim)
 */
function calculateAimAdjustment(cutAngle, spinY, power) {
    return predictAngleError(cutAngle, spinY, power);
}

// Model metadata
const ANGLE_MODEL_INFO = {
    degree: 2,
    rSquared: 0.4131,
    rmse: 16.8503,
    nSamples: 47,
    features: ['cutAngle', 'spinY', 'power'],
    coefficients: {
        "1": -14.643779591334509,
        "cutAngle": 0.7306913094787221,
        "spinY": -5.818529827810097,
        "power": 1.2270730208940457,
        "cutAngle*cutAngle": 0.0018567300536511122,
        "cutAngle*spinY": 1.1980734969522981,
        "cutAngle*power": -0.03997899030769875,
        "spinY*spinY": -12.727348538549249,
        "spinY*power": -0.4544287828630303,
        "power*power": -0.010631687732331196
}
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { predictAngleError, calculateAimAdjustment, ANGLE_MODEL_INFO };
}
