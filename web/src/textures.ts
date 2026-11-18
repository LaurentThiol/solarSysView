import * as THREE from "three";
import type { BodyInfo } from "../../ephemeris/solar.js";

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number): number {
  return noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function put(data: Uint8ClampedArray, index: number, color: [number, number, number]): void {
  data[index] = color[0];
  data[index + 1] = color[1];
  data[index + 2] = color[2];
  data[index + 3] = 255;
}

function shade(info: BodyInfo, x: number, y: number, width: number, height: number): [number, number, number] {
  const u = x / width;
  const v = y / height;
  const lat = 1 - Math.abs(v * 2 - 1);
  const n = fbm(u * 8, v * 4);
  if (info.id === "sun") {
    const grain = 0.75 + n * 0.35;
    return [255 * grain, 214 * grain, 150 * grain];
  }
  if (info.id === "earth") {
    const land = n > 0.52;
    const ice = lat < 0.16;
    if (ice) return [236, 242, 246];
    if (land) return mix([48, 92, 58], [142, 124, 78], n);
    return mix([18, 72, 128], [36, 120, 156], n);
  }
  if (info.id === "mars") {
    const ice = lat < 0.12 ? 1 : 0;
    const base = mix([140, 72, 46], [92, 42, 32], n);
    return ice ? [230, 226, 220] : base;
  }
  if (info.id === "jupiter" || info.id === "saturn") {
    const band = 0.5 + 0.5 * Math.sin(v * 46 + n * 2);
    const light: [number, number, number] = info.id === "saturn" ? [232, 214, 176] : [226, 198, 156];
    const dark: [number, number, number] = info.id === "saturn" ? [176, 142, 96] : [168, 112, 72];
    const color = mix(dark, light, band);
    if (info.id === "jupiter" && Math.hypot(u - 0.62, (v - 0.58) * 1.8) < 0.045) return [176, 84, 62];
    return color;
  }
  if (info.id === "uranus" || info.id === "neptune") {
    const light: [number, number, number] = info.id === "uranus" ? [196, 230, 232] : [120, 146, 214];
    const dark: [number, number, number] = info.id === "uranus" ? [120, 176, 186] : [48, 70, 150];
    return mix(dark, light, 0.35 + n * 0.4 + Math.sin(v * 20) * 0.08);
  }
  if (info.id === "venus") return mix([214, 176, 110], [236, 214, 168], n);
  if (info.id === "io") return mix([214, 176, 64], [120, 92, 48], n > 0.62 ? 1 : n);
  if (info.id === "europa") {
    const line = Math.abs(Math.sin(u * 18 + v * 9)) > 0.92 || Math.abs(Math.sin(v * 22)) > 0.94;
    return line ? [176, 92, 72] : [232, 228, 220];
  }
  if (info.id === "ganymede") return mix([120, 104, 86], [176, 160, 140], n);
  if (info.id === "callisto") return mix([72, 64, 58], [120, 108, 96], n);
  if (info.id === "halley") {
    const jet = n > 0.68;
    return jet ? [184, 222, 242] : mix([42, 46, 54], [94, 106, 120], n);
  }
  const gray = 150 + n * 70;
  return [gray, gray * 0.98, gray * 0.94];
}

export function proceduralTexture(info: BodyInfo): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      put(image.data, (y * canvas.width + x) * 4, shade(info, x, y, canvas.width, canvas.height));
    }
  }
  if (info.id === "mercury" || info.id === "moon" || info.id === "callisto") {
    context.putImageData(image, 0, 0);
    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (let i = 0; i < 28; i += 1) {
      const cx = hash(i, 3) * canvas.width;
      const cy = hash(i, 9) * canvas.height;
      const radius = 4 + hash(i, 12) * 14;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

const PHOTO_OF: Record<string, string> = {
  sun: "/textures/sun.jpg",
  mercury: "/textures/mercury.jpg",
  venus: "/textures/venus.jpg",
  earth: "/textures/earth.jpg",
  mars: "/textures/mars.jpg",
  jupiter: "/textures/jupiter.jpg",
  saturn: "/textures/saturn.jpg",
  uranus: "/textures/uranus.jpg",
  neptune: "/textures/neptune.jpg",
  moon: "/textures/moon.jpg",
};

export function photoUrl(id: string): string | null {
  return PHOTO_OF[id] ?? null;
}

export function loadTexture(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

export function loadClouds(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const light = pixels.data[i] * 0.3 + pixels.data[i + 1] * 0.59 + pixels.data[i + 2] * 0.11;
        pixels.data[i] = 255;
        pixels.data[i + 1] = 255;
        pixels.data[i + 2] = 255;
        pixels.data[i + 3] = Math.min(255, light * 1.35);
      }
      context.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      resolve(texture);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
