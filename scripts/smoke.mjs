// Does the built game work for a kid? Drives the production build (`vite preview` over dist/)
// in headless Chromium with real input:
//
//   1. desktop 1280×720, keyboard only: the cruise, the first move, a jump over the flower
//      pots, a slide under the towel line, the pause menu by keys, a bonk, the results card,
//      the wardrobe by keys, and a restart that is moving within half a second;
//   2. phone 390×844 with touch: a tap starts, swipes steer, jump and slide, a tap mid-run
//      does nothing, the 56 px pause button, and a tap anywhere on the results card restarts;
//   3. inside an iframe with the site's exact /play/[id] sandbox;
//   4. every string blanked (?blank=1), proving the wordless claim (§11);
//   5. a lost WebGL context, rebuilt by its ↻ without a page refresh (§8).
//
// Fails on any console error, page error, failed or external request, or a canvas that is
// one flat colour. Every wait is a deadline with polling, never a fixed sleep. Screenshots
// go to /tmp/zoomway-shots (or $SHOTS), outside the zero-asset source tree.
//
//   npm run build && npm run smoke
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const port = 4600 + (process.pid % 300);
const base = `http://localhost:${port}/`;
const shots = process.env.SHOTS ?? '/tmp/zoomway-shots/';
mkdirSync(shots, { recursive: true });

const failures = [];
const fail = (message) => {
  failures.push(message);
  console.error(`FAIL: ${message}`);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Poll `check` until it returns something truthy or the deadline passes. */
async function until(check, milliseconds, label) {
  const deadline = Date.now() + milliseconds;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await wait(30);
  }
  throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

const server = spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

function watch(page, tag) {
  page.on('console', (message) => {
    if (message.type() === 'error') fail(`[${tag}] console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => fail(`[${tag}] page error: ${error.message}`));
  page.on('requestfailed', (request) => fail(`[${tag}] request failed: ${request.url()}`));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) fail(`[${tag}] external request: ${url}`);
  });
}

const state = (frame) =>
  frame.evaluate(() => {
    const game = window.__zoomway;
    if (!game) return null;
    const { phase, started, distance, lane, vertical, ring, fruit, speed, tier } = game;
    return { phase, started, distance, lane, vertical, ring, fruit, speed, tier, ahead: game.ahead() };
  });

/** Standard deviation of a screenshot's luminance: 0 means one flat colour. */
async function spread(page) {
  const url = `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
  return page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 160, 90);
    const pixels = context.getImageData(0, 0, 160, 90).data;
    let sum = 0;
    let squares = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = 0.3 * pixels[index] + 0.59 * pixels[index + 1] + 0.11 * pixels[index + 2];
      sum += luminance;
      squares += luminance * luminance;
    }
    const count = pixels.length / 4;
    return Math.sqrt(squares / count - (sum / count) ** 2);
  }, url);
}

async function painted(page, frame, tag) {
  await until(() => state(frame), 15000, `${tag}: game state`);
  const value = await until(async () => {
    const deviation = await spread(page);
    return deviation > 12 ? deviation : 0;
  }, 15000, `${tag}: a painted canvas`);
  console.log(`[${tag}] canvas painted, luminance spread ${value.toFixed(1)}`);
}

/** Let CSS entrance animations finish so a screenshot shows the settled card. */
async function settled(page, selector) {
  await until(() => page.locator(selector).isVisible(), 4000, selector);
  await until(
    () => page.evaluate((query) => document.querySelector(query).getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).length === 0, selector),
    4000,
    `${selector} settled`,
  );
}

/** Wait until the nearest obstacle in the capybara's lane is `kind`, `seconds` away or closer. */
async function approach(frame, kind, seconds, limit = 40000) {
  return until(async () => {
    const current = await state(frame);
    const next = current.ahead.find((item) => item.lane === current.lane && item.seconds > 0);
    if (current.phase !== 'play') throw new Error(`run left play while waiting for a ${kind}: ${current.phase}`);
    return next && next.kind === kind && next.seconds <= seconds ? current : null;
  }, limit, `a ${kind} ${seconds}s ahead`);
}

try {
  await until(async () => (await fetch(base)).ok, 20000, 'vite preview');

  // ---- 1. desktop, keyboard only ---------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    watch(page, 'desktop');
    await page.goto(`${base}?seed=4242`);
    await painted(page, page, 'desktop');
    await wait(1200);
    let current = await state(page);
    if (current.started || current.distance !== 0) fail(`desktop: the cruise must wait for the first input, got ${JSON.stringify(current)}`);
    if (!(await page.locator('.title:not(.gone) .wordmark').isVisible())) fail('desktop: the wordmark should show on the cruise');
    await page.screenshot({ path: `${shots}desktop-cruise.png` });

    // §3: the first input is obeyed at once.
    await page.keyboard.press('ArrowLeft');
    await until(async () => (await state(page)).lane === 0 && (await state(page)).started, 300, 'first move obeyed at once');
    console.log('[desktop] the first ← started the run and moved a lane');

    // Follow the fruit past the crates, then jump the flower pots.
    await approach(page, 'hurdle', 0.22);
    await page.keyboard.press('ArrowUp');
    await until(async () => (await state(page)).vertical === 'jump', 300, 'jump');
    await wait(140);
    await page.screenshot({ path: `${shots}desktop-jump.png` });
    await until(async () => (await state(page)).vertical === 'ground', 1500, 'landing');
    current = await state(page);
    if (!current.ring || current.phase !== 'play') fail(`desktop: a jump over the pots should cost nothing, got ${JSON.stringify(current)}`);
    console.log('[desktop] ↑ jumped the flower pots');

    // The first towel line ever brings the pulsing ↓ hint, then ↓ slides under it.
    await approach(page, 'banner', 1.4);
    if (!(await page.locator('.slide-hint').isVisible())) fail('desktop: the ↓ hint should show before the first towel line');
    await approach(page, 'banner', 0.2);
    await page.keyboard.press('ArrowDown');
    await until(async () => (await state(page)).vertical === 'slide', 300, 'slide');
    await page.screenshot({ path: `${shots}desktop-slide.png` });
    await until(async () => (await state(page)).vertical === 'ground', 1500, 'slide ends');
    current = await state(page);
    if (!current.ring || current.phase !== 'play') fail(`desktop: sliding under the towel should cost nothing, got ${JSON.stringify(current)}`);
    console.log('[desktop] ↓ slid under the towel line');

    // Menus by keyboard: P opens pause, arrows move, Enter toggles, Esc resumes with a count-in.
    await page.keyboard.press('KeyP');
    await settled(page, '.card-pause');
    await page.screenshot({ path: `${shots}desktop-pause.png` });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const toggled = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed'));
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed'));
    if (toggled === null || toggled === after) fail(`desktop: Enter should flip the focused switch (${toggled} → ${after})`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await until(() => page.locator('.countdown:not(.hidden)').isVisible(), 1000, 'count-in dots');
    await until(async () => (await state(page)).phase === 'play', 3000, 'resume after the count-in');
    console.log('[desktop] pause → switch → Esc → count-in → play, all by keyboard');

    // Hands off: the ring absorbs the first bonk, the second ends the run.
    await until(async () => (await state(page)).phase === 'bonked', 60000, 'the bonk');
    await wait(650);
    await page.screenshot({ path: `${shots}desktop-bonk.png` });
    await until(async () => (await state(page)).phase === 'results', 3000, 'results card');
    current = await state(page);
    if (current.ring) fail('desktop: the swim ring should have popped before the run ended');
    await settled(page, '.card-results');
    await page.screenshot({ path: `${shots}desktop-results.png` });
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    if (!focused.includes('again')) fail(`desktop: ↻ should have focus on the results card, had "${focused}"`);
    console.log(`[desktop] bonked at ${Math.floor(current.distance)} m with ${current.fruit} tangerines`);

    // The wardrobe by keyboard, then back, then restart.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await settled(page, '.card-wardrobe');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.screenshot({ path: `${shots}desktop-wardrobe.png` });
    await page.keyboard.press('Escape');
    await settled(page, '.card-results');
    await wait(350);
    const restartAt = Date.now();
    await page.keyboard.press('Space');
    await until(async () => {
      const fresh = await state(page);
      return fresh.phase === 'play' && fresh.started && fresh.distance > 0.5;
    }, 500, 'a new run moving within half a second');
    console.log(`[desktop] Space restarted and was moving after ${Date.now() - restartAt} ms`);
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('zoomway:save')));
    if (!(saved.best > 0) || saved.hat !== 2 || saved.hints?.slide !== true) fail(`desktop: save should hold best, hat 2 and the slide hint, got ${JSON.stringify(saved)}`);

    // §8: a lost WebGL context shows one ↻ that rebuilds the scene, no refresh.
    await page.evaluate(() => document.getElementById('view').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await until(() => page.locator('.rebuild:not(.hidden)').isVisible(), 3000, 'the rebuild button');
    await page.keyboard.press('Enter');
    await until(() => page.locator('.rebuild.hidden').count(), 3000, 'rebuild done');
    await painted(page, page, 'desktop rebuilt');
    await context.close();
  }

  // ---- 2. phone, touch ---------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    watch(page, 'phone');
    await page.goto(`${base}?seed=777`);
    await painted(page, page, 'phone');
    await page.screenshot({ path: `${shots}phone-cruise.png` });
    await page.touchscreen.tap(195, 500);
    await until(async () => (await state(page)).started, 1000, 'a tap starts the run');
    if ((await state(page)).lane !== 1) fail('phone: the starting tap must not steer');
    const cdp = await context.newCDPSession(page);
    const swipe = async (across, down) => {
      const start = { x: 195, y: 520 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      for (let step = 1; step <= 4; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (across * step) / 4, y: start.y + (down * step) / 4 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(-60, 0);
    await until(async () => (await state(page)).lane === 0, 1000, 'swipe left');
    await swipe(60, 0);
    await until(async () => (await state(page)).lane === 1, 1000, 'swipe right');
    await swipe(-60, 0);
    await until(async () => (await state(page)).lane === 0, 1000, 'swipe left again, onto the fruit');
    await swipe(0, -60);
    await until(async () => (await state(page)).vertical === 'jump', 1000, 'swipe up jumps');
    await swipe(0, 60);
    await until(async () => ['drop', 'slide'].includes((await state(page)).vertical), 1000, 'swipe down mid-air drops into a slide');
    await until(async () => (await state(page)).vertical === 'ground', 2000, 'slide ends');
    console.log('[phone] tap started; swipes ← → ↑ ↓ all reached the capybara');
    const before = await state(page);
    await page.touchscreen.tap(300, 600);
    await wait(250);
    const afterTap = await state(page);
    if (afterTap.lane !== before.lane || afterTap.vertical !== 'ground') fail('phone: a tap mid-run must do nothing');
    await page.screenshot({ path: `${shots}phone-run.png` });

    const pauseButton = page.locator('.hud-right .round').nth(1);
    const box = await pauseButton.boundingBox();
    if (!box || box.width < 48 || box.height < 48) fail(`phone: the pause button must be at least 48 px, got ${JSON.stringify(box)}`);
    await pauseButton.tap();
    await settled(page, '.card-pause');
    await page.screenshot({ path: `${shots}phone-pause.png` });
    await page.locator('.card-pause .primary').tap();
    await until(async () => (await state(page)).phase === 'play', 3000, 'resume by tap');
    await until(async () => (await state(page)).phase === 'results', 60000, 'phone results');
    await settled(page, '.card-results');
    await page.screenshot({ path: `${shots}phone-results.png` });
    await wait(350);
    await page.touchscreen.tap(195, 60);
    await until(async () => {
      const fresh = await state(page);
      return fresh.phase === 'play' && fresh.started && fresh.distance > 0.5;
    }, 700, 'a tap anywhere restarts');
    console.log('[phone] pause button, results, and a tap anywhere restarted');
    await context.close();
  }

  // ---- 3. inside the site's sandboxed iframe -----------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    watch(page, 'iframe');
    await page.route('**/__host.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body style="margin:0;background:#222"><iframe id="game" src="${base}?seed=99" style="border:0;width:1280px;height:720px"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals" allow="fullscreen; autoplay; gamepad"></iframe></body>`,
      }),
    );
    await page.goto(`${base}__host.html`);
    const frame = await until(() => page.frame({ url: (url) => url.href.includes('seed=99') }), 10000, 'game frame');
    await painted(page, frame, 'iframe');
    await page.locator('#game').click({ position: { x: 640, y: 450 } });
    await until(async () => (await state(frame)).started, 1000, 'a click starts the run in the frame');
    await page.keyboard.press('ArrowRight');
    await until(async () => (await state(frame)).lane === 2, 1000, 'keys reach the framed game');
    await page.keyboard.press('KeyM');
    const stored = await frame.evaluate(() => localStorage.getItem('zoomway:save'));
    if (!stored?.includes('"muted":true')) fail(`iframe: the mute switch should be saved, got ${stored}`);
    await page.screenshot({ path: `${shots}iframe.png` });
    console.log('[iframe] boots, starts, steers and saves inside the /play sandbox');
    await context.close();
  }

  // ---- 4. every string blanked --------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    watch(page, 'blank');
    await page.goto(`${base}?blank=1&seed=5`);
    await painted(page, page, 'blank');
    await page.keyboard.press('ArrowRight');
    await until(async () => (await state(page)).lane === 2, 1000, 'blank: steer');
    const words = await page.evaluate(() => document.querySelector('.hud')?.textContent?.replace(/[0-9\s.,]/g, '') ?? '');
    if (words) fail(`blank: the HUD should hold no words, found "${words}"`);
    await page.keyboard.press('KeyP');
    await settled(page, '.card-pause');
    const cardWords = await page.evaluate(() => document.querySelector('.card-pause')?.textContent?.trim() ?? '');
    if (cardWords) fail(`blank: every string should be blank, found "${cardWords}"`);
    const iconless = await page.evaluate(() => [...document.querySelectorAll('.card-pause button')].filter((button) => !button.querySelector('svg')).length);
    if (iconless) fail(`blank: ${iconless} pause buttons have no icon`);
    await page.screenshot({ path: `${shots}blank-pause.png` });
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).phase === 'play', 3000, 'blank: resume');
    console.log('[blank] plays and pauses with every string blanked; every button has an icon');
    await context.close();
  }
} catch (error) {
  fail(error.message);
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGKILL');
}

if (failures.length) {
  console.error(`\nsmoke: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`\nsmoke: OK (screenshots in ${shots})`);
