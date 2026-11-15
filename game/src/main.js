// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game over and victory.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|boss|win (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_KILL, EVENT_LEAK, EVENT_OVER, EVENT_PLACE, EVENT_SELL, EVENT_SHOOT, EVENT_UPGRADE, EVENT_WAVE_CLEAR, EVENT_WAVE_START, EVENT_WIN, PHASE_BUILD, PHASE_OVER, PHASE_WAVE, PHASE_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SELL, ACTION_START_WAVE, ACTION_UPGRADE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, hitTest, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { time: world.state.elapsed });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const toField = (clientX, clientY) => {
    const scale = renderer.view.scale;
    return { x: (clientX - renderer.view.x) / scale, y: (clientY - renderer.view.y) / scale };
  };
  const input = createInput(canvas, toField);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let banner = null;
  let bannerUntil = 0;
  let shootCooldown = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function showBanner(text, sub, seconds) {
    banner = { text, sub, alpha: 1 };
    bannerUntil = world.state.elapsed + seconds;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    banner = null;
    screen = SCREEN_PLAY;
    announce('Playing. Build towers, then hold the reef for 15 waves.');
    audio.unlock();
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won
      ? `Victory! The reef holds. Score ${world.state.score}. Best ${best}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleClick(point) {
    const hit = hitTest(point, world.state);
    if (!hit) return;
    if (hit.kind === 'build') {
      world.state.buildType = hit.type;
      return;
    }
    if (hit.kind === 'upgrade') {
      if (world.upgradeTower(world.state.selected.col, world.state.selected.row)) audio.upgrade();
      else audio.error();
      return;
    }
    if (hit.kind === 'sell') {
      if (world.sellTower(world.state.selected.col, world.state.selected.row)) audio.sell();
      else audio.error();
      return;
    }
    // Grid cell.
    const existing = world.towerAt(hit.col, hit.row);
    if (existing) {
      world.state.selected = { col: hit.col, row: hit.row };
      return;
    }
    if (screen !== SCREEN_PLAY || world.state.phase !== PHASE_BUILD) {
      world.state.selected = null;
      return;
    }
    if (world.placeTower(hit.col, hit.row, world.state.buildType)) audio.place();
    else audio.error();
  }

  function handleActions() {
    const actions = input.takeActions();
    const buildType = input.takeBuildType();
    if (buildType) world.state.buildType = buildType;
    const click = input.takeClick();
    if (click && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      startGame();
      return;
    }
    if (click && screen === SCREEN_PLAY) handleClick(click);
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (actions & ACTION_START_WAVE && screen === SCREEN_PLAY && world.state.phase === PHASE_BUILD) {
      world.startWaveEarly();
    } else if (actions & ACTION_UPGRADE && screen === SCREEN_PLAY && world.state.selected) {
      if (world.upgradeTower(world.state.selected.col, world.state.selected.row)) audio.upgrade();
      else audio.error();
    } else if (actions & ACTION_SELL && screen === SCREEN_PLAY && world.state.selected) {
      if (world.sellTower(world.state.selected.col, world.state.selected.row)) audio.sell();
      else audio.error();
    } else if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_WIN || screen === SCREEN_PAUSED)) {
      audio.unlock();
      startGame();
    }
  }

  function react(events) {
    if (events & EVENT_WAVE_START) {
      showBanner(`WAVE ${world.state.wave}`, world.state.wave % 5 === 0 ? 'A Leviathan rides the tide!' : 'Hold the reef!', 2);
      audio.waveStart();
      announce(`Wave ${world.state.wave} of 15.`);
    }
    if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      announce(`Wave ${world.state.wave} cleared.`);
    }
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_LEAK) audio.leak();
    if (events & EVENT_WIN) {
      audio.victory();
      endGame(true);
    } else if (events & EVENT_OVER) {
      audio.gameOver();
      endGame(false);
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, false);
    if (events & EVENT_SHOOT) {
      // One soft tick per frame at most, whatever the tower count.
      if (shootCooldown <= 0) {
        audio.shoot('coral');
        shootCooldown = 0.12;
      }
    }
    react(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;
    shootCooldown -= dt;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (banner && world.state.elapsed > bannerUntil) banner = null;
    else if (banner) banner.alpha = Math.min(1, (bannerUntil - world.state.elapsed) / 0.5);
    renderer.draw(world.state, screen, best, { time: world.state.elapsed, muted: audio.muted, banner });
  }

  // Leaving the tab pauses a running game rather than letting the tide roll in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Debug/testing hook: lets automated playtests read the world (gold, phase, lives).
  window.__tidekeeper = world;

  announce('Tidekeeper. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
