#!/usr/bin/env python3
"""
AI Shot Angle Error Regression Model Builder (No Dependencies Version)

Builds a polynomial regression model without requiring numpy/scipy.
Uses pure Python with basic linear algebra.

Usage:
    python build_angle_model_simple.py <shot_data.json> [--degree N] [--output model.js]
"""

import json
import argparse
import sys
import math
from itertools import combinations_with_replacement

def load_shot_data(filepath):
    """Load shot data from JSON file."""
    with open(filepath, 'r') as f:
        data = json.load(f)

    if not data:
        raise ValueError("No shot data found in file")

    print(f"Loaded {len(data)} shots from {filepath}")
    return data

def extract_features(data):
    """Extract features and target from shot data."""
    features = []
    targets = []

    for shot in data:
        if any(key not in shot for key in ['cutAngle', 'spinY', 'power', 'angleError']):
            continue

        features.append([
            shot['cutAngle'],
            shot['spinY'],
            shot['power']
        ])
        targets.append(shot['angleError'])

    print(f"Extracted {len(targets)} valid samples")

    if features:
        cut_angles = [f[0] for f in features]
        spins = [f[1] for f in features]
        powers = [f[2] for f in features]

        print(f"  cutAngle range: [{min(cut_angles):.2f}, {max(cut_angles):.2f}]")
        print(f"  spinY range: [{min(spins):.2f}, {max(spins):.2f}]")
        print(f"  power range: [{min(powers):.2f}, {max(powers):.2f}]")
        print(f"  angleError range: [{min(targets):.2f}, {max(targets):.2f}]")
        mean_err = sum(targets) / len(targets)
        std_err = math.sqrt(sum((t - mean_err)**2 for t in targets) / len(targets))
        print(f"  angleError mean: {mean_err:.4f}, std: {std_err:.4f}")

    return features, targets

def build_polynomial_features(X, degree):
    """Build polynomial features from input matrix."""
    n_samples = len(X)
    n_features = len(X[0]) if X else 0

    feature_names = ['cutAngle', 'spinY', 'power']
    terms = []
    term_names = []

    # Constant term
    terms.append([1.0] * n_samples)
    term_names.append('1')

    # Generate terms for each degree
    for d in range(1, degree + 1):
        for combo in combinations_with_replacement(range(n_features), d):
            term = []
            name_parts = []
            for i in range(n_samples):
                val = 1.0
                for idx in combo:
                    val *= X[i][idx]
                term.append(val)
            for idx in combo:
                name_parts.append(feature_names[idx])
            terms.append(term)
            term_names.append('*'.join(name_parts))

    # Transpose to get X_poly as list of rows
    X_poly = [[terms[j][i] for j in range(len(terms))] for i in range(n_samples)]
    return X_poly, term_names

def matrix_transpose(M):
    """Transpose a matrix."""
    return [[M[j][i] for j in range(len(M))] for i in range(len(M[0]))]

def matrix_multiply(A, B):
    """Multiply two matrices."""
    rows_A, cols_A = len(A), len(A[0])
    rows_B, cols_B = len(B), len(B[0])

    result = [[0.0] * cols_B for _ in range(rows_A)]
    for i in range(rows_A):
        for j in range(cols_B):
            for k in range(cols_A):
                result[i][j] += A[i][k] * B[k][j]
    return result

def matrix_vector_multiply(A, v):
    """Multiply matrix by vector."""
    return [sum(A[i][j] * v[j] for j in range(len(v))) for i in range(len(A))]

def solve_linear_system(A, b):
    """
    Solve Ax = b using Gaussian elimination with partial pivoting.
    Returns x.
    """
    n = len(A)
    # Augment A with b
    aug = [row[:] + [b[i]] for i, row in enumerate(A)]

    # Forward elimination with partial pivoting
    for col in range(n):
        # Find pivot
        max_row = col
        for row in range(col + 1, n):
            if abs(aug[row][col]) > abs(aug[max_row][col]):
                max_row = row
        aug[col], aug[max_row] = aug[max_row], aug[col]

        if abs(aug[col][col]) < 1e-12:
            continue  # Skip near-zero pivot

        # Eliminate column
        for row in range(col + 1, n):
            factor = aug[row][col] / aug[col][col]
            for j in range(col, n + 1):
                aug[row][j] -= factor * aug[col][j]

    # Back substitution
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        if abs(aug[i][i]) < 1e-12:
            x[i] = 0.0
        else:
            x[i] = aug[i][n]
            for j in range(i + 1, n):
                x[i] -= aug[i][j] * x[j]
            x[i] /= aug[i][i]

    return x

def fit_regression(X_poly, y):
    """Fit linear regression using normal equations: (X'X)^-1 X'y"""
    X_T = matrix_transpose(X_poly)

    # X'X (X transpose times X)
    n_terms = len(X_poly[0])
    XtX = [[sum(X_T[i][k] * X_poly[k][j] for k in range(len(X_poly)))
            for j in range(n_terms)] for i in range(n_terms)]

    # X'y
    Xty = [sum(X_T[i][k] * y[k] for k in range(len(y))) for i in range(n_terms)]

    # Solve XtX * coeffs = Xty
    coeffs = solve_linear_system(XtX, Xty)

    # Calculate predictions
    y_pred = [sum(X_poly[i][j] * coeffs[j] for j in range(len(coeffs)))
              for i in range(len(X_poly))]

    # Calculate R-squared
    y_mean = sum(y) / len(y)
    ss_res = sum((y[i] - y_pred[i])**2 for i in range(len(y)))
    ss_tot = sum((y[i] - y_mean)**2 for i in range(len(y)))
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    # Calculate RMSE
    rmse = math.sqrt(ss_res / len(y))

    return coeffs, r_squared, rmse, y_pred

def generate_javascript(coeffs, term_names, degree, r_squared, rmse, n_samples):
    """Generate JavaScript code implementing the model."""

    js_code = f'''/**
 * AI Angle Error Prediction Model
 *
 * Generated from {n_samples} shot samples
 * Polynomial degree: {degree}
 * R-squared: {r_squared:.4f}
 * RMSE: {rmse:.4f} degrees
 *
 * Predicts the angle error (in degrees) based on cut angle, spin, and power.
 * Use this to adjust aim: subtract the predicted error from your aim angle.
 */

/**
 * Predict the angle error for a shot
 * @param {{number}} cutAngle - Cut angle in degrees (0 = straight, 90 = max)
 * @param {{number}} spinY - Vertical spin (-1 to 1, positive = topspin)
 * @param {{number}} power - Shot power
 * @returns {{number}} Predicted angle error in degrees
 */
function predictAngleError(cutAngle, spinY, power) {{
'''

    terms_code = []
    for coeff, name in zip(coeffs, term_names):
        if abs(coeff) < 1e-10:
            continue

        if name == '1':
            expr = f'{coeff:.10f}'
        else:
            parts = name.split('*')
            js_expr = ' * '.join(parts)
            expr = f'{coeff:.10f} * {js_expr}'

        terms_code.append(expr)

    if len(terms_code) <= 3:
        js_code += f'    return {" + ".join(terms_code)};\n'
    else:
        js_code += '    return (\n'
        for i, term in enumerate(terms_code):
            prefix = '        ' if i == 0 else '        + '
            js_code += f'{prefix}{term}\n'
        js_code += '    );\n'

    js_code += '}\n'

    js_code += f'''
/**
 * Calculate aim adjustment to compensate for predicted angle error
 * @param {{number}} cutAngle - Cut angle in degrees
 * @param {{number}} spinY - Vertical spin
 * @param {{number}} power - Shot power
 * @returns {{number}} Angle adjustment in degrees (subtract from aim)
 */
function calculateAimAdjustment(cutAngle, spinY, power) {{
    return predictAngleError(cutAngle, spinY, power);
}}

// Model metadata
const ANGLE_MODEL_INFO = {{
    degree: {degree},
    rSquared: {r_squared:.4f},
    rmse: {rmse:.4f},
    nSamples: {n_samples},
    features: ['cutAngle', 'spinY', 'power'],
    coefficients: {json.dumps(dict(zip(term_names, coeffs)), indent=8)}
}};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {{
    module.exports = {{ predictAngleError, calculateAimAdjustment, ANGLE_MODEL_INFO }};
}}
'''

    return js_code

def main():
    parser = argparse.ArgumentParser(
        description='Build angle error regression model from shot data'
    )
    parser.add_argument('input', help='Input JSON file with shot data')
    parser.add_argument('--degree', type=int, default=2,
                        help='Polynomial degree (default: 2)')
    parser.add_argument('--output', '-o', default='angle_model.js',
                        help='Output JavaScript file (default: angle_model.js)')

    args = parser.parse_args()

    try:
        data = load_shot_data(args.input)
    except FileNotFoundError:
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    X, y = extract_features(data)

    if len(y) < 10:
        print("Warning: Very few samples. Model may not be reliable.", file=sys.stderr)

    if len(y) == 0:
        print("Error: No valid samples found.", file=sys.stderr)
        sys.exit(1)

    X_poly, term_names = build_polynomial_features(X, args.degree)
    print(f"\nPolynomial features (degree {args.degree}): {len(term_names)} terms")
    print(f"  Terms: {', '.join(term_names)}")

    coeffs, r_squared, rmse, y_pred = fit_regression(X_poly, y)

    print(f"\n=== Model Performance ===")
    print(f"  R-squared: {r_squared:.4f}")
    print(f"  RMSE: {rmse:.4f} degrees")
    mae = sum(abs(y[i] - y_pred[i]) for i in range(len(y))) / len(y)
    print(f"  Mean Absolute Error: {mae:.4f} degrees")

    print(f"\nSignificant coefficients:")
    sorted_coeffs = sorted(enumerate(coeffs), key=lambda x: abs(x[1]), reverse=True)
    for idx, coeff in sorted_coeffs[:10]:
        if abs(coeff) > 1e-6:
            print(f"  {term_names[idx]:20s}: {coeff:+.6f}")

    js_code = generate_javascript(coeffs, term_names, args.degree,
                                   r_squared, rmse, len(y))

    with open(args.output, 'w') as f:
        f.write(js_code)
    print(f"\nGenerated JavaScript model: {args.output}")

if __name__ == '__main__':
    main()
