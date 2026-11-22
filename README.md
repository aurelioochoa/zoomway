# Zoomway

A very calm capybara on roller skates, with a tangerine on its head, zooms down a sunny
boardwalk over a turquoise lagoon: switch lanes, hop the flower pots, belly-slide under the
towel lines, grab the tangerines and plant your flag further than last time. A three-lane
runner in four zones (Lagoon Boardwalk, Orchard Bridge, Kite Cliffs, Sunset Pier). Every
chunk of boardwalk is proven survivable before it ships. A first-party game for
[kidtopiaplay.com](https://kidtopiaplay.com).

Three.js + TypeScript + Vite. Zero asset files: every mesh is a primitive with vertex
colours, every icon an inline SVG, every sound synthesized with Web Audio. No network, no
accounts; progress lives in `localStorage` under `zoomway:save`. Eight languages (en, es, de,
pt, fr, no, ko, zh), following the site's `kidtopia:lang`, then the browser; the play screen
itself has no words.

## Commands

```bash
npm ci
npm run dev      # dev server at localhost:5193
npm test         # Vitest: chunk and whole-run solvability, controller, rules, save, strings
npm run build    # tsc --noEmit + production build + license/asset/network/byte gates
npm run smoke    # after a build: plays the real dist/ in headless Chromium with keys and
                 # touch, inside the site's iframe sandbox; SHOTS=<dir> for screenshots
npm run fps      # after a build: frame rate, script time and draw calls at 4× CPU throttle
```

Controls: ← → or A D switch lanes · ↑ W or Space jump · ↓ or S slide (in the air: drop into
a slide) · P or Esc pause · M sound. Touch: swipe anywhere. Gamepad: d-pad or stick, A, Start.

See [VERIFICATION.md](./VERIFICATION.md) for the checks, measurements and the deliberate
differences from the design.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE.md); commercial use needs a separate license, see
[COMMERCIAL-LICENSE.md](./COMMERCIAL-LICENSE.md). Dependencies keep their own licenses:
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
