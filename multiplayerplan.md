# AI Opponent Implementation Plan

## Overview
Add an AI opponent system for the pool game supporting 8-ball, 9-ball, UK 8-ball, and snooker modes. The AI plays as Player 2 with 3 difficulty levels (Easy, Medium, Hard). Who breaks is randomized.

## Architecture

### New File: `js/ai.js`
Core AI module with the following structure:

```
AI Class
├── Configuration
│   ├── difficulty (easy/medium/hard)
│   ├── thinkingDelay (500-1500ms based on difficulty)
│   └── errorMultiplier (0.15 easy, 0.06 medium, 0.02 hard)
│
├── Shot Finding
│   ├── findAllPossibleShots() - enumerate target+pocket combos
│   ├── calculateGhostBall() - aim point for pocketing
│   ├── isPathClear() - check for obstructions
│   └── checkPocketApproach() - validate pocket angle
│
├── Shot Scoring
│   ├── scoreShot() - composite difficulty score
│   ├── scoreCutAngle() - harder cuts = lower score
│   ├── scoreDistance() - longer = harder
│   └── scorePocketAngle() - tight angles = harder
│
├── Shot Selection
│   ├── selectBestShot() - pick from candidates
│   ├── selectSafetyShot() - defensive play
│   └── applyDifficultyFilter() - easy AI picks worse shots
│
├── Shot Execution
│   ├── calculateShotParams() - direction, power, spin
│   ├── applyAimError() - difficulty-based inaccuracy
│   └── executeShot() - trigger shot via callback
│
└── Game Mode Logic
    ├── getValidTargets8Ball() - solids/stripes rules
    ├── getValidTargets9Ball() - lowest ball first
    ├── getValidTargetsUK8Ball() - group1/group2
    └── getValidTargetsSnooker() - red/color alternation
```

### Ghost Ball Algorithm
To pocket ball T into pocket P:
1. Direction from T to P: `d = normalize(P - T)`
2. Ghost ball position: `G = T - d * (2 * ballRadius)`
3. Cue ball aims at G: `aimDir = normalize(G - cueBall)`
4. Check path cueBall→G is clear
5. Check path T→P is clear

### Shot Scoring (0-100 scale)
```
score = cutAngleScore * 0.35
      + distanceScore * 0.25
      + pocketAngleScore * 0.20
      + pathClearScore * 0.20

where:
- cutAngleScore = 100 - (cutAngle / 90) * 100
- distanceScore = 100 - (distance / maxTableDist) * 60
- pocketAngleScore = based on approach angle to pocket
- pathClearScore = 100 if clear, 0 if blocked
```

### Difficulty Levels

| Setting | Aim Error | Think Time | Shot Selection |
|---------|-----------|------------|----------------|
| Easy    | ±8°       | 1500ms     | Random from top 50% |
| Medium  | ±4°       | 1000ms     | Best of top 3 |
| Hard    | ±1.5°     | 600ms      | Always optimal |

### Power Calculation
- Base power from distance to ghost ball
- Adjust for:
  - Target ball distance to pocket
  - Desired cue ball position after
  - Hard shots may use spin for position

## Integration Points

### `js/game.js` Changes
- Add `aiEnabled` flag
- Add `randomizeBreak()` method
- Call AI on Player 2's turn

### `js/main.js` Changes
- Create AI instance
- Bind AI to game events
- Handle AI shot execution
- Add `onAITurn` callback

### `js/ui.js` Changes
- Add "vs AI" checkbox toggle in the game-mode-card
- Add difficulty dropdown (Easy/Medium/Hard) - shown when AI enabled
- Show "AI thinking..." indicator overlay during AI turn
- Store AI preferences (`aiEnabled`, `aiDifficulty`) in localStorage
- Add `getAIEnabled()` and `getAIDifficulty()` methods

### `index.html` Changes
Add inside `.game-mode-card` div (after match-format-row):
```html
<div class="ai-options-row">
    <label class="ai-toggle">
        <input type="checkbox" id="ai-enabled">
        <span>vs AI Opponent</span>
    </label>
    <select id="ai-difficulty" class="hidden">
        <option value="easy">Easy</option>
        <option value="medium" selected>Medium</option>
        <option value="hard">Hard</option>
    </select>
</div>
```

Add AI thinking indicator (after loading-overlay):
```html
<div id="ai-thinking" class="hidden">
    <div class="thinking-spinner"></div>
    <span>AI is thinking...</span>
</div>
```

## Files to Modify

| File | Changes |
|------|---------|
| `js/ai.js` | **NEW** - Core AI logic |
| `js/main.js` | AI instantiation, shot execution |
| `js/game.js` | AI flag, break randomization, turn hooks |
| `js/ui.js` | AI toggle, difficulty selector, thinking indicator |
| `css/style.css` | AI thinking indicator styles |
| `index.html` | AI UI elements |

## Implementation Order

1. **Phase 1: Core AI** (`js/ai.js`)
   - Shot geometry (ghost ball, path checking)
   - Basic 8-ball target selection
   - Shot scoring and selection
   - Aim error system

2. **Phase 2: Game Integration**
   - Add AI instance to main.js
   - Hook into game turn system
   - Random break selection
   - Execute AI shots

3. **Phase 3: UI**
   - AI toggle in menu
   - Difficulty selector
   - "Thinking..." indicator

4. **Phase 4: Game Modes**
   - 9-ball rules
   - UK 8-ball rules
   - Snooker rules (red/color targeting)

5. **Phase 5: Polish**
   - Safety play when no good shots
   - Position play consideration (Hard mode)
   - Spin usage for advanced shots

## Verification

### Manual Testing
1. Start 8-ball game with AI enabled
2. Verify break is randomly assigned
3. On AI turn, verify thinking delay
4. Verify AI makes legal shots
5. Test all 3 difficulty levels
6. Test each game mode

### Edge Cases
- AI ball-in-hand placement
- AI handles fouls appropriately
- AI plays 8-ball/black ball correctly
- Snooker color sequence followed
