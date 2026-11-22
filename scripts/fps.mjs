// The Chromebook budget (§12), measured: plays the production build in headless Chromium
// with the CPU throttled 4× through the DevTools protocol, steering with the keyboard, and
// reports frames per second, main-thread script time per frame, the quality tier the FPS
// monitor settled on, draw calls and triangles. Headless WebGL is SwiftShader: software
// rasterising in the GPU process, which CPU throttling does not slow, so the frame rate is a
// floor set by SwiftShader, not a prediction. The throttled script time per frame is what
// says whether the game's own JavaScript fits a slow Chromebook's 16.7 ms frame.
//
//   npm run build && npm run fps
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const port = 4900 + (process.pid % 90);
const base = `http://localhost:${port}/`;
const server = spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  for (let attempt = 0; attempt < 100 && !(await fetch(base).then((response) => response.ok).catch(() => false)); attempt++) await wait(100);
  for (const [label, viewport] of [['desktop 1280×720', { width: 1280, height: 720 }], ['phone 390×844', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    const scriptSeconds = async () => (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'ScriptDuration').value;
    await page.goto(`${base}?seed=2024`);
    await page.waitForFunction(() => window.__zoomway?.stats, null, { timeout: 30000 });
    await page.keyboard.press('ArrowLeft');
    // Steer through the intro so the measurement covers a busy boardwalk, not an empty one.
    const steer = setInterval(async () => {
      const ahead = await page.evaluate(() => window.__zoomway.ahead().find((item) => item.lane === window.__zoomway.lane && item.seconds > 0)).catch(() => null);
      if (!ahead || ahead.seconds > 0.3) return;
      await page.keyboard.press(ahead.kind === 'hurdle' ? 'ArrowUp' : ahead.kind === 'banner' ? 'ArrowDown' : 'ArrowRight').catch(() => {});
    }, 60);
    await wait(4000);
    const scriptBefore = await scriptSeconds();
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          let peakCalls = 0;
          let peakTriangles = 0;
          const start = performance.now();
          const count = () => {
            frames++;
            peakCalls = Math.max(peakCalls, window.__zoomway.stats.calls);
            peakTriangles = Math.max(peakTriangles, window.__zoomway.stats.triangles);
            if (performance.now() - start < 8000) requestAnimationFrame(count);
            else resolve({ framesPerSecond: (frames * 1000) / (performance.now() - start), tier: window.__zoomway.tier, peakCalls, peakTriangles, phase: window.__zoomway.phase, distance: Math.floor(window.__zoomway.distance) });
          };
          requestAnimationFrame(count);
        }),
    );
    const scriptPerFrame = ((await scriptSeconds()) - scriptBefore) / (result.framesPerSecond * 8);
    clearInterval(steer);
    console.log(
      `${label}, CPU 4× throttled: ${result.framesPerSecond.toFixed(1)} fps (SwiftShader), ${(scriptPerFrame * 1000).toFixed(1)} ms script per frame, tier ${result.tier}, peak ${result.peakCalls} draw calls, peak ${result.peakTriangles} triangles (run ${result.phase} at ${result.distance} m)`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  server.kill('SIGKILL');
}
