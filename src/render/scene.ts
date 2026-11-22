// The renderer (§9, §12): it reads the sim and interpolates it, and never changes a rule.
// One InstancedMesh per obstacle costume, per pickup and per scenery family, pooled over the
// visible boardwalk, Lambert with vertex colours, one hemisphere and one directional light,
// fog, blob shadows and no shadow maps. Nothing here allocates per frame.

import {
  BackSide,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import { STEP_SECONDS, laneCenter, zoneAt } from '../sim/constants.js';
import { hashPosition } from '../sim/random.js';
import {
  EVENT_BUBBLE_POP,
  EVENT_FLAG,
  EVENT_NEAR_MISS,
  EVENT_RING_POP,
  EVENT_ZONE,
  type Run,
} from '../sim/run.js';
import { isLow } from '../sim/runner.js';
import {
  DECK_PERIOD,
  SKATE_COLORS,
  bubbleModel,
  capybaraBody,
  capybaraEyes,
  capybaraSkates,
  cloudModel,
  deckModel,
  flagModel,
  hatModels,
  obstacleModels,
  petalModel,
  pinwheelModel,
  sceneryModels,
  scarfTail,
  springModel,
  starModel,
  streakModel,
  swimRingModel,
  tangerineModel,
} from './models.js';

/** Sky top, horizon (and fog), water — Lagoon, Orchard, Kite Cliffs, Sunset Pier (§5). */
const PALETTES = [
  [0x5ec8f2, 0xd4f4f6, 0x3fc6c9],
  [0x74c4f0, 0xeaf6d4, 0x4cbaa8],
  [0x4aa3e6, 0xdcefff, 0x2f9fc4],
  [0x8f7fd6, 0xffd2a0, 0x6fa8c8],
].map((colors) => colors.map((hex) => new Color(hex)));

const VIEW_BEHIND = 14;
const VIEW_AHEAD = 140;
const PETALS = 90;
const STREAKS = 8;
const SCENERY_BIN = 14;
const CLOUD_BIN = 45;
const KINDS = ['blocker', 'hurdle', 'banner'] as const;
const PETAL_COLORS = [0xffb3d1, 0xffffff, 0xffe14d, 0xff8fb1, 0xa8f0e8].map((hex) => new Color(hex));
const RING_COLORS = [0xff6f61, 0xffffff].map((hex) => new Color(hex));
const WHITE = new Color(0xffffff);

export interface FrameState {
  /** How far between the last sim step and the next one this frame falls, 0..1. */
  alpha: number;
  delta: number;
  reducedMotion: boolean;
  hat: number;
  skates: number;
  /** The best distance this run chases; 0 means no flag yet. */
  flagDistance: number;
  /** Seconds since the bonk, or -1. */
  bonkSeconds: number;
}

function pool(geometry: BufferGeometry, material: Material, capacity: number): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

export class GameScene {
  readonly renderer: WebGLRenderer;
  /** 0 full, 1 lighter pixels, 2 lightest pixels and sparser scenery (§12). */
  tier = 0;
  lost = false;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.1, 600);
  private readonly lit = new MeshLambertMaterial({ vertexColors: true });
  private readonly dummy = new Object3D();
  private readonly dummyColor = new Color();
  private readonly obstacles: InstancedMesh[][];
  private readonly springs: InstancedMesh;
  private readonly fruit: InstancedMesh;
  private readonly bubbles: InstancedMesh;
  private readonly pinwheels: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly scenery: InstancedMesh[];
  private readonly clouds: InstancedMesh;
  private readonly petals: InstancedMesh;
  private readonly stars: InstancedMesh;
  private readonly streaks: InstancedMesh;
  private readonly pools: InstancedMesh[];
  private readonly deck: Mesh;
  private readonly water: Mesh;
  private readonly sky: Mesh;
  private readonly flag: Mesh;
  private readonly hemisphere = new HemisphereLight(0xffffff, 0xf0d9b0, 1.4);
  private readonly sun = new DirectionalLight(0xffffff, 1.5);
  private readonly capybara = new Object3D();
  private readonly body: Mesh;
  private readonly eyes: Mesh;
  private readonly skates: Mesh;
  private readonly skateMaterial = new MeshLambertMaterial({ vertexColors: true });
  private readonly tail: Mesh;
  private readonly hat: Mesh;
  private readonly hats = hatModels();
  private readonly wornBubble: Mesh;
  private readonly wornRing: Mesh;
  private readonly wornPinwheel: Mesh;
  private readonly palette = PALETTES[0]!.map((color) => color.clone());
  private readonly petalState = new Float32Array(PETALS * 7);
  private readonly streakState = new Float32Array(STREAKS * 4);
  private nextPetal = 0;
  private nextStreak = 0;
  private time = 0;
  private origin = 0;
  private cameraX = 0;
  private lean = 0;
  private baseFov = 55;
  private cameraBack = 4.5;
  private cameraUp = 3;
  private lookHeight = 0;
  private width = 1;
  private height = 1;
  private sampleSeconds = 0;
  private sampleFrames = 0;
  private slowSeconds = 0;
  private fastSeconds = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });
    const scene = this.scene;
    scene.fog = new Fog(this.palette[1]!, 40, 105);
    this.sun.position.set(-4, 10, 6);
    scene.add(this.hemisphere, this.sun);

    const costumes = obstacleModels();
    this.obstacles = costumes.map((zone) => zone.map((geometry) => pool(geometry, this.lit, 24)));
    this.springs = pool(springModel(), this.lit, 6);
    this.fruit = pool(tangerineModel(), this.lit, 180);
    const glass = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
    this.bubbles = pool(bubbleModel(0.42), glass, 4);
    this.pinwheels = pool(pinwheelModel(), new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), 4);
    this.rings = pool(swimRingModel(0.3, 0.11), this.lit, 4);
    const shadow = new MeshBasicMaterial({ color: 0x1d3a44, transparent: true, opacity: 0.22, depthWrite: false });
    this.shadows = pool(new CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), shadow, 80);
    this.scenery = sceneryModels().map((geometry) => pool(geometry, this.lit, 24));
    this.clouds = pool(cloudModel(), new MeshBasicMaterial({ vertexColors: true, fog: false }), 14);
    this.petals = pool(petalModel(), new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), PETALS);
    for (let index = 0; index < PETALS; index++) this.petals.setColorAt(index, PETAL_COLORS[0]!);
    this.stars = pool(starModel(), new MeshBasicMaterial({ vertexColors: true }), 3);
    this.streaks = pool(streakModel(), new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }), STREAKS);
    this.pools = [...this.obstacles.flat(), this.springs, this.fruit, this.bubbles, this.pinwheels, this.rings, this.shadows, ...this.scenery, this.clouds, this.petals, this.stars, this.streaks];
    scene.add(...this.pools);

    this.deck = new Mesh(deckModel(), this.lit);
    this.water = new Mesh(new PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new MeshLambertMaterial({ color: this.palette[2]! }));
    this.water.position.y = -1.0;
    this.sky = new Mesh(new SphereGeometry(450, 20, 12), new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
    this.paintSky();
    this.flag = new Mesh(flagModel(), this.lit);
    scene.add(this.deck, this.water, this.sky, this.flag);

    this.body = new Mesh(capybaraBody(), this.lit);
    this.eyes = new Mesh(capybaraEyes(), this.lit);
    this.skates = new Mesh(capybaraSkates(), this.skateMaterial);
    this.tail = new Mesh(scarfTail(), this.lit);
    this.tail.position.set(0.16, 0.92, -0.2);
    this.hat = new Mesh(this.hats[0]!, this.lit);
    this.wornBubble = new Mesh(bubbleModel(1.05), glass);
    this.wornBubble.position.y = 0.7;
    this.wornRing = new Mesh(swimRingModel(0.5, 0.13), this.lit);
    this.wornRing.rotation.x = Math.PI / 2;
    this.wornRing.position.y = 0.62;
    this.wornPinwheel = new Mesh(pinwheelModel(), this.pinwheels.material);
    this.wornPinwheel.position.set(0.22, 1.9, -0.45);
    this.wornPinwheel.scale.setScalar(0.8);
    this.capybara.add(this.body, this.eyes, this.skates, this.tail, this.hat, this.wornBubble, this.wornRing, this.wornPinwheel);
    scene.add(this.capybara);
  }

  get stats(): { calls: number; triangles: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const aspect = this.width / this.height;
    // §10: no letterboxing. The field of view is solved per aspect so three lanes plus a
    // lane of margin (6 m) always fit across the capybara; a tall phone also backs off.
    this.baseFov = aspect >= 1 ? 55 : 55 + 13 * Math.min(1, (1 - aspect) / 0.45);
    const halfWidth = Math.tan((this.baseFov * Math.PI) / 360) * aspect;
    this.cameraBack = Math.max(4.5, 3 / halfWidth / 1.12);
    this.cameraUp = this.cameraBack * (aspect >= 1 ? 3 / 4.5 : 0.85);
    // Landscape looks a little lower so the skates sit clear of the screen's bottom edge.
    this.lookHeight = aspect >= 1 ? -0.3 : 0.6;
    this.camera.aspect = aspect;
    this.applyTier();
  }

  private applyTier(): void {
    const pixelRatio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    this.renderer.setPixelRatio([Math.min(pixelRatio, 1.5), Math.min(pixelRatio, 1), 0.75][this.tier]!);
    this.renderer.setSize(this.width, this.height, false);
  }

  /** A rolling FPS monitor with hysteresis: quick to step down, slow to step back up. */
  private monitor(delta: number): void {
    if (this.time < 2) return;
    this.sampleSeconds += delta;
    this.sampleFrames++;
    if (this.sampleSeconds < 1) return;
    const framesPerSecond = this.sampleFrames / this.sampleSeconds;
    this.sampleSeconds = 0;
    this.sampleFrames = 0;
    this.slowSeconds = framesPerSecond < 42 ? this.slowSeconds + 1 : 0;
    this.fastSeconds = framesPerSecond > 57 ? this.fastSeconds + 1 : 0;
    if (this.slowSeconds >= 2 && this.tier < 2) {
      this.tier++;
      this.slowSeconds = 0;
      this.applyTier();
    } else if (this.fastSeconds >= 10 && this.tier > 0) {
      this.tier--;
      this.fastSeconds = 0;
      this.applyTier();
    }
  }

  private paintSky(): void {
    const geometry = this.sky.geometry;
    const positions = geometry.getAttribute('position');
    if (!geometry.getAttribute('color')) geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(positions.count * 3), 3));
    const attribute = geometry.getAttribute('color');
    const colors = attribute.array as Float32Array;
    const color = this.dummyColor;
    for (let index = 0; index < positions.count; index++) {
      const height = Math.max(0, positions.getY(index) / 450);
      color.copy(this.palette[1]!).lerp(this.palette[0]!, Math.min(1, height * 2.2));
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    attribute.needsUpdate = true;
  }

  private place(mesh: InstancedMesh, x: number, y: number, z: number, turn = 0, scale = 1, scaleY = scale): void {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    const dummy = this.dummy;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, turn, 0);
    dummy.scale.set(scale, scaleY, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count++, dummy.matrix);
  }

  private shadow(x: number, z: number, width: number, depth: number): void {
    this.dummy.position.set(x, 0.015, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(width, 1, depth);
    this.dummy.updateMatrix();
    if (this.shadows.count < this.shadows.instanceMatrix.count) this.shadows.setMatrixAt(this.shadows.count++, this.dummy.matrix);
  }

  /** Effects the sim's events ask for this frame. */
  react(events: number, run: Run, reducedMotion: boolean): void {
    const runner = run.runner;
    const z = -(runner.z - this.origin);
    if (events & EVENT_FLAG) this.burst(laneCenter(2) + 0.9, 2.6, -(run.startZ + run.best - this.origin), 36, PETAL_COLORS);
    if (events & EVENT_ZONE) this.burst(runner.x, 1.6, z - 2, 40, PETAL_COLORS);
    if (events & EVENT_RING_POP) this.burst(runner.x, 0.7, z, 16, RING_COLORS);
    if (events & EVENT_BUBBLE_POP) this.burst(runner.x, runner.feet + 0.8, z, 14, PETAL_COLORS.slice(1, 2));
    if (events & EVENT_NEAR_MISS && !reducedMotion) {
      for (const side of [-1, 1]) {
        const state = this.streakState;
        const index = this.nextStreak++ % STREAKS;
        state.set([runner.x + side * 0.7, 0.5 + Math.random() * 0.8, z - 1, 0.35], index * 4);
      }
    }
  }

  private burst(x: number, y: number, z: number, count: number, colors: Color[]): void {
    for (let made = 0; made < count; made++) {
      const index = this.nextPetal++ % PETALS;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      this.petalState.set([x, y, z, Math.cos(angle) * speed, 2 + Math.random() * 3, Math.sin(angle) * speed, 1.4 + Math.random() * 0.6], index * 7);
      this.petals.setColorAt(index, colors[made % colors.length]!);
    }
    if (this.petals.instanceColor) this.petals.instanceColor.needsUpdate = true;
  }

  update(run: Run, frame: FrameState): void {
    const delta = frame.delta;
    this.time += delta;
    this.monitor(delta);
    const runner = run.runner;
    const viewX = runner.previousX + (runner.x - runner.previousX) * frame.alpha;
    const viewZ = runner.previousZ + (runner.z - runner.previousZ) * frame.alpha;
    const feet = runner.previousFeet + (runner.feet - runner.previousFeet) * frame.alpha;
    // §12: the origin rebases every 500 m, so the GPU only ever sees small numbers.
    this.origin = Math.floor(viewZ / 500) * 500;
    const playerZ = this.toRender(viewZ);
    const motion = !frame.reducedMotion;
    const time = this.time;

    // Palettes drift toward the zone the capybara is in, never jump (§5).
    const target = PALETTES[zoneAt(run.distance)]!;
    let drift = 0;
    for (let index = 0; index < 3; index++) {
      const color = this.palette[index]!;
      const goal = target[index]!;
      drift += Math.abs(color.r - goal.r) + Math.abs(color.g - goal.g) + Math.abs(color.b - goal.b);
      color.lerp(goal, Math.min(1, delta * 0.6));
    }
    if (drift > 0.003) {
      (this.scene.fog as Fog).color.copy(this.palette[1]!);
      (this.water.material as MeshLambertMaterial).color.copy(this.palette[2]!);
      this.hemisphere.color.copy(this.palette[0]!).lerp(WHITE, 0.5);
      this.paintSky();
    }

    for (const mesh of this.pools) mesh.count = 0;
    const growIn = run.started ? Math.min(1, run.runSeconds / 0.35) : 1;
    for (const item of run.track.items) {
      const ahead = item.z - viewZ;
      if (ahead < -VIEW_BEHIND) continue;
      if (ahead > VIEW_AHEAD) break;
      const z = this.toRender(item.z);
      // Things fade up out of the distance rather than appearing (they arrive in the fog).
      const distanceScale = Math.min(1, Math.max(0, (VIEW_AHEAD - 20 - ahead) / 20));
      if (item.kind === 'fruit') {
        if (item.takenAt >= 0) {
          const flight = (run.time - item.takenAt) / 0.25;
          if (flight >= 1) continue;
          const towards = flight * flight;
          this.place(
            this.fruit,
            item.x + (viewX - item.x) * towards,
            item.height + (feet + 1.3 - item.height) * towards,
            z + (playerZ - z) * towards,
            time * 9,
            1.3 * (1 - flight),
          );
          continue;
        }
        this.place(this.fruit, item.x, item.height + (motion ? Math.sin(time * 3 + item.z) * 0.06 : 0), z, time * 2 + item.z, distanceScale);
        continue;
      }
      if (item.takenAt >= 0) continue;
      const scale = distanceScale * growIn;
      if (scale <= 0) continue;
      const bob = motion ? Math.sin(time * 2.5 + item.z) * 0.08 : 0;
      switch (item.kind) {
        case 'blocker':
        case 'hurdle':
        case 'banner': {
          const zone = zoneAt(item.z - run.startZ);
          const wobble = run.bonked === item && frame.bonkSeconds >= 0 ? Math.sin(frame.bonkSeconds * 30) * 0.08 * Math.max(0, 1 - frame.bonkSeconds) : 0;
          this.place(this.obstacles[zone]![KINDS.indexOf(item.kind)]!, item.x, 0, z, wobble, scale);
          if (item.kind !== 'banner') this.shadow(item.x, z, 1.5 * scale, 1.3 * scale);
          break;
        }
        case 'spring':
          this.place(this.springs, item.x, 0, z, 0, scale);
          break;
        case 'bubble':
          this.place(this.bubbles, item.x, item.height + bob, z, time, scale * (1 + Math.sin(time * 5) * 0.04));
          this.shadow(item.x, z, 0.7 * scale, 0.7 * scale);
          break;
        case 'pinwheel':
          this.place(this.pinwheels, item.x, item.height + 0.2 + bob, z, time * 3, scale);
          this.shadow(item.x, z, 0.5 * scale, 0.5 * scale);
          break;
        case 'ring':
          this.place(this.rings, item.x, item.height + bob, z, time * 1.5, scale);
          this.shadow(item.x, z, 0.7 * scale, 0.7 * scale);
          break;
      }
    }
    this.placeScenery(run, viewZ);
    this.updateParticles(delta, playerZ, feet, viewX, frame);
    this.poseCapybara(run, frame, viewX, feet, playerZ);
    this.shadow(viewX, playerZ, 1.0, 1.3);

    // The deck is world-locked: it moves in whole railing periods, so planks never swim.
    this.deck.position.set(0, 0, this.toRender(Math.floor(viewZ / DECK_PERIOD) * DECK_PERIOD - VIEW_BEHIND));
    this.water.position.set(viewX, -1.0, playerZ);
    this.flag.visible = frame.flagDistance > 0;
    if (this.flag.visible) {
      const flagZ = run.started ? run.startZ + frame.flagDistance : viewZ + frame.flagDistance;
      this.flag.position.set(laneCenter(2) + 1.45, 0, this.toRender(flagZ));
      const passed = run.started && run.distance >= frame.flagDistance;
      this.flag.rotation.y = passed ? Math.min(1, (run.distance - frame.flagDistance) / 12) * Math.PI * 4 : 0;
    }
    for (const mesh of this.pools) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.moveCamera(run, frame, viewX, feet, playerZ);
  }

  /** Sim z (forward) to render z (-z forward), relative to the rebased origin. */
  private toRender(z: number): number {
    return -(z - this.origin);
  }

  private placeScenery(run: Run, viewZ: number): void {
    const density = this.tier === 2 ? 0.3 : 0.6;
    const firstBin = Math.floor((viewZ - VIEW_BEHIND) / SCENERY_BIN);
    for (let bin = firstBin; bin * SCENERY_BIN < viewZ + VIEW_AHEAD; bin++) {
      for (const side of [-1, 1]) {
        const chance = hashPosition(bin, side + 3);
        if (chance > density) continue;
        const z = bin * SCENERY_BIN;
        const zone = zoneAt(z - run.startZ);
        const spread = zone === 2 ? 22 : 10;
        this.place(this.scenery[zone]!, side * (spread + chance * 16), 0, this.toRender(z), chance * 9, 0.85 + chance * 0.5);
      }
    }
    for (let bin = Math.floor(viewZ / CLOUD_BIN) - 1; bin * CLOUD_BIN < viewZ + 260; bin++) {
      const chance = hashPosition(bin, 11);
      this.place(this.clouds, (chance - 0.5) * 160, 30 + chance * 20, this.toRender(bin * CLOUD_BIN), chance * 3, 1 + chance);
    }
  }

  private updateParticles(delta: number, playerZ: number, feet: number, viewX: number, frame: FrameState): void {
    const state = this.petalState;
    for (let index = 0; index < PETALS; index++) {
      const offset = index * 7;
      if (state[offset + 6]! <= 0) continue;
      state[offset + 6]! -= delta;
      state[offset + 4]! -= 6 * delta;
      for (let axis = 0; axis < 3; axis++) state[offset + axis]! += state[offset + 3 + axis]! * delta;
      this.dummy.rotation.set(index + this.time * 4, index, this.time * 3);
      this.dummy.position.set(state[offset]!, Math.max(0.05, state[offset + 1]!), state[offset + 2]!);
      this.dummy.scale.setScalar(Math.min(1, state[offset + 6]! * 2));
      this.dummy.updateMatrix();
      this.petals.setMatrixAt(this.petals.count++, this.dummy.matrix);
    }
    const streaks = this.streakState;
    for (let index = 0; index < STREAKS; index++) {
      const offset = index * 4;
      if (streaks[offset + 3]! <= 0) continue;
      streaks[offset + 3]! -= delta;
      streaks[offset + 2]! += 16 * delta;
      this.place(this.streaks, streaks[offset]!, streaks[offset + 1]!, streaks[offset + 2]!, 0, streaks[offset + 3]! * 2.5, 1);
    }
    // §8: three stars circle the capybara's head after a bonk.
    if (frame.bonkSeconds > 0.45) {
      for (let index = 0; index < 3; index++) {
        const angle = this.time * 4 + (index * Math.PI * 2) / 3;
        this.place(this.stars, viewX + Math.cos(angle) * 0.45, feet + 1.55, playerZ + 0.3 + Math.sin(angle) * 0.45, angle, 1);
      }
    }
  }

  private poseCapybara(run: Run, frame: FrameState, viewX: number, feet: number, playerZ: number): void {
    const runner = run.runner;
    const motion = !frame.reducedMotion;
    const time = this.time;
    const capybara = this.capybara;
    if (this.hat.geometry !== this.hats[frame.hat]) this.hat.geometry = this.hats[frame.hat]!;
    this.skateMaterial.color.setHex(SKATE_COLORS[frame.skates]!);
    const sideways = (runner.x - runner.previousX) / STEP_SECONDS;
    this.lean += (-sideways * 0.05 - this.lean) * Math.min(1, frame.delta * 14);
    const onGround = feet === 0 && !run.over;
    const stride = motion && onGround && run.speed > 0 ? Math.sin(time * 9) : 0;
    capybara.position.set(viewX, feet + Math.abs(stride) * 0.03, playerZ);
    // A scrape, or the swim ring just popped: the capybara wobbles on (§8).
    const wobbling = runner.scrapeSeconds > 0 || run.graceSeconds > 0;
    capybara.rotation.set(0, stride * 0.05, this.lean + (wobbling ? Math.sin(time * 30) * 0.12 : 0));
    capybara.scale.set(1, 1, 1);
    this.hat.position.set(0, 1.19, -0.55);
    this.hat.rotation.set(0, 0, 0);
    if (isLow(runner) && !run.over) {
      // The belly-slide: flat on its tummy, nose tucked, tobogganing (§3).
      capybara.scale.set(1.08, 0.58, 1.12);
      capybara.rotation.x = 0.08;
    } else if (runner.vertical === 'jump' || runner.vertical === 'spring') {
      const rising = runner.feet > runner.previousFeet;
      capybara.scale.set(rising ? 0.94 : 1.02, rising ? 1.08 : 0.97, 1);
      capybara.rotation.x = rising ? -0.12 : 0.1;
    } else if (run.floating) {
      capybara.rotation.z += Math.sin(time * 2) * 0.1;
    }
    if (frame.bonkSeconds >= 0) {
      // §8: one roll backward, then sitting up, legs out, while the hat pops off and plops back.
      const roll = Math.min(1, frame.bonkSeconds / 0.5);
      // Positive pitch lifts the nose: one full turn backward flows into sitting up, rear
      // down and front legs out.
      capybara.rotation.set(roll * (Math.PI * 2 + 0.7), 0, 0);
      capybara.position.z += (1 - (1 - roll) ** 2) * 0.9;
      capybara.position.y = roll < 1 ? Math.sin(roll * Math.PI) * 0.5 : 0;
      const hop = (frame.bonkSeconds - 0.2) / 0.7;
      if (hop > 0 && hop < 1) {
        this.hat.position.y += Math.sin(hop * Math.PI) * 0.9;
        this.hat.rotation.z = hop * Math.PI * 2;
      }
    }
    const blinkPhase = (time + 0.4) % 3.4;
    const blinking = blinkPhase < 0.12 || (frame.bonkSeconds > 1 && frame.bonkSeconds < 1.15);
    this.eyes.scale.set(1, blinking ? 0.15 : 1, 1);
    this.eyes.position.y = blinking ? 0.9 : 0;
    this.tail.rotation.set(-0.15 + Math.sin(time * (motion ? 16 : 6)) * 0.18, Math.sin(time * 7) * 0.2, 0);
    this.wornRing.visible = run.ring;
    this.wornBubble.visible = run.floating && runner.vertical === 'float';
    if (this.wornBubble.visible) {
      const waiting = run.bubbleSeconds === 0 ? 0.08 : 0.025;
      this.wornBubble.scale.set(1 + Math.sin(time * 9) * waiting, 1 - Math.sin(time * 9) * waiting, 1);
    }
    this.wornPinwheel.visible = run.pinwheelSeconds > 0;
    this.wornPinwheel.rotation.z = time * 10;
  }

  private moveCamera(run: Run, frame: FrameState, viewX: number, feet: number, playerZ: number): void {
    const motion = !frame.reducedMotion;
    this.cameraX += (viewX * 0.55 - this.cameraX) * Math.min(1, frame.delta * 6);
    const speedFraction = Math.max(0, (run.speed - 8) / 10);
    // §7a: the camera widens slightly with speed and shakes once, a little, on a bonk.
    this.camera.fov = this.baseFov + (motion ? speedFraction * 7 : 0);
    this.camera.updateProjectionMatrix();
    let shake = 0;
    if (motion && frame.bonkSeconds >= 0 && frame.bonkSeconds < 0.35) shake = Math.sin(frame.bonkSeconds * 70) * 0.07 * (1 - frame.bonkSeconds / 0.35);
    this.camera.position.set(this.cameraX + shake, this.cameraUp + feet * 0.35, playerZ + this.cameraBack);
    // §8: after a bonk the camera stops and leans toward the obstacle that was hit (it is
    // already straight ahead), keeping the capybara's sit-up in frame below the results card.
    const lookX = run.bonked && frame.bonkSeconds >= 0 ? run.bonked.x * 0.6 : this.cameraX * 0.8;
    this.camera.lookAt(lookX, this.lookHeight + feet * 0.25, playerZ - 9);
    this.sky.position.copy(this.camera.position);
  }

  render(): void {
    if (!this.lost) this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
