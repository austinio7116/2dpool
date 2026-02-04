/**
 * Predict the angle error for a shot
 * @param {number} cutAngle - Cut angle in degrees (0 = straight, 90 = max)
 * @param {number} spinY - Vertical spin (-1 to 1, positive = topspin)
 * @param {number} power - Shot power
 * @returns {number} Predicted angle error in degrees
 *
 * Model details:
 * - Trained on: ai_shot_data_1770157567819.json :contentReference[oaicite:1]{index=1}
 * - Features: [cutAngle, spinY, power]
 * - Network: 3 -> 8 -> 8 -> 1 with tanh activations
 * - Output clipped to [-15, 15] degrees (training targets were clipped)
 */
function predictAngleError(cutAngle, spinY, power) {
  // basic input sanitization (avoid NaN/Infinity propagating)
  if (!Number.isFinite(cutAngle) || !Number.isFinite(spinY) || !Number.isFinite(power)) return 0;

  // StandardScaler params from training (feature order: cutAngle, spinY, power)
  const mean = [21.6004138587, 0.0329539774, 21.378403421];
  const scale = [18.493388669, 0.3964140468, 7.4194046303];

  // MLP weights (sklearn-style: coefs_ and intercepts_)
  // W[0] is 3x8, W[1] is 8x8, W[2] is 8x1
  const W = [
    [
      [-0.0974746948,  0.6851909472,  0.294252358,   0.1949336119, -0.5841918602, -0.4356762807, -0.7416422722,  0.6293520346],
      [ 0.2379786885,  0.3231862866, -0.7774126513,  0.7135093327,  0.4155301125, -0.5137588148, -0.3870985877, -0.381032047 ],
      [-0.3128112609, -0.0229500096, -0.0104998449, -0.2700524896,  0.2037706354, -0.4544346034, -0.329816511,  -0.2841913319]
    ],
    [
      [-0.4489919952,  0.4629098788,  0.4982756265,  0.4635421623, -0.3218311104, -0.5708619703,  0.1395284177, -0.1605010153],
      [-0.5548677426, -0.0192758217, -0.5748697452, -0.3955768019,  0.0170463987, -0.0853596092, -0.0254487913,  0.5419547562],
      [-0.0734718377, -0.1591645337,  0.1355112229, -0.4021407805, -0.1327663018,  0.3143612685,  0.2273161843, -0.055099942 ],
      [ 0.0683251157,  0.3254840364,  0.017772079,   0.1592568388, -0.2220178557, -0.0052108105,  0.2408337107,  0.3811733099],
      [-0.3792442234, -0.3208689022, -0.3614214647, -0.0177931195, -0.3839319202, -0.1249358972,  0.0429050714,  0.1337324472],
      [-0.0644393542, -0.3866381444,  0.2752883889, -0.1269409466, -0.3052018776,  0.2584719468,  0.5066558369, -0.0455017283],
      [-0.0595762199,  0.3005318295, -0.1441385831,  0.2511389368,  0.0847821848, -0.3789866064, -0.1490615527, -0.1108387825],
      [ 0.2013320737,  0.2794361423, -0.4053309978,  0.2083789938,  0.1791313718, -0.1729253257, -0.2103194765, -0.2109249349]
    ],
    [
      [ 0.2325526419],
      [-0.2899091988],
      [ 0.1646713593],
      [ 0.4274067805],
      [ 0.101540219 ],
      [ 0.1519612897],
      [-0.1785159471],
      [ 0.3290940008]
    ]
  ];

  // Biases for each layer: b[0] len 8, b[1] len 8, b[2] len 1
  const b = [
    [-0.0647132086,  0.4151363453, -0.1558877815,  0.0653608138, -0.1150156847, -0.3228775316, -0.2950827713,  0.2843016429],
    [ 0.1164200184,  0.1006872268, -0.0028160845,  0.0955058925, -0.1240013868,  0.0725259271,  0.1020992271,  0.0802044659],
    [ 0.6398981203]
  ];

  // normalize inputs
  const x = [
    (cutAngle - mean[0]) / scale[0],
    (spinY   - mean[1]) / scale[1],
    (power   - mean[2]) / scale[2]
  ];

  const tanh = (z) => Math.tanh(z);

  // layer 1: 3 -> 8 (tanh)
  const h1 = new Array(8);
  for (let j = 0; j < 8; j++) {
    let s = b[0][j];
    for (let i = 0; i < 3; i++) s += x[i] * W[0][i][j];
    h1[j] = tanh(s);
  }

  // layer 2: 8 -> 8 (tanh)
  const h2 = new Array(8);
  for (let j = 0; j < 8; j++) {
    let s = b[1][j];
    for (let i = 0; i < 8; i++) s += h1[i] * W[1][i][j];
    h2[j] = tanh(s);
  }

  // output: 8 -> 1 (linear)
  let y = b[2][0];
  for (let i = 0; i < 8; i++) y += h2[i] * W[2][i][0];

  // clip to training range
  if (y > 15) y = 15;
  else if (y < -15) y = -15;

  return y;
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

