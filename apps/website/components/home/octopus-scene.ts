import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  NormalBlending,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { octopus } from '@/lib/brand';

/** Width of the octopus in world units; its height follows the logo. */
const WORLD_WIDTH = 3.2;
const WORLD_HEIGHT = (WORLD_WIDTH * octopus.height) / octopus.width;
/** The head circle of logo.png, in logo units (see lib/brand.ts). */
const HEAD = { x: 62.7, y: 27.6, radius: 28 } as const;

export type ScreenPoint = { x: number; y: number };

export interface OctopusSceneOptions {
  canvas: HTMLCanvasElement;
  /** Points of the outline, in logo units, whose screen positions are reported. */
  anchors: ReadonlyArray<readonly [number, number]>;
  dark: boolean;
  /** Without motion the scene renders single frames on demand. */
  animate: boolean;
  onFrame(anchors: ScreenPoint[], head: ScreenPoint, time: number): void;
}

export interface OctopusScene {
  setDark(dark: boolean): void;
  /** Pointer position over the stage, from -1 to 1 on both axes. */
  setPointer(x: number, y: number): void;
  /** Light the octopus up for one commit. */
  flash(): void;
  setActive(active: boolean): void;
  resize(): void;
  dispose(): void;
}

const toWorld = (x: number, y: number) =>
  [
    (x / octopus.width - 0.5) * WORLD_WIDTH,
    (0.5 - y / octopus.height) * WORLD_HEIGHT
  ] as const;

/**
 * How far an arm sways at world position x. The same formula runs in the
 * vertex shader, so reported anchor points stay on the moving arm tips.
 */
function sway(x: number, time: number) {
  const reach = Math.min(Math.max((Math.abs(x) - 0.5) / 1.1, 0), 1);
  const arm = reach * reach * (3 - 2 * reach);
  const side = Math.sign(x);
  return {
    y: Math.sin(time * 1.35 - Math.abs(x) * 2.4 + side * 0.7) * 0.075 * arm,
    z: Math.cos(time * 1.05 - Math.abs(x) * 2.1 + side) * 0.12 * arm * arm
  };
}

// The back half is the front mirrored through z, so its z offset is negated
// in object space to move both halves the same way.
const swayShader = /* glsl */ `
  float coReach = clamp((abs(transformed.x) - 0.5) / 1.1, 0.0, 1.0);
  float coArm = coReach * coReach * (3.0 - 2.0 * coReach);
  float coSide = sign(transformed.x);
  float coMirror = sign(determinant(mat3(modelMatrix)));
  transformed.y += sin(uTime * 1.35 - abs(transformed.x) * 2.4 + coSide * 0.7) * 0.075 * coArm;
  transformed.z += cos(uTime * 1.05 - abs(transformed.x) * 2.1 + coSide) * 0.12 * coArm * coArm * coMirror;
`;

/** The outline as a closed polygon in logo units, `steps` points per curve. */
function outlinePoints(steps: number) {
  const tokens = octopus.path.match(/[MCZ]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const points: Array<readonly [number, number]> = [];
  let cursor = 0;
  let current: readonly [number, number] = [0, 0];
  const read = () => Number(tokens[cursor++]);
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === 'M') {
      current = [read(), read()];
      points.push(current);
    } else if (command === 'C') {
      const [x0, y0] = current;
      const [x1, y1, x2, y2, x3, y3] = [
        read(),
        read(),
        read(),
        read(),
        read(),
        read()
      ];
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const m = 1 - t;
        points.push([
          m * m * m * x0 +
            3 * m * m * t * x1 +
            3 * m * t * t * x2 +
            t * t * t * x3,
          m * m * m * y0 +
            3 * m * m * t * y1 +
            3 * m * t * t * y2 +
            t * t * t * y3
        ]);
      }
      current = [x3, y3];
    }
  }
  return points;
}

const PAD = 2;

/**
 * Scan-converts the outline onto a grid of `columns` cells across: rows tell
 * which cell centres are inside and where the outline crosses horizontal
 * grid edges, columns where it crosses vertical ones.
 */
function scanOutline(columns: number) {
  const rows = Math.round((columns * octopus.height) / octopus.width);
  const gw = columns + PAD * 2;
  const gh = rows + PAD * 2;
  const outline = outlinePoints(16).map(
    ([x, y]) =>
      [
        (x / octopus.width) * columns + PAD - 0.5,
        (y / octopus.height) * rows + PAD - 0.5
      ] as const
  );
  const rowHits: number[][] = Array.from({ length: gh }, () => []);
  const columnHits: number[][] = Array.from({ length: gw }, () => []);
  outline.forEach(([ax, ay], index) => {
    const [bx, by] = outline[(index + 1) % outline.length];
    for (let y = Math.ceil(Math.min(ay, by)); y < Math.max(ay, by); y++) {
      rowHits[y]?.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    for (let x = Math.ceil(Math.min(ax, bx)); x < Math.max(ax, bx); x++) {
      columnHits[x]?.push(ay + ((x - ax) * (by - ay)) / (bx - ax));
    }
  });
  const inside = new Uint8Array(gw * gh);
  // Where the outline crosses the edge from cell i to its right (`across`)
  // or lower (`down`) neighbour, as a fraction of the cell size.
  const across = new Float32Array(gw * gh).fill(0.5);
  const down = new Float32Array(gw * gh).fill(0.5);
  rowHits.forEach((hits, y) => {
    hits.sort((a, b) => a - b);
    for (let k = 0; k + 1 < hits.length; k += 2) {
      for (let x = Math.ceil(hits[k]); x < hits[k + 1]; x++)
        inside[y * gw + x] = 1;
    }
    for (const hit of hits)
      across[y * gw + Math.floor(hit)] = hit - Math.floor(hit);
  });
  columnHits.forEach((hits, x) => {
    for (const hit of hits)
      down[Math.floor(hit) * gw + x] = hit - Math.floor(hit);
  });
  return { columns, rows, gw, gh, inside, across, down };
}

type Grid = ReturnType<typeof scanOutline>;

/**
 * Solves ∇²u = -1 inside the outline with u = 0 on it, by over-relaxed
 * Gauss-Seidel. Next to the outline the stencil uses the distance to where
 * the outline crosses (Shortley-Weller) rather than to the next cell, so the
 * solution falls to zero exactly on the silhouette instead of in steps.
 */
function solveHeights(grid: Grid, iterations: number, initial?: Float32Array) {
  const { columns, gw, gh, inside, across, down } = grid;
  const nodes: number[] = [];
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++)
      if (inside[y * gw + x]) nodes.push(y * gw + x);
  }
  const clamp = (value: number) => Math.min(Math.max(value, 0.04), 1);
  const weights = new Float32Array(nodes.length * 5);
  nodes.forEach((i, n) => {
    const left = inside[i - 1] ? 1 : clamp(1 - across[i - 1]);
    const right = inside[i + 1] ? 1 : clamp(across[i]);
    const up = inside[i - gw] ? 1 : clamp(1 - down[i - gw]);
    const below = inside[i + gw] ? 1 : clamp(down[i]);
    weights[n * 5] = 2 / (left * (left + right));
    weights[n * 5 + 1] = 2 / (right * (left + right));
    weights[n * 5 + 2] = 2 / (up * (up + below));
    weights[n * 5 + 3] = 2 / (below * (up + below));
    weights[n * 5 + 4] = 2 / (left * right) + 2 / (up * below);
  });
  const u = initial ?? new Float32Array(gw * gh);
  for (let i = 0; i < u.length; i++) if (!inside[i]) u[i] = 0;
  const h2 = (WORLD_WIDTH / columns) ** 2;
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let n = 0; n < nodes.length; n++) {
      const i = nodes[n];
      const w = n * 5;
      const next =
        (weights[w] * u[i - 1] +
          weights[w + 1] * u[i + 1] +
          weights[w + 2] * u[i - gw] +
          weights[w + 3] * u[i + gw] +
          h2) /
        weights[w + 4];
      u[i] += 1.9 * (next - u[i]);
    }
  }
  return u;
}

/** Samples a coarse solution onto a finer grid, as its starting point. */
function upsample(coarse: Grid, values: Float32Array, fine: Grid) {
  const result = new Float32Array(fine.gw * fine.gh);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= coarse.gw || y >= coarse.gh
      ? 0
      : values[y * coarse.gw + x];
  for (let y = 0; y < fine.gh; y++) {
    const cy = ((y - PAD + 0.5) / fine.rows) * coarse.rows + PAD - 0.5;
    const y0 = Math.floor(cy);
    const fy = cy - y0;
    for (let x = 0; x < fine.gw; x++) {
      const cx = ((x - PAD + 0.5) / fine.columns) * coarse.columns + PAD - 0.5;
      const x0 = Math.floor(cx);
      const fx = cx - x0;
      result[y * fine.gw + x] =
        (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
        (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    }
  }
  return result;
}

/**
 * Builds one half (the front) of the octopus as a height field over the logo
 * outline. Heights take the square root of the Poisson solution, which turns
 * every part of the flat logo into a rounded, balloon-like volume; a sphere
 * is blended over the head so it stays round. Cells cut by the outline are
 * clipped to it, so the front and the mirrored back meet exactly on the
 * silhouette. A half-resolution solve seeds the full one, which then needs
 * only a few iterations.
 */
function buildHalfGeometry(columns: number) {
  const coarse = scanOutline(Math.round(columns / 2));
  const grid = scanOutline(columns);
  const u = solveHeights(
    grid,
    40,
    upsample(coarse, solveHeights(coarse, 150), grid)
  );
  const { rows, gw, gh, inside, across, down } = grid;
  const pad = PAD;

  const [headX, headY] = toWorld(HEAD.x, HEAD.y);
  const headRadius = (HEAD.radius / octopus.width) * WORLD_WIDTH;
  const worldX = (x: number) => ((x - pad + 0.5) / columns - 0.5) * WORLD_WIDTH;
  const worldY = (y: number) => (0.5 - (y - pad + 0.5) / rows) * WORLD_HEIGHT;
  const heightAt = (x: number, y: number, i: number) => {
    const body = 1.62 * Math.sqrt(Math.max(u[i], 0));
    const dx = worldX(x) - headX;
    const dy = worldY(y) - headY;
    // Capped by the body near the outline, so the rim still meets at zero.
    const head = Math.min(
      0.9 * Math.sqrt(Math.max(headRadius * headRadius - dx * dx - dy * dy, 0)),
      body * 1.8
    );
    // Smooth maximum, so the head grows out of the body without a crease.
    const k = 0.12;
    const h = Math.max(k - Math.abs(body - head), 0) / k;
    return Math.max(body, head) + (h * h * k) / 4;
  };

  const positions: number[] = [];
  const onRim: boolean[] = [];
  const nodeIndex = new Int32Array(gw * gh).fill(-1);
  const edgeIndex = new Map<number, number>();

  const node = (x: number, y: number) => {
    const i = y * gw + x;
    if (nodeIndex[i] < 0) {
      nodeIndex[i] = positions.length / 3;
      positions.push(worldX(x), worldY(y), heightAt(x, y, i));
      onRim.push(false);
    }
    return nodeIndex[i];
  };
  // A rim vertex where the outline crosses the grid edge between two cells.
  const crossing = (a: number, b: number) => {
    const first = Math.min(a, b);
    const vertical = Math.abs(a - b) !== 1;
    const key = first * 2 + (vertical ? 1 : 0);
    const known = edgeIndex.get(key);
    if (known !== undefined) return known;
    const x = first % gw;
    const y = (first - x) / gw;
    const index = positions.length / 3;
    positions.push(
      worldX(vertical ? x : x + across[first]),
      worldY(vertical ? y + down[first] : y),
      0
    );
    onRim.push(true);
    edgeIndex.set(key, index);
    return index;
  };

  const indices: number[] = [];
  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const corners = [
        y * gw + x,
        y * gw + x + 1,
        (y + 1) * gw + x + 1,
        (y + 1) * gw + x
      ];
      if (!corners.some((corner) => inside[corner])) continue;
      const polygon: number[] = [];
      for (let k = 0; k < 4; k++) {
        const a = corners[k];
        const b = corners[(k + 1) % 4];
        if (inside[a]) polygon.push(node(a % gw, (a - (a % gw)) / gw));
        if (inside[a] !== inside[b]) polygon.push(crossing(a, b));
      }
      for (let k = 1; k < polygon.length - 1; k++) {
        indices.push(polygon[0], polygon[k], polygon[k + 1]);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // The rim is vertical, so front and back share its normals.
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.length);
  const top = new Color('#ff6a44');
  const bottom = new Color('#e3411d');
  const mixed = new Color();
  for (let i = 0; i < positions.length / 3; i++) {
    if (onRim[i]) {
      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const length = Math.hypot(nx, ny) || 1;
      normals.setXYZ(i, nx / length, ny / length, 0);
    }
    const t = Math.min(
      Math.max(0.5 - positions[i * 3 + 1] / WORLD_HEIGHT, 0),
      1
    );
    mixed.copy(top).lerp(bottom, t);
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function radialTexture(inner: string, outer: string) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createOctopusScene(options: OctopusSceneOptions): OctopusScene {
  const { canvas, anchors, animate, onFrame } = options;
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'default'
  });
  // At least 1.5× so standard-density screens get supersampled edges.
  renderer.setPixelRatio(
    Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2)
  );
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;

  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.42, 8.4);
  camera.lookAt(0, -0.05, 0);

  const key = new DirectionalLight('#fff3ea', 2.5);
  key.position.set(-3, 4.5, 5);
  // A cool rim from behind traces the silhouette in the brand's sea colour.
  const rim = new DirectionalLight('#9be7df', 1.4);
  rim.position.set(3.5, 2.5, -4.5);
  const hemisphere = new HemisphereLight('#ffe6da', '#3a1a10', 0.4);
  scene.add(key, rim, hemisphere);

  const time = { value: 0 };
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.28,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new Color('#ffb59e'),
    emissive: new Color('#ff5a33'),
    emissiveIntensity: 0
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${swayShader}`
      );
  };

  const geometry = buildHalfGeometry(window.innerWidth < 720 ? 170 : 240);
  const body = new Group();
  const front = new Mesh(geometry, material);
  const back = new Mesh(geometry, material);
  back.scale.z = -1;
  body.add(front, back);

  // A soft shadow (a glow in dark mode) that always faces the camera.
  const shadowTexture = radialTexture(
    'rgba(255,255,255,1)',
    'rgba(255,255,255,0)'
  );
  const floor = new Sprite(
    new SpriteMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false
    })
  );
  floor.position.set(0, -WORLD_HEIGHT / 2 - 0.32, -0.4);

  const root = new Group();
  root.add(body);
  scene.add(root, floor);

  const setDark = (dark: boolean) => {
    const floorMaterial = floor.material;
    floorMaterial.color.set(dark ? '#ff6a45' : '#6b3020');
    floorMaterial.opacity = dark ? 0.38 : 0.28;
    floorMaterial.blending = dark ? AdditiveBlending : NormalBlending;
    floorMaterial.needsUpdate = true;
    key.intensity = dark ? 2.2 : 2.5;
    rim.intensity = dark ? 2.2 : 1.4;
    hemisphere.intensity = dark ? 0.3 : 0.4;
    if (!running) render(clock);
  };

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let flashStart = -10;
  let clock = 0;
  let last = 0;
  let frame = 0;
  let running = false;
  let active = true;
  let width = 0;
  let height = 0;

  const anchorWorld = anchors.map(([x, y]) => toWorld(x, y));
  const [headX, headY] = toWorld(HEAD.x, HEAD.y);
  const scratch = new Vector3();
  const project = (x: number, y: number, z: number): ScreenPoint => {
    scratch.set(x, y, z).applyMatrix4(body.matrixWorld).project(camera);
    return {
      x: (scratch.x * 0.5 + 0.5) * width,
      y: (0.5 - scratch.y * 0.5) * height
    };
  };

  function render(seconds: number) {
    time.value = seconds;
    const motion = animate ? 1 : 0;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    root.rotation.y =
      pointer.x * 0.42 + Math.sin(seconds * 0.32) * 0.1 * motion;
    root.rotation.x = 0.06 + pointer.y * 0.2;
    root.position.y = Math.sin(seconds * 0.9) * 0.07 * motion;
    const glow = Math.max(0, 1 - (seconds - flashStart) / 0.9);
    material.emissiveIntensity = glow * glow * 0.55;
    floor.scale.set(
      3.1 - root.position.y * 1.2,
      0.5 - root.position.y * 0.3,
      1
    );
    renderer.render(scene, camera);

    const points = anchorWorld.map(([x, y]) => {
      const offset = sway(x, seconds);
      return project(x, y + offset.y, offset.z);
    });
    onFrame(points, project(headX, headY, 0.62), seconds);
  }

  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const delta = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    clock += delta;
    render(clock);
  };

  const start = () => {
    if (running || !animate || !active) return;
    running = true;
    last = 0;
    frame = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(frame);
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the whole octopus in view on narrow stages.
    camera.position.z =
      camera.aspect < 1.1 ? 8.4 * (1.1 / camera.aspect) ** 0.9 : 8.4;
    camera.updateProjectionMatrix();
    if (!running) render(clock);
  };

  resize();
  setDark(options.dark);
  start();

  return {
    setDark,
    setPointer(x, y) {
      pointer.tx = Math.max(-1, Math.min(1, x));
      pointer.ty = Math.max(-1, Math.min(1, y));
      if (!running) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        render(clock);
      }
    },
    flash() {
      flashStart = clock;
      if (!running) render(clock);
    },
    setActive(next) {
      active = next;
      if (active) start();
      else stop();
    },
    resize,
    dispose() {
      stop();
      geometry.dispose();
      material.dispose();
      floor.material.dispose();
      shadowTexture.dispose();
      environment.dispose();
      renderer.dispose();
    }
  };
}
