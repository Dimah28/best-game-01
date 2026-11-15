// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Canvas shapes and text only — no images, no network. Text that holds a number
// is rebuilt only when the number changes, so a frame allocates nothing.

import {
  ENEMIES, FIELD, FONT, GRID, MAX_TOWER_LEVEL, PALETTE, PATH_CELLS, TOTAL_WAVES,
  TOWERS, TOWER_ORDER, UPGRADE_COST,
} from './config.js';
import { PHASE_BUILD, PHASE_OVER, PHASE_WAVE, PHASE_WIN, upgradeCost } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Bottom build bar and right info panel, in field coordinates. */
export const BUILD_BAR = { x: 200, y: 636, width: 880, height: 76 };
export const INFO_PANEL = { x: 1000, y: 70, width: 260, height: 240 };
const HUD_HEIGHT = 56;

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const goldLabel = cachedLabel('◉ ');
  const livesLabel = cachedLabel('♥ ');
  const waveLabel = cachedLabel('Wave ');
  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const finalLabel = cachedLabel('Score ');
  const waveBestLabel = cachedLabel('Best ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size + 1000)) fonts.set(size + 1000, `${size}px ${FONT}`);
    context.font = fonts.get(size + 1000);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function isPath(col, row) {
    for (let i = 0; i < PATH_CELLS.length; i += 1) {
      if (PATH_CELLS[i][0] === col && PATH_CELLS[i][1] === row) return true;
    }
    return false;
  }

  function drawWater(time) {
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.waterLight);
    grad.addColorStop(0.5, PALETTE.water);
    grad.addColorStop(1, PALETTE.waterDeep);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Drifting light shafts.
    context.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 5; i += 1) {
      const x = ((i * 317 + time * 12) % 1500) - 100;
      context.save();
      context.translate(x, 0);
      context.rotate(0.25);
      context.fillRect(0, -40, 46, 800);
      context.restore();
    }
    // Rising bubbles.
    context.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 14; i += 1) {
      const bx = (i * 97 + 40) % FIELD.width;
      const by = FIELD.height - ((time * (18 + i * 2) + i * 53) % (FIELD.height + 40));
      context.beginPath();
      context.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawChannel() {
    // Sandy channel along the path cells, with a darker rim.
    context.fillStyle = PALETTE.sandDark;
    for (const [col, row] of PATH_CELLS) {
      context.fillRect(col * GRID.cell - 2, row * GRID.cell - 2, GRID.cell + 4, GRID.cell + 4);
    }
    context.fillStyle = PALETTE.sand;
    for (const [col, row] of PATH_CELLS) {
      context.fillRect(col * GRID.cell + 2, row * GRID.cell + 2, GRID.cell - 4, GRID.cell - 4);
    }
    // Channel flow dashes, darker sand.
    context.fillStyle = 'rgba(120,90,40,0.5)';
    for (const [col, row] of PATH_CELLS) {
      context.fillRect(col * GRID.cell + 14, row * GRID.cell + GRID.cell / 2 - 2, 18, 4);
      context.fillRect(col * GRID.cell + 48, row * GRID.cell + GRID.cell / 2 - 2, 18, 4);
    }
  }

  function drawDecor(decor) {
    for (const d of decor) {
      const sway = Math.sin(d.hue * 9) * 2;
      if (d.kind === 0) {
        // Pink coral sprig.
        context.strokeStyle = d.hue > 0.5 ? PALETTE.coralPink : PALETTE.coralOrange;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(d.x, d.y);
        context.lineTo(d.x - d.size * 0.4 + sway, d.y - d.size);
        context.moveTo(d.x, d.y);
        context.lineTo(d.x + sway, d.y - d.size * 1.2);
        context.moveTo(d.x, d.y);
        context.lineTo(d.x + d.size * 0.4 + sway, d.y - d.size * 0.8);
        context.stroke();
      } else if (d.kind === 1) {
        // Green reef tuft.
        context.strokeStyle = PALETTE.reefLight;
        context.lineWidth = 2.5;
        context.beginPath();
        for (let k = -1; k <= 1; k += 1) {
          context.moveTo(d.x + k * 5, d.y);
          context.quadraticCurveTo(d.x + k * 7 + sway, d.y - d.size * 0.6, d.x + k * 9 + sway, d.y - d.size);
        }
        context.stroke();
      } else {
        // Rock.
        context.fillStyle = '#3a4a58';
        context.beginPath();
        context.ellipse(d.x, d.y, d.size * 0.7, d.size * 0.45, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawTowerBase(t) {
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(t.x, t.y + 22, 30, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#274b63';
    context.beginPath();
    context.arc(t.x, t.y, 27, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#35647f';
    context.beginPath();
    context.arc(t.x, t.y, 22, 0, Math.PI * 2);
    context.fill();
  }

  function drawTower(t, time) {
    drawTowerBase(t);
    const def = TOWERS[t.type];
    const cx = t.x;
    const cy = t.y;
    if (t.type === 'coral') {
      // Branching coral + dart barrel aimed at the last target.
      context.strokeStyle = def.color;
      context.lineWidth = 5;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(cx, cy + 8);
      context.lineTo(cx - 10, cy - 12);
      context.moveTo(cx, cy + 8);
      context.lineTo(cx, cy - 18);
      context.moveTo(cx, cy + 8);
      context.lineTo(cx + 10, cy - 12);
      context.stroke();
      context.save();
      context.translate(cx, cy - 4);
      context.rotate(t.angle);
      context.fillStyle = def.dark;
      context.fillRect(0, -3.5, 24, 7);
      context.fillStyle = def.color;
      context.beginPath();
      context.arc(24, 0, 4, 0, Math.PI * 2);
      context.fill();
      context.restore();
    } else if (t.type === 'kelp') {
      // Swaying frost fronds + glowing bulb.
      context.strokeStyle = def.color;
      context.lineWidth = 4;
      context.lineCap = 'round';
      for (let k = -1; k <= 1; k += 1) {
        const sway = Math.sin(time * 2.4 + k * 1.3 + t.id) * 6;
        context.beginPath();
        context.moveTo(cx + k * 9, cy + 10);
        context.quadraticCurveTo(cx + k * 11 + sway, cy - 8, cx + k * 13 + sway, cy - 22);
        context.stroke();
      }
      context.fillStyle = '#e8fbff';
      context.beginPath();
      context.arc(cx, cy - 2, 6 + Math.sin(time * 3 + t.id) * 1.2, 0, Math.PI * 2);
      context.fill();
    } else {
      // Anemone dome + tentacle ring + shell barrel.
      context.fillStyle = def.dark;
      context.beginPath();
      context.arc(cx, cy + 2, 17, Math.PI, 0);
      context.fill();
      context.fillStyle = def.color;
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2 + time * 0.4;
        context.beginPath();
        context.arc(cx + Math.cos(a) * 17, cy + Math.sin(a) * 8, 3.2, 0, Math.PI * 2);
        context.fill();
      }
      context.save();
      context.translate(cx, cy);
      context.rotate(t.angle);
      context.fillStyle = '#efe6ff';
      context.fillRect(0, -4.5, 26, 9);
      context.fillStyle = def.color;
      context.beginPath();
      context.arc(26, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    // Level pips.
    for (let l = 0; l < MAX_TOWER_LEVEL; l += 1) {
      context.fillStyle = l < t.level ? PALETTE.gold : 'rgba(255,255,255,0.25)';
      context.beginPath();
      context.arc(cx - 12 + l * 12, cy + 30, 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawEnemy(e, time) {
    const def = ENEMIES[e.kind];
    const wob = Math.sin(e.wobble + e.wobblePhase) * 3;
    const x = e.x;
    const y = e.y + wob * 0.4;
    context.save();
    context.translate(x, y);
    if (e.kind === 'minnow') {
      context.rotate(Math.sin(e.wobble + e.wobblePhase) * 0.12);
      context.fillStyle = def.dark;
      context.beginPath();
      context.moveTo(-e.radius, 0);
      context.lineTo(-e.radius - 10, -8);
      context.lineTo(-e.radius - 10, 8);
      context.closePath();
      context.fill();
      context.fillStyle = e.flash > 0 ? '#ffffff' : def.color;
      context.beginPath();
      context.ellipse(0, 0, e.radius, e.radius * 0.62, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#10202e';
      context.beginPath();
      context.arc(e.radius * 0.55, -2, 2.4, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'jelly') {
      const pulse = 1 + Math.sin(time * 4 + e.wobblePhase) * 0.08;
      context.scale(pulse, 1 / pulse);
      context.fillStyle = e.flash > 0 ? '#ffffff' : def.color;
      context.beginPath();
      context.arc(0, 0, e.radius, Math.PI, 0);
      context.closePath();
      context.fill();
      context.strokeStyle = def.dark;
      context.lineWidth = 2;
      for (let k = -2; k <= 2; k += 1) {
        context.beginPath();
        context.moveTo(k * 5, e.radius * 0.4);
        context.quadraticCurveTo(k * 5 + wob, e.radius * 1.1, k * 6 + wob * 1.4, e.radius * 1.7);
        context.stroke();
      }
      context.fillStyle = '#10202e';
      context.beginPath();
      context.arc(-4, -2, 2, 0, Math.PI * 2);
      context.arc(4, -2, 2, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'crab') {
      context.fillStyle = def.dark;
      context.beginPath();
      context.arc(-e.radius - 4, -6, 6, 0, Math.PI * 2);
      context.arc(e.radius + 4, -6, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = e.flash > 0 ? '#ffffff' : def.color;
      context.beginPath();
      context.ellipse(0, 0, e.radius, e.radius * 0.72, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = def.dark;
      context.lineWidth = 2;
      for (let k = -1; k <= 1; k += 1) {
        context.beginPath();
        context.moveTo(-e.radius * 0.6 + k * 8, e.radius * 0.5);
        context.lineTo(-e.radius * 0.7 + k * 8, e.radius * 1.05);
        context.stroke();
      }
      context.fillStyle = '#10202e';
      context.beginPath();
      context.arc(-5, -e.radius * 0.55, 2.2, 0, Math.PI * 2);
      context.arc(5, -e.radius * 0.55, 2.2, 0, Math.PI * 2);
      context.fill();
    } else {
      // Leviathan: big serpent-fish with dorsal spikes.
      context.fillStyle = def.dark;
      context.beginPath();
      context.moveTo(-e.radius - 4, 0);
      context.lineTo(-e.radius - 26, -14);
      context.lineTo(-e.radius - 26, 14);
      context.closePath();
      context.fill();
      for (let k = 0; k < 3; k += 1) {
        context.beginPath();
        context.moveTo(-e.radius * 0.5 + k * 16, -e.radius * 0.7);
        context.lineTo(-e.radius * 0.5 + k * 16 + 7, -e.radius * 1.15);
        context.lineTo(-e.radius * 0.5 + k * 16 + 14, -e.radius * 0.7);
        context.closePath();
        context.fill();
      }
      context.fillStyle = e.flash > 0 ? '#ffffff' : def.color;
      context.beginPath();
      context.ellipse(0, 0, e.radius, e.radius * 0.58, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(e.radius * 0.6, -3, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#10202e';
      context.beginPath();
      context.arc(e.radius * 0.62, -3, 2.4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      for (let k = 0; k < 3; k += 1) {
        context.beginPath();
        context.moveTo(e.radius * 0.86 - k * 6, e.radius * 0.42);
        context.lineTo(e.radius * 0.86 - k * 6 - 3, e.radius * 0.62);
        context.lineTo(e.radius * 0.86 - k * 6 + 3, e.radius * 0.62);
        context.closePath();
        context.fill();
      }
    }
    context.restore();
    // Slow tint.
    if (e.slowFactor < 1) {
      context.fillStyle = 'rgba(127,227,255,0.35)';
      context.beginPath();
      context.arc(x, y, e.radius + 3, 0, Math.PI * 2);
      context.fill();
    }
    // Health bar (skip when full).
    if (e.hp < e.maxHp) {
      const w = e.radius * 2;
      const bx = x - w / 2;
      const by = y - e.radius - 12;
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(bx - 1, by - 1, w + 2, 6);
      context.fillStyle = e.hp / e.maxHp > 0.5 ? PALETTE.green : e.hp / e.maxHp > 0.25 ? PALETTE.gold : PALETTE.red;
      context.fillRect(bx, by, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawProjectiles(projectiles) {
    for (const p of projectiles) {
      if (!p.active) continue;
      const color = p.kind === 'anemone' ? '#e6d4ff' : p.kind === 'kelp' ? '#bfefff' : '#ffd0c2';
      context.fillStyle = color;
      context.beginPath();
      context.arc(p.x, p.y, p.kind === 'anemone' ? 6 : 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.beginPath();
      context.arc(p.x, p.y, p.kind === 'anemone' ? 3 : 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(particles) {
    for (const p of particles) {
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      if (p.ring) {
        context.strokeStyle = p.color;
        context.globalAlpha = alpha * 0.8;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(p.x, p.y, p.size * (1.6 - alpha * 0.6), 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
      } else {
        context.globalAlpha = alpha;
        context.fillStyle = p.color;
        context.beginPath();
        context.arc(p.x, p.y, p.size * alpha + 0.5, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
  }

  function drawFloaters(floaters) {
    for (const f of floaters) {
      if (!f.active) continue;
      context.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
      text(f.text, f.x, f.y, 18, f.color, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawRange(state) {
    if (!state.selected) return;
    let tower = null;
    for (const t of state.towers) {
      if (t.col === state.selected.col && t.row === state.selected.row) tower = t;
    }
    if (!tower) return;
    context.fillStyle = 'rgba(255,255,255,0.06)';
    context.strokeStyle = 'rgba(255,255,255,0.45)';
    context.setLineDash([8, 6]);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.setLineDash([]);
    // Highlight the selected cell.
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 3;
    context.strokeRect(tower.col * GRID.cell + 3, tower.row * GRID.cell + 3, GRID.cell - 6, GRID.cell - 6);
  }

  function drawHud(state, best, muted) {
    context.fillStyle = 'rgba(6,18,31,0.82)';
    context.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, HUD_HEIGHT - 2, FIELD.width, 2);
    text(goldLabel(state.gold), 24, 36, 26, PALETTE.gold, 'left');
    text(livesLabel(state.lives), 190, 36, 26, state.lives <= 5 ? PALETTE.red : PALETTE.green, 'left');
    text(waveLabel(state.wave > 0 ? `${state.wave}/${TOTAL_WAVES}` : `0/${TOTAL_WAVES}`), 330, 36, 26, PALETTE.text, 'left');
    text(scoreLabel(state.score), 520, 36, 26, PALETTE.text, 'left');
    text(bestLabel(best), 760, 36, 22, PALETTE.muted, 'left');
    const remaining = state.spawnQueue.length + state.enemies.reduce((n, e) => n + (e.active ? 1 : 0), 0);
    if (state.phase === PHASE_WAVE) {
      plainText(`Enemies left: ${remaining}`, 920, 36, 18, PALETTE.muted, 'left');
    } else if (state.phase === PHASE_BUILD && state.wave < TOTAL_WAVES) {
      plainText(`Next wave in ${Math.max(0, Math.ceil(state.intermission))}s — press W to start early`, 920, 36, 18, PALETTE.gold, 'left');
    }
    if (state.phase === PHASE_WAVE) {
      if (muted) plainText('Muted (M)', 1220, 36, 18, PALETTE.muted, 'right');
      else plainText('M: mute · P: pause', 1220, 36, 18, PALETTE.muted, 'right');
    }
  }

  function drawBuildBar(state) {
    const bar = BUILD_BAR;
    context.fillStyle = PALETTE.panel;
    roundRect(bar.x, bar.y, bar.width, bar.height, 12);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(bar.x, bar.y, bar.width, bar.height, 12);
    context.stroke();
    const cardW = bar.width / 3;
    for (let i = 0; i < TOWER_ORDER.length; i += 1) {
      const key = TOWER_ORDER[i];
      const def = TOWERS[key];
      const cx = bar.x + i * cardW;
      const selected = state.buildType === key;
      const afford = state.gold >= def.cost;
      if (selected) {
        context.fillStyle = 'rgba(255,217,77,0.16)';
        roundRect(cx + 6, bar.y + 6, cardW - 12, bar.height - 12, 8);
        context.fill();
      }
      context.fillStyle = def.color;
      context.beginPath();
      context.arc(cx + 30, bar.y + bar.height / 2, 13, 0, Math.PI * 2);
      context.fill();
      text(def.name, cx + 52, bar.y + 30, 19, afford ? PALETTE.text : PALETTE.muted, 'left');
      plainText(`◉ ${def.cost}  ·  [${def.hotkey}]  ·  ${def.desc}`, cx + 52, bar.y + 54, 15, afford ? PALETTE.muted : '#7a6a55', 'left');
    }
  }

  function drawInfoPanel(state) {
    if (!state.selected) return;
    let tower = null;
    for (const t of state.towers) {
      if (t.col === state.selected.col && t.row === state.selected.row) tower = t;
    }
    if (!tower) return;
    const panel = INFO_PANEL;
    const def = TOWERS[tower.type];
    context.fillStyle = PALETTE.panel;
    roundRect(panel.x, panel.y, panel.width, panel.height, 12);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(panel.x, panel.y, panel.width, panel.height, 12);
    context.stroke();
    text(def.name, panel.x + 18, panel.y + 34, 22, PALETTE.text, 'left');
    plainText(`Level ${tower.level} / ${MAX_TOWER_LEVEL}`, panel.x + 18, panel.y + 60, 16, PALETTE.muted, 'left');
    plainText(`Damage ${Math.round(tower.damage * 10) / 10}  ·  Rate ${Math.round(tower.rate * 10) / 10}/s`, panel.x + 18, panel.y + 86, 16, PALETTE.text, 'left');
    plainText(`Range ${Math.round(tower.range)}${tower.splash ? `  ·  Splash ${tower.splash}` : ''}${tower.slowDuration ? '  ·  Slows' : ''}`, panel.x + 18, panel.y + 110, 16, PALETTE.text, 'left');
    plainText(`Invested ◉ ${tower.invested}`, panel.x + 18, panel.y + 134, 16, PALETTE.muted, 'left');
    // Upgrade button.
    const upY = panel.y + 150;
    if (tower.level < MAX_TOWER_LEVEL) {
      const cost = upgradeCost(tower.type, tower.level + 1);
      const afford = state.gold >= cost;
      context.fillStyle = afford ? '#2f7d4f' : '#3a4a58';
      roundRect(panel.x + 18, upY, panel.width - 36, 34, 8);
      context.fill();
      text(`Upgrade → Lv ${tower.level + 1}  ◉ ${cost}  [U]`, panel.x + panel.width / 2, upY + 23, 16, afford ? '#ffffff' : PALETTE.muted, 'center');
    } else {
      plainText('Max level reached', panel.x + panel.width / 2, upY + 22, 16, PALETTE.gold, 'center');
    }
    const sellY = panel.y + 192;
    const refund = Math.round(tower.invested * 0.7);
    context.fillStyle = '#7d3a2f';
    roundRect(panel.x + 18, sellY, panel.width - 36, 34, 8);
    context.fill();
    text(`Sell for ◉ ${refund}  [X]`, panel.x + panel.width / 2, sellY + 23, 16, '#ffffff', 'center');
  }

  function drawBanner(banner) {
    if (!banner || banner.alpha <= 0) return;
    context.globalAlpha = Math.min(1, banner.alpha);
    text(banner.text, FIELD.width / 2, 300, 64, '#ffffff', 'center');
    if (banner.sub) plainText(banner.sub, FIELD.width / 2, 340, 22, PALETTE.gold, 'center');
    context.globalAlpha = 1;
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34 + 60;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(6,18,31,0.88)';
    roundRect(x, y, width, height, 16);
    context.fill();
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(x, y, width, height, 16);
    context.stroke();
    text(title, FIELD.width / 2, y + 74, 46, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      plainText(lines[i], FIELD.width / 2, y + 122 + i * 34, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.gold, 'center');
  }

  /** Paint one frame: the reef, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, extra) {
    const opts = extra || {};
    const time = opts.time || 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawWater(time);
    drawChannel();
    drawDecor(state.decor);
    for (const t of state.towers) drawTower(t, time);
    for (const e of state.enemies) if (e.active) drawEnemy(e, time);
    drawProjectiles(state.projectiles);
    drawParticles(state.particles);
    drawRange(state);
    drawFloaters(state.floaters);
    if (screen === SCREEN_TITLE) {
      drawPanel('TIDEKEEPER', [
        'The tide is coming. Hold the reef for 15 waves.',
        'Build towers on the reef — 1 Coral, 2 Frost Kelp, 3 Cannon.',
        'Click a tower to upgrade it or sell it. Leaks cost lives.',
        'Boss Leviathans ride waves 5, 10 and 15. Good luck, Keeper.',
        best > 0 ? `Best score: ${best}` : 'No keeper has held the reef yet.',
      ], 'Press Space or click to start', PALETTE.gold);
      return;
    }
    drawHud(state, best, opts.muted);
    drawBuildBar(state);
    drawInfoPanel(state);
    drawBanner(opts.banner);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The tide waits for no keeper — except now.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('The Reef Falls', [
        `Score ${state.score}   ·   Best ${best}`,
        `You held to wave ${state.wave} of ${TOTAL_WAVES}  ·  ${state.kills} creatures stopped`,
        `Gold earned ◉ ${state.earned}  ·  Towers built ${state.towersBuilt}`,
      ], 'Press Space or click to try again', PALETTE.red);
    } else if (screen === SCREEN_WIN) {
      drawPanel('THE REEF HOLDS!', [
        `Score ${state.score}   ·   Best ${best}`,
        `All ${TOTAL_WAVES} waves cleared  ·  ${state.kills} creatures stopped`,
        `Lives left ${state.lives} ♥  ·  Gold earned ◉ ${state.earned}`,
      ], 'Press Space or click to play again', PALETTE.green);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}

/** Where a field-coordinate click lands: build bar, info panel buttons, or a grid cell. */
export function hitTest(point, state) {
  const bar = BUILD_BAR;
  if (point.y >= bar.y && point.y <= bar.y + bar.height && point.x >= bar.x && point.x <= bar.x + bar.width) {
    const index = Math.min(2, Math.floor((point.x - bar.x) / (bar.width / 3)));
    return { kind: 'build', type: TOWER_ORDER[index] };
  }
  if (state.selected) {
    const panel = INFO_PANEL;
    if (point.x >= panel.x && point.x <= panel.x + panel.width) {
      const upY = panel.y + 150;
      const sellY = panel.y + 192;
      if (point.y >= upY && point.y <= upY + 34) return { kind: 'upgrade' };
      if (point.y >= sellY && point.y <= sellY + 34) return { kind: 'sell' };
    }
  }
  const col = Math.floor(point.x / GRID.cell);
  const row = Math.floor(point.y / GRID.cell);
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
  return { kind: 'grid', col, row };
}
