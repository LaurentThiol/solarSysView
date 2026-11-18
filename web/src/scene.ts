import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import solar, { type BodyInfo, type BodyPosition, type IssTelemetry } from "../../ephemeris/solar.js";
import { loadClouds, loadTexture, photoUrl, proceduralTexture } from "./textures";
import type { ViewSettings } from "./view";

const AU_SCENE = 10;
const SUN_RADIUS = 1.15;
const IO_A_AU = 421700 / solar.AU_KM;

interface Actor {
  info: BodyInfo;
  root: THREE.Group;
  tilt: THREE.Group;
  spin: THREE.Group;
  mesh: THREE.Mesh;
  visual: THREE.Object3D;
  clouds: THREE.Mesh | null;
  rings: THREE.Mesh | null;
  halo: THREE.Sprite | null;
  tailGroup: THREE.Group | null;
  ionTailMat: THREE.ShaderMaterial | null;
  dustTailMat: THREE.ShaderMaterial | null;
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | null;
  radius: number;
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
  private readonly earthInfo: BodyInfo | undefined;
  private readonly orbitGroup = new THREE.Group();
  private readonly planetOrbits = new Map<string, THREE.Line | THREE.LineLoop>();
  private readonly moonOrbits = new Map<string, THREE.LineLoop>();
  private readonly belt: THREE.Points;
  private readonly beltSource: { x: number; y: number; z: number }[] = [];
  private readonly marker: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly clock = new THREE.Clock();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private readonly earthSunUniform = { value: new THREE.Vector3(1, 0, 0) };
  private readonly issOrbitNormal = new THREE.Vector3(0, 1, 0);
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpEye = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpBasis = new THREE.Matrix4();
  private view: ViewSettings | null = null;
  private exponent = -1;
  private size = -1;
  private lastIssOrbitJd = Number.NaN;
  private lastJwstOrbitJd = Number.NaN;
  private wasCockpit = false;
  private cockpitTargetId: string | null = null;
  private cockpitYaw = 0;
  private cockpitPitch = 0;
  private readonly cockpitSurfaceLocal = new THREE.Vector3(0, 1, 0);
  private readonly cockpitForwardLocal = new THREE.Vector3(0, 0, 1);
  private tween: Tween | null = null;
  private selectedId: string | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly labelLayer: HTMLElement,
  ) {
    this.earthInfo = this.catalog.bodies.find((body) => body.id === "earth");
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
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 2000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 420;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
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
    this.rebuildMoonOrbits(solar.J2000);
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

  adjustCockpitLook(dYaw: number, dPitch: number): void {
    this.cockpitYaw += dYaw;
    this.cockpitPitch = THREE.MathUtils.clamp(this.cockpitPitch + dPitch, -1.38, 1.38);
  }

  resetCockpitLook(): void {
    this.cockpitYaw = 0;
    this.cockpitPitch = 0;
  }

  frame(id: string): void {
    const actor = this.actors.get(id);
    if (!actor || !actor.root.visible) return;
    const radius = actor.radius;
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.7, 0.45, 1);
    direction.normalize();
    let distance: number;
    if (id === "iss") {
      distance = Math.max(radius * 6.5, 0.12);
    } else if (id === "roadster" || id === "jwst") {
      distance = Math.max(radius * 5.2, 0.15);
    } else if (id === "halley") {
      distance = Math.max(radius * 12, 0.55);
    } else if (id === "saturn") {
      distance = Math.max(radius * 9, 1.15);
    } else if (actor.info.kind === "moon") {
      distance = Math.max(radius * 8, 0.35);
    } else {
      distance = Math.max(radius * 8, 1.05);
    }
    this.moveTo({
      position: actor.root.position.clone().add(direction.multiplyScalar(distance)),
      target: actor.root.position.clone(),
    });
  }

  update(
    jd: number,
    view: ViewSettings,
    selectedId: string | null,
    issTelemetry?: IssTelemetry | null,
  ): void {
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
      this.rebuildMoonOrbits(jd);
    } else {
      if (!Number.isFinite(this.lastIssOrbitJd) || Math.abs(jd - this.lastIssOrbitJd) > 0.01) {
        this.refreshIssOrbit(jd);
      }
      if (!Number.isFinite(this.lastJwstOrbitJd) || Math.abs(jd - this.lastJwstOrbitJd) > 0.5) {
        this.refreshJwstOrbit(jd);
      }
    }
    this.orbitGroup.visible = view.orbits;
    this.belt.visible = view.belt;
    if (!this.reducedMotion) this.belt.rotation.y += dt * 0.012;
    const placed = new Map<string, BodyPosition>(
      solar.positions(jd, { issTelemetry }).map((point) => [point.id, point]),
    );
    let liveIssForward: THREE.Vector3 | null = null;
    if (placed.get("iss")?.source === "live") {
      const ahead = new Map<string, BodyPosition>(
        solar.positions(jd + 15 / 86400, { issTelemetry }).map((point) => [point.id, point]),
      );
      const issNow = placed.get("iss");
      const earthNow = placed.get("earth");
      const issNext = ahead.get("iss");
      const earthNext = ahead.get("earth");
      const issInfo = this.actors.get("iss")?.info;
      if (issNow && earthNow && issNext && earthNext && issInfo) {
        const relNow = this.satelliteOffset(
          issInfo,
          issNow.x - earthNow.x,
          issNow.y - earthNow.y,
          issNow.z - earthNow.z,
        );
        const relNext = this.satelliteOffset(
          issInfo,
          issNext.x - earthNext.x,
          issNext.y - earthNext.y,
          issNext.z - earthNext.z,
        );
        liveIssForward = relNext.sub(relNow);
      }
    }
    const cloudPhase = (((jd - solar.J2000) * 0.35) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

    for (const info of this.catalog.bodies) {
      const actor = this.actors.get(info.id);
      const point = placed.get(info.id);
      if (!actor || !point) continue;

      const visible = (info.kind !== "craft" || view.crafts) && point.active;
      actor.root.visible = visible;
      actor.mesh.visible = visible;
      if (actor.rings) actor.rings.visible = visible;
      if (actor.clouds) actor.clouds.visible = visible;

      if (info.parent) {
        const parent = this.actors.get(info.parent);
        const origin = placed.get(info.parent);
        if (!parent || !origin) continue;
        const relScene = this.satelliteOffset(info, point.x - origin.x, point.y - origin.y, point.z - origin.z);
        actor.root.position.copy(parent.root.position).add(relScene);
        if (info.id === "iss" && relScene.lengthSq() > 1e-10) {
          this.orientIss(actor, relScene, liveIssForward);
        } else if (info.id === "jwst" && actor.root.position.lengthSq() > 1e-8) {
          this.orientJwst(actor);
        } else {
          actor.spin.rotation.y = point.spin;
        }
      } else {
        actor.root.position.copy(this.compressVector(point.x, point.y, point.z));
        actor.spin.rotation.y = point.spin;
      }

      if (actor.clouds) actor.clouds.rotation.y = point.spin + cloudPhase;

      const cometActivity =
        info.id === "halley"
          ? THREE.MathUtils.clamp(Math.pow(0.75 / Math.max(0.58, point.rAu), 1.65), 0, 1)
          : 0;

      if (actor.tailGroup) {
        const showTail = visible && cometActivity > 0.015 && actor.root.position.lengthSq() > 1e-8;
        actor.tailGroup.visible = showTail;
        if (showTail) {
          this.tmpForward.copy(actor.root.position).normalize();
          this.tmpUp.set(0, 1, 0);
          if (Math.abs(this.tmpForward.dot(this.tmpUp)) > 0.95) this.tmpUp.set(1, 0, 0);
          this.tmpRight.crossVectors(this.tmpUp, this.tmpForward).normalize();
          this.tmpUp.crossVectors(this.tmpForward, this.tmpRight).normalize();
          this.tmpBasis.makeBasis(this.tmpRight, this.tmpUp, this.tmpForward);
          actor.tailGroup.quaternion.setFromRotationMatrix(this.tmpBasis);
          const tailWidth = 0.42 + cometActivity * 0.88;
          const tailLength = 0.55 + cometActivity * 3.85;
          actor.tailGroup.scale.set(tailWidth, tailWidth, tailLength);
          if (actor.ionTailMat) actor.ionTailMat.uniforms.uOpacity.value = cometActivity * 0.84;
          if (actor.dustTailMat) actor.dustTailMat.uniforms.uOpacity.value = cometActivity * 0.64;
        }
      }

      if (actor.halo && actor.halo.material instanceof THREE.SpriteMaterial) {
        const inThisCockpit = Boolean(view.cockpit && selectedId === info.id);
        const camDist = this.camera.position.distanceTo(actor.root.position);
        if (info.id === "halley") {
          const comaBoost = 0.18 + cometActivity * 0.82;
          actor.halo.material.opacity = visible && !inThisCockpit ? 0.9 * comaBoost : 0;
          const comaScale = actor.radius * (4.2 + cometActivity * 9.5);
          actor.halo.scale.set(comaScale, comaScale, 1);
        } else {
          const fade = THREE.MathUtils.clamp((camDist - 0.35) / 1.4, 0, 0.85);
          actor.halo.material.opacity = visible && !inThisCockpit ? fade : 0;
          const haloScale = Math.max(actor.radius * 5.5, Math.min(0.42, camDist * 0.022));
          actor.halo.scale.set(haloScale, haloScale, 1);
        }
      }
    }

    const earthActor = this.actors.get("earth");
    if (earthActor && earthActor.root.position.lengthSq() > 1e-8) {
      this.earthSunUniform.value.copy(earthActor.root.position).negate().normalize();
    }

    const roadsterOrbit = this.planetOrbits.get("roadster");
    if (roadsterOrbit) {
      const roadsterPoint = placed.get("roadster");
      const active = Boolean(roadsterPoint?.active);
      roadsterOrbit.visible = view.orbits && view.crafts && (active || selectedId === "roadster");
      const mat = roadsterOrbit.material as THREE.LineDashedMaterial;
      mat.opacity = active ? 0.62 : 0.22;
    }

    const issOrbit = this.moonOrbits.get("iss");
    if (issOrbit && issOrbit.material instanceof THREE.LineBasicMaterial) {
      issOrbit.material.opacity = placed.get("iss")?.source === "live" ? 0.28 : 0.68;
    }

    const targetActor = selectedId ? this.actors.get(selectedId) : undefined;
    const inCockpit = Boolean(view.cockpit && selectedId && targetActor?.root.visible);

    this.placeMarker(inCockpit ? null : selectedId);
    this.updateMoonOrbitVisibility(selectedId);

    if (inCockpit && selectedId) {
      this.applyCockpitCamera(selectedId);
    } else {
      if (this.wasCockpit) {
        this.exitCockpitCamera(selectedId);
      }
      this.updateCamera(dt, view, selectedId);
      this.controls.update();
    }

    this.updateLabels(view, selectedId, inCockpit);
    this.renderer.render(this.scene, this.camera);
  }

  private orientIss(
    actor: Actor,
    relScene: THREE.Vector3,
    forwardHint?: THREE.Vector3 | null,
  ): void {
    this.tmpUp.copy(relScene).normalize();
    if (forwardHint && forwardHint.lengthSq() > 1e-12) {
      this.tmpForward.copy(forwardHint).addScaledVector(this.tmpUp, -forwardHint.dot(this.tmpUp));
    } else {
      this.tmpForward.crossVectors(this.issOrbitNormal, this.tmpUp);
    }
    if (this.tmpForward.lengthSq() < 1e-8) {
      this.tmpForward.set(0, 0, 1);
    } else {
      this.tmpForward.normalize();
    }
    this.tmpRight.crossVectors(this.tmpUp, this.tmpForward).normalize();
    this.tmpForward.crossVectors(this.tmpRight, this.tmpUp).normalize();
    this.tmpBasis.makeBasis(this.tmpRight, this.tmpUp, this.tmpForward);
    actor.tilt.quaternion.setFromRotationMatrix(this.tmpBasis);
    actor.spin.rotation.set(0, 0, 0);
  }

  private orientJwst(actor: Actor): void {
    // +Y pointe à l'opposé du Soleil (bouclier thermique -Y tourné vers le Soleil)
    this.tmpUp.copy(actor.root.position).normalize();
    const eclipticNorth = this.tmpLook.set(0, 1, 0);
    this.tmpForward.crossVectors(eclipticNorth, this.tmpUp);
    if (this.tmpForward.lengthSq() < 1e-8) {
      this.tmpForward.set(0, 0, 1);
    } else {
      this.tmpForward.normalize();
    }
    this.tmpRight.crossVectors(this.tmpUp, this.tmpForward).normalize();
    this.tmpForward.crossVectors(this.tmpRight, this.tmpUp).normalize();
    this.tmpBasis.makeBasis(this.tmpRight, this.tmpUp, this.tmpForward);
    actor.tilt.quaternion.setFromRotationMatrix(this.tmpBasis);
    actor.spin.rotation.set(0, 0, 0);
  }

  private addBody(info: BodyInfo, sphere: THREE.SphereGeometry): void {
    const root = new THREE.Group();
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    tilt.rotation.x = -THREE.MathUtils.degToRad(info.obliquityDeg);

    let mesh: THREE.Mesh;
    let visual: THREE.Object3D;
    let material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | null = null;
    let halo: THREE.Sprite | null = null;
    let tailGroup: THREE.Group | null = null;
    let ionTailMat: THREE.ShaderMaterial | null = null;
    let dustTailMat: THREE.ShaderMaterial | null = null;

    if (info.id === "roadster" || info.id === "iss" || info.id === "jwst") {
      visual =
        info.id === "roadster"
          ? this.buildRoadsterModel()
          : info.id === "jwst"
            ? this.buildJwstModel()
            : this.buildIssModel();
      mesh = new THREE.Mesh(
        sphere,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      mesh.userData.bodyId = info.id;
      spin.add(visual);
      spin.add(mesh);
      if (info.id === "roadster" || info.id === "jwst") {
        halo = this.makeCraftHalo(info.color);
        root.add(halo);
      }
    } else {
      material =
        info.id === "sun"
          ? new THREE.MeshBasicMaterial({ color: info.color, map: proceduralTexture(info) })
          : new THREE.MeshStandardMaterial({
              color: 0xffffff,
              map: proceduralTexture(info),
              roughness: info.id === "europa" || info.id === "moon" ? 0.72 : 0.9,
              metalness: 0.02,
            });
      mesh = new THREE.Mesh(sphere, material);
      mesh.userData.bodyId = info.id;
      visual = mesh;
      spin.add(mesh);
      if (info.id === "halley") {
        halo = this.makeCraftHalo("#9feaff");
        root.add(halo);
        const tail = this.buildCometTail();
        tailGroup = tail.group;
        ionTailMat = tail.ionMat;
        dustTailMat = tail.dustMat;
        root.add(tailGroup);
      }
    }

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
    label.className =
      info.kind === "craft"
        ? "body-label is-craft"
        : info.kind === "comet"
          ? "body-label is-comet"
          : "body-label";
    label.textContent = info.name;
    this.labelLayer.append(label);
    this.labels.set(info.id, label);
    this.actors.set(info.id, {
      info,
      root,
      tilt,
      spin,
      mesh,
      visual,
      clouds: null,
      rings,
      halo,
      tailGroup,
      ionTailMat,
      dustTailMat,
      material,
      radius: 0.1,
    });
  }

  private buildRoadsterModel(): THREE.Group {
    const group = new THREE.Group();

    const cherry = new THREE.MeshStandardMaterial({
      color: "#b81d2f",
      emissive: "#240408",
      metalness: 0.55,
      roughness: 0.28,
    });
    const stageWhite = new THREE.MeshStandardMaterial({
      color: "#ece9e2",
      metalness: 0.18,
      roughness: 0.62,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: "#222328",
      metalness: 0.45,
      roughness: 0.52,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: "#bfd9ee",
      transparent: true,
      opacity: 0.58,
      metalness: 0.35,
      roughness: 0.12,
      side: THREE.DoubleSide,
    });
    const suitWhite = new THREE.MeshStandardMaterial({
      color: "#f5f4f0",
      metalness: 0.08,
      roughness: 0.48,
    });
    const visorDark = new THREE.MeshStandardMaterial({
      color: "#1f1b16",
      metalness: 0.88,
      roughness: 0.14,
    });
    const lampMat = new THREE.MeshBasicMaterial({ color: "#fff3d1" });

    // Adaptateur conique et tronçon supérieur du 2e étage Falcon Heavy
    const stageTank = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.48, 20), stageWhite);
    stageTank.rotation.x = Math.PI / 2;
    stageTank.position.set(0, 0.02, -0.66);
    group.add(stageTank);

    const adapter = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.25, 0.16, 20), darkMetal);
    adapter.rotation.x = Math.PI / 2;
    adapter.position.set(0, 0.02, -0.36);
    group.add(adapter);

    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 16), darkMetal);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, 0.02, -0.98);
    group.add(bell);

    // Carrosserie cabriolet Midnight Cherry
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.94), cherry);
    chassis.position.set(0, 0.02, 0.18);
    group.add(chassis);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.3), cherry);
    nose.position.set(0, 0.0, 0.56);
    nose.rotation.x = 0.14;
    group.add(nose);

    const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.075, 0.28), cherry);
    rearDeck.position.set(0, 0.09, -0.14);
    group.add(rearDeck);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.38), darkMetal);
    cockpit.position.set(0, 0.08, 0.16);
    group.add(cockpit);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.024), glass);
    windshield.position.set(0, 0.145, 0.35);
    windshield.rotation.x = -0.58;
    group.add(windshield);

    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.024, 0.03), lampMat);
      lamp.position.set(side * 0.15, 0.03, 0.7);
      group.add(lamp);
    }

    // Quatre roues
    const tireGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.075, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.08, 12);
    rimGeo.rotateZ(Math.PI / 2);
    for (const x of [-0.24, 0.24]) {
      for (const z of [-0.1, 0.44]) {
        const tire = new THREE.Mesh(tireGeo, darkMetal);
        tire.position.set(x, -0.025, z);
        group.add(tire);
        const rim = new THREE.Mesh(rimGeo, stageWhite);
        rim.position.set(x, -0.025, z);
        group.add(rim);
      }
    }

    // Starman au volant (siège gauche)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.085, 6, 12), suitWhite);
    torso.position.set(-0.095, 0.145, 0.12);
    torso.rotation.x = -0.15;
    group.add(torso);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), suitWhite);
    helmet.position.set(-0.095, 0.255, 0.11);
    group.add(helmet);

    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), visorDark);
    visor.position.set(-0.095, 0.26, 0.132);
    group.add(visor);

    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.09, 4, 8), suitWhite);
    leftArm.position.set(-0.175, 0.15, 0.19);
    leftArm.rotation.x = Math.PI / 2.4;
    group.add(leftArm);

    group.traverse((child) => {
      child.raycast = () => undefined;
    });
    return group;
  }

  private buildIssModel(): THREE.Group {
    const group = new THREE.Group();

    const trussMat = new THREE.MeshStandardMaterial({
      color: "#cac3b4",
      metalness: 0.52,
      roughness: 0.42,
    });
    const moduleMat = new THREE.MeshStandardMaterial({
      color: "#eae6dc",
      metalness: 0.34,
      roughness: 0.48,
    });
    const solarMat = new THREE.MeshStandardMaterial({
      color: "#d89a3b",
      emissive: "#3b2507",
      metalness: 0.48,
      roughness: 0.3,
    });
    const radiatorMat = new THREE.MeshStandardMaterial({
      color: "#f4f1ea",
      metalness: 0.15,
      roughness: 0.55,
    });

    // Poutre principale (Integrated Truss Structure)
    const truss = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.055, 0.055), trussMat);
    group.add(truss);

    // Modules pressurisés longitudinaux (Zvezda, Zarya, Destiny, Harmony)
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.96, 16), moduleMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, -0.05, 0.02);
    group.add(core);

    // Laboratoires transversaux (Columbus et Kibo)
    const labs = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.48, 14), moduleMat);
    labs.rotation.z = Math.PI / 2;
    labs.position.set(0, -0.05, 0.28);
    group.add(labs);

    // Nœud nadir / Cupola tournée vers la Terre (-Y)
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.12, 12), trussMat);
    cupola.position.set(0, -0.11, 0.12);
    group.add(cupola);

    // Quatre paires d'ailes solaires dorées (8 panneaux)
    const wingGeo = new THREE.BoxGeometry(0.18, 0.012, 0.72);
    for (const x of [-0.86, -0.58, 0.58, 0.86]) {
      for (const zSign of [-1, 1]) {
        const wing = new THREE.Mesh(wingGeo, solarMat);
        wing.position.set(x, 0, zSign * 0.44);
        group.add(wing);
      }
    }

    // Radiateurs thermiques blancs
    const radGeo = new THREE.BoxGeometry(0.014, 0.3, 0.16);
    for (const x of [-0.28, 0.28]) {
      const radiator = new THREE.Mesh(radGeo, radiatorMat);
      radiator.position.set(x, 0.14, -0.1);
      group.add(radiator);
    }

    group.traverse((child) => {
      child.raycast = () => undefined;
    });
    return group;
  }

  private buildJwstModel(): THREE.Group {
    const group = new THREE.Group();

    const goldMirror = new THREE.MeshStandardMaterial({
      color: "#f0b93c",
      emissive: "#4a3106",
      metalness: 0.84,
      roughness: 0.18,
    });
    const darkCarbon = new THREE.MeshStandardMaterial({
      color: "#1a1c22",
      metalness: 0.38,
      roughness: 0.58,
    });
    const kaptonCold = new THREE.MeshStandardMaterial({
      color: "#cfd5e2",
      metalness: 0.68,
      roughness: 0.28,
      side: THREE.DoubleSide,
    });
    const kaptonSun = new THREE.MeshStandardMaterial({
      color: "#caa0b8",
      emissive: "#22111b",
      metalness: 0.62,
      roughness: 0.32,
      side: THREE.DoubleSide,
    });

    // Bouclier thermique Kapton à 5 couches en losange
    const kite = new THREE.Shape();
    kite.moveTo(0, 0.68);
    kite.lineTo(0.46, 0);
    kite.lineTo(0, -0.56);
    kite.lineTo(-0.46, 0);
    kite.closePath();
    const shieldGeo = new THREE.ShapeGeometry(kite);
    shieldGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < 5; i += 1) {
      const layer = new THREE.Mesh(shieldGeo, i >= 3 ? kaptonSun : kaptonCold);
      const shrink = 1 - i * 0.03;
      layer.scale.set(shrink, 1, shrink);
      layer.position.set(0, -0.02 - i * 0.024, 0);
      group.add(layer);
    }

    // Bus de servitude côté Soleil (-Y)
    const bus = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.22), darkCarbon);
    bus.position.set(0, -0.16, -0.06);
    group.add(bus);

    // Structure arrière et les 18 segments hexagonaux dorés du miroir primaire (6 + 12)
    const mirrorCenterY = 0.27;
    const mirrorBaseZ = -0.06;
    const backplane = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.024, 6), darkCarbon);
    backplane.rotation.x = Math.PI / 2;
    backplane.rotation.z = Math.PI / 6;
    backplane.position.set(0, mirrorCenterY, mirrorBaseZ - 0.022);
    group.add(backplane);

    const spacing = 0.112;
    const segRadius = (spacing / Math.sqrt(3)) * 0.93;
    const segGeo = new THREE.CylinderGeometry(segRadius, segRadius, 0.022, 6);
    segGeo.rotateX(Math.PI / 2);

    for (let q = -2; q <= 2; q += 1) {
      for (let r = -2; r <= 2; r += 1) {
        if (Math.abs(q + r) > 2 || (q === 0 && r === 0)) continue;
        const sx = spacing * (q + r * 0.5);
        const sy = spacing * (r * Math.sqrt(3) * 0.5);
        const dishZ = mirrorBaseZ + (sx * sx + sy * sy) * 0.15;
        const seg = new THREE.Mesh(segGeo, goldMirror);
        seg.position.set(sx, mirrorCenterY + sy, dishZ);
        group.add(seg);
      }
    }

    // Baffle central Cassegrain
    const baffle = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.14, 12), darkCarbon);
    baffle.rotation.x = Math.PI / 2;
    baffle.position.set(0, mirrorCenterY, mirrorBaseZ + 0.065);
    group.add(baffle);

    // Miroir secondaire et ses 3 mâts porteurs déployés vers +Z
    const secPos = new THREE.Vector3(0, 0.25, 0.38);
    const secondary = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.045, 12), darkCarbon);
    secondary.rotation.x = Math.PI / 2;
    secondary.position.copy(secPos);
    group.add(secondary);

    const anchors = [
      new THREE.Vector3(0, 0.53, mirrorBaseZ),
      new THREE.Vector3(-0.22, 0.09, mirrorBaseZ),
      new THREE.Vector3(0.22, 0.09, mirrorBaseZ),
    ];
    const upAxis = new THREE.Vector3(0, 1, 0);
    for (const anchor of anchors) {
      const delta = secPos.clone().sub(anchor);
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, delta.length(), 8),
        darkCarbon,
      );
      strut.position.copy(anchor).addScaledVector(delta, 0.5);
      strut.quaternion.setFromUnitVectors(upAxis, delta.normalize());
      group.add(strut);
    }

    group.traverse((child) => {
      child.raycast = () => undefined;
    });
    return group;
  }

  private buildCometTail(): {
    group: THREE.Group;
    ionMat: THREE.ShaderMaterial;
    dustMat: THREE.ShaderMaterial;
  } {
    const group = new THREE.Group();
    const makePlume = (radius: number, colorHex: string, curve: number) => {
      const geo = new THREE.ConeGeometry(radius, 1, 24, 16, true);
      geo.translate(0, -0.5, 0);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color(colorHex) },
          uOpacity: { value: 0.7 },
          uCurve: { value: curve },
        },
        vertexShader: `
          uniform float uCurve;
          varying float vZ;
          varying vec3 vNormalView;
          varying vec3 vViewDir;
          void main() {
            vZ = clamp(position.z, 0.0, 1.0);
            vec3 pos = position;
            pos.x += uCurve * vZ * vZ;
            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            vNormalView = normalize(normalMatrix * normal);
            vViewDir = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vZ;
          varying vec3 vNormalView;
          varying vec3 vViewDir;
          void main() {
            float axial = smoothstep(0.0, 0.08, vZ) * pow(1.0 - vZ, 1.65);
            float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.72);
            float alpha = axial * (0.32 + 0.68 * edge) * uOpacity;
            if (alpha < 0.004) discard;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.raycast = () => undefined;
      return { mesh, mat };
    };

    const ion = makePlume(0.085, "#6ee6ff", 0.0);
    const dust = makePlume(0.22, "#ffe1ad", -0.24);
    group.add(ion.mesh, dust.mesh);
    return { group, ionMat: ion.mat, dustMat: dust.mat };
  }

  private makeCraftHalo(colorHex: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const c = new THREE.Color(colorHex);
      const r = Math.round(c.r * 255);
      const g = Math.round(c.g * 255);
      const b = Math.round(c.b * 255);
      const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
      gradient.addColorStop(0, "rgba(255, 244, 230, 0.95)");
      gradient.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, 0.65)`);
      gradient.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.16)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    sprite.raycast = () => undefined;
    return sprite;
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
    sprite.raycast = () => undefined;
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
        if (!actor.material) return;
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
          const earthMat = actor.material;
          earthMat.emissive = new THREE.Color("#ffe3b8");
          earthMat.emissiveMap = night;
          earthMat.emissiveIntensity = 0.9;
          earthMat.customProgramCacheKey = () => "earth-day-night";
          earthMat.onBeforeCompile = (shader) => {
            shader.uniforms.uSunDir = this.earthSunUniform;
            shader.vertexShader = shader.vertexShader
              .replace(
                "#include <common>",
                "#include <common>\nvarying vec3 vEarthWorldNormal;",
              )
              .replace(
                "#include <project_vertex>",
                "vEarthWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);\n#include <project_vertex>",
              );
            shader.fragmentShader = shader.fragmentShader
              .replace(
                "#include <common>",
                "#include <common>\nuniform vec3 uSunDir;\nvarying vec3 vEarthWorldNormal;",
              )
              .replace(
                "#include <emissivemap_fragment>",
                "#include <emissivemap_fragment>\nfloat nightMask = smoothstep(0.08, -0.16, dot(normalize(vEarthWorldNormal), uSunDir));\ntotalEmissiveRadiance *= nightMask;",
              );
          };
          earthMat.needsUpdate = true;
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
      const radius = shownRadius(actor.info, this.size, this.earthInfo);
      actor.radius = radius;
      if (actor.info.kind === "craft") {
        actor.visual.scale.setScalar(radius);
        actor.mesh.scale.setScalar(radius * 1.45);
      } else {
        actor.mesh.scale.setScalar(radius);
      }
      if (actor.clouds) actor.clouds.scale.setScalar(radius * 1.015);
      if (actor.rings) actor.rings.scale.setScalar(radius);
    }
    this.placeMarker(this.selectedId);
  }

  private rebuildPlanetOrbits(): void {
    for (const line of this.planetOrbits.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.orbitGroup.remove(line);
    }
    this.planetOrbits.clear();
    for (const info of this.catalog.bodies) {
      if (!info.hasOrbit || info.parent) continue;
      const sampleCount = info.id === "halley" ? 360 : 240;
      const points = solar
        .sampleOrbit(info.id, sampleCount)
        .map((point) => this.compressVector(point.x, point.y, point.z));
      if (info.id === "roadster") {
        const closed = [...points, points[0].clone()];
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(closed),
          new THREE.LineDashedMaterial({
            color: info.color,
            dashSize: 0.24,
            gapSize: 0.15,
            transparent: true,
            opacity: 0.62,
          }),
        );
        line.computeLineDistances();
        this.orbitGroup.add(line);
        this.planetOrbits.set(info.id, line);
      } else {
        const line = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: info.color,
            transparent: true,
            opacity: info.id === "halley" ? 0.48 : 0.4,
          }),
        );
        this.orbitGroup.add(line);
        this.planetOrbits.set(info.id, line);
      }
    }
  }

  private rebuildMoonOrbits(jd: number): void {
    for (const line of this.moonOrbits.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      line.removeFromParent();
    }
    this.moonOrbits.clear();
    for (const info of this.catalog.bodies) {
      if (!info.parent) continue;
      const parent = this.actors.get(info.parent);
      if (!parent) continue;
      const points = solar
        .sampleOrbit(info.id, 96, jd)
        .map((point) => this.satelliteOffset(info, point.x, point.y, point.z));
      if (info.id === "iss" && points.length >= 25) {
        this.issOrbitNormal.crossVectors(points[0], points[24]).normalize();
        this.lastIssOrbitJd = jd;
      }
      if (info.id === "jwst") {
        this.lastJwstOrbitJd = jd;
      }
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: info.color,
          transparent: true,
          opacity: info.id === "iss" ? 0.68 : info.id === "jwst" ? 0.6 : 0.45,
        }),
      );
      parent.root.add(line);
      this.moonOrbits.set(info.id, line);
    }
  }

  private refreshIssOrbit(jd: number): void {
    const line = this.moonOrbits.get("iss");
    const actor = this.actors.get("iss");
    if (!line || !actor) return;
    const points = solar
      .sampleOrbit("iss", 96, jd)
      .map((point) => this.satelliteOffset(actor.info, point.x, point.y, point.z));
    if (points.length >= 25) {
      this.issOrbitNormal.crossVectors(points[0], points[24]).normalize();
    }
    line.geometry.setFromPoints(points);
    this.lastIssOrbitJd = jd;
  }

  private refreshJwstOrbit(jd: number): void {
    const line = this.moonOrbits.get("jwst");
    const actor = this.actors.get("jwst");
    if (!line || !actor) return;
    const points = solar
      .sampleOrbit("jwst", 96, jd)
      .map((point) => this.satelliteOffset(actor.info, point.x, point.y, point.z));
    line.geometry.setFromPoints(points);
    this.lastJwstOrbitJd = jd;
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
    if (!actor || !actor.root.visible) {
      this.marker.removeFromParent();
      return;
    }
    actor.root.add(this.marker);
    const radius = actor.radius;
    const factor = selectedId === "saturn" ? 2.85 : actor.info.kind === "craft" ? 2.1 : 1.85;
    const minMarker = actor.info.kind === "craft" ? 0.045 : 0.12;
    this.marker.scale.setScalar(Math.max(radius * factor, minMarker));
  }

  private updateMoonOrbitVisibility(selectedId: string | null): void {
    const cameraPosition = this.camera.position;
    for (const [id, line] of this.moonOrbits) {
      const actor = this.actors.get(id);
      const info = actor?.info;
      if (!info || !this.view?.orbits) {
        line.visible = false;
        continue;
      }
      if (info.kind === "craft" && !this.view.crafts) {
        line.visible = false;
        continue;
      }
      const parent = info.parent ? this.actors.get(info.parent) : undefined;
      const threshold = id === "iss" ? 6.5 : id === "jwst" ? 11 : 22;
      const near = parent ? parent.root.position.distanceTo(cameraPosition) < threshold : false;
      line.visible = Boolean(actor?.root.visible && (selectedId === id || selectedId === info.parent || near));
    }
  }

  private updateLabels(view: ViewSettings, selectedId: string | null, inCockpit = false): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const wide = width > 800;
    const earthActor = this.actors.get("earth");
    const earthDist = earthActor ? earthActor.root.position.distanceTo(this.camera.position) : Infinity;
    const nearEarth = earthDist < 6.5;
    const nearL2 = earthDist < 16;

    for (const info of this.catalog.bodies) {
      const label = this.labels.get(info.id);
      const actor = this.actors.get(info.id);
      if (!label || !actor) continue;
      if (!actor.root.visible) {
        label.hidden = true;
        continue;
      }
      const selected = info.id === selectedId;
      if (inCockpit && selected) {
        label.hidden = true;
        continue;
      }
      let showNames = view.names;
      if (info.kind === "moon") {
        showNames = view.names && (selected || info.parent === selectedId || inCockpit);
      } else if (info.id === "iss") {
        showNames = view.names && view.crafts && (selected || selectedId === "earth" || nearEarth);
      } else if (info.id === "jwst") {
        showNames = view.names && view.crafts && (selected || selectedId === "earth" || nearL2);
      } else if (info.kind === "craft") {
        showNames = view.names && view.crafts;
      }
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

  private initSurfaceCockpit(actor: Actor): void {
    actor.root.updateWorldMatrix(true, true);
    const invSpin = actor.spin.matrixWorld.clone().invert();

    if (actor.info.id === "earth") {
      // Observatoire terrestre en France métropolitaine (46,5° N, 2,3° E), regard vers le sud-est
      const lat = THREE.MathUtils.degToRad(46.5);
      const lon = THREE.MathUtils.degToRad(2.3);
      this.cockpitSurfaceLocal
        .set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
        .normalize();
      const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon)).normalize();
      const south = new THREE.Vector3().crossVectors(this.cockpitSurfaceLocal, east).normalize();
      this.cockpitForwardLocal
        .copy(east)
        .multiplyScalar(0.68)
        .addScaledVector(south, 0.68)
        .addScaledVector(this.cockpitSurfaceLocal, 0.14)
        .normalize();
      return;
    }

    if (actor.info.kind === "moon" && actor.info.parent) {
      const parent = this.actors.get(actor.info.parent);
      const toParentWorld = parent
        ? parent.root.position.clone().sub(actor.root.position)
        : new THREE.Vector3(1, 0, 0);
      const toParentLocal = toParentWorld.transformDirection(invSpin).normalize();
      const north = Math.abs(toParentLocal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      this.cockpitSurfaceLocal
        .copy(toParentLocal)
        .multiplyScalar(0.55)
        .addScaledVector(north, 0.83)
        .normalize();
      const tangent = toParentLocal
        .clone()
        .addScaledVector(this.cockpitSurfaceLocal, -toParentLocal.dot(this.cockpitSurfaceLocal))
        .normalize();
      this.cockpitForwardLocal
        .copy(tangent)
        .addScaledVector(this.cockpitSurfaceLocal, 0.16)
        .normalize();
      return;
    }

    // Planètes et Soleil : terminateur éclairé à moyenne latitude (avec vue sur les anneaux pour Saturne)
    const toSunWorld =
      actor.root.position.lengthSq() > 1e-6
        ? actor.root.position.clone().negate().normalize()
        : new THREE.Vector3(1, 0.25, 0).normalize();
    const toSunLocal = toSunWorld.transformDirection(invSpin).normalize();
    const pole = new THREE.Vector3(0, 1, 0);
    const eastFromSun = new THREE.Vector3().crossVectors(pole, toSunLocal);
    if (eastFromSun.lengthSq() < 1e-6) eastFromSun.set(0, 0, 1);
    eastFromSun.normalize();

    this.cockpitSurfaceLocal
      .copy(toSunLocal)
      .multiplyScalar(0.42)
      .addScaledVector(eastFromSun, 0.76)
      .addScaledVector(pole, actor.info.id === "saturn" ? 0.48 : 0.38)
      .normalize();

    const targetDir = actor.info.id === "saturn" ? pole.clone().negate() : toSunLocal;
    const tangent = targetDir
      .clone()
      .addScaledVector(this.cockpitSurfaceLocal, -targetDir.dot(this.cockpitSurfaceLocal));
    if (tangent.lengthSq() < 1e-6) tangent.copy(eastFromSun);
    tangent.normalize();
    this.cockpitForwardLocal
      .copy(tangent)
      .addScaledVector(this.cockpitSurfaceLocal, actor.info.id === "saturn" ? 0.24 : 0.14)
      .normalize();
  }

  private applyCockpitCamera(id: string): void {
    const actor = this.actors.get(id);
    if (!actor || !actor.root.visible) return;
    if (!this.wasCockpit || this.cockpitTargetId !== id) {
      this.wasCockpit = true;
      this.cockpitTargetId = id;
      this.cockpitYaw = 0;
      this.cockpitPitch = 0;
      this.tween = null;
      this.controls.enabled = false;
      this.camera.near = 0.0015;
      this.camera.updateProjectionMatrix();
      if (actor.info.kind !== "craft" && id !== "halley") {
        this.initSurfaceCockpit(actor);
      }
    }

    actor.root.updateWorldMatrix(true, true);

    const eyeWorld = this.tmpEye;
    const baseForward = this.tmpForward;
    const baseUp = this.tmpUp;

    if (id === "roadster") {
      // Siège passager à côté de Starman, vue à travers le pare-brise et sur le capot rouge cerise
      eyeWorld.set(0.095, 0.255, -0.02).applyMatrix4(actor.visual.matrixWorld);
      const target = this.tmpLook.set(-0.02, 0.16, 0.85).applyMatrix4(actor.visual.matrixWorld);
      baseForward.copy(target).sub(eyeWorld).normalize();
      baseUp.set(0, 1, 0).transformDirection(actor.visual.matrixWorld).normalize();
    } else if (id === "iss") {
      // Hublot de la Cupola orienté vers l'avant et l'horizon terrestre
      eyeWorld.set(0, -0.145, 0.14).applyMatrix4(actor.visual.matrixWorld);
      const target = this.tmpLook.set(0, -0.78, 0.95).applyMatrix4(actor.visual.matrixWorld);
      baseForward.copy(target).sub(eyeWorld).normalize();
      baseUp.set(0, 1, 0).transformDirection(actor.visual.matrixWorld).normalize();
    } else if (id === "jwst") {
      // Sur le bouclier Kapton, juste à côté des 18 miroirs hexagonaux dorés
      eyeWorld.set(-0.34, 0.28, -0.34).applyMatrix4(actor.visual.matrixWorld);
      const target = this.tmpLook.set(0.08, 0.22, 0.55).applyMatrix4(actor.visual.matrixWorld);
      baseForward.copy(target).sub(eyeWorld).normalize();
      baseUp.set(0, 1, 0).transformDirection(actor.visual.matrixWorld).normalize();
    } else if (id === "halley") {
      // Escorte du noyau glacé en regardant le long de la double queue cométaire
      const r = actor.radius;
      const antiSun =
        actor.root.position.lengthSq() > 1e-8
          ? actor.root.position.clone().normalize()
          : new THREE.Vector3(0, 0, 1);
      const refUp = Math.abs(antiSun.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(refUp, antiSun).normalize();
      const up = new THREE.Vector3().crossVectors(antiSun, side).normalize();
      eyeWorld
        .copy(actor.root.position)
        .addScaledVector(antiSun, -r * 3.0)
        .addScaledVector(side, r * 1.85)
        .addScaledVector(up, r * 0.95);
      const target = this.tmpLook.copy(actor.root.position).addScaledVector(antiSun, r * 4.5);
      baseForward.copy(target).sub(eyeWorld).normalize();
      baseUp.copy(up);
    } else {
      const altFactor = id === "earth" ? 1.045 : id === "sun" ? 1.12 : 1.035;
      eyeWorld
        .copy(this.cockpitSurfaceLocal)
        .multiplyScalar(actor.radius * altFactor)
        .applyMatrix4(actor.spin.matrixWorld);
      baseUp.copy(this.cockpitSurfaceLocal).transformDirection(actor.spin.matrixWorld).normalize();
      baseForward.copy(this.cockpitForwardLocal).transformDirection(actor.spin.matrixWorld).normalize();
    }

    this.tmpRight.crossVectors(baseForward, baseUp);
    if (this.tmpRight.lengthSq() < 1e-8) this.tmpRight.set(1, 0, 0);
    this.tmpRight.normalize();
    const orthoUp = new THREE.Vector3().crossVectors(this.tmpRight, baseForward).normalize();

    this.tmpQuat.setFromAxisAngle(orthoUp, this.cockpitYaw);
    const lookDir = baseForward.clone().applyQuaternion(this.tmpQuat);
    const yawedRight = this.tmpRight.clone().applyQuaternion(this.tmpQuat);
    this.tmpQuat.setFromAxisAngle(yawedRight, this.cockpitPitch);
    lookDir.applyQuaternion(this.tmpQuat).normalize();
    const finalUp = new THREE.Vector3().crossVectors(yawedRight, lookDir).normalize();

    this.camera.position.copy(eyeWorld);
    this.camera.up.copy(finalUp);
    this.camera.lookAt(this.tmpLook.copy(eyeWorld).add(lookDir));
  }

  private exitCockpitCamera(selectedId: string | null): void {
    this.wasCockpit = false;
    this.cockpitTargetId = null;
    this.cockpitYaw = 0;
    this.cockpitPitch = 0;
    this.camera.near = 0.01;
    this.camera.up.set(0, 1, 0);
    this.camera.updateProjectionMatrix();
    this.controls.enabled = true;
    if (selectedId) {
      const actor = this.actors.get(selectedId);
      if (actor && actor.root.visible) {
        const offset = new THREE.Vector3(0.55, 0.35, 0.75)
          .normalize()
          .multiplyScalar(Math.max(actor.radius * 6.5, 0.18));
        this.controls.target.copy(actor.root.position);
        this.camera.position.copy(actor.root.position).add(offset);
        this.frame(selectedId);
        return;
      }
    }
    const pose = this.fullPose();
    this.camera.position.copy(pose.position);
    this.controls.target.copy(pose.target);
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
    if (!actor || !actor.root.visible) return;
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

  private compressVector(x: number, y: number, z: number): THREE.Vector3 {
    const radius = Math.hypot(x, y, z);
    if (radius < 1e-8) return new THREE.Vector3();
    const visual = Math.pow(radius, this.exponent > 0 ? this.exponent : 0.55) * AU_SCENE;
    const scale = visual / radius;
    return new THREE.Vector3(x * scale, z * scale, -y * scale);
  }

  private satelliteOffset(info: BodyInfo, dx: number, dy: number, dz: number): THREE.Vector3 {
    const rAu = Math.hypot(dx, dy, dz);
    if (rAu < 1e-12 || !info.parent) return new THREE.Vector3();
    const parentActor = this.actors.get(info.parent);
    const parentRadius = parentActor
      ? shownRadius(parentActor.info, this.size, this.earthInfo)
      : 0.2;

    let visualDist: number;
    if (info.id === "iss") {
      visualDist = Math.max(parentRadius * 1.26, parentRadius + 0.032);
    } else if (info.id === "jwst") {
      const base = Math.max(0.68, parentRadius * 3.6);
      const ratio = info.aAu > 0 ? rAu / info.aAu : 1;
      visualDist = base * ratio;
    } else if (info.parent === "earth") {
      const base = Math.max(0.42, parentRadius * 2.45);
      const ratio = info.aAu > 0 ? rAu / info.aAu : 1;
      visualDist = base * ratio;
    } else {
      visualDist = parentRadius * 1.58 * Math.pow(rAu / IO_A_AU, 0.72);
    }
    const scale = visualDist / rAu;
    return new THREE.Vector3(dx * scale, dz * scale, -dy * scale);
  }
}

function shownRadius(info: BodyInfo, size: number, earthInfo?: BodyInfo): number {
  if (info.id === "sun") return SUN_RADIUS;
  const safeSize = size > 0 ? size : 16;
  if (info.id === "iss") {
    const earthRadius = earthInfo ? shownRadius(earthInfo, safeSize) : 0.17;
    return Math.min(0.045, Math.max(0.015, earthRadius * 0.16));
  }
  if (info.id === "roadster" || info.id === "jwst") {
    return 0.024 + (safeSize / 36) * 0.036;
  }
  if (info.id === "halley") {
    return 0.032 + (safeSize / 36) * 0.034;
  }
  const real = (info.radiusKm / 695700) * SUN_RADIUS;
  const boosted = real * safeSize;
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
