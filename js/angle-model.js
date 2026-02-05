/**
 * Predict the angle error for a shot
 * @param {number} cutAngle - Cut angle in degrees (0 = straight, 90 = max)
 * @param {number} distance - cueBallToTargetDist
 * @param {number} power - Shot power
 * @returns {number} Predicted angle error in degrees
 */
function predictAngleError(cutAngle, distance, power) {
  if (cutAngle <= 30.0) {
    return (
      0.062389027849
      + 0.115161446823 * cutAngle
      + 0.002656875118 * cutAngle * cutAngle
      + -0.000048268337 * cutAngle * cutAngle * cutAngle
    );
  }

  return (
    8.277719152516
    + -0.056579116294 * cutAngle
    + -0.074466733826 * power
    + -0.000028228384 * distance
    + 0.000028613156 * cutAngle * distance
  );
}

/**
 * Aim adjustment (subtract from aim)
 */
function calculateAimAdjustment(cutAngle, distance, power) {
  return predictAngleError(cutAngle, distance, power);
}

const ANGLE_MODEL_INFO = {
  piecewise: {
    cutAngleBreakDeg: 30.0,
    lowCutModel: "cubic(cutAngle)",
    highCutModel: "linear(cutAngle, power, distance, cutAngle*distance)"
  },
  overall: {
    rSquared: 0.531635466141,
    rmseDeg: 1.340184020635
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { predictAngleError, calculateAimAdjustment, ANGLE_MODEL_INFO };
}
