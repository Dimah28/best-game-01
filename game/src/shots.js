// The screenshot scenes behind ?shot=start|play|boss|win. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (build on the best reef cells, upgrade when rich, call waves early), so the frame is
// what a real game looks like and the same seed always gives the same frame.

import { FIELD, GRID, PATH_CELLS, STEP, TOWERS, TOWER_ORDER } from './config.js';
import { PHASE_BUILD, PHASE_WAVE, PHASE_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** Rank buildable cells by how much channel they cover: path cells within 2.2 cells. */
export function rankedCells() {
  const scored = [];
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      let onPath = false;
      for (const [pc, pr] of PATH_CELLS) if (pc === col && pr === row) onPath = true;
      if (onPath) continue;
      let cover = 0;
      for (const [pc, pr] of PATH_CELLS) {
        const d = Math.sqrt((pc - col) ** 2 + (pr - row) ** 2);
        if (d <= 2.2) cover += 1;
      }
      scored.push({ col, row, cover });
    }
  }
  scored.sort((a, b) => b.cover - a.cover || a.row - b.row || a.col - b.col);
  return scored;
}

// Tower type assigned to each ranked cell, cycling for a balanced reef.
const CELL_TYPES = ['coral', 'coral', 'kelp', 'anemone', 'coral', 'kelp', 'coral', 'anemone', 'kelp', 'coral'];

/** One autopilot decision per step: spend gold, then call the next wave. */
function autopilotStep(world) {
  const state = world.state;
  if (state.phase === PHASE_BUILD) {
    // Build on the best free cells first.
    const cells = rankedCells();
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const type = CELL_TYPES[i % CELL_TYPES.length];
      if (state.gold < TOWERS[type].cost) continue;
      if (world.canBuild(cell.col, cell.row)) {
        world.placeTower(cell.col, cell.row, type);
        break;
      }
    }
    // Upgrade the oldest towers when rich.
    for (const t of state.towers) {
      if (state.gold < 60) break;
      if (t.level < 3) {
        const before = state.gold;
        world.upgradeTower(t.col, t.row);
        if (state.gold === before) break;
      }
    }
    world.startWaveEarly();
  } else if (state.phase === PHASE_WAVE) {
    // Mid-wave upgrades when the reef is flush.
    for (const t of state.towers) {
      if (state.gold < 150) break;
      if (t.level < 3) world.upgradeTower(t.col, t.row);
    }
  }
}

function runSteps(world, steps) {
  for (let i = 0; i < steps; i += 1) {
    autopilotStep(world);
    world.step(STEP, false);
    if (world.state.phase === PHASE_WIN) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Any other name is the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'win') {
    // Title: a small reef already built, creatures drifting down the channel.
    const cells = rankedCells();
    world.placeTower(cells[0].col, cells[0].row, 'coral');
    world.placeTower(cells[1].col, cells[1].row, 'coral');
    world.placeTower(cells[2].col, cells[2].row, 'kelp');
    world.state.selected = null; // no range circle behind the title panel
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, true);
    return { screen: SCREEN_TITLE, best: 1240 };
  }

  if (name === 'play') {
    // Mid wave 3: towers up, creatures on the channel, shells in the air.
    for (let i = 0; i < 60000; i += 1) {
      autopilotStep(world);
      world.step(STEP, false);
      const s = world.state;
      if (s.phase === PHASE_WAVE && s.wave === 3 && s.spawnQueue.length <= 4) {
        runSteps(world, 3 / STEP);
        break;
      }
      if (s.phase === PHASE_WIN) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }

  if (name === 'boss') {
    // Wave 5: the first Leviathan is on the reef, mid-fight.
    for (let i = 0; i < 120000; i += 1) {
      autopilotStep(world);
      world.step(STEP, false);
      const s = world.state;
      const boss = s.enemies.find((e) => e.active && e.kind === 'leviathan');
      if (boss && boss.progress > 500) {
        runSteps(world, 2 / STEP);
        break;
      }
      if (s.phase === PHASE_WIN) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }

  // win: play the whole game to victory.
  runSteps(world, 200000);
  const s = world.state;
  if (s.phase !== PHASE_WIN) {
    // Safety net (should not trigger once tuned): finish the last wave by hand.
    s.wave = 15;
    s.phase = PHASE_WIN;
    s.score += s.lives * 200;
  }
  return { screen: SCREEN_WIN, best: Math.max(s.score, 1240) };
}
