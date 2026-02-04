/**
 * AI Angle Error Prediction Model
 *
 * Generated from 79 shot samples
 * Polynomial degree: 2
 * R-squared: 0.3579
 * RMSE: 13.6603 degrees
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
        -12.0958945556
        + 0.6633349058 * cutAngle
        + -9.7396869062 * spinY
        + 0.8741035562 * power
        + 0.0030528539 * cutAngle * cutAngle
        + 0.9783293658 * cutAngle * spinY
        + -0.0397762973 * cutAngle * power
        + -12.1570168941 * spinY * spinY
        + -0.1227854639 * spinY * power
        + -0.0039730358 * power * power
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
    rSquared: 0.3579,
    rmse: 13.6603,
    nSamples: 79,
    features: ['cutAngle', 'spinY', 'power'],
    coefficients: {
        "1": -12.09589455560793,
        "cutAngle": 0.6633349058172757,
        "spinY": -9.73968690615841,
        "power": 0.8741035562405083,
        "cutAngle*cutAngle": 0.003052853945081535,
        "cutAngle*spinY": 0.9783293657951451,
        "cutAngle*power": -0.039776297289907225,
        "spinY*spinY": -12.157016894050214,
        "spinY*power": -0.12278546391403572,
        "power*power": -0.003973035814037518
}
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { predictAngleError, calculateAimAdjustment, ANGLE_MODEL_INFO };
}
