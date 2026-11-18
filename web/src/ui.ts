import solar, { type BodyInfo, type BodyPosition } from "../../ephemeris/solar.js";
import {
  formatAu,
  formatDay,
  formatDegrees,
  formatEccentricity,
  formatGeoCoord,
  formatJulian,
  formatKm,
  formatMeters,
  formatParisDate,
  formatPeriod,
  formatRate,
  formatSpeed,
  jdFromParisInput,
  parisInputValue,
} from "./format";
import { defaultView, type ViewSettings } from "./view";
import type { ClockMode } from "./clock";

export type EventPresetId =
  | "iss-live"
  | "starman-launch"
  | "starman-mars"
  | "jwst-l2"
  | "halley-1986"
  | "voyager-1977";

interface Handlers {
  onToggle: () => void;
  onRate: (rate: number) => void;
  onDate: (jd: number) => void;
  onNow: () => void;
  onEvent: (id: EventPresetId) => void;
  onSelect: (id: string | null) => void;
  onFrame: (id: string) => void;
  onCockpit: (cockpit: boolean) => void;
  onInner: () => void;
  onFull: () => void;
  onFollow: (follow: boolean) => void;
  onQuit: () => Promise<boolean>;
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
  setShutdown: (enabled: boolean) => void;
  isQuitDialogOpen: () => boolean;
  view: () => ViewSettings;
  selectedId: () => string | null;
  selectBody: (id: string | null) => void;
  focusBody: (id: string) => void;
  setCockpit: (cockpit: boolean) => void;
  enableCrafts: () => void;
  clearSelection: () => void;
} {
  const view: ViewSettings = { ...defaultView };
  let selectedId: string | null = null;
  let renderedSelection: string | null | undefined;
  let currentRate = 1;

  const list = need<HTMLOListElement>("#body-list");
  const empty = need<HTMLElement>("#fiche-empty");
  const body = need<HTMLElement>("#fiche-body");
  const name = need<HTMLElement>("#fiche-name");
  const fact = need<HTMLElement>("#fiche-fact");
  const inactiveNote = need<HTMLElement>("#fiche-inactive");
  const issModeLine = need<HTMLElement>("#fiche-iss-mode");
  const facts = need<HTMLDListElement>("#fiche-facts");
  const serverLine = need<HTMLElement>("#fiche-server");
  const jumpLaunch = need<HTMLButtonElement>("#jump-launch");
  const issLiveBtn = need<HTMLButtonElement>("#iss-live-btn");
  const frameButton = need<HTMLButtonElement>("#frame-body");
  const cockpitButton = need<HTMLButtonElement>("#cockpit-body");
  const dateLabel = need<HTMLElement>("#date-label");
  const jdLabel = need<HTMLElement>("#jd-label");
  const pill = need<HTMLElement>("#clock-pill");
  const quitButton = need<HTMLButtonElement>("#quit-app");
  const quitDialog = need<HTMLDialogElement>("#quit-dialog");
  const quitCancel = need<HTMLButtonElement>("#quit-cancel");
  const quitConfirm = need<HTMLButtonElement>("#quit-confirm");
  const quitDesc = need<HTMLElement>("#quit-desc");
  const shutdownScreen = need<HTMLElement>("#shutdown-screen");
  const shutdownDetail = need<HTMLElement>("#shutdown-detail");
  const shutdownClose = need<HTMLButtonElement>("#shutdown-close");
  const shutdownReload = need<HTMLButtonElement>("#shutdown-reload");
  const play = need<HTMLButtonElement>("#play-toggle");
  const reverseToggle = need<HTMLButtonElement>("#reverse-toggle");
  const nowButton = need<HTMLButtonElement>("#now-button");
  const rateLabel = need<HTMLElement>("#rate-label");
  const dateInput = need<HTMLInputElement>("#date-input");
  const eventSelect = need<HTMLSelectElement>("#event-select");
  const dateError = need<HTMLElement>("#date-error");
  const transportHint = need<HTMLElement>("#transport-hint");
  const live = need<HTMLElement>("#live");
  const editorLink = need<HTMLAnchorElement>("#editor-link");
  const exponent = need<HTMLInputElement>("#opt-exponent");
  const exponentNote = need<HTMLElement>("#exponent-note");
  const size = need<HTMLInputElement>("#opt-size");
  const exactSizeButton = need<HTMLButtonElement>("#exact-size");
  const sizeNote = need<HTMLElement>("#size-note");
  const orbits = need<HTMLInputElement>("#opt-orbits");
  const names = need<HTMLInputElement>("#opt-names");
  const belt = need<HTMLInputElement>("#opt-belt");
  const crafts = need<HTMLInputElement>("#opt-crafts");
  const followButton = need<HTMLButtonElement>("#preset-follow");
  let issListMeta: HTMLElement | null = null;

  function appendBodyItem(info: BodyInfo): void {
    const item = document.createElement("li");
    if (info.kind === "moon") item.classList.add("is-moon");
    if (info.kind === "craft") item.classList.add("is-craft");
    if (info.kind === "comet") item.classList.add("is-comet");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = info.id;
    button.setAttribute("aria-pressed", "false");
    const swatch = document.createElement("span");
    swatch.className =
      info.id === "sun"
        ? "swatch sun"
        : info.kind === "craft"
          ? "swatch craft"
          : info.kind === "comet"
            ? "swatch comet"
            : "swatch";
    swatch.style.background = info.color;
    const label = document.createElement("span");
    label.className = "body-name";
    label.textContent = info.name;
    const meta = document.createElement("span");
    meta.className = "body-meta";
    if (info.altitudeKm != null) {
      meta.textContent = formatKm(info.altitudeKm);
    } else if (info.orbitMode === "l2Halo") {
      meta.textContent = "L2 · 1,5 M km";
    } else if (info.aAu > 0.05) {
      meta.textContent = formatAu(info.aAu);
    } else {
      meta.textContent = "";
    }
    if (info.id === "iss") issListMeta = meta;
    button.append(swatch, label, meta);
    button.addEventListener("click", () => toggleSelect(info.id));
    item.append(button);
    list.append(item);
  }

  for (const primary of bodies) {
    if (primary.kind !== "star" && primary.kind !== "planet") continue;
    appendBodyItem(primary);
    for (const moon of bodies) {
      if (moon.kind === "moon" && moon.parent === primary.id) {
        appendBodyItem(moon);
      }
    }
  }

  const cometBodies = bodies.filter((item) => item.kind === "comet");
  if (cometBodies.length > 0) {
    const heading = document.createElement("li");
    heading.className = "list-section";
    heading.setAttribute("aria-hidden", "true");
    heading.textContent = "Comètes";
    list.append(heading);
    for (const comet of cometBodies) appendBodyItem(comet);
  }

  const craftBodies = bodies.filter((item) => item.kind === "craft");
  if (craftBodies.length > 0) {
    const heading = document.createElement("li");
    heading.className = "list-section";
    heading.setAttribute("aria-hidden", "true");
    heading.textContent = "Engins";
    list.append(heading);
    for (const craft of craftBodies) appendBodyItem(craft);
  }

  play.addEventListener("click", () => handlers.onToggle());
  reverseToggle.addEventListener("click", () => {
    const fallback = currentRate === 0 ? -1 : -currentRate;
    handlers.onRate(fallback);
  });
  nowButton.addEventListener("click", () => {
    dateError.hidden = true;
    handlers.onNow();
  });
  eventSelect.addEventListener("change", () => {
    const value = eventSelect.value as EventPresetId | "";
    if (!value) return;
    dateError.hidden = true;
    handlers.onEvent(value);
    eventSelect.value = "";
  });
  document.querySelectorAll<HTMLButtonElement>(".rates button").forEach((button) => {
    button.addEventListener("click", () => {
      const rate = Number(button.dataset.rate);
      if (!Number.isFinite(rate)) return;
      const sign = currentRate < 0 ? -1 : 1;
      handlers.onRate(sign * rate);
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
  frameButton.addEventListener("click", () => {
    if (!selectedId) return;
    if (view.cockpit) setCockpit(false);
    setFollow(true);
    handlers.onFollow(true);
    handlers.onFrame(selectedId);
  });
  cockpitButton.addEventListener("click", () => {
    if (!selectedId) return;
    const info = byId.get(selectedId);
    if (info?.kind === "craft") enableCrafts();
    const next = !view.cockpit;
    if (next) {
      setFollow(true);
      handlers.onFollow(true);
    }
    setCockpit(next);
  });
  issLiveBtn.addEventListener("click", () => {
    dateError.hidden = true;
    handlers.onEvent("iss-live");
  });
  jumpLaunch.addEventListener("click", () => {
    if (!selectedId) return;
    const info = byId.get(selectedId);
    if (!info || info.sinceJd == null) return;
    enableCrafts();
    dateError.hidden = true;
    handlers.onDate(info.sinceJd + 0.02);
    setFollow(true);
    handlers.onFollow(true);
    if (!view.cockpit) handlers.onFrame(info.id);
  });
  document.querySelector<HTMLButtonElement>("#preset-inner")?.addEventListener("click", () => {
    if (view.cockpit) setCockpit(false);
    setFollow(false);
    handlers.onInner();
  });
  document.querySelector<HTMLButtonElement>("#preset-full")?.addEventListener("click", () => {
    if (view.cockpit) setCockpit(false);
    setFollow(false);
    handlers.onFull();
  });
  followButton.addEventListener("click", () => {
    if (!selectedId) selectBody("earth");
    setFollow(!view.follow);
    handlers.onFollow(view.follow);
  });
  exponent.addEventListener("input", () => {
    view.exponent = Number(exponent.value);
    paintExponent();
  });
  size.addEventListener("input", () => {
    view.size = Number(size.value);
    if (view.exactSize) {
      view.exactSize = false;
      exactSizeButton.setAttribute("aria-pressed", "false");
      size.classList.remove("is-overridden");
    }
    paintSize();
  });
  exactSizeButton.addEventListener("click", () => {
    view.exactSize = !view.exactSize;
    exactSizeButton.setAttribute("aria-pressed", view.exactSize ? "true" : "false");
    size.classList.toggle("is-overridden", view.exactSize);
    paintSize();
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
  crafts.addEventListener("change", () => {
    view.crafts = crafts.checked;
    if (!view.crafts && view.cockpit && selectedId && byId.get(selectedId)?.kind === "craft") {
      setCockpit(false);
    }
  });
  quitButton.addEventListener("click", () => {
    quitDesc.textContent = editorLink.hidden
      ? "Les flux Node-RED, la connexion WebSocket temps réel et le serveur local seront arrêtés proprement."
      : "Les flux Node-RED, l’éditeur /red, la connexion WebSocket et le serveur local seront arrêtés proprement.";
    if (typeof quitDialog.showModal === "function") {
      quitDialog.showModal();
    } else {
      quitDialog.setAttribute("open", "");
    }
  });
  quitCancel.addEventListener("click", () => {
    quitDialog.close();
  });
  quitDialog.addEventListener("click", (event) => {
    if (event.target === quitDialog) quitDialog.close();
  });
  quitConfirm.addEventListener("click", () => {
    quitConfirm.disabled = true;
    quitCancel.disabled = true;
    quitConfirm.textContent = "Arrêt en cours…";
    void handlers.onQuit().then((serverStopped) => {
      quitDialog.close();
      document.body.classList.add("is-shutdown");
      shutdownDetail.textContent = serverStopped
        ? "Les flux Node-RED, la connexion WebSocket et le serveur local ont été fermés proprement. Vous pouvez fermer cet onglet."
        : "La scène WebGL et les connexions locales ont été fermées proprement. Vous pouvez fermer cet onglet.";
      shutdownScreen.hidden = false;
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // Le navigateur peut refuser window.close() sur un onglet ouvert manuellement
        }
      }, 180);
    });
  });
  shutdownClose.addEventListener("click", () => {
    try {
      window.close();
    } catch {
      // Ignoré
    }
    window.setTimeout(() => {
      if (!document.hidden) {
        shutdownDetail.textContent =
          "Le serveur et Node-RED sont bien arrêtés. Utilisez Cmd+W (ou Ctrl+W) pour fermer cet onglet.";
      }
    }, 150);
  });
  shutdownReload.addEventListener("click", () => {
    window.location.reload();
  });
  document.querySelector("#transport")?.addEventListener("submit", (event) => event.preventDefault());
  const viewPanel = document.querySelector<HTMLDetailsElement>("details#view");
  if (viewPanel && window.matchMedia("(max-width: 800px)").matches) viewPanel.open = false;
  paintExponent();
  paintSize();

  function enableCrafts(): void {
    view.crafts = true;
    crafts.checked = true;
  }

  function setFollow(follow: boolean): void {
    view.follow = follow;
    followButton.setAttribute("aria-pressed", follow ? "true" : "false");
  }

  function setCockpit(cockpit: boolean): void {
    if (view.cockpit === cockpit) return;
    view.cockpit = cockpit;
    cockpitButton.setAttribute("aria-pressed", cockpit ? "true" : "false");
    cockpitButton.textContent = cockpit ? "Quitter" : "À bord";
    transportHint.innerHTML = cockpit
      ? "glisser : regarder à 360° · <kbd>échap</kbd> quitter à bord"
      : "<kbd>espace</kbd> pause · double-clic : cadrer";
    handlers.onCockpit(cockpit);
  }

  function paintExponent(): void {
    exponentNote.textContent =
      view.exponent > 0.98
        ? "Les distances à l’écran suivent les unités astronomiques."
        : "Les distances à l’écran sont compressées pour tenir dans le cadre.";
  }

  function paintSize(): void {
    sizeNote.textContent = view.exactSize
      ? "Proportions réelles face au Soleil (109 Terres, 10 Jupiters)."
      : `Rayons amplifiés (×${view.size}) pour voir les planètes de loin.`;
  }

  function toggleSelect(id: string): void {
    selectBody(selectedId === id ? null : id);
  }

  function selectBody(id: string | null): void {
    selectedId = id;
    if (!selectedId) {
      if (view.cockpit) setCockpit(false);
      setFollow(false);
    } else if (view.cockpit && byId.get(selectedId)?.kind === "craft") {
      enableCrafts();
    }
    handlers.onSelect(selectedId);
  }

  function focusBody(id: string): void {
    selectedId = id;
    handlers.onSelect(id);
    const info = byId.get(id);
    if (info?.kind === "craft") enableCrafts();
    if (view.cockpit) setCockpit(false);
    setFollow(true);
    handlers.onFollow(true);
    handlers.onFrame(id);
  }

  function distanceLabel(info: BodyInfo, points: BodyPosition[]): string | null {
    const self = points.find((point) => point.id === info.id);
    if (!self) return null;
    if (!info.parent) return info.id === "sun" ? "0 UA" : formatAu(self.rAu);
    const parent = points.find((point) => point.id === info.parent);
    if (!parent) return formatAu(self.rAu);
    const km = Math.hypot(self.x - parent.x, self.y - parent.y, self.z - parent.z) * solar.AU_KM;
    return formatKm(km);
  }

  function earthDistanceLabel(info: BodyInfo, points: BodyPosition[]): string | null {
    const self = points.find((point) => point.id === info.id);
    const earth = points.find((point) => point.id === "earth");
    if (!self || !earth) return null;
    const distAu = Math.hypot(self.x - earth.x, self.y - earth.y, self.z - earth.z);
    if (distAu < 0.02) return formatKm(distAu * solar.AU_KM);
    return formatAu(distAu);
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
      info.spanMeters != null
        ? ["Envergure", formatMeters(info.spanMeters)]
        : ["Rayon", formatKm(info.radiusKm)],
      ["Période", formatPeriod(info.periodDays)],
      info.altitudeKm != null
        ? ["Altitude", formatKm(info.altitudeKm)]
        : ["Excentricité", info.hasOrbit ? formatEccentricity(info.e) : "—"],
      [
        info.frame === "equatorial" ? "Inclinaison (équateur)" : "Inclinaison",
        info.hasOrbit ? formatDegrees(info.iDeg) : "—",
      ],
      [
        info.kind === "craft" || info.kind === "comet" ? "Rotation" : "Jour",
        formatDay(info.spinHours, info.retrograde),
      ],
    ];
    if (info.orbitMode === "l2Halo") {
      rows.push(["Rayon halo L2", formatKm(info.aAu * solar.AU_KM)]);
    } else if (info.altitudeKm == null) {
      rows.push(["Demi-grand axe", info.aAu > 0 ? formatAu(info.aAu) : "—"]);
    }

    facts.replaceChildren();
    for (const [term, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      if (term === "Demi-grand axe") dd.id = "axis-value";
      facts.append(dt, dd);
    }

    const dtDist = document.createElement("dt");
    dtDist.textContent =
      info.id === "iss"
        ? "Rayon orbital"
        : info.id === "jwst"
          ? "Distance à la Terre"
          : info.parent
            ? "Distance au corps parent"
            : "Distance au Soleil";
    const ddDist = document.createElement("dd");
    ddDist.id = "distance-value";
    facts.append(dtDist, ddDist);

    if (info.id === "roadster" || info.id === "halley") {
      const dtEarth = document.createElement("dt");
      dtEarth.textContent = "Distance à la Terre";
      const ddEarth = document.createElement("dd");
      ddEarth.id = "earth-distance-value";
      facts.append(dtEarth, ddEarth);
    }

    if (info.hasOrbit) {
      const dtSpeed = document.createElement("dt");
      dtSpeed.textContent = "Vitesse orbitale";
      const ddSpeed = document.createElement("dd");
      ddSpeed.id = "speed-value";
      facts.append(dtSpeed, ddSpeed);
    }
  }

  return {
    view: () => view,
    selectedId: () => selectedId,
    selectBody,
    focusBody,
    setCockpit,
    enableCrafts,
    isQuitDialogOpen: () => quitDialog.open,
    clearSelection() {
      if (!selectedId && !view.follow && !view.cockpit) return;
      selectedId = null;
      if (view.cockpit) setCockpit(false);
      setFollow(false);
      handlers.onSelect(null);
    },
    setEditor(enabled: boolean) {
      editorLink.hidden = !enabled;
    },
    setShutdown(enabled: boolean) {
      quitButton.hidden = !enabled;
    },
    sync(snapshot: UiSnapshot) {
      currentRate = snapshot.rate;
      dateLabel.textContent = formatParisDate(snapshot.jd);
      jdLabel.textContent = formatJulian(snapshot.jd);
      rateLabel.textContent = snapshot.playing ? formatRate(snapshot.rate) : "En pause";
      play.textContent = snapshot.playing ? "Pause" : "Lecture";
      play.setAttribute("aria-pressed", snapshot.playing ? "false" : "true");
      reverseToggle.setAttribute("aria-pressed", snapshot.rate < 0 ? "true" : "false");
      pill.textContent =
        snapshot.mode === "node-red"
          ? "Horloge Node-RED"
          : snapshot.mode === "local"
            ? "Horloge locale"
            : snapshot.mode === "stopped"
              ? "Observatoire arrêté"
              : "Connexion à Node-RED…";
      pill.classList.toggle("is-live", snapshot.mode === "node-red");
      pill.classList.toggle("is-local", snapshot.mode === "local");

      const absRate = Math.abs(snapshot.rate);
      document.querySelectorAll<HTMLButtonElement>(".rates button").forEach((button) => {
        const rate = Number(button.dataset.rate);
        const match = rate > 0 && Math.abs(rate - absRate) / rate < 0.03;
        button.setAttribute("aria-pressed", match ? "true" : "false");
      });

      const activeById = new Map(snapshot.positions.map((point) => [point.id, point.active]));
      list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((button) => {
        const id = button.dataset.id;
        const active = id ? (activeById.get(id) ?? true) : true;
        button.classList.toggle("is-inactive", !active);
      });

      const issPoint = snapshot.positions.find((point) => point.id === "iss");
      if (issListMeta) {
        const liveNow = issPoint?.source === "live";
        issListMeta.textContent = liveNow ? "EN DIRECT" : formatKm(415);
        issListMeta.classList.toggle("is-live", liveNow);
      }

      if (document.activeElement !== dateInput) dateInput.value = parisInputValue(snapshot.jd);
      if (snapshot.selectedId !== selectedId) selectedId = snapshot.selectedId;
      if (renderedSelection !== selectedId) {
        renderedSelection = selectedId;
        renderSelection(selectedId ? (byId.get(selectedId) ?? null) : null);
        live.textContent = selectedId
          ? `Sélection : ${byId.get(selectedId)?.name ?? "astre"}.`
          : "Aucun astre sélectionné.";
      }

      const info = selectedId ? byId.get(selectedId) : undefined;
      const selfPoint = info ? snapshot.positions.find((point) => point.id === info.id) : undefined;
      const isActive = selfPoint?.active ?? true;

      if (info && !isActive && info.sinceJd != null) {
        if (view.cockpit) setCockpit(false);
        inactiveNote.hidden = false;
        inactiveNote.textContent = `Pas encore dans l’espace à cette date (départ le ${formatParisDate(info.sinceJd)}).`;
        jumpLaunch.hidden = false;
        frameButton.hidden = true;
        cockpitButton.hidden = true;
      } else {
        inactiveNote.hidden = true;
        jumpLaunch.hidden = true;
        frameButton.hidden = false;
        cockpitButton.hidden = false;
      }

      if (info?.id === "iss") {
        issModeLine.hidden = false;
        if (
          selfPoint?.source === "live" &&
          selfPoint.liveLatDeg != null &&
          selfPoint.liveLonDeg != null
        ) {
          issModeLine.classList.add("is-live");
          const alt =
            selfPoint.liveAltitudeKm != null ? ` · ${formatKm(selfPoint.liveAltitudeKm)}` : "";
          issModeLine.textContent = `En direct (Node-RED) : ${formatGeoCoord(selfPoint.liveLatDeg, selfPoint.liveLonDeg)}${alt}`;
          const isRealTime =
            snapshot.playing && Math.abs(snapshot.rate - 1 / 86400) / (1 / 86400) < 0.08;
          issLiveBtn.hidden = isRealTime;
        } else {
          issModeLine.classList.remove("is-live");
          issModeLine.textContent = "Mode : orbite théorique circulaire (415 km, 51,64°)";
          issLiveBtn.hidden = false;
        }
      } else {
        issModeLine.hidden = true;
        issLiveBtn.hidden = true;
      }

      const distance = document.querySelector<HTMLElement>("#distance-value");
      if (info && distance) {
        distance.textContent = isActive ? (distanceLabel(info, snapshot.positions) ?? "—") : "Au sol";
      }
      const earthDistance = document.querySelector<HTMLElement>("#earth-distance-value");
      if (info && earthDistance) {
        earthDistance.textContent = isActive
          ? (earthDistanceLabel(info, snapshot.positions) ?? "—")
          : "—";
      }
      const speed = document.querySelector<HTMLElement>("#speed-value");
      if (info && speed) {
        speed.textContent =
          isActive && selfPoint && selfPoint.speedKmS > 0 ? formatSpeed(selfPoint.speedKmS) : "—";
      }

      if (info && isActive && snapshot.mode === "node-red" && snapshot.serverBodies) {
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
