// Every mesh is Three.js primitives with vertex colours, merged into one geometry per thing
// so each family is one draw call (§9, §12). Models face -z, the way the boardwalk runs, and
// stand on y = 0, the deck. Obstacle costumes change per zone; their silhouette and height
// never do: tall (blocker), knee-high (hurdle), head-high with air beneath (banner).

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Paint = number | ((x: number, y: number, z: number) => number);
type Triple = [number, number, number];
type Part = [shape: BufferGeometry, paint: Paint, at?: Triple, turn?: Triple, size?: Triple];

export const box = (width: number, height: number, depth: number) => new BoxGeometry(width, height, depth);
export const ball = (radius: number, segments = 10) => new SphereGeometry(radius, segments, Math.max(4, segments - 4));
export const tube = (top: number, bottom: number, height: number, segments = 8) => new CylinderGeometry(top, bottom, height, segments);
const cone = (radius: number, height: number, segments = 8) => new ConeGeometry(radius, height, segments);
const torus = (radius: number, thickness: number) => new TorusGeometry(radius, thickness, 6, 16);

export function build(parts: Part[]): BufferGeometry {
  const color = new Color();
  const matrix = new Matrix4();
  const geometries = parts.map(([shape, paint, at = [0, 0, 0], turn = [0, 0, 0], size = [1, 1, 1]]) => {
    shape.deleteAttribute('uv');
    shape.applyMatrix4(matrix.compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...turn)), new Vector3(...size)));
    const positions = shape.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      color.set(typeof paint === 'number' ? paint : paint(positions.getX(index), positions.getY(index), positions.getZ(index)));
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    shape.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return shape;
  });
  return mergeGeometries(geometries)!;
}

/** Crisp stripes need their own boxes: one face's vertex colours would blend into a gradient. */
function stripedBox(size: Triple, at: Triple, axis: 0 | 1 | 2, colors: number[], bands: number): Part[] {
  return Array.from({ length: bands }, (_, band): Part => {
    const bandSize: Triple = [...size];
    bandSize[axis] = size[axis] / bands;
    const bandAt: Triple = [...at];
    bandAt[axis] = at[axis] - size[axis] / 2 + bandSize[axis] * (band + 0.5);
    return [box(...bandSize), colors[band % colors.length]!, bandAt];
  });
}

/** Two posts at the lane's edges and a line between them, for every banner costume. */
const bannerFrame = (post: number, line: number): Part[] => [
  [tube(0.04, 0.05, 1.95), post, [-0.72, 0.975, 0]],
  [tube(0.04, 0.05, 1.95), post, [0.72, 0.975, 0]],
  [box(1.5, 0.04, 0.04), line, [0, 1.88, 0]],
];

const wheels = (radius: number, x: number): Part[] => [
  [tube(radius, radius, 0.08, 10), 0x4a4a5a, [-x, radius, 0], [0, 0, Math.PI / 2]],
  [tube(radius, radius, 0.08, 10), 0x4a4a5a, [x, radius, 0], [0, 0, Math.PI / 2]],
];

/** [zone][kind]: Lagoon, Orchard, Kite Cliffs, Sunset Pier × blocker, hurdle, banner (§9). */
export function obstacleModels(): BufferGeometry[][] {
  const crateWood = 0xd39a5b;
  const slat = 0xa06a36;
  const lagoon = [
    build([
      [box(1.3, 1.1, 1.1), crateWood, [0, 0.55, 0]],
      [box(1.32, 0.12, 1.12), slat, [0, 0.3, 0]],
      [box(1.32, 0.12, 1.12), slat, [0, 0.8, 0]],
      [box(1.05, 0.95, 0.95), 0xe0ae72, [0.05, 1.575, 0], [0, 0.25, 0]],
      [box(1.07, 0.1, 0.97), slat, [0.05, 1.6, 0], [0, 0.25, 0]],
      [box(0.55, 0.25, 0.5), crateWood, [-0.1, 2.175, 0], [0, -0.3, 0]],
    ]),
    build(
      [-0.45, 0, 0.45].flatMap((x, index): Part[] => [
        [tube(0.22, 0.15, 0.4), 0xd9693f, [x, 0.2, 0]],
        [ball(0.15), 0x5cb85c, [x, 0.44, 0]],
        [ball(0.12), [0xff7eb6, 0xffd34d, 0xffffff][index]!, [x, 0.56, -0.05]],
      ]),
    ),
    build([
      ...bannerFrame(0xf4f1ea, 0xe9e2d0),
      ...stripedBox([0.62, 1.0, 0.04], [-0.36, 1.37, 0], 1, [0xff6f61, 0xffffff, 0x3fc6c9], 5),
      ...stripedBox([0.62, 1.0, 0.04], [0.36, 1.37, 0], 1, [0xffd34d, 0xffffff, 0xff8fb1], 5),
    ]),
  ];
  const orchard = [
    build([
      [box(1.3, 0.8, 1.1), 0xd94b3d, [0, 0.75, 0]],
      ...wheels(0.32, 0.6),
      ...[-0.35, 0, 0.35].flatMap((x): Part[] => [
        [ball(0.2), 0xff9f1c, [x, 1.3, -0.2]],
        [ball(0.2), 0xe8433a, [x, 1.3, 0.2]],
      ]),
      [ball(0.2), 0xffd34d, [0, 1.62, 0]],
      [tube(0.03, 0.03, 1.0), 0xf4f1ea, [-0.6, 1.7, 0.5]],
      [tube(0.03, 0.03, 1.0), 0xf4f1ea, [0.6, 1.7, 0.5]],
      [tube(0.03, 0.03, 1.0), 0xf4f1ea, [-0.6, 1.7, -0.5]],
      [tube(0.03, 0.03, 1.0), 0xf4f1ea, [0.6, 1.7, -0.5]],
      ...stripedBox([1.4, 0.12, 1.2], [0, 2.24, 0], 0, [0xffffff, 0xe8433a], 6),
    ]),
    build([
      [box(1.4, 0.68, 0.6), 0xe8c25a, [0, 0.34, 0]],
      [box(1.42, 0.06, 0.62), 0xb8902f, [0, 0.22, 0]],
      [box(1.42, 0.06, 0.62), 0xb8902f, [0, 0.5, 0]],
    ]),
    build([
      ...bannerFrame(0x9b6b3f, 0x7ab55c),
      ...[-0.5, -0.17, 0.17, 0.5].flatMap((x, strand): Part[] =>
        [1.72, 1.42, 1.12].map((y): Part => [ball(0.13, 8), (strand + Math.round(y * 10)) % 2 ? 0xffb3d1 : 0xffffff, [x, y, 0]]),
      ),
    ]),
  ];
  const kiteColors = [0xff6f61, 0x3fc6c9, 0xffd34d, 0xb39ddb];
  const kite = (x: number, y: number, color: number, size = 0.32): Part => [box(size, size, 0.03), color, [x, y, 0], [0, 0, Math.PI / 4]];
  const cliffs = [
    build([
      [box(1.3, 0.1, 1.0), 0xc08552, [0, 0.8, 0]],
      [box(0.08, 0.8, 0.08), 0x8a5a30, [-0.6, 0.4, -0.45]],
      [box(0.08, 0.8, 0.08), 0x8a5a30, [0.6, 0.4, -0.45]],
      [box(0.08, 0.8, 0.08), 0x8a5a30, [-0.6, 0.4, 0.45]],
      [box(0.08, 0.8, 0.08), 0x8a5a30, [0.6, 0.4, 0.45]],
      [box(1.2, 0.7, 0.9), 0xf2e3c6, [0, 0.4, 0]],
      [box(0.07, 1.5, 0.07), 0x8a5a30, [-0.6, 1.55, 0]],
      [box(0.07, 1.5, 0.07), 0x8a5a30, [0.6, 1.55, 0]],
      [box(1.3, 0.08, 0.08), 0x8a5a30, [0, 2.26, 0]],
      kite(-0.32, 1.78, kiteColors[0]!, 0.42),
      kite(0.32, 1.78, kiteColors[1]!, 0.42),
      kite(0, 1.25, kiteColors[2]!, 0.42),
    ]),
    build([
      ...[-0.56, -0.28, 0, 0.28, 0.56].flatMap((x): Part[] => [
        [box(0.15, 0.55, 0.05), 0xffffff, [x, 0.275, 0]],
        [cone(0.11, 0.14, 4), 0xffffff, [x, 0.62, 0], [0, Math.PI / 4, 0]],
      ]),
      [box(1.4, 0.07, 0.06), 0xe6e1d6, [0, 0.18, 0.04]],
      [box(1.4, 0.07, 0.06), 0xe6e1d6, [0, 0.44, 0.04]],
    ]),
    build([
      ...bannerFrame(0x8a5a30, 0x5a5a6a),
      ...[-0.45, 0, 0.45].flatMap((x, index): Part[] => [
        [box(0.015, 0.3, 0.015), 0x5a5a6a, [x, 1.72, 0]],
        kite(x, 1.42, kiteColors[index + 1]!, 0.36),
        [box(0.04, 0.4, 0.02), kiteColors[index]!, [x, 1.0, 0]],
      ]),
    ]),
  ];
  const pier = [
    build([
      [box(1.3, 0.9, 1.0), 0xffd6e0, [0, 0.8, 0]],
      [box(1.32, 0.16, 1.02), 0xff8fb1, [0, 1.2, 0]],
      ...wheels(0.3, 0.6),
      [tube(0.04, 0.04, 1.0), 0xffffff, [0, 1.75, 0]],
      [cone(0.78, 0.4, 10), 0x7fd8c4, [0, 2.1, 0]],
      [ball(0.08, 6), 0xffffff, [0, 2.32, 0]],
      [cone(0.1, 0.25, 8), 0xe8b06a, [-0.35, 1.4, 0], [Math.PI, 0, 0]],
      [ball(0.11, 8), 0xfff0f5, [-0.35, 1.55, 0]],
    ]),
    build(
      [-0.38, 0.38].flatMap((x): Part[] =>
        [0.1, 0.3, 0.5].map((y): Part => [torus(0.26 - y * 0.12, 0.09), 0xb58a5a, [x, y, 0], [Math.PI / 2, 0, 0]]),
      ),
    ),
    build([
      ...bannerFrame(0x6f5a8a, 0x3a3a4a),
      ...[-0.45, 0, 0.45].flatMap((x, index): Part[] => [
        [box(0.015, 0.2, 0.015), 0x3a3a4a, [x, 1.76, 0]],
        [ball(0.2), [0xff9f43, 0xff6f61, 0xffd34d][index]!, [x, 1.45, 0], [0, 0, 0], [1, 1.15, 1]],
        [box(0.05, 0.35, 0.05), 0xff6f61, [x, 1.05, 0]],
      ]),
    ]),
  ];
  return [lagoon, orchard, cliffs, pier];
}

export const springModel = () =>
  build([
    ...stripedBox([1.1, 0.1, 1.6], [0, 0.14, 0], 2, [0xffd34d, 0xff6f61], 5),
    ...[-0.4, 0.4].flatMap((x): Part[] => [
      [tube(0.06, 0.06, 0.1), 0x9aa3b5, [x, 0.05, -0.6]],
      [tube(0.06, 0.06, 0.1), 0x9aa3b5, [x, 0.05, 0.6]],
    ]),
  ]);

export const tangerineModel = () =>
  build([
    [ball(0.2), 0xff9f1c, [0, 0, 0], [0, 0, 0], [1, 0.9, 1]],
    [box(0.13, 0.02, 0.07), 0x57b04a, [0.05, 0.19, 0], [0, 0, 0.3]],
  ]);

export const bubbleModel = (radius: number) =>
  build([[ball(radius, 14), (x, y) => (y > radius * 0.3 ? 0xffd1f0 : y < -radius * 0.3 ? 0xbff6ff : x > 0 ? 0xfff6a8 : 0xd8ffe0)]]);

export const pinwheelModel = () =>
  build([
    [tube(0.025, 0.025, 0.7), 0xffffff, [0, -0.35, 0]],
    ...[0xff6f61, 0xffd34d, 0x3fc6c9, 0x8fd16a].map((color, index): Part => [
      cone(0.16, 0.34, 3),
      color,
      [Math.cos((index * Math.PI) / 2) * 0.14, Math.sin((index * Math.PI) / 2) * 0.14, 0],
      [0, 0, (index * Math.PI) / 2 - Math.PI / 2],
      [1, 1, 0.15],
    ]),
  ]);

export const swimRingModel = (radius: number, thickness: number) =>
  build([[torus(radius, thickness), (x, y) => (Math.floor(((Math.atan2(y, x) + Math.PI) / Math.PI) * 4) % 2 ? 0xffffff : 0xff6f61)]]);

/** The capybara (§9): barrel body, blocky snout, tiny ears, teal skates, flapping scarf. */
const FUR = 0xb07a45;
export const capybaraBody = () =>
  build([
    [ball(0.5, 12), FUR, [0, 0.62, 0], [0, 0, 0], [0.78, 0.62, 1.0]],
    [ball(0.3, 10), 0xc99060, [0, 0.5, 0.05], [0, 0, 0], [0.9, 0.7, 1.2]],
    [box(0.5, 0.42, 0.48), 0xa8723f, [0, 0.98, -0.55]],
    [box(0.42, 0.3, 0.32), 0x8a5a30, [0, 0.9, -0.86]],
    [box(0.2, 0.07, 0.05), 0x3b2a20, [0, 0.99, -1.02]],
    [ball(0.07, 6), 0x6e4526, [-0.2, 1.22, -0.45]],
    [ball(0.07, 6), 0x6e4526, [0.2, 1.22, -0.45]],
    [torus(0.27, 0.07), 0xff6f61, [0, 0.86, -0.32], [Math.PI / 2 - 0.35, 0, 0]],
    ...[-0.22, 0.22].flatMap((x): Part[] =>
      [-0.3, 0.32].flatMap((z): Part[] => [
        [tube(0.07, 0.07, 0.3), FUR, [x, 0.28, z]],
        [tube(0.045, 0.045, 0.06, 8), 0x3a3a48, [x, 0.045, z - 0.09], [0, 0, Math.PI / 2]],
        [tube(0.045, 0.045, 0.06, 8), 0x3a3a48, [x, 0.045, z + 0.09], [0, 0, Math.PI / 2]],
      ]),
    ),
  ]);

/** Half-closed, contented eyes: a separate mesh so they can blink. */
export const capybaraEyes = () =>
  build([
    [box(0.12, 0.03, 0.02), 0x2a1e18, [-0.14, 1.06, -0.79], [0, 0, 0.15]],
    [box(0.12, 0.03, 0.02), 0x2a1e18, [0.14, 1.06, -0.79], [0, 0, -0.15]],
  ]);

/** White boots, tinted by the material to the chosen skate colour. */
export const capybaraSkates = () =>
  build([-0.22, 0.22].flatMap((x): Part[] => [-0.3, 0.32].map((z): Part => [box(0.17, 0.1, 0.3), 0xffffff, [x, 0.12, z]])));

export const scarfTail = () => build(stripedBox([0.13, 0.03, 0.5], [0, 0, 0.25], 2, [0xff6f61, 0xffd34d], 4));

export const SKATE_COLORS = [0x2ec4b6, 0xff6f61, 0xffd23f, 0xb39ddb, 0x9ccc65];

/** Five fruit hats, all free from the first run (§10, §15 Q2), resting on the head. */
export function hatModels(): BufferGeometry[] {
  const leaf = (x: number, y: number): Part => [box(0.15, 0.025, 0.08), 0x57b04a, [x, y, 0], [0, 0.4, 0.35]];
  const stem = (y: number): Part => [tube(0.015, 0.02, 0.08), 0x6e4526, [0, y, 0]];
  return [
    build([[ball(0.18), 0xff9f1c, [0, 0.16, 0], [0, 0, 0], [1, 0.9, 1]], leaf(0.06, 0.33)]),
    build([
      [ball(0.15), 0xffe14d, [0, 0.14, 0], [0, 0, 0], [1.35, 1, 1]],
      [cone(0.05, 0.08, 6), 0xf2cf2a, [0.22, 0.14, 0], [0, 0, -Math.PI / 2]],
      [cone(0.05, 0.08, 6), 0xf2cf2a, [-0.22, 0.14, 0], [0, 0, Math.PI / 2]],
    ]),
    build([
      [cone(0.17, 0.34, 10), 0xe8333f, [0, 0.13, 0], [Math.PI, 0, 0]],
      [ball(0.17, 10), 0xe8333f, [0, 0.27, 0], [0, 0, 0], [1, 0.45, 1]],
      [cone(0.13, 0.08, 6), 0x57b04a, [0, 0.34, 0]],
    ]),
    build([[ball(0.18), 0xe8433a, [0, 0.16, 0]], stem(0.36), leaf(0.07, 0.36)]),
    build([[ball(0.16), 0xc6d94a, [0, 0.14, 0]], [ball(0.11), 0xc6d94a, [0, 0.3, 0]], stem(0.44)]),
  ];
}

export const starModel = () => build([[box(0.16, 0.16, 0.05), 0xffe14d, [0, 0, 0], [0, 0, Math.PI / 4]], [box(0.16, 0.16, 0.05), 0xffe14d]]);
export const petalModel = () => build([[box(0.14, 0.02, 0.09), 0xffffff]]);
export const streakModel = () => build([[box(0.03, 0.03, 1.3), 0xffffff]]);
export const flagModel = () =>
  build([
    [tube(0.05, 0.06, 3.2), 0xffffff, [0, 1.6, 0]],
    [ball(0.09, 8), 0xffd34d, [0, 3.25, 0]],
    [cone(0.38, 1.1, 3), 0xff4081, [0.55, 2.8, 0], [0, 0, -Math.PI / 2], [1, 1, 0.12]],
  ]);

/** The boardwalk: planks, coral lane lines, rope railings and pilings, one draw call. */
export const DECK_LENGTH = 136;
export const DECK_PERIOD = 4;
export function deckModel(): BufferGeometry {
  const parts: Part[] = [];
  for (let z = 0; z < DECK_LENGTH; z += 0.5) {
    parts.push([box(5.8, 0.12, 0.47), (z * 2) % 2 ? 0xf6e7c8 : 0xefdcb5, [0, -0.06, -z]]);
  }
  for (let z = 0; z < DECK_LENGTH; z += DECK_PERIOD) {
    for (const side of [-1, 1]) {
      parts.push([tube(0.06, 0.07, 1.05), 0xb07a45, [side * 2.85, 0.5, -z]]);
      parts.push([tube(0.13, 0.13, 1.4), 0x9c6a3a, [side * 2.6, -0.8, -z]]);
    }
  }
  for (const side of [-1, 1]) {
    parts.push([box(0.06, 0.012, DECK_LENGTH), 0xff8a7a, [side * 0.75, 0.006, -DECK_LENGTH / 2]]);
    parts.push([box(0.28, 0.3, DECK_LENGTH), 0xc08a55, [side * 2.92, -0.17, -DECK_LENGTH / 2]]);
    for (const height of [0.95, 0.6]) {
      parts.push([tube(0.035, 0.035, DECK_LENGTH, 6), 0xf0dfb6, [side * 2.85, height, -DECK_LENGTH / 2], [Math.PI / 2, 0, 0]]);
    }
  }
  return build(parts);
}

/** Scenery families, one per zone: hot-spring islands, orchard islets, cliffs, pier huts. */
export function sceneryModels(): BufferGeometry[] {
  const mound = (color: number, radius: number): Part => [ball(radius, 12), color, [0, -1.0, 0], [0, 0, 0], [1, 0.28, 1]];
  const palm: Part[] = [
    [tube(0.12, 0.18, 3.2), 0xa0703c, [0.3, 0.9, 0], [0, 0, -0.18]],
    ...[0, 1, 2, 3, 4].map((index): Part => [
      cone(0.35, 1.8, 4),
      0x4fb35a,
      [0.6 + Math.cos(index * 1.26) * 0.7, 2.4, Math.sin(index * 1.26) * 0.7],
      [Math.PI / 2 - 0.4, index * 1.26, 0],
      [1, 1, 0.3],
    ]),
  ];
  const tree = (x: number, z: number): Part[] => [
    [tube(0.12, 0.16, 1.4), 0x8a5a30, [x, 0.3, z]],
    [ball(0.95, 10), 0x5cb85c, [x, 1.6, z]],
    ...[0, 1, 2, 3].map((index): Part => [ball(0.14, 6), 0xff9f1c, [x + Math.cos(index * 1.6) * 0.8, 1.5 + (index % 2) * 0.4, z + Math.sin(index * 1.6) * 0.8]]),
  ];
  return [
    build([
      mound(0xf3dca5, 3.2),
      [tube(1.0, 1.1, 0.08, 14), 0x9ff0ee, [-0.8, -0.18, 0.5]],
      [ball(0.35, 8), 0xffffff, [-0.8, 0.5, 0.5]],
      [ball(0.25, 8), 0xffffff, [-0.6, 0.95, 0.4]],
      [ball(0.4, 8), 0xb9b0a3, [1.6, -0.3, -1.2]],
      ...palm,
    ]),
    build([mound(0x8fd16a, 3.6), ...tree(-1, 0.4), ...tree(1.2, -0.8)]),
    build([
      [tube(4.2, 5.2, 9, 7), 0xd9a066, [0, 3.5, 0]],
      [tube(3.2, 4.2, 4, 7), 0xc08552, [0.6, 9.5, 0.4]],
      [tube(3.3, 3.2, 0.5, 7), 0x8fd16a, [0.6, 11.7, 0.4]],
      [box(0.015, 6, 0.015), 0xffffff, [0, 14.7, 0], [0.3, 0, 0]],
      [box(1.3, 1.3, 0.05), 0xff6f61, [0, 17.8, -0.9], [0, 0, Math.PI / 4]],
      [box(0.12, 1.4, 0.04), 0xffd34d, [0, 16.6, -0.9]],
    ]),
    build([
      ...[-0.8, 0.8].flatMap((x): Part[] => [-0.8, 0.8].map((z): Part => [tube(0.1, 0.1, 2.2), 0x8a5a30, [x, -0.3, z]])),
      [box(2.4, 0.15, 2.4), 0xc08a55, [0, 0.8, 0]],
      [box(1.9, 1.5, 1.9), 0x9ad1f0, [0, 1.6, 0]],
      [cone(1.7, 1.1, 4), 0xff8a7a, [0, 2.9, 0], [0, Math.PI / 4, 0]],
      [box(0.4, 0.6, 0.05), 0xffd34d, [0, 1.6, -0.96]],
      [tube(0.05, 0.05, 2.4), 0x3a3a4a, [1.5, 2.0, -1.0]],
      [ball(0.22, 8), 0xffd34d, [1.5, 3.3, -1.0]],
    ]),
  ];
}

/** Unlit, so the shading is painted in: white on top, a cool blue underneath. */
const cloudShade = (_x: number, y: number) => (y > 0.6 ? 0xffffff : y > -0.8 ? 0xf1f8fc : 0xdcebf4);
export const cloudModel = () =>
  build([
    [ball(3, 10), cloudShade],
    [ball(2.4, 10), cloudShade, [3, -0.4, 0.5]],
    [ball(2.2, 10), cloudShade, [-2.8, -0.6, 0]],
    [ball(1.8, 10), cloudShade, [0.8, 1.6, 0.3]],
  ]);
