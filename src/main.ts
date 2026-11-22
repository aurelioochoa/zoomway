// Zoomway: the loop and the glue between sim, renderer, sound and menus. The sim steps at a
// fixed 60 Hz and the renderer interpolates whatever the display rate is, so a Chromebook at
// 30 fps plays by the same rules as a phone at 60 (§12).

import './ui/style.css';
import { BONK_HOLD_SECONDS, BUBBLE_SECONDS, PINWHEEL_SECONDS, STEP_SECONDS, WARM_UP_DISTANCE } from './sim/constants.js';
import { freshSeed } from './sim/random.js';
import {
  EVENT_BONK,
  EVENT_BUBBLE_GET,
  EVENT_BUBBLE_POP,
  EVENT_FLAG,
  EVENT_FRUIT,
  EVENT_JUMP,
  EVENT_LANE,
  EVENT_NEAR_MISS,
  EVENT_PINWHEEL_GET,
  EVENT_RING_GET,
  EVENT_RING_POP,
  EVENT_SCRAPE,
  EVENT_SLIDE,
  EVENT_SPRING,
  EVENT_START,
  EVENT_UNDER,
  EVENT_ZONE,
  Run,
} from './sim/run.js';
import { INPUT_DOWN, INPUT_LEFT, INPUT_NONE, INPUT_RIGHT, INPUT_UP, isObstacle, type Input } from './sim/runner.js';
import { GameScene } from './render/scene.js';
import { Sound } from './audio/sound.js';
import { Ui, type Toggle } from './ui/ui.js';
import { detectLanguage, getLanguage, setBlank, setLanguage } from './i18n/index.js';
import { loadSave, recordRun, writeSave } from './save/save.js';

type Phase = 'play' | 'paused' | 'countdown' | 'bonked' | 'results';

const parameters = new URLSearchParams(location.search);
setLanguage(detectLanguage());
if (parameters.get('blank') === '1') setBlank(true);
document.documentElement.lang = { no: 'nb', zh: 'zh-Hans' }[getLanguage() as string] ?? getLanguage();

const loaded = loadSave();
const save = loaded.save;
const persist = () => writeSave(loaded);
const sound = new Sound();
sound.setMuted(save.muted);
sound.setMusic(save.music);

const systemMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reducedMotion = () => save.reducedMotion ?? systemMotion?.matches ?? false;
const touchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const app = document.getElementById('app')!;
let scene: GameScene | null = null;

const seedParameter = parameters.get('seed');
let seed = seedParameter ? Number(seedParameter) >>> 0 : freshSeed();
const bestFor = () => (save.gentle ? save.bestGentle : save.best);
const furthestEver = () => Math.max(save.best, save.bestGentle);
let run = new Run(seed, save.gentle, bestFor(), furthestEver());
let phase: Phase = 'play';
let accumulator = 0;
let last = performance.now();
const pending: Input[] = [];
let bonkSeconds = -1;
let countdownSeconds = 0;
let recorded = false;
let newBest = false;
let fruitRecord = false;
let shownDistance = -1;

const ui = new Ui(
  app,
  {
    pause: () => pause(),
    resume: () => resume(),
    restart: () => newRun(true),
    toggleMute: () => toggleMute(),
    toggle: (setting) => toggle(setting),
    chooseHat: (index) => {
      save.hat = index;
      persist();
    },
    chooseSkates: (index) => {
      save.skates = index;
      persist();
    },
    rebuild: () => rebuild(),
  },
  () => ({ muted: save.muted, music: save.music, reducedMotion: reducedMotion(), gentle: save.gentle, hat: save.hat, skates: save.skates }),
  touchDevice,
);
ui.setMuted(save.muted);
ui.showTitle(true, furthestEver());
app.classList.toggle('reduced', reducedMotion());
systemMotion?.addEventListener?.('change', () => app.classList.toggle('reduced', reducedMotion()));

function rebuild(): void {
  scene?.dispose();
  const canvas = document.createElement('canvas');
  canvas.id = 'view';
  document.getElementById('view')?.replaceWith(canvas);
  try {
    scene = new GameScene(canvas);
    resize();
    ui.showRebuild(false);
  } catch {
    // No WebGL at all right now: the ↻ stays, so there is always a way to try again (§8).
    scene = null;
    ui.showRebuild(true);
  }
}

function resize(): void {
  scene?.resize(app.clientWidth, app.clientHeight);
}
window.addEventListener('resize', resize);
rebuild();

// Focus the game so keys reach it, but not inside a frame: there the host page focuses us
// (the site's /play does), and a frame may not take focus without a gesture.
let framed = true;
try {
  framed = window.self !== window.top;
} catch {
  framed = true;
}
if (!framed) ui.touch.focus({ preventScroll: true });

// ---- run lifecycle ------------------------------------------------------------------

function resetHud(): void {
  ui.setFruit(0);
  ui.setDistance(0);
  ui.setRing(true);
  ui.setPower('bubble', 0);
  ui.setPower('pinwheel', 0);
  ui.showHint(false);
  shownDistance = -1;
}

/** §8: restart is one input and moving within half a second; a cruise only from the menu. */
function newRun(moving: boolean): void {
  if (ui.overlay) ui.close();
  seed = seedParameter ? seed + 1 : freshSeed();
  run = new Run(seed, save.gentle, bestFor(), furthestEver());
  recorded = false;
  bonkSeconds = -1;
  accumulator = 0;
  pending.length = 0;
  resetHud();
  phase = 'play';
  ui.showTitle(!moving, furthestEver());
  if (moving) {
    run.begin();
    onEvents(EVENT_START);
  }
  sound.resume();
}

function record(): boolean {
  if (recorded || !run.started) return false;
  recorded = true;
  fruitRecord = run.fruit > save.bestFruit;
  const newBest = recordRun(save, run.gentle, run.distance, run.fruit);
  persist();
  return newBest;
}

function pause(): void {
  if (phase !== 'play' && phase !== 'countdown') return;
  phase = 'paused';
  pending.length = 0;
  ui.setCountdown(null);
  sound.suspend();
  ui.openPause();
}

/** §8: resuming counts in with three pulsing dots (nothing is coming on the cruise). */
function resume(): void {
  if (phase !== 'paused') return;
  ui.close();
  sound.resume();
  phase = run.started ? 'countdown' : 'play';
  countdownSeconds = 1.5;
  last = performance.now();
}

function toggleMute(): void {
  save.muted = !save.muted;
  persist();
  sound.unlock();
  sound.setMuted(save.muted);
  ui.setMuted(save.muted);
}

function toggle(setting: Toggle): void {
  if (setting === 'music') {
    save.music = !save.music;
    sound.setMusic(save.music);
  } else if (setting === 'motion') {
    save.reducedMotion = !reducedMotion();
    app.classList.toggle('reduced', reducedMotion());
  } else {
    // §D: Gentle has its own best and flag, so it begins a fresh cruise in the new mode.
    save.gentle = !save.gentle;
    if (run.started && !run.over) record();
    run = new Run(seedParameter ? seed : freshSeed(), save.gentle, bestFor(), furthestEver());
    recorded = false;
    resetHud();
    ui.showTitle(true, furthestEver());
  }
  persist();
}

function queueInput(input: Input): void {
  sound.unlock();
  if (phase !== 'play' || ui.overlay) return;
  if (!run.started && input === INPUT_NONE) {
    run.begin();
    onEvents(EVENT_START);
    return;
  }
  if (pending.length < 3) pending.push(input);
}

function showResults(): void {
  phase = 'results';
  ui.openResults({ distance: run.distance, fruit: run.fruit, best: run.best, newBest, fruitRecord, furthestEver: furthestEver() });
}

// ---- events from the sim ------------------------------------------------------------

function onEvents(events: number): void {
  if (events & EVENT_START) {
    ui.showTitle(false, furthestEver());
    sound.unlock();
    sound.startMusic();
    sound.whoosh();
  }
  if (events & EVENT_LANE) sound.whoosh();
  if (events & EVENT_JUMP) sound.boing();
  if (events & EVENT_SLIDE) sound.fwip();
  if (events & EVENT_FRUIT) {
    sound.plink(run.time);
    ui.setFruit(run.fruit);
  }
  if (events & EVENT_SCRAPE) sound.hup();
  if (events & EVENT_NEAR_MISS) sound.swirl();
  if (events & EVENT_RING_POP) {
    sound.ringPop();
    ui.setRing(false);
  }
  if (events & EVENT_RING_GET) {
    sound.ringGet();
    ui.setRing(true);
  }
  if (events & EVENT_BUBBLE_GET) sound.bubbleGet();
  if (events & EVENT_BUBBLE_POP) sound.bubblePop();
  if (events & EVENT_PINWHEEL_GET) sound.pinwheel();
  if (events & EVENT_SPRING) sound.spring();
  if (events & EVENT_FLAG) sound.chime();
  if (events & EVENT_ZONE) {
    sound.zone();
    ui.showZone(run.zoneReached);
  }
  if (events & EVENT_UNDER && !save.hints.slide) {
    save.hints.slide = true;
    persist();
  }
  if (events & EVENT_BONK) {
    sound.bonk();
    phase = 'bonked';
    bonkSeconds = 0;
    pending.length = 0;
    newBest = record();
  }
  scene?.react(events, run, reducedMotion());
}

// ---- input --------------------------------------------------------------------------

const KEYS: Record<string, Input> = {
  ArrowLeft: INPUT_LEFT,
  KeyA: INPUT_LEFT,
  ArrowRight: INPUT_RIGHT,
  KeyD: INPUT_RIGHT,
  ArrowUp: INPUT_UP,
  KeyW: INPUT_UP,
  Space: INPUT_UP,
  ArrowDown: INPUT_DOWN,
  KeyS: INPUT_DOWN,
};

window.addEventListener('keydown', (event) => {
  // The open card already acted on this key (Esc closing it must not pause again).
  if (event.defaultPrevented) return;
  if (event.code === 'KeyM') {
    toggleMute();
    if (ui.overlay === 'pause') ui.openPause();
    return;
  }
  if (ui.overlay) {
    // Keys on the card, or on a button of their own (the ↻ after a lost context), act natively.
    if ((event.target as HTMLElement).closest?.('.scrim, button')) return;
    // Focus wandered off the card (a click on the scrim): bring the keys back to it.
    event.preventDefault();
    if (event.key === 'Escape') ui.back();
    else if (phase === 'paused' && event.code === 'KeyP') resume();
    else if (phase === 'results' && ['Space', 'Enter', 'ArrowUp', 'KeyW'].includes(event.code)) ui.tryRestart();
    else ui.focusCard();
    return;
  }
  const input = KEYS[event.code];
  if (input !== undefined) {
    event.preventDefault();
    if (!event.repeat) queueInput(input);
  } else if (event.code === 'KeyP' || event.key === 'Escape') {
    event.preventDefault();
    pause();
  }
});

// §10: a swipe counts mid-motion, past 30 px or 6 % of the short side; a tap starts the
// cruise and does nothing during a run, so there are no accidental jumps.
let pointer: { id: number; x: number; y: number; fired: boolean } | null = null;
ui.touch.addEventListener('pointerdown', (event) => {
  sound.unlock();
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, fired: false };
  try {
    ui.touch.setPointerCapture(event.pointerId);
  } catch {
    // Not every pointer can be captured; its moves still arrive.
  }
});
ui.touch.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId || pointer.fired) return;
  const across = event.clientX - pointer.x;
  const down = event.clientY - pointer.y;
  if (Math.hypot(across, down) < Math.min(30, 0.06 * Math.min(innerWidth, innerHeight))) return;
  pointer.fired = true;
  queueInput(Math.abs(across) > Math.abs(down) ? (across > 0 ? INPUT_RIGHT : INPUT_LEFT) : down > 0 ? INPUT_DOWN : INPUT_UP);
});
const endPointer = (event: PointerEvent) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (!pointer.fired && event.type === 'pointerup' && !run.started) queueInput(INPUT_NONE);
  pointer = null;
};
ui.touch.addEventListener('pointerup', endPointer);
ui.touch.addEventListener('pointercancel', endPointer);
ui.touch.addEventListener('contextmenu', (event) => event.preventDefault());

// Gamepad (§10): d-pad or stick to move, A to jump or confirm, Start to pause.
const padWasDown: boolean[] = [];
function pollGamepad(): void {
  let pads: (Gamepad | null)[] = [];
  try {
    pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  } catch {
    return;
  }
  const gamepad = pads.find((pad) => pad?.connected);
  if (!gamepad) return;
  const stickX = gamepad.axes[0] ?? 0;
  const stickY = gamepad.axes[1] ?? 0;
  const controls: [boolean, () => void][] = [
    [!!gamepad.buttons[14]?.pressed || stickX < -0.6, () => queueInput(INPUT_LEFT)],
    [!!gamepad.buttons[15]?.pressed || stickX > 0.6, () => queueInput(INPUT_RIGHT)],
    [!!gamepad.buttons[12]?.pressed || stickY < -0.6, () => queueInput(INPUT_UP)],
    [!!gamepad.buttons[13]?.pressed || stickY > 0.6, () => queueInput(INPUT_DOWN)],
    [!!gamepad.buttons[0]?.pressed, () => (ui.overlay ? (document.activeElement as HTMLElement | null)?.click() : queueInput(INPUT_UP))],
    [!!gamepad.buttons[9]?.pressed, () => (phase === 'paused' ? resume() : pause())],
  ];
  controls.forEach(([down, action], index) => {
    if (down && !padWasDown[index]) action();
    padWasDown[index] = down;
  });
}

// §5, §8: a hidden tab or a lost focus pauses; a run already past the best is kept on pagehide.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    sound.suspend();
  }
});
window.addEventListener('blur', () => pause());
window.addEventListener('pagehide', () => {
  if (run.started && !run.over && run.distance > run.best) {
    recordRun(save, run.gentle, run.distance, run.fruit);
    persist();
  }
});

// ---- the loop -----------------------------------------------------------------------

function nextBannerSeconds(): number {
  for (const item of run.track.items) {
    if (item.kind === 'banner' && item.z > run.runner.z) return (item.z - run.runner.z) / Math.max(1, run.speed);
  }
  return Infinity;
}

function frame(now: number): void {
  const delta = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  pollGamepad();
  if (phase === 'countdown') {
    const before = Math.ceil(countdownSeconds / 0.5);
    countdownSeconds -= delta;
    const dots = Math.ceil(countdownSeconds / 0.5);
    if (dots !== before && dots > 0) sound.tick(false);
    ui.setCountdown(dots > 0 ? dots : null);
    if (countdownSeconds <= 0) {
      sound.tick(true);
      phase = 'play';
    }
  }
  let events = 0;
  if (phase === 'play' || phase === 'bonked' || phase === 'results') {
    accumulator += delta;
    while (accumulator >= STEP_SECONDS) {
      accumulator -= STEP_SECONDS;
      events |= run.step(phase === 'play' ? (pending.shift() ?? INPUT_NONE) : INPUT_NONE);
    }
  }
  if (events) onEvents(events);
  if (bonkSeconds >= 0) {
    bonkSeconds += delta;
    if (phase === 'bonked' && bonkSeconds >= BONK_HOLD_SECONDS) showResults();
  }

  const meters = Math.floor(run.distance);
  if (meters !== shownDistance) {
    shownDistance = meters;
    ui.setDistance(meters);
  }
  ui.setPower('bubble', run.floating ? Math.max(0.04, run.bubbleSeconds / BUBBLE_SECONDS) : 0);
  ui.setPower('pinwheel', run.pinwheelSeconds / PINWHEEL_SECONDS);
  // §3: the first time ever, a pulsing ↓ appears 1.5 s ahead of a towel line.
  const bannerSeconds = !save.hints.slide && run.started && !run.over ? nextBannerSeconds() : Infinity;
  ui.showHint(bannerSeconds <= 1.5 && phase === 'play');
  sound.setPace((run.speed - 8) / 10, run.distance > WARM_UP_DISTANCE);

  if (scene) {
    scene.update(run, {
      alpha: accumulator / STEP_SECONDS,
      delta,
      reducedMotion: reducedMotion(),
      hat: save.hat,
      skates: save.skates,
      flagDistance: run.best,
      bonkSeconds,
    });
    scene.render();
    if (scene.lost && document.querySelector('.rebuild.hidden')) {
      pause();
      ui.showRebuild(true);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For the headless smoke and FPS harnesses: read-only state, no hooks into the rules.
(window as unknown as { __zoomway: unknown }).__zoomway = {
  get phase() {
    return phase;
  },
  get started() {
    return run.started;
  },
  get distance() {
    return run.distance;
  },
  get lane() {
    return run.runner.lane;
  },
  get vertical() {
    return run.runner.vertical;
  },
  get ring() {
    return run.ring;
  },
  get fruit() {
    return run.fruit;
  },
  get speed() {
    return run.speed;
  },
  get tier() {
    return scene?.tier ?? -1;
  },
  get stats() {
    return scene?.stats ?? null;
  },
  /** The next obstacles ahead, nearest first: kind, lane and seconds away. */
  ahead() {
    return run.track.items
      .filter((item) => isObstacle(item.kind) && item.z > run.runner.z - 0.5)
      .slice(0, 9)
      .map((item) => ({ kind: item.kind, lane: item.lane, seconds: (item.z - run.runner.z) / Math.max(1, run.speed) }));
  },
};
