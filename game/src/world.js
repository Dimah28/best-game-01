// The game's rules and state, with no drawing and no browser in it: the reef grid, the
// tide channel, towers, creatures, projectiles, particles, gold, lives, waves and score.
// step() advances one fixed step and returns what happened as bit flags, so the caller
// can react (sounds, announcements) without the world knowing about screens. Nothing
// here allocates after createWorld returns, except the small wave queue built per wave.

import {
  EARLY_CALL_GOLD_PER_SEC, ENEMIES, FIELD, GRID, HP_GROWTH_PER_WAVE, INTERMISSION,
  MAX_TOWER_LEVEL, PATH_CELLS, POOL_ENEMIES, POOL_FLOATERS, POOL_PARTICLES,
  POOL_PROJECTILES, SELL_REFUND, START_GOLD, START_LIVES, TOTAL_WAVES, TOWERS,
  UPGRADE_COST, UPGRADE_DAMAGE, UPGRADE_RANGE, UPGRADE_RATE, WAYPOINTS,
} from './config.js';

export const EVENT_KILL = 1;
export const EVENT_LEAK = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_WAVE_START = 32;
export const EVENT_PLACE = 64;
export const EVENT_UPGRADE = 128;
export const EVENT_SELL = 256;
export const EVENT_SHOOT = 512;

export const PHASE_BUILD = 'build'; // between waves
export const PHASE_WAVE = 'wave'; // a wave is running
export const PHASE_OVER = 'over';
export const PHASE_WIN = 'win';

function cellKey(col, row) {
  return row * GRID.cols + col;
}

function isPathCell(col, row) {
  for (let i = 0; i < PATH_CELLS.length; i += 1) {
    if (PATH_CELLS[i][0] === col && PATH_CELLS[i][1] === row) return true;
  }
  return false;
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Wave composition: how many of each creature, in spawn order. Bosses ride waves 5, 10, 15. */
export function waveComposition(wave) {
  const list = [];
  const count = 5 + wave * 2;
  for (let i = 0; i < count; i += 1) {
    if (wave >= 3 && i % 5 === 4) list.push('crab');
    else if (wave >= 2 && i % 3 === 2) list.push('jelly');
    else list.push('minnow');
  }
  if (wave % 5 === 0) list.unshift('leviathan'); // the boss leads; its escort trails behind
  return list;
}

function spawnInterval(wave) {
  return Math.max(0.35, 0.9 - wave * 0.03);
}

function towerStats(type, level) {
  const base = TOWERS[type];
  const grown = level - 1;
  return {
    range: base.range * (UPGRADE_RANGE ** grown),
    damage: base.damage * (UPGRADE_DAMAGE ** grown),
    rate: base.rate * (UPGRADE_RATE ** grown),
    projectileSpeed: base.projectileSpeed,
    splash: base.splash,
    slowFactor: base.slowFactor,
    slowDuration: base.slowDuration,
  };
}

export function upgradeCost(type, level) {
  return Math.round(TOWERS[type].cost * UPGRADE_COST[level]);
}

export function createWorld(random) {
  // Decorations: fixed reef corals and rocks, placed once from the seed.
  const decor = [];
  for (let i = 0; i < 26; i += 1) {
    const col = Math.floor(random() * GRID.cols);
    const row = Math.floor(random() * GRID.rows);
    if (isPathCell(col, row)) continue;
    decor.push({
      x: col * GRID.cell + 12 + random() * 56,
      y: row * GRID.cell + 12 + random() * 56,
      size: 6 + random() * 14,
      kind: Math.floor(random() * 3),
      hue: random(),
    });
  }

  const towers = [];
  const enemies = [];
  for (let i = 0; i < POOL_ENEMIES; i += 1) {
    enemies.push({
      active: false, kind: 'minnow', x: 0, y: 0, hp: 0, maxHp: 0, speed: 0,
      waypoint: 0, slowUntil: 0, slowFactor: 1, radius: 12, bounty: 0, damage: 1,
      wobble: 0, wobblePhase: 0, flash: 0, progress: 0,
    });
  }
  const projectiles = [];
  for (let i = 0; i < POOL_PROJECTILES; i += 1) {
    projectiles.push({ active: false, x: 0, y: 0, target: null, speed: 0, damage: 0, splash: 0, slowFactor: 1, slowDuration: 0, kind: 'coral', vx: 0, vy: 0 });
  }
  const particles = [];
  for (let i = 0; i < POOL_PARTICLES; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '#fff', ring: false });
  }
  const floaters = [];
  for (let i = 0; i < POOL_FLOATERS; i += 1) {
    floaters.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffd94d' });
  }

  const state = {
    gold: START_GOLD, lives: START_LIVES, score: 0,
    wave: 0, phase: PHASE_BUILD, intermission: INTERMISSION,
    kills: 0, leaked: 0, earned: 0, towersBuilt: 0,
    spawnQueue: [], spawnTimer: 0, elapsed: 0,
    selected: null, // {col,row} of the selected tower, or null
    buildType: 'coral',
    towers, enemies, projectiles, particles, floaters, decor,
  };

  let towerId = 0;

  function reset() {
    state.gold = START_GOLD;
    state.lives = START_LIVES;
    state.score = 0;
    state.wave = 0;
    state.phase = PHASE_BUILD;
    state.intermission = INTERMISSION;
    state.kills = 0;
    state.leaked = 0;
    state.earned = 0;
    state.towersBuilt = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.elapsed = 0;
    state.selected = null;
    state.buildType = 'coral';
    towers.length = 0;
    for (const e of enemies) e.active = false;
    for (const p of projectiles) p.active = false;
    for (const p of particles) p.active = false;
    for (const f of floaters) f.active = false;
    towerId = 0;
  }

  function towerAt(col, row) {
    for (let i = 0; i < towers.length; i += 1) {
      if (towers[i].col === col && towers[i].row === row) return towers[i];
    }
    return null;
  }

  function canBuild(col, row) {
    if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return false;
    if (isPathCell(col, row)) return false;
    return towerAt(col, row) === null;
  }

  function freeEnemy() {
    for (let i = 0; i < enemies.length; i += 1) if (!enemies[i].active) return enemies[i];
    return null;
  }

  function freeProjectile() {
    for (let i = 0; i < projectiles.length; i += 1) if (!projectiles[i].active) return projectiles[i];
    return null;
  }

  function spawnParticle(x, y, vx, vy, life, size, color, ring) {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (p.active) continue;
      p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.maxLife = life; p.size = size; p.color = color; p.ring = ring;
      return;
    }
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2;
      const s = speed * (0.4 + random() * 0.8);
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + random() * 0.35, 2 + random() * 3, color, false);
    }
  }

  function floater(x, y, text, color) {
    for (let i = 0; i < floaters.length; i += 1) {
      const f = floaters[i];
      if (f.active) continue;
      f.active = true; f.x = x; f.y = y; f.life = 1; f.text = text; f.color = color;
      return;
    }
  }

  function placeTower(col, row, type) {
    if (!canBuild(col, row)) return 0;
    const def = TOWERS[type];
    if (!def || state.gold < def.cost) return 0;
    state.gold -= def.cost;
    const stats = towerStats(type, 1);
    towers.push({
      id: towerId, col, row, type, level: 1, invested: def.cost,
      x: col * GRID.cell + GRID.cell / 2, y: row * GRID.cell + GRID.cell / 2,
      cooldown: 0, angle: -Math.PI / 2, ...stats,
    });
    towerId += 1;
    state.towersBuilt += 1;
    state.selected = { col, row };
    burst(towers[towers.length - 1].x, towers[towers.length - 1].y, def.color, 10, 90);
    return EVENT_PLACE;
  }

  function upgradeTower(col, row) {
    const t = towerAt(col, row);
    if (!t || t.level >= MAX_TOWER_LEVEL) return 0;
    const cost = upgradeCost(t.type, t.level + 1);
    if (state.gold < cost) return 0;
    state.gold -= cost;
    t.invested += cost;
    t.level += 1;
    const stats = towerStats(t.type, t.level);
    Object.assign(t, stats);
    burst(t.x, t.y, '#ffd94d', 14, 120);
    floater(t.x, t.y - 30, `Lv ${t.level}!`, '#ffd94d');
    return EVENT_UPGRADE;
  }

  function sellTower(col, row) {
    const t = towerAt(col, row);
    if (!t) return 0;
    const refund = Math.round(t.invested * SELL_REFUND);
    state.gold += refund;
    towers.splice(towers.indexOf(t), 1);
    if (state.selected && state.selected.col === col && state.selected.row === row) state.selected = null;
    floater(t.x, t.y - 20, `+${refund}g`, '#ffd94d');
    return EVENT_SELL;
  }

  function startWave() {
    if (state.phase !== PHASE_BUILD) return 0;
    state.wave += 1;
    state.spawnQueue = waveComposition(state.wave);
    state.spawnTimer = 0.4;
    state.phase = PHASE_WAVE;
    state.selected = null;
    return EVENT_WAVE_START;
  }

  /** Start the next wave now, banking the leftover intermission as bonus gold. */
  function startWaveEarly() {
    if (state.phase !== PHASE_BUILD) return 0;
    const bonus = Math.round(state.intermission * EARLY_CALL_GOLD_PER_SEC);
    state.gold += bonus;
    state.earned += bonus;
    const ev = startWave();
    if (bonus > 0) floater(FIELD.width / 2, 120, `Early call +${bonus}g`, '#ffd94d');
    return ev;
  }

  function spawnEnemy(kind) {
    const e = freeEnemy();
    if (!e) return;
    const def = ENEMIES[kind];
    const hpScale = 1 + HP_GROWTH_PER_WAVE * (state.wave - 1);
    e.active = true;
    e.kind = kind;
    e.x = WAYPOINTS[0][0];
    e.y = WAYPOINTS[0][1];
    e.maxHp = Math.round(def.hp * hpScale);
    e.hp = e.maxHp;
    e.speed = def.speed * (0.92 + random() * 0.16);
    e.waypoint = 1;
    e.slowUntil = 0;
    e.slowFactor = 1;
    e.radius = def.radius;
    e.bounty = def.bounty;
    e.damage = def.damage;
    e.wobble = 0;
    e.wobblePhase = random() * Math.PI * 2;
    e.flash = 0;
    e.progress = 0;
  }

  function killEnemy(e, events) {
    e.active = false;
    state.kills += 1;
    state.gold += e.bounty;
    state.earned += e.bounty;
    state.score += e.bounty * 10;
    burst(e.x, e.y, ENEMIES[e.kind].color, e.kind === 'leviathan' ? 26 : 10, e.kind === 'leviathan' ? 200 : 110);
    floater(e.x, e.y - 18, `+${e.bounty}g`, '#ffd94d');
    return events | EVENT_KILL;
  }

  function leakEnemy(e, events) {
    e.active = false;
    state.lives -= e.damage;
    state.leaked += 1;
    burst(e.x, e.y, '#ff6b6b', 12, 130);
    floater(e.x - 10, e.y - 18, `-${e.damage} ❤`, '#ff6b6b');
    if (state.lives <= 0) {
      state.lives = 0;
      state.phase = PHASE_OVER;
      return events | EVENT_LEAK | EVENT_OVER;
    }
    return events | EVENT_LEAK;
  }

  function fireTower(t, target) {
    const p = freeProjectile();
    if (!p) return false;
    p.active = true;
    p.x = t.x;
    p.y = t.y;
    p.target = target;
    p.speed = t.projectileSpeed;
    p.damage = t.damage;
    p.splash = t.splash;
    p.slowFactor = t.slowFactor;
    p.slowDuration = t.slowDuration;
    p.kind = t.type;
    p.vx = 0;
    p.vy = 0;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    return true;
  }

  function damageEnemy(e, damage, slowFactor, slowDuration, events) {
    e.hp -= damage;
    e.flash = 0.12;
    if (slowDuration > 0) {
      e.slowFactor = Math.min(e.slowFactor, slowFactor);
      e.slowUntil = Math.max(e.slowUntil, state.elapsed + slowDuration);
    }
    if (e.hp <= 0 && e.active) return killEnemy(e, events);
    return events;
  }

  function stepEnemies(dt, events) {
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      if (state.elapsed > e.slowUntil) e.slowFactor = 1;
      const wp = WAYPOINTS[e.waypoint];
      const dx = wp[0] - e.x;
      const dy = wp[1] - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const speed = e.speed * e.slowFactor;
      const move = speed * dt;
      e.wobble += dt * 6;
      if (d <= move) {
        e.x = wp[0];
        e.y = wp[1];
        e.waypoint += 1;
        if (e.waypoint >= WAYPOINTS.length) {
          events = leakEnemy(e, events);
          if (events & EVENT_OVER) return events;
        }
      } else {
        e.x += (dx / d) * move;
        e.y += (dy / d) * move;
        e.progress += move;
      }
    }
    return events;
  }

  function stepTowers(dt, events) {
    for (let i = 0; i < towers.length; i += 1) {
      const t = towers[i];
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      // First targeting: the creature furthest along the channel (most ground covered).
      let best = null;
      let bestScore = -1;
      for (let j = 0; j < enemies.length; j += 1) {
        const e = enemies[j];
        if (!e.active) continue;
        const d = dist(t.x, t.y, e.x, e.y);
        if (d > t.range + e.radius) continue;
        if (e.progress > bestScore) {
          bestScore = e.progress;
          best = e;
        }
      }
      if (best) {
        if (fireTower(t, best)) {
          t.cooldown = 1 / t.rate;
          events |= EVENT_SHOOT;
        }
      }
    }
    return events;
  }

  function stepProjectiles(dt, events) {
    for (let i = 0; i < projectiles.length; i += 1) {
      const p = projectiles[i];
      if (!p.active) continue;
      const target = p.target;
      if (!target || !target.active) {
        p.active = false;
        continue;
      }
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const move = p.speed * dt;
      if (d <= move + target.radius * 0.5) {
        p.active = false;
        if (p.splash > 0) {
          spawnParticle(target.x, target.y, 0, 0, 0.3, p.splash, '#c99aff', true);
          for (let j = 0; j < enemies.length; j += 1) {
            const e = enemies[j];
            if (!e.active) continue;
            if (dist(target.x, target.y, e.x, e.y) <= p.splash + e.radius) {
              events = damageEnemy(e, p.damage, p.slowFactor, p.slowDuration, events);
            }
          }
        } else {
          spawnParticle(target.x, target.y, 0, 0, 0.15, 5, '#ffffff', true);
          events = damageEnemy(target, p.damage, p.slowFactor, p.slowDuration, events);
        }
      } else {
        p.x += (dx / d) * move;
        p.y += (dy / d) * move;
      }
    }
    return events;
  }

  function stepParticles(dt) {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    for (let i = 0; i < floaters.length; i += 1) {
      const f = floaters[i];
      if (!f.active) continue;
      f.life -= dt * 0.9;
      f.y -= 34 * dt;
      if (f.life <= 0) f.active = false;
    }
  }

  function anyEnemyActive() {
    for (let i = 0; i < enemies.length; i += 1) if (enemies[i].active) return true;
    return false;
  }

  /**
   * One fixed step. `harmless` is the title screen's backdrop: creatures drift along the
   * channel but nothing leaks, scores or dies.
   */
  function step(dt, harmless) {
    let events = 0;
    state.elapsed += dt;

    if (harmless) {
      // Title backdrop: a gentle wave 1 drift with no towers firing and no scoring.
      if (state.spawnQueue.length === 0 && !anyEnemyActive()) {
        state.wave = 1;
        state.spawnQueue = waveComposition(1);
        state.spawnTimer = 0.2;
      }
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnEnemy(state.spawnQueue.shift());
          state.spawnTimer += spawnInterval(1);
        }
      }
      // Drift without damage: move, and recycle leakers back to the start.
      for (let i = 0; i < enemies.length; i += 1) {
        const e = enemies[i];
        if (!e.active) continue;
        const wp = WAYPOINTS[e.waypoint];
        const dx = wp[0] - e.x;
        const dy = wp[1] - e.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const move = e.speed * dt;
        e.wobble += dt * 6;
        if (d <= move) {
          e.x = wp[0];
          e.y = wp[1];
          e.waypoint += 1;
          if (e.waypoint >= WAYPOINTS.length) e.active = false;
        } else {
          e.x += (dx / d) * move;
          e.y += (dy / d) * move;
        }
      }
      stepParticles(dt);
      return 0;
    }

    if (state.phase === PHASE_BUILD) {
      state.intermission -= dt;
      if (state.intermission <= 0) {
        events |= startWave();
      }
    } else if (state.phase === PHASE_WAVE) {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnEnemy(state.spawnQueue.shift());
          state.spawnTimer += spawnInterval(state.wave);
        }
      }
      events = stepTowers(dt, events);
      events = stepProjectiles(dt, events);
      events = stepEnemies(dt, events);
      if (events & EVENT_OVER) {
        stepParticles(dt);
        return events;
      }
      if (state.spawnQueue.length === 0 && !anyEnemyActive()) {
        // Wave cleared: bonus gold and points, then a breather before the next wave.
        const bonus = 25 + state.wave * 5;
        state.gold += bonus;
        state.earned += bonus;
        state.score += state.wave * 150;
        floater(FIELD.width / 2, 110, `Wave ${state.wave} clear! +${bonus}g`, '#7fe08a');
        events |= EVENT_WAVE_CLEAR;
        if (state.wave >= TOTAL_WAVES) {
          state.phase = PHASE_WIN;
          state.score += state.lives * 200;
          return events | EVENT_WIN;
        }
        state.phase = PHASE_BUILD;
        state.intermission = INTERMISSION;
      }
    }
    stepParticles(dt);
    return events;
  }

  reset();
  return {
    state, reset, step, placeTower, upgradeTower, sellTower,
    startWave, startWaveEarly, towerAt, canBuild, waveComposition,
  };
}
