# Zoomway verification — 2026-11-21

Measured on this machine (Linux, Node 22.23.3, Playwright 1.65.0 Chromium with SwiftShader
WebGL). Nothing here was run on a physical phone or Chromebook.

## Automated checks

- **`npm test`**: 7 files, 248 tests, about 28 s.
  - `src/data/chunks.test.ts` (186): every chunk, the intro included, is searched at every
    speed it can appear at (8–18 m/s in steps of 2; the intro at 8–10), starting after the
    shortest decision gap for that speed, from a standing start in each lane. Each must have
    a clear path from all three lanes, and every tangerine must lie on some clear path. Also:
    no row has a blocker in all three lanes, and tier 0 rows hold one kind of obstacle.
  - `src/sim/track.test.ts` (6): five whole generated runs of 1.5 km (8, 12, 15 and 18 m/s,
    and Gentle at 12) searched end to end, so every seam between chunks is crossed for real;
    and the generator lays tiers 0, 1 and 2 along the real speed curve.
  - `src/sim/solver.test.ts` (6): the search can fail. It rejects a wall of crates, a towel
    line overlapping flower pots, and a two-lane switch faster than the controller allows, and
    it marks a tangerine hidden in a crate as off every path. It also finds the
    jump → drop → slide → jump route through closely spaced pots, the skill the design wants
    learned.
  - `src/sim/runner.test.ts` (10): 0.14 s lane change, one queued change, 0.6 s jump with a
    1.6 m apex, the 100 ms jump buffer (and nothing earlier), drop-into-slide, hitboxes 15 %
    smaller than meshes, head-on versus side contact, graze forgiveness for a late jump and
    for a crate reached while already steering out of its lane.
  - `src/sim/run.test.ts` (11): the speed curve (10.8 / 12.9 / 15.4 m/s at 30 / 60 / 120 s,
    never above 18; Gentle never above 12), the decision gap (1.6 s warm-up, 0.75 s cap,
    ≥ 1.2 s Gentle), a five-minute cruise that never times out or brings an obstacle into
    view, the first input obeyed at once, determinism per seed, ring then bonk, a side scrape
    that costs nothing, a bubble that waits for an empty landing stretch, the flag event once,
    and zones reached only past the furthest run ever.
  - `src/save/save.test.ts` (8): round trip, field-by-field fallback that keeps the best, the
    distances rescued from corrupt JSON, a newer save's unknown fields written back
    untouched, throwing or missing storage, the one key `zoomway:save`, separate normal and
    Gentle bests.
  - `src/i18n/i18n.test.ts` (21): eight tables with identical keys and `{placeholders}`, no
    empty strings, no table copied from English, the name never translated, number formatting
    per language, blanking, and detection order (`kidtopia:lang` read-only, then the browser
    with nb/nn → no, then English; throwing storage tolerated).
- **`npm run build`**: `tsc --noEmit`, the Vite production build, then
  `scripts/check-licenses.mjs`: 55 dependencies with free licenses, zero asset files, no live
  external URL in `dist/` (two inert three.js strings allowlisted with reasons), and the
  byte budget. Measured: **598.7 KiB raw, 156.0 KiB gzip** against the 1536 KiB limit. Final
  line: `all gates passed`. Each gate was proven to fail on a planted violation (a `.png` in
  `src/`, a `fetch("https://…")` in `dist/`, 1.7 MB of padding in `dist/`) and to pass again
  once the plant was removed.
- **`npm run smoke`**: the real `dist/` under `vite preview` in headless Chromium, failing on
  any console error, page error, failed request, external request or flat-colour canvas.
  Final line: `smoke: OK (screenshots in /tmp/zoomway-shots/)`.
  - Desktop, keyboard only: the cruise waits; the first ← starts and steers at once; ↑ jumps
    the flower pots; the first-ever towel line shows the ↓ hint and ↓ slides under it; P
    opens pause, the arrows move focus, Enter flips a switch, Esc resumes through the three
    count-in dots; hands off, the swim ring pops on the first bonk and the second ends the
    run; ↻ has focus on the results card; the wardrobe opens and a hat is chosen by keys;
    Space restarts and the run was **moving 146 ms later**; the save holds the best, the hat
    and the hint flag. A lost WebGL context (`WEBGL_lose_context`) shows the ↻, Enter
    rebuilds the scene and the canvas paints again without a reload.
  - Phone 390×844 with touch: a tap starts without steering; swipes ← → ↑ ↓ reach the
    capybara (↓ in the air drops into a slide); a tap mid-run does nothing; the pause button
    measures at least 48 px and works; a tap anywhere on the results card restarts.
  - The site's exact iframe (`sandbox="allow-scripts allow-same-origin allow-popups
    allow-forms allow-modals"`, `allow="fullscreen; autoplay; gamepad"`): boots, a click
    starts, keys steer, M is saved to `localStorage`.
  - `?blank=1`: the run plays and pauses with every string empty; the HUD holds no words and
    every pause button has an icon.
- **`npm run fps`** (the 4× CPU-throttled harness of §12), steering through the intro:
  - desktop 1280×720: 16.1 fps, 8.6 ms of main-thread script per frame, tier 2, peak 17
    draw calls, 26.5k triangles;
  - phone 390×844: 28.2 fps, 6.5 ms script per frame, tier 2, peak 17 draw calls, 26.3k
    triangles.

  The frame rate is SwiftShader rasterising in software in the GPU process, which CPU
  throttling does not touch (unthrottled gave the same 16 fps). It shows the FPS monitor
  stepping down to its lightest tier on a slow device. The figures that predict a Chromebook
  are the script time (half of a 16.7 ms frame at 4× throttling, harness polling included)
  and the draw calls and triangles, which stay well under the design's 40 and 80k.

## Visual review

I looked at every capture in `/tmp/zoomway-shots/` and fixed what was wrong. These are the
final captures:

- Desktop 1280×720: `desktop-cruise.png` (wordmark, zone strip, keycap hints, fruit bending
  left), `desktop-jump.png`, `desktop-slide.png` (striped towel line with the ↓ hint above
  the capybara), `desktop-pause.png`, `desktop-bonk.png` (sit-up with stars),
  `desktop-results.png`, `desktop-wardrobe.png`.
- Phone 390×844 at DPR 2: `phone-cruise.png`, `phone-run.png`, `phone-pause.png`,
  `phone-results.png`.
- `iframe.png`, `blank-pause.png`.

What the review changed: stripes were washed-out gradients (one box face blends its vertex
colours), so stripes are now banded boxes. Clouds were lit grey from below and are now unlit
and painted. In landscape the skates sat under the start hints, so the camera looks lower.
The ↓ hint covered the capybara and now sits above it. The results card covered the bonk
cartoon and now sits high, and the camera no longer pitches down onto the crate, which had
lifted the capybara behind the card on phones. The wardrobe's Back button stretched tall and
the skate-swatch colour rule repainted the strawberry icon. On phones the zone strip floated
mid-screen and the white swipe arrows were faint on the planks. An ice-cream umbrella wider
than its lane made the next lane look blocked. The HUD's mute button sat under the card
scrim. The three later zones were checked with a throwaway preview page, since deleted, that
rendered each zone's scenery and costumes.

## Deliberate differences from the design

- **No canvas textures at all.** §9 allows plank grain, towel stripes and the sky gradient
  drawn into canvases. Planks, stripes and the sky dome are all vertex-coloured geometry, so
  nothing is drawn at boot.
- **Anti-aliasing is fixed at boot.** MSAA is a WebGL context attribute, so it is requested
  once (`antialias: true`). The three tiers step the pixel ratio (min(dpr, 1.5) → min(dpr, 1)
  → 0.75), and the lightest tier halves the scenery. Turning MSAA off at the lower tiers would
  mean a new context in the middle of a run.
- **Portrait framing also moves the camera.** Landscape uses §7a's 4.5 m behind and 3 m up.
  In portrait the vertical field of view grows only to 68°, and the camera backs off and rises
  until three lanes plus a lane of margin (6 m) fit across the capybara. A field-of-view-only
  solution needed about 105°, which distorts.
- **The cruise's fruit line keeps its distance** while the capybara cruises, so the opening
  never reaches anything. At the first input the rest of the intro (crates ~3 s, pots ~8 s,
  towel ~13 s, bubble ~18 s) lands ahead and grows in over 0.35 s. The intro replays at the
  start of every run. Restarting from the results card skips the cruise and is moving at
  once; the cruise and wordmark return on a fresh load or when Gentle is switched.
- **The bonk hold.** The camera stops with the capybara and leans toward the obstacle's lane
  for the 0.9 s hold rather than pitching down to it. The results card then sits high, so the
  sit-up, stars and hat plop stay visible below it.
- **The bubble lands by waiting, not by reservation.** After its 4 s the bubble wobbles on
  until 1 s of its lane ahead is empty, then pops. The generator's decision gaps guarantee
  such a stretch comes. While floating, tangerines are collected at any height.
- **Forgiveness beyond the 15 % hitboxes**, all from §8's "never by being slightly late": a
  head-on contact while already steering out of that lane, a pot clipped by ≤ 0.3 m, a towel
  line clipped by ≤ 0.25 m, and coming down onto or rising into an obstacle are all forgiven.
  The solver allows none of them, so every proven path is clean.
- **Near miss**: a dodge out of an obstacle's lane in the 0.45 s before it passes, or a
  forgiven graze. Both play the swirl and, with motion on, wind streaks.
- **The ↓ hint** shows until the kid has once slid under a towel line, not just once. A kid
  who bonks on their first towel line gets it again next run.
- **Swipe threshold**: the smaller of 30 px and 6 % of the short side.
- **Gentle switched mid-run** records the run so far (quitting loses nothing) and starts a
  fresh cruise, because Gentle has its own best and flag.
- **Zones cycle every 3500 m** (Sunset Pier is 2500–3500 m). The first-reach petals and the
  zone strip use the furthest run in either mode.
- **Power-ups** are at least 300 m apart.
- **The HUD's distance icon is a skate**, keeping the flag for the best distance only. The
  most tangerines in one run is shown as a star beside the fruit count when beaten.
- **No WebGL at all** (renderer creation throws) shows the same ↻ as a lost context.

## Not verified

Real-device performance (a physical phone or Chromebook GPU), real audio output (sound was
exercised only as code paths in headless Chromium), and a real gamepad (only the code path
exists; nothing in the harness presses one).

## Reproduce

```bash
npm ci
npm test
npm run build
npm run smoke   # SHOTS=<dir> to choose where screenshots go
npm run fps
```
