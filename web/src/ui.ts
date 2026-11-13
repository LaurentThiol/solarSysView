import solar, { type BodyInfo, type BodyPosition } from "../../ephemeris/solar.js";
import {
  formatAu,
  formatDay,
  formatDegrees,
  formatEccentricity,
  formatJulian,
  formatKm,
  formatParisDate,
  formatPeriod,
  formatRate,
  jdFromParisInput,
  parisInputValue,
} from "./format";
import { defaultView, type ViewSettings } from "./view";
import type { ClockMode } from "./clock";

interface Handlers {
  onToggle: () => void;
  onRate: (rate: number) => void;
  onDate: (jd: number) => void;
  onSelect: (id: string | null) => void;
  onFrame: () => void;
  onInner: () => void;
  onFull: () => void;
  onFollow: (follow: boolean) => void;
}

export interface UiSnapshot {
  mode: ClockMode;
  jd: number;
  playing: boolean;
  rate: number;
  selectedId: string | null;
  positions: BodyPosition[];
  serverBodies: BodyPosition[] | null;
  follow: boolean;
}

const bodies = solar.catalog().bodies;
const byId = new Map(bodies.map((body) => [body.id, body]));

function need<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Élément manquant : ${selector}`);
  return element;
}

export function mountUi(handlers: Handlers): {
  sync: (snapshot: UiSnapshot) => void;
  setEditor: (enabled: boolean) => void;
  view: () => ViewSettings;
  selectedId: () => string | null;
  clearSelection: () => void;
} {
  const view: ViewSettings = { ...defaultView };
  let selectedId: string | null = null;
  let renderedSelection: string | null | undefined;

  const list = need<HTMLOListElement>("#body-list");
  const empty = need<HTMLElement>("#fiche-empty");
  const body = need<HTMLElement>("#fiche-body");
  const name = need<HTMLElement>("#fiche-name");
  const fact = need<HTMLElement>("#fiche-fact");
  const facts = need<HTMLDListElement>("#fiche-facts");
  const serverLine = need<HTMLElement>("#fiche-server");
  const dateLabel = need<HTMLElement>("#date-label");
  const jdLabel = need<HTMLElement>("#jd-label");
  const pill = need<HTMLElement>("#clock-pill");
  const play = need<HTMLButtonElement>("#play-toggle");
  const rateLabel = need<HTMLElement>("#rate-label");
  const dateInput = need<HTMLInputElement>("#date-input");
  const dateError = need<HTMLElement>("#date-error");
  const live = need<HTMLElement>("#live");
  const editorLink = need<HTMLAnchorElement>("#editor-link");
  const exponent = need<HTMLInputElement>("#opt-exponent");
  const exponentNote = need<HTMLElement>("#exponent-note");
  const size = need<HTMLInputElement>("#opt-size");
  const orbits = need<HTMLInputElement>("#opt-orbits");
  const names = need<HTMLInputElement>("#opt-names");
  const belt = need<HTMLInputElement>("#opt-belt");
  const followButton = need<HTMLButtonElement>("#preset-follow");

  for (const info of bodies) {
    const item = document.createElement("li");
    if (info.kind === "moon") item.classList.add("is-moon");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = info.id;
    button.setAttribute("aria-pressed", "false");
    const swatch = document.createElement("span");
    swatch.className = info.id === "sun" ? "swatch sun" : "swatch";
    swatch.style.background = info.color;
    const label = document.createElement("span");
    label.className = "body-name";
    label.textContent = info.name;
    const meta = document.createElement("span");
    meta.className = "body-meta";
    meta.textContent = info.aAu > 0.05 ? formatAu(info.aAu) : "";
    button.append(swatch, label, meta);
    button.addEventListener("click", () => select(info.id));
    item.append(button);
    list.append(item);
  }

  play.addEventListener("click", () => handlers.onToggle());
  document.querySelectorAll<HTMLButtonElement>(".rates button").forEach((button) => {
    button.addEventListener("click", () => {
      const rate = Number(button.dataset.rate);
      if (Number.isFinite(rate)) handlers.onRate(rate);
    });
  });
  dateInput.addEventListener("change", () => {
    const jd = jdFromParisInput(dateInput.value);
    if (jd == null || !Number.isFinite(solar.utcYear(jd))) {
      dateError.hidden = false;
      return;
    }
    const year = solar.utcYear(jd);
    if (year < solar.MIN_YEAR || year > solar.MAX_YEAR) {
      dateError.hidden = false;
      return;
    }
    dateError.hidden = true;
    handlers.onDate(jd);
  });
  document.querySelector<HTMLButtonElement>("#frame-body")?.addEventListener("click", () => {
    setFollow(true);
    handlers.onFollow(true);
    handlers.onFrame();
  });
  document.querySelector<HTMLButtonElement>("#preset-inner")?.addEventListener("click", () => {
    setFollow(false);
    handlers.onInner();
  });
  document.querySelector<HTMLButtonElement>("#preset-full")?.addEventListener("click", () => {
    setFollow(false);
    handlers.onFull();
  });
  followButton.addEventListener("click", () => {
    if (!selectedId) select("earth");
    setFollow(!view.follow);
    handlers.onFollow(view.follow);
  });
  exponent.addEventListener("input", () => {
    view.exponent = Number(exponent.value);
    paintExponent();
  });
  size.addEventListener("input", () => {
    view.size = Number(size.value);
  });
  orbits.addEventListener("change", () => {
    view.orbits = orbits.checked;
  });
  names.addEventListener("change", () => {
    view.names = names.checked;
  });
  belt.addEventListener("change", () => {
    view.belt = belt.checked;
  });
  document.querySelector("#transport")?.addEventListener("submit", (event) => event.preventDefault());
  const viewPanel = document.querySelector("details#view");
  if (viewPanel && window.matchMedia("(max-width: 800px)").matches) viewPanel.open = false;
  paintExponent();

  function setFollow(follow: boolean): void {
    view.follow = follow;
    followButton.setAttribute("aria-pressed", follow ? "true" : "false");
  }

  function paintExponent(): void {
    exponentNote.textContent =
      view.exponent > 0.98
        ? "Les distances à l’écran suivent les unités astronomiques."
        : "Les distances à l’écran sont compressées pour tenir dans le cadre.";
  }

  function select(id: string): void {
    selectedId = selectedId === id ? null : id;
    if (!selectedId) setFollow(false);
    handlers.onSelect(selectedId);
  }

  function distanceLabel(info: BodyInfo, points: BodyPosition[]): string | null {
    const self = points.find((point) => point.id === info.id);
    if (!self) return null;
    if (!info.parent) return formatAu(self.rAu);
    const parent = points.find((point) => point.id === info.parent);
    if (!parent) return formatAu(self.rAu);
    const km = Math.hypot(self.x - parent.x, self.y - parent.y, self.z - parent.z) * solar.AU_KM;
    return formatKm(km);
  }

  function renderSelection(info: BodyInfo | null): void {
    list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.id === info?.id ? "true" : "false");
    });
    if (!info) {
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    name.textContent = info.name;
    fact.textContent = info.fact;
    const rows: [string, string][] = [
      ["Rayon", formatKm(info.radiusKm)],
      ["Période", formatPeriod(info.periodDays)],
      ["Excentricité", info.hasOrbit ? formatEccentricity(info.e) : "—"],
      ["Inclinaison", info.hasOrbit ? formatDegrees(info.iDeg) : "—"],
      ["Jour", formatDay(info.spinHours, info.retrograde)],
      ["Demi-grand axe", info.aAu > 0 ? formatAu(info.aAu) : "—"],
    ];
    facts.replaceChildren();
    for (const [term, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      if (term === "Demi-grand axe") dd.id = "axis-value";
      facts.append(dt, dd);
    }
    const dt = document.createElement("dt");
    dt.textContent = info.parent ? "Distance au corps parent" : "Distance au Soleil";
    const dd = document.createElement("dd");
    dd.id = "distance-value";
    facts.append(dt, dd);
  }

  return {
    view: () => view,
    selectedId: () => selectedId,
    clearSelection() {
      if (!selectedId && !view.follow) return;
      selectedId = null;
      setFollow(false);
      handlers.onSelect(null);
    },
    setEditor(enabled: boolean) {
      editorLink.hidden = !enabled;
    },
    sync(snapshot: UiSnapshot) {
      dateLabel.textContent = formatParisDate(snapshot.jd);
      jdLabel.textContent = formatJulian(snapshot.jd);
      rateLabel.textContent = snapshot.playing ? formatRate(snapshot.rate) : "En pause";
      play.textContent = snapshot.playing ? "Pause" : "Lecture";
      play.setAttribute("aria-pressed", snapshot.playing ? "false" : "true");
      pill.textContent =
        snapshot.mode === "node-red"
          ? "Horloge Node-RED"
          : snapshot.mode === "local"
            ? "Horloge locale"
            : "Connexion à Node-RED…";
      pill.classList.toggle("is-live", snapshot.mode === "node-red");
      pill.classList.toggle("is-local", snapshot.mode === "local");
      document.querySelectorAll<HTMLButtonElement>(".rates button").forEach((button) => {
        const rate = Number(button.dataset.rate);
        button.setAttribute("aria-pressed", Math.abs(rate - snapshot.rate) < 0.05 ? "true" : "false");
      });
      if (document.activeElement !== dateInput) dateInput.value = parisInputValue(snapshot.jd);
      if (snapshot.selectedId !== selectedId) selectedId = snapshot.selectedId;
      if (renderedSelection !== selectedId) {
        renderedSelection = selectedId;
        renderSelection(selectedId ? byId.get(selectedId) ?? null : null);
        live.textContent = selectedId
          ? `Sélection : ${byId.get(selectedId)?.name ?? "astre"}.`
          : "Aucun astre sélectionné.";
      }
      const info = selectedId ? byId.get(selectedId) : undefined;
      const distance = document.querySelector<HTMLElement>("#distance-value");
      if (info && distance) {
        distance.textContent = distanceLabel(info, snapshot.positions) ?? "—";
      }
      if (info && snapshot.mode === "node-red" && snapshot.serverBodies) {
        const received = distanceLabel(info, snapshot.serverBodies);
        serverLine.hidden = !received;
        serverLine.textContent = received ? `Calcul Node-RED : ${received}` : "";
      } else {
        serverLine.hidden = true;
      }
      if (view.follow !== snapshot.follow) setFollow(snapshot.follow);
    },
  };
}
