# Third-Party Notices for Zoomway

Zoomway's own code is licensed under PolyForm Noncommercial 1.0.0 (see `LICENSE.md`). The
dependencies below keep their own licenses.

## Runtime dependency (shipped to players)

- [three](https://threejs.org/) 0.185.1 — MIT License, Copyright © 2010-2026 three.js
  authors. Includes `examples/jsm/utils/BufferGeometryUtils.js` from the same package.

## Build / dev dependencies (not shipped to players)

- [TypeScript](https://www.typescriptlang.org/) 5.9.3 — Apache-2.0
- [Vite](https://vite.dev/) 8.2.2 — MIT (its CSS minifier, lightningcss, is MPL-2.0; a build
  tool only — nothing of it is in `dist/`)
- [Vitest](https://vitest.dev/) 4.1.11 — MIT
- [@types/three](https://github.com/DefinitelyTyped/DefinitelyTyped) 0.185.4 — MIT
- [Playwright](https://playwright.dev/) 1.65.0 — Apache-2.0 (the smoke and FPS harnesses only)

`npm run check:licenses` re-verifies that every installed dependency carries a recognised
free license, that the repo holds no asset files, and that `dist/` contains no live external
URL and stays inside the byte budget.
