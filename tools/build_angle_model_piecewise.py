#!/usr/bin/env python3
import json
import argparse
import numpy as np
from pathlib import Path

# =========================
# MODEL CONFIG
# =========================
CUT_BREAK_DEG = 30.0

# =========================
# CLI
# =========================
parser = argparse.ArgumentParser(
    description="Build piecewise angle-error model and export as JavaScript"
)
parser.add_argument(
    "input",
    help="Input JSON shot data file"
)
parser.add_argument(
    "-o", "--output",
    required=True,
    help="Output JavaScript file"
)
args = parser.parse_args()

input_path = Path(args.input)
output_path = Path(args.output)

# =========================
# LOAD DATA
# =========================
with open(input_path, "r") as f:
    data = json.load(f)

cut = np.array([d["cutAngle"] for d in data])
power = np.array([d["power"] for d in data])
dist = np.array([d["cueBallToTargetDist"] for d in data])
err = np.array([d["angleError"] for d in data])

# =========================
# LOW CUT MODEL (CUBIC)
# angleError = c0 + c1*x + c2*x^2 + c3*x^3
# =========================
low_mask = cut <= CUT_BREAK_DEG
X_low = np.column_stack([
    np.ones(low_mask.sum()),
    cut[low_mask],
    cut[low_mask] ** 2,
    cut[low_mask] ** 3,
])
y_low = err[low_mask]

coef_low, *_ = np.linalg.lstsq(X_low, y_low, rcond=None)

# =========================
# HIGH CUT MODEL
# angleError =
#   a0
# + a1 * cutAngle
# + a2 * power
# + a3 * distance
# + a4 * cutAngle * distance
# =========================
high_mask = cut > CUT_BREAK_DEG
X_high = np.column_stack([
    np.ones(high_mask.sum()),
    cut[high_mask],
    power[high_mask],
    dist[high_mask],
    cut[high_mask] * dist[high_mask],
])
y_high = err[high_mask]

coef_high, *_ = np.linalg.lstsq(X_high, y_high, rcond=None)

# =========================
# METRICS
# =========================
def predict(c, p, d):
    if c <= CUT_BREAK_DEG:
        return (
            coef_low[0]
            + coef_low[1] * c
            + coef_low[2] * c ** 2
            + coef_low[3] * c ** 3
        )
    return (
        coef_high[0]
        + coef_high[1] * c
        + coef_high[2] * p
        + coef_high[3] * d
        + coef_high[4] * c * d
    )

pred = np.array([predict(c, p, d) for c, p, d in zip(cut, power, dist)])
resid = err - pred

ss_res = np.sum(resid ** 2)
ss_tot = np.sum((err - err.mean()) ** 2)
r2 = 1.0 - ss_res / ss_tot
rmse = np.sqrt(np.mean(resid ** 2))

# =========================
# WRITE JAVASCRIPT
# =========================
output_path.parent.mkdir(parents=True, exist_ok=True)

with open(output_path, "w") as f:
    f.write(f"""\
/**
 * Predict the angle error for a shot
 * @param {{number}} cutAngle - Cut angle in degrees (0 = straight, 90 = max)
 * @param {{number}} distance - cueBallToTargetDist
 * @param {{number}} power - Shot power
 * @returns {{number}} Predicted angle error in degrees
 */
function predictAngleError(cutAngle, distance, power) {{
  if (cutAngle <= {CUT_BREAK_DEG}) {{
    return (
      {coef_low[0]:.12f}
      + {coef_low[1]:.12f} * cutAngle
      + {coef_low[2]:.12f} * cutAngle * cutAngle
      + {coef_low[3]:.12f} * cutAngle * cutAngle * cutAngle
    );
  }}

  return (
    {coef_high[0]:.12f}
    + {coef_high[1]:.12f} * cutAngle
    + {coef_high[2]:.12f} * power
    + {coef_high[3]:.12f} * distance
    + {coef_high[4]:.12f} * cutAngle * distance
  );
}}

/**
 * Aim adjustment (subtract from aim)
 */
function calculateAimAdjustment(cutAngle, distance, power) {{
  return predictAngleError(cutAngle, distance, power);
}}

const ANGLE_MODEL_INFO = {{
  piecewise: {{
    cutAngleBreakDeg: {CUT_BREAK_DEG},
    lowCutModel: "cubic(cutAngle)",
    highCutModel: "linear(cutAngle, power, distance, cutAngle*distance)"
  }},
  overall: {{
    rSquared: {r2:.12f},
    rmseDeg: {rmse:.12f}
  }}
}};

if (typeof module !== "undefined" && module.exports) {{
  module.exports = {{ predictAngleError, calculateAimAdjustment, ANGLE_MODEL_INFO }};
}}
""")

print(f"Model written to {output_path}")
print(f"R² = {r2:.6f}")
print(f"RMSE = {rmse:.6f} deg")
