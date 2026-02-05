#!/usr/bin/env python3
import argparse
import json
import math
from pathlib import Path
from datetime import datetime

import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error


# ----------------------------
# Config (defaults)
# ----------------------------
TARGET = "angleError"

# Training features: spinY intentionally excluded (kept only for JS signature compatibility)
FEATURES = ["cutAngle", "power"]  # x0=cutAngle, x1=power

POWER_BRACKETS = None
AUTO_BRACKETS_N = 55  # used only if POWER_BRACKETS=None

SPLIT_MIN = 10
SPLIT_MAX = 60
SPLIT_STEP = 1

POLY_DEGREE = 3
RIDGE_ALPHA = 1.0

TEST_SIZE = 0.2
RANDOM_SEED = 42

MIN_SAMPLES_PER_BRACKET = 10
MIN_SAMPLES_PER_SIDE = 5

# JS clip to match the interface style you showed (you can change/remove)
TARGET_CLIP = 15.0


# ----------------------------
# Helpers
# ----------------------------
def rmse(y_true, y_pred) -> float:
    return math.sqrt(mean_squared_error(y_true, y_pred))


def build_poly_ridge(degree: int, alpha: float) -> Pipeline:
    return Pipeline(
        [
            ("poly", PolynomialFeatures(degree=degree, include_bias=True)),
            ("ridge", Ridge(alpha=alpha, fit_intercept=False)),
        ]
    )


def load_rows(path: Path):
    rows = json.loads(path.read_text())
    if isinstance(rows, dict) and "data" in rows:
        rows = rows["data"]
    if not isinstance(rows, list):
        raise ValueError("Input JSON must be a list of rows, or an object with a 'data' list.")
    return rows


def make_brackets_auto(powers: np.ndarray, n: int):
    lo = float(np.min(powers))
    hi = float(np.max(powers))
    if hi <= lo:
        return [(lo, hi + 1e-9)]
    edges = np.linspace(lo, hi, n + 1)
    brackets = [(float(edges[i]), float(edges[i + 1])) for i in range(n)]
    brackets[-1] = (brackets[-1][0], brackets[-1][1] + 1e-9)
    return brackets


def fit_piecewise_cutangle(X_train, y_train, split_angle, model_left, model_right):
    mask_left = X_train[:, 0] < split_angle
    Xl, yl = X_train[mask_left], y_train[mask_left]
    Xr, yr = X_train[~mask_left], y_train[~mask_left]
    if len(yl) < MIN_SAMPLES_PER_SIDE or len(yr) < MIN_SAMPLES_PER_SIDE:
        return None
    model_left.fit(Xl, yl)
    model_right.fit(Xr, yr)
    return model_left, model_right


def predict_piecewise_cutangle(X, split_angle, model_left, model_right):
    mask_left = X[:, 0] < split_angle
    out = np.empty(X.shape[0], dtype=float)
    if np.any(mask_left):
        out[mask_left] = model_left.predict(X[mask_left])
    if np.any(~mask_left):
        out[~mask_left] = model_right.predict(X[~mask_left])
    return out


def extract_poly_ridge_coeffs(model: Pipeline):
    poly = model.named_steps["poly"]
    ridge = model.named_steps["ridge"]
    names = poly.get_feature_names_out()
    coefs = ridge.coef_
    return list(zip(names, coefs))


def js_from_poly_ridge(model: Pipeline, func_name: str, xmap: dict) -> str:
    """
    Export PolynomialFeatures+Ridge(fit_intercept=False) to JS.
    sklearn feature names: 1, x0, x1, x0^2, x0 x1, ...
    We map x0/x1 to real JS identifiers using xmap, e.g. x0->cutAngle, x1->power.
    """
    coeffs = extract_poly_ridge_coeffs(model)

    def repl_var(tok: str) -> str:
        return xmap.get(tok, tok)

    def term_to_js(term: str) -> str:
        if term == "1":
            return "1.0"
        parts = term.split(" ")
        js_parts = []
        for p in parts:
            if "^" in p:
                base, pw = p.split("^")
                base = repl_var(base)
                js_parts.append(f"Math.pow({base}, {int(pw)})")
            else:
                js_parts.append(repl_var(p))
        return "(" + " * ".join(js_parts) + ")"

    lines = [f"function {func_name}(cutAngle, power) {{", "  return ("]
    for name, c in coeffs:
        lines.append(f"    {c:.12g} * {term_to_js(name)} +")
    lines[-1] = lines[-1].rstrip(" +")
    lines += ["  );", "}"]
    return "\n".join(lines)


def build_js(
    results,
    input_filename: str,
    n_samples_total: int,
    poly_degree: int,
    clip_val: float,
    metrics: dict,
) -> str:
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%SZ")

    out = []
    out.append("/* eslint-disable no-var, prefer-const */")
    out.append("/**")
    out.append(" * Auto-generated angle error model.")
    out.append(" *")
    out.append(f" * Trained on: {input_filename}")
    out.append(" * Features: cutAngle, spinY, power")
    out.append(f" * Model: piecewise PolynomialFeatures(degree={poly_degree}) + Ridge")
    out.append(f" * Output clip: [-{clip_val:g}, {clip_val:g}] degrees")
    out.append(f" * Generated (UTC): {now}")
    out.append(" * Metrics (overall holdout test, random_state=42):")
    out.append(f" *   rSquared: {metrics['r2']:.6f}")
    out.append(f" *   rmse: {metrics['rmse']:.6f}")
    out.append(f" *   mae: {metrics['mae']:.6f}")
    out.append(" *")
    out.append(" * Generated by build_angle_model_nn.py")
    out.append(" */")
    out.append("")

    # Emit bracket functions
    xmap = {"x0": "cutAngle", "x1": "power"}
    for r in results:
        bi = r["bi"]
        pmin, pmax = r["pmin"], r["pmax"]
        split = r["split"]
        fL = f"__predictAngleError_b{bi}_left"
        fR = f"__predictAngleError_b{bi}_right"
        out.append(
            f"// Bracket {bi}: power in [{pmin}, {pmax}) (n={r['n']}, split={split}, rmse={r['rmse']:.4f})"
        )
        out.append(js_from_poly_ridge(r["mL"], fL, xmap))
        out.append("")
        out.append(js_from_poly_ridge(r["mR"], fR, xmap))
        out.append("")

    # Wrapper
    out.append("/**")
    out.append(" * Predict the angle error for a shot")
    out.append(" * @param {number} cutAngle - Cut angle in degrees (0 = straight, 90 = max)")
    out.append(" * @param {number} spinY - Vertical spin (-1 to 1, positive = topspin)")
    out.append(" * @param {number} power - Shot power")
    out.append(" * @returns {number} Predicted angle error in degrees")
    out.append(" */")
    out.append("function predictAngleError(cutAngle, spinY, power) {")
    out.append("  // basic input sanitization (avoid NaN/Infinity propagating)")
    out.append("  if (!Number.isFinite(cutAngle) || !Number.isFinite(spinY) || !Number.isFinite(power)) return 0;")
    out.append("")
    out.append("  // NOTE: spinY is accepted for compatibility but not used by this model.")
    out.append("")

    # bracket routing
    for idx, r in enumerate(results):
        bi = r["bi"]
        pmin, pmax = r["pmin"], r["pmax"]
        split = r["split"]
        cond = f"(power >= {pmin} && power < {pmax})"
        if idx == 0:
            out.append(f"  if {cond} {{")
        else:
            out.append(f"  else if {cond} {{")
        out.append(f"    const split = {split};")
        out.append(f"    let y = (cutAngle < split)")
        out.append(f"      ? __predictAngleError_b{bi}_left(cutAngle, power)")
        out.append(f"      : __predictAngleError_b{bi}_right(cutAngle, power);")
        out.append(f"    if (y > {clip_val:g}) y = {clip_val:g};")
        out.append(f"    else if (y < -{clip_val:g}) y = -{clip_val:g};")
        out.append("    return y;")
        out.append("  }")

    # fallback clamp
    out.append("  // fallback: clamp to nearest bracket")
    if results:
        first = results[0]
        last = results[-1]

        out.append(f"  if (power < {first['pmin']}) {{")
        out.append(f"    const split = {first['split']};")
        out.append(f"    let y = (cutAngle < split)")
        out.append(f"      ? __predictAngleError_b{first['bi']}_left(cutAngle, power)")
        out.append(f"      : __predictAngleError_b{first['bi']}_right(cutAngle, power);")
        out.append(f"    if (y > {clip_val:g}) y = {clip_val:g};")
        out.append(f"    else if (y < -{clip_val:g}) y = -{clip_val:g};")
        out.append("    return y;")
        out.append("  }")

        out.append("  {")
        out.append(f"    const split = {last['split']};")
        out.append(f"    let y = (cutAngle < split)")
        out.append(f"      ? __predictAngleError_b{last['bi']}_left(cutAngle, power)")
        out.append(f"      : __predictAngleError_b{last['bi']}_right(cutAngle, power);")
        out.append(f"    if (y > {clip_val:g}) y = {clip_val:g};")
        out.append(f"    else if (y < -{clip_val:g}) y = -{clip_val:g};")
        out.append("    return y;")
        out.append("  }")
    else:
        out.append("  return 0;")
    out.append("}")
    out.append("")

    out.append("/**")
    out.append(" * Calculate aim adjustment to compensate for predicted angle error")
    out.append(" * @param {number} cutAngle - Cut angle in degrees")
    out.append(" * @param {number} spinY - Vertical spin")
    out.append(" * @param {number} power - Shot power")
    out.append(" * @returns {number} Angle adjustment in degrees (subtract from aim)")
    out.append(" */")
    out.append("function calculateAimAdjustment(cutAngle, spinY, power) {")
    out.append("  return predictAngleError(cutAngle, spinY, power);")
    out.append("}")
    out.append("")

    # metadata: keep same object name and export style as your MLP version
    out.append("// Model metadata")
    out.append("const ANGLE_MODEL_INFO = {")
    out.append('  modelType: "piecewise_poly_ridge",')
    out.append(f"  degree: {poly_degree},")
    out.append(f"  clip: {clip_val:g},")
    out.append(f"  nSamples: {n_samples_total},")
    out.append('  features: ["cutAngle", "spinY", "power"],')
    out.append("  piecewise: {")
    out.append("    brackets: [")
    for r in results:
        out.append(f"      {{ pmin: {r['pmin']}, pmax: {r['pmax']}, split: {r['split']}, n: {r['n']} }},")
    out.append("    ]")
    out.append("  },")
    out.append("  metrics: {")
    out.append(f"    rSquared: {metrics['r2']:.6f},")
    out.append(f"    rmse: {metrics['rmse']:.6f},")
    out.append(f"    mae: {metrics['mae']:.6f}")
    out.append("  }")
    out.append("};")
    out.append("")
    out.append("// Export for use in modules")
    out.append('if (typeof module !== "undefined" && module.exports) {')
    out.append("  module.exports = { predictAngleError, calculateAimAdjustment, ANGLE_MODEL_INFO };")
    out.append("}")
    out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(
        prog="build_angle_model_nn.py",
        description="Train a piecewise polynomial ridge model for angleError and export to JS (CommonJS interface).",
    )
    ap.add_argument("input", type=Path, help="Input JSON file (list of rows, or {data:[...]})")
    ap.add_argument("--output", "-o", type=Path, required=True, help="Output JS file path")
    args = ap.parse_args()

    rows = load_rows(args.input)

    X_all, y_all, p_all = [], [], []
    for r in rows:
        if "cutAngle" not in r or "power" not in r or TARGET not in r:
            continue
        try:
            cut = float(r["cutAngle"])
            power = float(r["power"])
            y = float(r[TARGET])
        except (TypeError, ValueError):
            continue
        X_all.append([cut, power])
        y_all.append(y)
        p_all.append(power)

    X_all = np.array(X_all, dtype=float)
    y_all = np.array(y_all, dtype=float)
    p_all = np.array(p_all, dtype=float)

    if X_all.shape[0] < 200:
        raise RuntimeError(f"Not enough usable rows: {X_all.shape[0]}")

    brackets = POWER_BRACKETS if POWER_BRACKETS is not None else make_brackets_auto(p_all, AUTO_BRACKETS_N)

    print("Power brackets:", brackets)
    print()

    results = []

    # For overall metrics, accumulate holdout predictions across brackets
    y_test_all = []
    y_pred_all = []

    for bi, (pmin, pmax) in enumerate(brackets):
        mask = (p_all >= pmin) & (p_all < pmax)
        Xb = X_all[mask]
        yb = y_all[mask]

        if len(yb) < MIN_SAMPLES_PER_BRACKET:
            print(f"[Bracket {bi}] power in [{pmin},{pmax}) -> SKIP (n={len(yb)})")
            continue

        X_train, X_test, y_train, y_test = train_test_split(
            Xb, yb, test_size=TEST_SIZE, random_state=RANDOM_SEED
        )

        best = None
        for split in range(SPLIT_MIN, SPLIT_MAX + 1, SPLIT_STEP):
            mL = build_poly_ridge(POLY_DEGREE, RIDGE_ALPHA)
            mR = build_poly_ridge(POLY_DEGREE, RIDGE_ALPHA)

            fitted = fit_piecewise_cutangle(X_train, y_train, split, mL, mR)
            if fitted is None:
                continue
            mL, mR = fitted

            pred = predict_piecewise_cutangle(X_test, split, mL, mR)
            score = rmse(y_test, pred)

            if best is None or score < best["rmse"]:
                best = {"split": split, "rmse": score, "mL": mL, "mR": mR}

        if best is None:
            print(f"[Bracket {bi}] power in [{pmin},{pmax}) -> FAILED to find valid split")
            continue

        split = best["split"]
        mL = best["mL"]
        mR = best["mR"]

        pred = predict_piecewise_cutangle(X_test, split, mL, mR)

        br_rmse = rmse(y_test, pred)
        br_r2 = r2_score(y_test, pred)

        left_mask = X_test[:, 0] < split
        rmse_left = rmse(y_test[left_mask], pred[left_mask]) if np.any(left_mask) else float("nan")
        rmse_right = rmse(y_test[~left_mask], pred[~left_mask]) if np.any(~left_mask) else float("nan")

        results.append(
            {
                "bi": bi,
                "pmin": float(pmin),
                "pmax": float(pmax),
                "split": int(split),
                "rmse": float(br_rmse),
                "r2": float(br_r2),
                "rmse_left": float(rmse_left),
                "rmse_right": float(rmse_right),
                "mL": mL,
                "mR": mR,
                "n": int(len(yb)),
            }
        )

        # accumulate overall holdout
        y_test_all.append(y_test)
        y_pred_all.append(pred)

        print(f"[Bracket {bi}] power [{pmin},{pmax}) n={len(yb)}")
        print(f"  best split: cutAngle < {split}")
        print(
            f"  RMSE={br_rmse:.4f}   R2={br_r2:.4f}   "
            f"RMSE_left={rmse_left:.4f}   RMSE_right={rmse_right:.4f}"
        )
        print()

    if results and y_test_all:
        yt = np.concatenate(y_test_all)
        yp = np.concatenate(y_pred_all)
        overall = {
            "r2": float(r2_score(yt, yp)),
            "rmse": float(rmse(yt, yp)),
            "mae": float(mean_absolute_error(yt, yp)),
        }
    else:
        overall = {"r2": 0.0, "rmse": 0.0, "mae": 0.0}

    js = build_js(
        results=results,
        input_filename=args.input.name,
        n_samples_total=int(X_all.shape[0]),
        poly_degree=POLY_DEGREE,
        clip_val=TARGET_CLIP,
        metrics=overall,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(js, encoding="utf-8")
    print(f"Wrote JS model to: {args.output.resolve()}")


if __name__ == "__main__":
    main()
