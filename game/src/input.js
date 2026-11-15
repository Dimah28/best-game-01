// Keyboard and pointer input. Held keys give nothing here (towers aim themselves);
// one-shot presses are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. Pointer clicks land on
// the grid (place/select a tower) or on the build bar (pick a tower type).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_START_WAVE = 8;
export const ACTION_UPGRADE = 16;
export const ACTION_SELL = 32;
export const ACTION_RESTART = 64;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const START_WAVE = new Set(['KeyW']);
const UPGRADE = new Set(['KeyU']);
const SELL = new Set(['KeyX']);
const RESTART = new Set(['KeyR']);
const BUILD_KEYS = { Digit1: 'coral', Digit2: 'kelp', Digit3: 'anemone', Numpad1: 'coral', Numpad2: 'kelp', Numpad3: 'anemone' };

export function createInput(target, toField) {
  let actions = 0;
  let buildType = null;
  let click = null;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (START_WAVE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_START_WAVE;
    } else if (UPGRADE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_UPGRADE;
    } else if (SELL.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SELL;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (BUILD_KEYS[event.code]) {
      buildType = BUILD_KEYS[event.code];
    } else {
      return;
    }
    event.preventDefault();
  });

  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    const point = toField(event.clientX - rect.left, event.clientY - rect.top);
    click = { x: point.x, y: point.y };
  });

  return {
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Tower type picked with 1/2/3 since the last call, or null. */
    takeBuildType() {
      const taken = buildType;
      buildType = null;
      return taken;
    },
    /** Grid point of the last click since the last call, in field coordinates, or null. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
  };
}
