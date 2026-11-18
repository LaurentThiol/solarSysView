import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "./style.css";
import solar from "../../ephemeris/solar.js";
import { ObservatoryClock } from "./clock";
import { createScene } from "./scene";
import { mountUi } from "./ui";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const labels = document.querySelector<HTMLElement>("#labels");
const glError = document.querySelector<HTMLElement>("#gl-error");

if (!canvas || !labels || !glError) {
  throw new Error("Page incomplète");
}

const scene = createScene(canvas, labels);
if (!scene) glError.hidden = false;

const clock = new ObservatoryClock(() => undefined);
let follow = false;
let frameQueued = false;
let pendingFrameId: string | null = null;

function requestFrameBody(id: string): void {
  if (id === "iss" || id === "roadster") {
    ui.enableCrafts();
  }
  if (id === "iss" && Math.abs(clock.rate()) > 0.1) {
    const sign = clock.rate() < 0 ? -1 : 1;
    clock.command({ type: "setRate", rateDaysPerSec: sign * (1 / 1440) });
  }
  pendingFrameId = id;
  queue();
}

const ui = mountUi({
  onToggle: () => clock.command({ type: "toggle" }),
  onRate: (rateDaysPerSec) => clock.command({ type: "setRate", rateDaysPerSec }),
  onDate: (jd) => clock.command({ type: "setDate", jd }),
  onNow: () => {
    clock.command({ type: "setDate", jd: solar.unixToJd(Date.now()) });
    if (!clock.playing()) clock.command({ type: "play" });
  },
  onSelect: (id) => {
    if (!id) follow = false;
  },
  onFrame: (id) => {
    requestFrameBody(id);
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
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    follow = false;
    pendingFrameId = null;
    ui.clearSelection();
    return;
  }
  if (event.code !== "Space") return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  event.preventDefault();
  clock.command({ type: "toggle" });
});

let pointer: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", (event) => {
  if (!pointer || !scene) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer = null;
  if (dx * dx + dy * dy > 16) return;
  const id = scene.pick(event.clientX, event.clientY);
  const current = ui.selectedId();
  if (id) {
    ui.selectBody(id === current ? null : id);
  } else if (current) {
    ui.clearSelection();
  }
});
canvas.addEventListener("dblclick", (event) => {
  if (!scene) return;
  const id = scene.pick(event.clientX, event.clientY) ?? ui.selectedId();
  if (!id) return;
  ui.focusBody(id);
});
canvas.addEventListener("pointermove", (event) => {
  if (!scene) return;
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
    positions: solar.positions(jd),
    serverBodies: clock.serverBodies,
    follow,
  };
}

function frame(): void {
  frameQueued = false;
  const state = snapshot();
  const view = { ...ui.view(), follow };
  scene?.update(state.jd, view, state.selectedId);
  if (pendingFrameId) {
    const target = pendingFrameId;
    pendingFrameId = null;
    scene?.frame(target);
  }
  ui.sync(state);
  queue();
}

function queue(): void {
  if (frameQueued || document.hidden) return;
  frameQueued = true;
  requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) queue();
});

async function connect(): Promise<void> {
  clock.startAutoReconnect((enabled) => ui.setEditor(enabled));
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      clock.useLocal();
      return;
    }
    const health = (await response.json()) as { editor?: boolean };
    ui.setEditor(health.editor === true);
    clock.connectSocket();
  } catch {
    clock.useLocal();
  }
}

void connect();
queue();
