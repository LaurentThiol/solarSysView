import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import solar, { type BodyInfo, type BodyPosition } from "../../ephemeris/solar.js";
import { loadClouds, loadTexture, photoUrl, proceduralTexture } from "./textures";
import type { ViewSettings } from "./view";

const AU_SCENE = 10;
const SUN_RADIUS = 1.15;

interface Actor {
  info: BodyInfo;
  root: THREE.Group;
  tilt: THREE.Group;
  spin: THREE.Group;
  mesh: THREE.Mesh;
  clouds: THREE.Mesh | null;
  rings: THREE.Mesh | null;
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
}

interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

interface Tween {
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  fromT: THREE.Vector3;
  toT: THREE.Vector3;
  t: number;
  dur: number;
}

export class SolarScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly actors = new Map<string, Actor>();
  private readonly labels = new Map<string, HTMLElement>();
  private readonly catalog = solar.catalog();
  private readonly orbitGroup = new THREE.Group();
  private readonly moonOrbits = new Map<string, THREE.LineLoop>();
  private readonly belt: THREE.Points;
  private readonly beltSource: { x: number; y: number; z: number }[] = [];
  private readonly marker: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly clock = new THREE.Clock();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private view: ViewSettings | null = null;
  private exponent = -1;
  private size = -1;
  private tween: Tween | null = null;
  private selectedId: string | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly labelLayer: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x08090d, 1);
    this.scene.add(new THREE.AmbientLight(0x8ea0c0, 0.16));
    this.scene.add(new THREE.HemisphereLight(0x243044, 0x1a120c, 0.22));
    const sunLight = new THREE.PointLight(0xfff4e0, 8, 0, 0);
    this.scene.add(sunLight);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.02, 2000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 420;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI - 0.12;
    this.controls.addEventListener("start", () => {
      this.tween = null;
    });
    this.scene.add(this.makeStars());
    this.scene.add(this.orbitGroup);
    this.belt = this.makeBelt();
    this.scene.add(this.belt);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.28, 72),
      new THREE.MeshBasicMaterial({
        color: 0xd4b483,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = Math.PI / 2;
    this.marker.raycast = () => undefined;
    const sphere = new THREE.SphereGeometry(1, 48, 32);
    for (const info of this.catalog.bodies) this.addBody(info, sphere);
    this.addCorona();
    this.exponent = 0.55;
    this.size = 16;
    this.applySizes();
    this.rebuildPlanetOrbits();
    this.rebuildMoonOrbits();
    this.placeBelt();
    this.resize();
    const pose = this.fullPose();
    if (this.reducedMotion) {
      this.camera.position.copy(pose.position);
      this.controls.target.copy(pose.target);
    } else {
      this.camera.position.copy(pose.position).multiplyScalar(1.7);
      this.tween = {
        fromP: this.camera.position.clone(),
        toP: pose.position.clone(),
        fromT: new THREE.Vector3(),
        toT: pose.target.clone(),
        t: 0,
        dur: 2.6,
      };
    }
    void this.loadPhotos();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const id = hits[0]?.object.userData.bodyId;
    return typeof id === "string" ? id : null;
  }

  showInner(): void {
    this.moveTo(this.innerPose());
  }

  showFull(): void {
    this.moveTo(this.fullPose());
  }

  frame(id: string): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    const radius = actor.mesh.scale.x;
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.7, 0.45, 1);
    direction.normalize();
    const distance = Math.max(radius * (id === "saturn" ? 9 : 8), 1.15);
    this.moveTo({
      position: actor.root.position.clone().add(direction.multiplyScalar(distance)),
      target: actor.root.position.clone(),
    });
  }

  update(jd: number, view: ViewSettings, selectedId: string | null): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.view = view;
    this.selectedId = selectedId;
    if (this.exponent !== view.exponent) {
      this.exponent = view.exponent;
      this.rebuildPlanetOrbits();
      this.placeBelt();
    }
    if (this.size !== view.size) {
      this.size = view.size;
      this.applySizes();
      this.rebuildMoonOrbits();
    }
    this.orbitGroup.visible = view.orbits;
    this.belt.visible = view.belt;
    if (!this.reducedMotion) this.belt.rotation.y += dt * 0.012;
    const placed = new Map<string, BodyPosition>(solar.positions(jd).map((point) => [point.id, point]));
    for (const info of this.catalog.bodies) {
      const actor = this.actors.get(info.id);
      const point = placed.get(info.id);
      if (!actor || !point) continue;
      if (info.parent) {
        const parent = this.actors.get(info.parent);
        const origin = placed.get(info.parent);
        if (!parent || !origin) continue;
        actor.root.position.copy(parent.root.position).add(
          this.offsetVector(point.x - origin.x, point.y - origin.y, point.z - origin.z, this.moonBoost()),
        );
      } else {
        actor.root.position.copy(this.compressVector(point.x, point.y, point.z));
      }
      actor.spin.rotation.y = point.spin;
      if (actor.clouds) actor.clouds.rotation.y = jd * 0.35;
    }
    this.placeMarker(selectedId);
    this.updateMoonOrbitVisibility(selectedId);
    this.updateLabels(view, selectedId);
    this.updateCamera(dt, view, selectedId);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private addBody(info: BodyInfo, sphere: THREE.SphereGeometry): void {
    const root = new THREE.Group();
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(info.obliquityDeg);
    const material =
      info.id === "sun"
        ? new THREE.MeshBasicMaterial({ color: info.color, map: proceduralTexture(info) })
        : new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: proceduralTexture(info),
            roughness: info.id === "europa" || info.id === "moon" ? 0.72 : 0.9,
            metalness: 0.02,
          });
    const mesh = new THREE.Mesh(sphere, material);
    mesh.userData.bodyId = info.id;
    spin.add(mesh);
    tilt.add(spin);
    let rings: THREE.Mesh | null = null;
    if (info.id === "saturn") {
      rings = new THREE.Mesh(new THREE.RingGeometry(1.22, 2.35, 96), this.ringMaterial());
      rings.rotation.x = Math.PI / 2;
      rings.userData.bodyId = info.id;
      tilt.add(rings);
      this.pickables.push(rings);
    }
    root.add(tilt);
    this.scene.add(root);
    this.pickables.push(mesh);
    const label = document.createElement("span");
    label.className = "body-label";
    label.textContent = info.name;
    this.labelLayer.append(label);
    this.labels.set(info.id, label);
    this.actors.set(info.id, { info, root, tilt, spin, mesh, clouds: null, rings, material });
  }

  private addCorona(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255, 244, 220, 0.95)");
    gradient.addColorStop(0.18, "rgba(255, 186, 90, 0.45)");
    gradient.addColorStop(0.46, "rgba(255, 120, 40, 0.12)");
    gradient.addColorStop(1, "rgba(255, 80, 20, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    sprite.scale.set(SUN_RADIUS * 7.5, SUN_RADIUS * 7.5, 1);
    this.scene.add(sprite);
  }

  private ringMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color("#e4d2a8") } },
      vertexShader: `
        varying float vRadius;
        void main() {
          vRadius = length(position.xy);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vRadius;
        uniform vec3 uColor;
        void main() {
          float t = clamp((vRadius - 1.22) / (2.35 - 1.22), 0.0, 1.0);
          float alpha = smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.9, 1.0, t));
          float bands = 0.62 + 0.38 * sin(t * 86.0);
          float division = smoothstep(0.02, 0.0, abs(t - 0.58));
          alpha *= bands * (1.0 - 0.9 * division);
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(uColor, alpha * 0.92);
        }
      `,
    });
  }

  private makeStars(): THREE.Points {
    const count = 2800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const radius = 380 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const warm = Math.random();
      colors[i * 3] = 0.75 + warm * 0.25;
      colors[i * 3 + 1] = 0.78 + Math.random() * 0.15;
      colors[i * 3 + 2] = 0.85 + (1 - warm) * 0.15;
      sizes[i] = 0.6 + Math.random() * 1.8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (220.0 / max(1.0, -mv.z)), 0.4, 3.2);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    return new THREE.Points(geometry, material);
  }

  private makeBelt(): THREE.Points {
    const count = 2200;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const axis = 2.15 + Math.random() * 1.25;
      const angle = Math.random() * Math.PI * 2;
      const inclination = (Math.random() - 0.5) * 0.16;
      const radius = axis * (0.96 + Math.random() * 0.08);
      this.beltSource.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        z: radius * Math.sin(inclination),
      });
      const tone = 0.35 + Math.random() * 0.35;
      colors[i * 3] = tone + 0.15;
      colors[i * 3 + 1] = tone;
      colors[i * 3 + 2] = tone * 0.8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.055,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
  }

  private async loadPhotos(): Promise<void> {
    await Promise.all(
      [...this.actors.values()].map(async (actor) => {
        const url = photoUrl(actor.info.id);
        if (!url) return;
        const texture = await loadTexture(url);
        if (!texture) return;
        actor.material.map = texture;
        actor.material.needsUpdate = true;
        if (actor.info.id !== "earth" || !(actor.material instanceof THREE.MeshStandardMaterial)) return;
        const [night, clouds] = await Promise.all([
          loadTexture("/textures/earth-night.jpg"),
          loadClouds("/textures/earth-clouds.jpg"),
        ]);
        if (night) {
          actor.material.emissive = new THREE.Color("#ffffff");
          actor.material.emissiveMap = night;
          actor.material.emissiveIntensity = 0.55;
          actor.material.needsUpdate = true;
        }
        if (clouds) {
          const cloud = new THREE.Mesh(
            actor.mesh.geometry,
            new THREE.MeshStandardMaterial({
              map: clouds,
              transparent: true,
              opacity: 0.42,
              depthWrite: false,
              roughness: 1,
            }),
          );
          cloud.userData.bodyId = "earth";
          actor.spin.add(cloud);
          actor.clouds = cloud;
          this.pickables.push(cloud);
          this.applySizes();
        }
      }),
    );
  }

  private applySizes(): void {
    for (const actor of this.actors.values()) {
      const radius = shownRadius(actor.info, this.size);
      actor.mesh.scale.setScalar(radius);
      if (actor.clouds) actor.clouds.scale.setScalar(radius * 1.015);
      if (actor.rings) actor.rings.scale.setScalar(radius);
    }
    this.placeMarker(this.selectedId);
  }

  private rebuildPlanetOrbits(): void {
    for (const child of [...this.orbitGroup.children]) {
      const line = child as THREE.LineLoop;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.orbitGroup.remove(line);
    }
    for (const info of this.catalog.bodies) {
      if (!info.hasOrbit || info.parent) continue;
      const points = solar.sampleOrbit(info.id, 240).map((point) => this.compressVector(point.x, point.y, point.z));
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: info.color, transparent: true, opacity: 0.4 }),
      );
      this.orbitGroup.add(line);
    }
  }

  private rebuildMoonOrbits(): void {
    for (const line of this.moonOrbits.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      line.removeFromParent();
    }
    this.moonOrbits.clear();
    const boost = this.moonBoost();
    for (const info of this.catalog.bodies) {
      if (!info.parent) continue;
      const parent = this.actors.get(info.parent);
      if (!parent) continue;
      const points = solar
        .sampleOrbit(info.id, 96)
        .map((point) => this.offsetVector(point.x, point.y, point.z, boost));
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: info.color, transparent: true, opacity: 0.45 }),
      );
      parent.root.add(line);
      this.moonOrbits.set(info.id, line);
    }
  }

  private placeBelt(): void {
    const attribute = this.belt.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.beltSource.forEach((point, index) => {
      const placed = this.compressVector(point.x, point.y, point.z);
      attribute.setXYZ(index, placed.x, placed.y, placed.z);
    });
    attribute.needsUpdate = true;
  }

  private placeMarker(selectedId: string | null): void {
    if (!selectedId) {
      this.marker.removeFromParent();
      return;
    }
    const actor = this.actors.get(selectedId);
    if (!actor) return;
    actor.root.add(this.marker);
    const radius = actor.mesh.scale.x;
    const factor = selectedId === "saturn" ? 2.85 : 1.85;
    this.marker.scale.setScalar(Math.max(radius * factor, 0.12));
  }

  private updateMoonOrbitVisibility(selectedId: string | null): void {
    const cameraPosition = this.camera.position;
    for (const [id, line] of this.moonOrbits) {
      const info = this.actors.get(id)?.info;
      const parent = info?.parent ? this.actors.get(info.parent) : undefined;
      const near = parent ? parent.root.position.distanceTo(cameraPosition) < 22 : false;
      line.visible = Boolean(this.view?.orbits && info && (selectedId === id || selectedId === info.parent || near));
    }
  }

  private updateLabels(view: ViewSettings, selectedId: string | null): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const wide = width > 800;
    for (const info of this.catalog.bodies) {
      const label = this.labels.get(info.id);
      const actor = this.actors.get(info.id);
      if (!label || !actor) continue;
      const selected = info.id === selectedId;
      const showNames = view.names && (info.kind !== "moon" || selected || info.parent === selectedId);
      label.classList.toggle("is-selected", selected);
      if (!showNames && !selected) {
        label.hidden = true;
        continue;
      }
      const projected = actor.root.position.clone().project(this.camera);
      if (projected.z > 1) {
        label.hidden = true;
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const covered =
        y < 76 ||
        y > height - (wide ? 96 : 200) ||
        (wide && x < 350) ||
        (wide && x > width - 250);
      label.hidden = covered;
      label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -150%)`;
    }
  }

  private updateCamera(dt: number, view: ViewSettings, selectedId: string | null): void {
    if (this.tween) {
      this.tween.t += dt;
      const k = ease(Math.min(1, this.tween.t / this.tween.dur));
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, k);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, k);
      if (k >= 1) this.tween = null;
      return;
    }
    if (!view.follow || !selectedId) return;
    const actor = this.actors.get(selectedId);
    if (!actor) return;
    const step = actor.root.position.clone().sub(this.controls.target);
    const gain = 1 - Math.pow(0.02, dt);
    step.multiplyScalar(gain);
    this.controls.target.add(step);
    this.camera.position.add(step);
  }

  private moveTo(pose: Pose): void {
    this.tween = {
      fromP: this.camera.position.clone(),
      toP: pose.position,
      fromT: this.controls.target.clone(),
      toT: pose.target,
      t: 0,
      dur: this.reducedMotion ? 0.01 : 1.05,
    };
  }

  private fullPose(): Pose {
    const distance = this.sceneRadius(32) * 1.18;
    return {
      position: new THREE.Vector3(distance * 0.46, distance * 0.34, distance * 0.62),
      target: new THREE.Vector3(),
    };
  }

  private innerPose(): Pose {
    const distance = this.sceneRadius(1.7) * 2.5;
    return {
      position: new THREE.Vector3(distance * 0.42, distance * 0.36, distance * 0.64),
      target: new THREE.Vector3(),
    };
  }

  private sceneRadius(au: number): number {
    return Math.pow(Math.max(au, 0.02), this.exponent > 0 ? this.exponent : 0.55) * AU_SCENE;
  }

  private moonBoost(): number {
    return 7 + (this.size > 0 ? this.size : 16) * 0.28;
  }

  private compressVector(x: number, y: number, z: number): THREE.Vector3 {
    const radius = Math.hypot(x, y, z);
    if (radius < 1e-8) return new THREE.Vector3();
    const visual = Math.pow(radius, this.exponent > 0 ? this.exponent : 0.55) * AU_SCENE;
    const scale = visual / radius;
    return new THREE.Vector3(x * scale, z * scale, y * scale);
  }

  private offsetVector(x: number, y: number, z: number, boost: number): THREE.Vector3 {
    const scale = AU_SCENE * boost;
    return new THREE.Vector3(x * scale, z * scale, y * scale);
  }
}

function shownRadius(info: BodyInfo, size: number): number {
  if (info.id === "sun") return SUN_RADIUS;
  const real = (info.radiusKm / 695700) * SUN_RADIUS;
  const boosted = real * (size > 0 ? size : 16);
  const minimum = info.kind === "moon" ? 0.028 : 0.05;
  const cap = info.kind === "moon" ? 0.16 : info.id === "jupiter" || info.id === "saturn" ? 0.86 : 0.4;
  return Math.min(cap, Math.max(minimum, boosted));
}

function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function createScene(canvas: HTMLCanvasElement, labels: HTMLElement): SolarScene | null {
  try {
    return new SolarScene(canvas, labels);
  } catch (error) {
    console.error(error);
    return null;
  }
}
