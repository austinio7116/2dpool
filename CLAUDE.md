# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

2D Pool is a browser-based pool/billiards game with 8-ball, 9-ball, and free play modes. It features realistic physics (Planck.js), spin mechanics, audio synthesis, and mobile/touch support.

## Running the Project

No build process required. Serve via HTTP for ES6 modules to work:

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

For physics testing:
```bash
node test-physics.js
```

## Architecture

### Core Game Loop (main.js → PoolGame class)
```
PoolGame (orchestrator)
  ├─ UI        → Menu/HUD (js/ui.js)
  ├─ Input     → Mouse/touch, aiming, spin (js/input.js)
  ├─ Game      → Rules & state machine (js/game.js)
  ├─ Table     → Geometry, pockets (js/table.js)
  ├─ Physics   → Planck.js wrapper (js/planck-physics.js)
  ├─ Renderer  → Canvas drawing (js/renderer.js)
  ├─ Cue       → Cue stick visuals (js/cue.js)
  └─ Audio     → Web Audio synthesis (js/audio.js)
```

### Game State Machine (game.js)
States: `MENU` → `PLAYING` → `BALLS_MOVING` → `BALL_IN_HAND` → `GAME_OVER`

### Physics System (planck-physics.js)
- Wraps Planck.js (Box2D port) - no gravity, collision-based
- Sync pattern: `syncBallsToPlanck()` → step world → `syncBallsFromPlanck()` → `applyPendingSpinEffects()`
- 8 substeps per frame for collision accuracy
- Pocket detection is custom (distance-based), not Planck

### Spin Mechanics
- Ball `angularVel`: x = sidespin, y = topspin/backspin
- Applied as Planck impulses at collision points
- Spin indicator shows hit point offset on cue ball face

## Key Patterns

- **ES6 Modules**: Named exports, no build step
- **Callback Architecture**: Classes expose `onGameStart`, `onStateChange`, etc. bound in main.js `bindCallbacks()`
- **Vec2 Utilities**: `Vec2.add()`, `Vec2.normalize()`, etc. in utils.js
- **Constants**: Centralized in utils.js

## Files by Task

| Task | Files |
|------|-------|
| Game rules | js/game.js |
| Physics behavior | js/planck-physics.js |
| UI/menus | js/ui.js + css/style.css |
| Input handling | js/input.js |
| Visuals | js/renderer.js |
| Sound effects | js/audio.js |
| Ball properties | js/ball.js |
| Table geometry | js/table.js + Constants in js/utils.js |

## Notes

- Two physics engines exist: `physics.js` (unused reference) and `planck-physics.js` (active)
- Mobile support uses `{ passive: false }` for touch events to allow preventDefault()
- Web Audio API requires user interaction before initialization
