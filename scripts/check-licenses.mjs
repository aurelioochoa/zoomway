// The build's gates (design §9, §12; SHIP-CHECKLIST §1–2), run last by `npm run build`:
//
//   1. Every installed dependency carries a recognised free/open-source license.
//   2. The game ships ZERO asset files: every mesh is a Three.js primitive, every icon an
//      inline SVG, every sound synthesized. Scans what can reach a player — src/, public/,
//      scripts/, index.html and dist/ — never node_modules/.
//   3. The built output contains no live external URL (no CDN, fonts or telemetry). Inert
//      occurrences (license comments, minified error URLs) are allowlisted with a reason.
//   4. The whole of dist/ stays under the design's 1.5 MiB byte budget.
//
//   node scripts/check-licenses.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 1.5 * 1024 * 1024;

// MPL-2.0 is accepted only because lightningcss (Vite's CSS minifier) is a build tool:
// nothing of it ships to players. The one runtime dependency, three, is MIT.
const FREE_LICENSES = [/^MIT\b/i, /^ISC\b/i, /^BSD-\d/i, /^Apache-2\.0/i, /^MPL-2\.0/i, /^CC0-1\.0/i, /^Unlicense$/i, /^0BSD$/i, /^BlueOak-1\.0\.0/i];

const ASSET_EXTENSIONS = new Set(
  '.glb .gltf .fbx .obj .dae .blend .stl .ply .3ds .png .jpg .jpeg .gif .webp .avif .bmp .tga .ktx .ktx2 .basis .dds .hdr .exr .tif .tiff .mp3 .wav .ogg .m4a .flac .aac .opus .mid .midi .ttf .otf .woff .woff2 .eot .mp4 .webm .mov .svg'.split(' '),
);

// Every http(s):// in dist/ that is provably inert, each with its reason. If three.js grows a
// new one, prove it is never fetched before adding it here.
const INERT_URLS = [
  { prefix: 'https://github.com/mrdoob/three.js', reason: 'three.js license comment and error-message links, never fetched' },
  { prefix: 'http://www.w3.org', reason: 'XML namespace identifiers (SVG markup), not loads' },
  { prefix: 'https://jcgt.org/published/0007/04/01/', reason: 'a paper citation in a comment inside three.js PMREM shader source, never fetched' },
];

const failures = [];

function walk(directory, onFile) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') walk(path, onFile);
    else if (entry.isFile()) onFile(path);
  }
}

// ---- 1. dependency licenses --------------------------------------------------------
if (!existsSync('node_modules')) {
  failures.push('node_modules/ missing: run `npm ci` before the license gate');
} else {
  const packageDirectories = readdirSync('node_modules').flatMap((name) =>
    name.startsWith('@') ? readdirSync(join('node_modules', name)).map((scoped) => join(name, scoped)) : name.startsWith('.') ? [] : [name],
  );
  let checked = 0;
  for (const name of packageDirectories) {
    const manifestPath = join('node_modules', name, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const license = typeof manifest.license === 'string' ? manifest.license : manifest.license?.type;
    checked++;
    if (!license || !FREE_LICENSES.some((pattern) => pattern.test(license))) {
      failures.push(`dependency "${name}" license is not recognised as free: ${license ?? '(none)'}`);
    }
  }
  console.log(`license gate: ${checked} dependencies checked`);
}

// ---- 2. zero asset files -----------------------------------------------------------
let scanned = 0;
const onSourceFile = (path) => {
  scanned++;
  if (ASSET_EXTENSIONS.has(extname(path).toLowerCase())) failures.push(`asset file present (§9 zero-asset rule): ${path}`);
};
for (const directory of ['src', 'public', 'scripts', 'dist']) if (existsSync(directory)) walk(directory, onSourceFile);
onSourceFile('index.html');
console.log(`asset gate: ${scanned} files scanned`);

// ---- 3 and 4. no live URLs in dist/, and the byte budget ---------------------------
if (!existsSync('dist')) {
  failures.push('dist/ missing: the network and byte gates need a build');
} else {
  let rawBytes = 0;
  let gzipBytes = 0;
  walk('dist', (path) => {
    const content = readFileSync(path);
    rawBytes += statSync(path).size;
    gzipBytes += gzipSync(content).length;
    if (!['.js', '.html', '.css', '.json'].includes(extname(path))) return;
    for (const url of content.toString('utf8').match(/https?:\/\/[^\s"'`)\\]+/g) ?? []) {
      if (!INERT_URLS.some((inert) => url.startsWith(inert.prefix))) failures.push(`live external URL in built output: ${url} (${path})`);
    }
  });
  console.log(`network gate: dist/ scanned for external URLs`);
  console.log(`byte budget: ${(rawBytes / 1024).toFixed(1)} KiB raw, ${(gzipBytes / 1024).toFixed(1)} KiB gzip (limit ${BUDGET_BYTES / 1024} KiB raw)`);
  if (rawBytes >= BUDGET_BYTES) failures.push(`dist/ is ${rawBytes} bytes, at or above the ${BUDGET_BYTES}-byte budget`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log('all gates passed');
