#!/usr/bin/env python3
"""
AI Shot Angle Error Regression Model Builder

Reads JSON shot data collected from the game and builds a polynomial regression
model to predict angleError based on cutAngle, spinY, and power.

Usage:
    python build_angle_model.py <shot_data.json> [--degree N] [--output model.js]

The output is JavaScript code that can be used directly in the AI for aim adjustment.
"""

import json
import argparse
import sys
import numpy as np
from pathlib import Path

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
        # Skip shots with missing data
        if any(key not in shot for key in ['cutAngle', 'spinY', 'power', 'angleError']):
            continue

        features.append([
            shot['cutAngle'],
            shot['spinY'],
            shot['power']
        ])
        targets.append(shot['angleError'])

    X = np.array(features)
    y = np.array(targets)

    print(f"Extracted {len(y)} valid samples")
    print(f"  cutAngle range: [{X[:, 0].min():.2f}, {X[:, 0].max():.2f}]")
    print(f"  spinY range: [{X[:, 1].min():.2f}, {X[:, 1].max():.2f}]")
    print(f"  power range: [{X[:, 2].min():.2f}, {X[:, 2].max():.2f}]")
    print(f"  angleError range: [{y.min():.2f}, {y.max():.2f}]")
    print(f"  angleError mean: {y.mean():.4f}, std: {y.std():.4f}")

    return X, y

def build_polynomial_features(X, degree):
    """
    Build polynomial features from input matrix.
    For degree=2 with inputs [a, b, c], generates:
    [1, a, b, c, a^2, ab, ac, b^2, bc, c^2]
    """
    n_samples = X.shape[0]
    n_features = X.shape[1]

    # Generate all polynomial terms up to given degree
    from itertools import combinations_with_replacement

    feature_names = ['cutAngle', 'spinY', 'power']
    terms = []
    term_names = []

    # Constant term
    terms.append(np.ones(n_samples))
    term_names.append('1')

    # Generate terms for each degree
    for d in range(1, degree + 1):
        for combo in combinations_with_replacement(range(n_features), d):
            term = np.ones(n_samples)
            name_parts = []
            for idx in combo:
                term *= X[:, idx]
                name_parts.append(feature_names[idx])
            terms.append(term)
            term_names.append('*'.join(name_parts))

    X_poly = np.column_stack(terms)
    return X_poly, term_names

def fit_regression(X_poly, y):
    """Fit linear regression using least squares."""
    # Use numpy's lstsq for numerical stability
    coeffs, residuals, rank, s = np.linalg.lstsq(X_poly, y, rcond=None)

    # Calculate R-squared
    y_pred = X_poly @ coeffs
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    # Calculate RMSE
    rmse = np.sqrt(np.mean((y - y_pred) ** 2))

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

    # Build the polynomial calculation
    # We need to generate code that computes each term
    terms_code = []
    for i, (coeff, name) in enumerate(zip(coeffs, term_names)):
        if abs(coeff) < 1e-10:
            continue

        # Convert term name to JavaScript expression
        if name == '1':
            expr = f'{coeff:.10f}'
        else:
            parts = name.split('*')
            js_expr = ' * '.join(parts)
            expr = f'{coeff:.10f} * {js_expr}'

        terms_code.append(expr)

    # Join terms with proper formatting
    if len(terms_code) <= 3:
        js_code += f'    return {" + ".join(terms_code)};\n'
    else:
        js_code += '    return (\n'
        for i, term in enumerate(terms_code):
            prefix = '        ' if i == 0 else '        + '
            js_code += f'{prefix}{term}\n'
        js_code += '    );\n'

    js_code += '}\n'

    # Add a convenience function for aim adjustment
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
    coefficients: {json.dumps(dict(zip(term_names, coeffs.tolist())), indent=8)}
}};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {{
    module.exports = {{ predictAngleError, calculateAimAdjustment, ANGLE_MODEL_INFO }};
}}
'''

    return js_code

def analyze_data(X, y, y_pred):
    """Print analysis of the data and model fit."""
    print("\n=== Model Analysis ===")

    # Analyze by cut angle ranges
    print("\nAngle error by cut angle range:")
    ranges = [(0, 15), (15, 30), (30, 45), (45, 60), (60, 90)]
    for low, high in ranges:
        mask = (X[:, 0] >= low) & (X[:, 0] < high)
        if mask.sum() > 0:
            mean_err = y[mask].mean()
            std_err = y[mask].std()
            pred_err = np.abs(y[mask] - y_pred[mask]).mean()
            print(f"  {low:2d}-{high:2d} deg: n={mask.sum():4d}, "
                  f"mean error={mean_err:+.2f} deg, std={std_err:.2f}, "
                  f"model MAE={pred_err:.2f}")

    # Analyze by spin
    print("\nAngle error by spin:")
    spin_ranges = [(-1, -0.3), (-0.3, 0.3), (0.3, 1)]
    spin_labels = ['backspin', 'neutral', 'topspin']
    for (low, high), label in zip(spin_ranges, spin_labels):
        mask = (X[:, 1] >= low) & (X[:, 1] < high)
        if mask.sum() > 0:
            mean_err = y[mask].mean()
            print(f"  {label:10s}: n={mask.sum():4d}, mean error={mean_err:+.2f} deg")

def main():
    parser = argparse.ArgumentParser(
        description='Build angle error regression model from shot data'
    )
    parser.add_argument('input', help='Input JSON file with shot data')
    parser.add_argument('--degree', type=int, default=2,
                        help='Polynomial degree (default: 2)')
    parser.add_argument('--output', '-o', default='angle_model.js',
                        help='Output JavaScript file (default: angle_model.js)')
    parser.add_argument('--analyze', '-a', action='store_true',
                        help='Show detailed analysis')

    args = parser.parse_args()

    # Load data
    try:
        data = load_shot_data(args.input)
    except FileNotFoundError:
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    # Extract features
    X, y = extract_features(data)

    if len(y) < 10:
        print("Warning: Very few samples. Model may not be reliable.", file=sys.stderr)

    # Build polynomial features
    X_poly, term_names = build_polynomial_features(X, args.degree)
    print(f"\nPolynomial features (degree {args.degree}): {len(term_names)} terms")
    print(f"  Terms: {', '.join(term_names)}")

    # Fit model
    coeffs, r_squared, rmse, y_pred = fit_regression(X_poly, y)

    print(f"\n=== Model Performance ===")
    print(f"  R-squared: {r_squared:.4f}")
    print(f"  RMSE: {rmse:.4f} degrees")
    print(f"  Mean Absolute Error: {np.mean(np.abs(y - y_pred)):.4f} degrees")

    # Show significant coefficients
    print(f"\nSignificant coefficients:")
    sorted_indices = np.argsort(np.abs(coeffs))[::-1]
    for idx in sorted_indices[:10]:
        if abs(coeffs[idx]) > 1e-6:
            print(f"  {term_names[idx]:20s}: {coeffs[idx]:+.6f}")

    if args.analyze:
        analyze_data(X, y, y_pred)

    # Generate JavaScript
    js_code = generate_javascript(coeffs, term_names, args.degree,
                                   r_squared, rmse, len(y))

    # Write output
    output_path = Path(args.output)
    output_path.write_text(js_code)
    print(f"\nGenerated JavaScript model: {output_path}")

    # Also print a summary for direct use
    print("\n=== Quick Integration ===")
    print("To use in ai.js, replace calculateThrowShift with predictAngleError")
    print("and adjust the aim angle by subtracting the predicted error.")

if __name__ == '__main__':
    main()
