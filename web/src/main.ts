import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "./style.css";
import solar from "../../ephemeris/solar.js";
import { ObservatoryClock } from "./clock";
import { createScene } from "./scene";
import { mountUi, type EventPresetId } from "./ui";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const labels = document.querySelector<HTMLElement>("#labels");
const glError = document.querySelector<HTMLElement>("#gl-error");

if (!canvas || !labels || !glError) {
  throw new Error("Page incomplète");
}

const scene = createScene(canvas, labels);
if (!scene) glError.hidden = false;

const clock = new ObservatoryClock(() => queue());
let follow = false;
let frameQueued = false;
let rafId = 0;
let appStopped = false;
let pendingFrameId: string | null = null;

function requestFrameBody(id: string): void {
  if (id === "iss" || id === "roadster" || id === "jwst") {
    ui.enableCrafts();
  }
  if (id === "iss" && Math.abs(clock.rate()) > 0.1) {
    const sign = clock.rate() < 0 ? -1 : 1;
    clock.command({ type: "setRate", rateDaysPerSec: sign * (1 / 1440) });
  }
  pendingFrameId = id;
  queue();
}

function runEventPreset(preset: EventPresetId): void {
  if (preset === "iss-live") {
    ui.enableCrafts();
    ui.setCockpit(false);
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.now()) });
    clock.command({ type: "setRate", rateDaysPerSec: 1 / 86400 });
    if (!clock.playing()) clock.command({ type: "play" });
    ui.focusBody("iss");
    return;
  }
  if (preset === "starman-launch") {
    ui.enableCrafts();
    ui.setCockpit(false);
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.UTC(2018, 1, 7, 2, 45, 0)) });
    clock.command({ type: "setRate", rateDaysPerSec: 1 / 24 });
    if (!clock.playing()) clock.command({ type: "play" });
    ui.focusBody("roadster");
    return;
  }
  if (preset === "starman-mars") {
    ui.enableCrafts();
    ui.setCockpit(false);
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.UTC(2020, 9, 7, 6, 25, 0)) });
    clock.command({ type: "setRate", rateDaysPerSec: 1 });
    if (!clock.playing()) clock.command({ type: "play" });
    ui.focusBody("roadster");
    return;
  }
  if (preset === "jwst-l2") {
    ui.enableCrafts();
    ui.setCockpit(false);
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.UTC(2022, 0, 24, 19, 0, 0)) });
    clock.command({ type: "setRate", rateDaysPerSec: 1 });
    if (!clock.playing()) clock.command({ type: "play" });
    ui.focusBody("jwst");
    return;
  }
  if (preset === "halley-1986") {
    ui.setCockpit(false);
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.UTC(1986, 1, 9, 11, 0, 0)) });
    clock.command({ type: "setRate", rateDaysPerSec: 1 });
    if (!clock.playing()) clock.command({ type: "play" });
    ui.focusBody("halley");
    return;
  }
  if (preset === "voyager-1977") {
    ui.setCockpit(false);
    follow = false;
    pendingFrameId = null;
    ui.clearSelection();
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.UTC(1977, 7, 20, 14, 29, 0)) });
    clock.command({ type: "setRate", rateDaysPerSec: 30 });
    if (!clock.playing()) clock.command({ type: "play" });
    scene?.showFull();
  }
}

async function shutdownObservatory(): Promise<boolean> {
  appStopped = true;
  if (frameQueued) {
    cancelAnimationFrame(rafId);
    frameQueued = false;
  }
  clock.stop();

  let serverStopped = false;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("/api/shutdown", {
      method: "POST",
      headers: { "X-Solar-Shutdown": "1" },
      cache: "no-store",
      signal: controller.signal,
    });
    serverStopped = response.ok;
  } catch {
    serverStopped = false;
  } finally {
    window.clearTimeout(timeout);
  }

  scene?.dispose();
  return serverStopped;
}

const ui = mountUi({
  onToggle: () => clock.command({ type: "toggle" }),
  onRate: (rateDaysPerSec) => clock.command({ type: "setRate", rateDaysPerSec }),
  onDate: (jd) => clock.command({ type: "setDate", jd }),
  onNow: () => {
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.now()) });
    if (!clock.playing()) clock.command({ type: "play" });
  },
  onEvent: (preset) => runEventPreset(preset),
  onSelect: (id) => {
    if (!id) follow = false;
  },
  onFrame: (id) => {
    requestFrameBody(id);
  },
  onCockpit: (cockpit) => {
    if (cockpit) {
      pendingFrameId = null;
      scene?.resetCockpitLook();
    }
    queue();
  },
  onInner: () => {
    follow = false;
    pendingFrameId = null;
    scene?.showInner();
  },
  onFull: () => {
    follow = false;
    pendingFrameId = null;
    scene?.showFull();
  },
  onFollow: (next) => {
    follow = next;
  },
  onQuit: () => shutdownObservatory(),
});

window.addEventListener("keydown", (event) => {
  if (appStopped || ui.isQuitDialogOpen()) return;
  if (event.code === "Escape") {
    if (ui.isNodeRedOpen()) {
      ui.closeNodeRed();
      return;
    }
    if (ui.view().cockpit) {
      ui.setCockpit(false);
      return;
    }
    follow = false;
    pendingFrameId = null;
    ui.clearSelection();
    return;
  }
  if (event.code !== "Space") return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
  ) {
    return;
  }
  event.preventDefault();
  clock.command({ type: "toggle" });
});

let pointer: {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
} | null = null;

canvas.addEventListener("pointerdown", (event) => {
  pointer = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
  };
  if (ui.view().cockpit) {
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (!pointer || !scene) return;
  const dx = event.clientX - pointer.startX;
  const dy = event.clientY - pointer.startY;
  if (ui.view().cockpit && canvas.hasPointerCapture(pointer.id)) {
    canvas.releasePointerCapture(pointer.id);
  }
  pointer = null;
  canvas.style.cursor = "grab";
  if (dx * dx + dy * dy > 16) return;
  const id = scene.pick(event.clientX, event.clientY);
  const current = ui.selectedId();
  if (id) {
    ui.selectBody(id === current ? null : id);
  } else if (current && !ui.view().cockpit) {
    ui.clearSelection();
  }
});

canvas.addEventListener("pointercancel", () => {
  pointer = null;
});

canvas.addEventListener("dblclick", (event) => {
  if (!scene) return;
  const id = scene.pick(event.clientX, event.clientY) ?? ui.selectedId();
  if (!id) return;
  ui.focusBody(id);
});

canvas.addEventListener("pointermove", (event) => {
  if (!scene) return;
  if (pointer && ui.view().cockpit) {
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    scene.adjustCockpitLook(dx * 0.0045, dy * 0.0045);
    queue();
    return;
  }
  const id = scene.pick(event.clientX, event.clientY);
  canvas.style.cursor = id ? "pointer" : "grab";
});

function snapshot() {
  const jd = clock.jdNow();
  return {
    mode: clock.mode,
    jd,
    playing: clock.playing(),
    rate: clock.rate(),
    selectedId: ui.selectedId(),
    positions: solar.positions(jd, { issTelemetry: clock.issLive }),
    serverBodies: clock.serverBodies,
    follow,
  };
}

function frame(): void {
  frameQueued = false;
  if (appStopped) return;
  const state = snapshot();
  const view = { ...ui.view(), follow };
  scene?.update(state.jd, view, state.selectedId, clock.issLive);
  if (pendingFrameId && !view.cockpit) {
    const target = pendingFrameId;
    pendingFrameId = null;
    scene?.frame(target);
  }
  ui.sync(state);
  queue();
}

function queue(): void {
  if (appStopped || frameQueued || document.hidden) return;
  frameQueued = true;
  rafId = requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (!appStopped && !document.hidden) queue();
});

const isLocalHost =
  location.hostname === "127.0.0.1" ||
  location.hostname === "localhost" ||
  location.hostname === "::1";

async function connect(): Promise<void> {
  clock.startAutoReconnect(({ editor, shutdown }) => {
    ui.setEditor(editor);
    ui.setShutdown(shutdown);
  });
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      if (isLocalHost) ui.setShutdown(true);
      clock.useLocal();
      return;
    }
    const health = (await response.json()) as { editor?: boolean; shutdown?: boolean };
    ui.setEditor(health.editor === true);
    ui.setShutdown(health.shutdown === true);
    clock.connectSocket();
  } catch {
    if (isLocalHost) ui.setShutdown(true);
    clock.useLocal();
  }
}

void connect();
queue();
