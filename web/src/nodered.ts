import type { ClockMode } from "./clock";

export interface FlowNodeItem {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  wires: string[][];
  url?: string;
  method?: string;
  repeat?: string;
  func?: string;
  info?: string;
}

interface FlowMapResponse {
  ok: boolean;
  editor?: boolean;
  tab?: { id: string; label: string; info: string };
  nodes?: FlowNodeItem[];
}

const FALLBACK_TAB_INFO =
  "Horloge partagée du planétarium (10 Hz), API REST (/api/catalog, /api/health) et télémétrie hybride de l’ISS avec bascule automatique sur l’orbite théorique.";

const FALLBACK_NODES: FlowNodeItem[] = [
  {
    id: "note-solar",
    type: "comment",
    name: "L'horloge vit ici. La scène ne fait que dessiner la date reçue.",
    x: 360,
    y: 60,
    wires: [],
  },
  {
    id: "inj-tick",
    type: "inject",
    name: "Horloge",
    x: 150,
    y: 140,
    repeat: "0.1",
    wires: [["fn-clock"]],
  },
  {
    id: "ws-in-cmd",
    type: "websocket in",
    name: "Commandes",
    x: 160,
    y: 220,
    url: "/api/ws/solar",
    wires: [["fn-clock"]],
  },
  {
    id: "fn-clock",
    type: "function",
    name: "Éphémérides",
    x: 400,
    y: 180,
    wires: [["ws-out-tick"]],
    func: [
      "const solar = global.get('solar');",
      "const now = Date.now();",
      "let state = flow.get('sim') || solar.initialState(now);",
      "const issTelemetry = flow.get('issLive') || null;",
      "const command = msg.topic === 'tick' ? { type: 'tick' } : solar.parseCommand(msg.payload);",
      "const next = solar.reduce(state, command, now, { issTelemetry });",
      "flow.set('sim', next.state);",
      "delete msg._session;",
      "msg.payload = next.tick;",
      "return msg;",
    ].join("\n"),
  },
  {
    id: "ws-out-tick",
    type: "websocket out",
    name: "Vers la scène",
    x: 640,
    y: 180,
    url: "/api/ws/solar",
    wires: [],
  },
  {
    id: "http-catalog",
    type: "http in",
    name: "Catalogue",
    x: 150,
    y: 320,
    method: "GET",
    url: "/catalog",
    wires: [["fn-catalog"]],
  },
  {
    id: "fn-catalog",
    type: "function",
    name: "Catalogue JSON",
    x: 390,
    y: 320,
    wires: [["http-catalog-res"]],
    func: "msg.payload = global.get('solar').catalog();\nmsg.statusCode = 200;\nreturn msg;",
  },
  {
    id: "http-catalog-res",
    type: "http response",
    name: "HTTP 200",
    x: 610,
    y: 320,
    wires: [],
  },
  {
    id: "http-health",
    type: "http in",
    name: "Santé",
    x: 140,
    y: 400,
    method: "GET",
    url: "/health",
    wires: [["fn-health"]],
  },
  {
    id: "fn-health",
    type: "function",
    name: "Santé JSON",
    x: 380,
    y: 400,
    wires: [["http-health-res"]],
    func: "msg.payload = {\n  ok: true,\n  editor: global.get('editorEnabled') === true,\n  shutdown: global.get('shutdownEnabled') === true\n};\nreturn msg;",
  },
  {
    id: "http-health-res",
    type: "http response",
    name: "HTTP 200",
    x: 600,
    y: 400,
    wires: [],
  },
  {
    id: "note-iss",
    type: "comment",
    name: "ISS hybride : interroge l'API temps réel près du présent, sinon repli sur l'orbite théorique.",
    x: 420,
    y: 470,
    wires: [],
  },
  {
    id: "inj-iss-live",
    type: "inject",
    name: "Sondage ISS (5 s)",
    x: 170,
    y: 520,
    repeat: "5",
    wires: [["fn-iss-gate"]],
  },
  {
    id: "fn-iss-gate",
    type: "function",
    name: "Près du présent ?",
    x: 380,
    y: 520,
    wires: [["http-iss-live"]],
    func: "const solar = global.get('solar');\nconst sim = flow.get('sim');\nconst nowJd = solar.unixToJd(Date.now());\nif (sim && Math.abs(sim.jd - nowJd) > 5 / 1440) return null;\nmsg.requestTimeout = 3500;\nreturn msg;",
  },
  {
    id: "http-iss-live",
    type: "http request",
    name: "API ISS (25544)",
    x: 580,
    y: 520,
    method: "GET",
    url: "https://api.wheretheiss.at/v1/satellites/25544",
    wires: [["fn-iss-store"]],
  },
  {
    id: "catch-iss-live",
    type: "catch",
    name: "Repli hors ligne",
    x: 580,
    y: 580,
    wires: [["fn-iss-store"]],
  },
  {
    id: "fn-iss-store",
    type: "function",
    name: "Télémétrie ISS",
    x: 800,
    y: 520,
    wires: [],
    func: "flow.set('issLive', { latDeg, lonDeg, altitudeKm, velocityKmS, jd, dLatPerDay, dLonPerDay });\nreturn null;",
  },
];

interface PaletteStyle {
  fill: string;
  accent: string;
  badge: string;
  role: string;
}

function styleForType(type: string): PaletteStyle {
  if (type === "inject") {
    return {
      fill: "#1d2b3c",
      accent: "#6ea8dc",
      badge: "⏱",
      role: "Déclencheur périodique (inject)",
    };
  }
  if (type.startsWith("websocket")) {
    return {
      fill: "#261f38",
      accent: "#a98eda",
      badge: "⇄",
      role: type === "websocket in" ? "Entrée WebSocket (/api/ws/solar)" : "Diffusion WebSocket (/api/ws/solar)",
    };
  }
  if (type === "function") {
    return {
      fill: "#332419",
      accent: "#e39b56",
      badge: "ƒ",
      role: "Fonction JavaScript Node-RED",
    };
  }
  if (type.startsWith("http")) {
    return {
      fill: "#1b2e24",
      accent: "#7ec492",
      badge: "HTTP",
      role:
        type === "http in"
          ? "Route entrante Express / Node-RED"
          : type === "http request"
            ? "Requête HTTP externe"
            : "Réponse HTTP JSON",
    };
  }
  if (type === "catch") {
    return {
      fill: "#361e20",
      accent: "#e07a73",
      badge: "!",
      role: "Capture d’erreur et repli hors ligne",
    };
  }
  return {
    fill: "#191b23",
    accent: "#d4b483",
    badge: "•",
    role: "Note d’architecture",
  };
}

function need<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Élément Node-RED manquant : ${selector}`);
  return el;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

export interface NodeRedStudio {
  open: (tab?: "editor" | "diagram") => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  setEditorAvailable: (enabled: boolean) => void;
  syncStatus: (info: { mode: ClockMode; jdLabel: string; rateLabel: string; liveIss: boolean }) => void;
}

export function mountNodeRedStudio(onLayoutChange?: () => void): NodeRedStudio {
  const toggleBtn = need<HTMLButtonElement>("#nodered-toggle");
  const railEditorLink = need<HTMLAnchorElement>("#editor-link");
  const studio = need<HTMLElement>("#nodered-studio");
  const liveStatus = need<HTMLElement>("#nr-live-status");
  const tabEditor = need<HTMLButtonElement>("#nr-tab-editor");
  const tabDiagram = need<HTMLButtonElement>("#nr-tab-diagram");
  const sizeToggle = need<HTMLButtonElement>("#nr-size-toggle");
  const reloadBtn = need<HTMLButtonElement>("#nr-reload");
  const extLink = need<HTMLAnchorElement>("#nr-ext-link");
  const closeBtn = need<HTMLButtonElement>("#nr-close");
  const paneEditor = need<HTMLElement>("#nr-pane-editor");
  const paneDiagram = need<HTMLElement>("#nr-pane-diagram");
  const iframe = need<HTMLIFrameElement>("#nr-iframe");
  const disabledNote = need<HTMLElement>("#nr-editor-disabled");
  const tabSummary = need<HTMLElement>("#nr-tab-summary");
  const svg = need<SVGSVGElement>("#nr-svg");
  const nodeBadge = need<HTMLElement>("#nr-node-badge");
  const nodeTitle = need<HTMLElement>("#nr-node-title");
  const nodeMeta = need<HTMLElement>("#nr-node-meta");
  const openInRedBtn = need<HTMLButtonElement>("#nr-open-in-red");
  const nodeCodeWrap = need<HTMLElement>("#nr-code-wrap");
  const nodeCode = need<HTMLElement>("#nr-node-code");

  let opened = false;
  let activeTab: "editor" | "diagram" = "editor";
  let wide = false;
  let editorEnabled = false;
  let iframeLoaded = false;
  let nodes: FlowNodeItem[] = FALLBACK_NODES;
  let summaryText = FALLBACK_TAB_INFO;
  let selectedNodeId = "fn-clock";
  let lastClockMode: ClockMode = "connecting";

  function syncBodyClasses(): void {
    document.body.classList.toggle("has-nr-split", opened && !wide);
    studio.classList.toggle("is-wide", wide);
    sizeToggle.textContent = wide ? "Côte à côte" : "Plein cadre";
    sizeToggle.setAttribute("aria-pressed", wide ? "true" : "false");
    onLayoutChange?.();
  }

  function ensureIframe(): void {
    if (!editorEnabled || iframeLoaded) return;
    iframe.src = "/red/";
    iframeLoaded = true;
  }

  function applyTab(tab: "editor" | "diagram"): void {
    activeTab = tab;
    const isEditor = tab === "editor";
    tabEditor.setAttribute("aria-selected", isEditor ? "true" : "false");
    tabDiagram.setAttribute("aria-selected", isEditor ? "false" : "true");
    paneEditor.hidden = !isEditor;
    paneDiagram.hidden = isEditor;
    if (isEditor) {
      disabledNote.hidden = editorEnabled;
      iframe.hidden = !editorEnabled;
      ensureIframe();
    } else {
      void refreshFlowMap();
      renderGraph();
    }
  }

  async function refreshFlowMap(): Promise<void> {
    try {
      const response = await fetch("/api/flow-map", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as FlowMapResponse;
      if (payload.ok && Array.isArray(payload.nodes) && payload.nodes.length > 0) {
        nodes = payload.nodes;
        if (payload.tab?.info) summaryText = payload.tab.info;
        if (!nodes.some((n) => n.id === selectedNodeId)) {
          selectedNodeId = nodes.find((n) => n.type === "function")?.id ?? nodes[0].id;
        }
        renderGraph();
      }
    } catch {
      // Garde la carte embarquée hors ligne
    }
  }

  function describeNodeMeta(node: FlowNodeItem): string {
    const parts = [styleForType(node.type).role];
    if (node.repeat) {
      parts.push(`Cadence : toutes les ${node.repeat.replace(".", ",")} s`);
    }
    if (node.method && node.url) {
      const fullUrl = node.url.startsWith("http") ? node.url : `/api${node.url}`;
      parts.push(`${node.method} ${fullUrl}`);
    } else if (node.url) {
      parts.push(node.url);
    }
    const targets = node.wires.flat().length;
    if (targets > 0) {
      parts.push(`${targets} liaison${targets > 1 ? "s" : ""} sortante${targets > 1 ? "s" : ""}`);
    }
    return parts.join(" · ");
  }

  function renderInspector(): void {
    const node = nodes.find((item) => item.id === selectedNodeId) ?? nodes[0];
    if (!node) return;
    const palette = styleForType(node.type);
    nodeBadge.textContent = node.type;
    nodeBadge.style.borderColor = palette.accent;
    nodeBadge.style.color = palette.accent;
    nodeTitle.textContent = node.name || node.id;
    nodeMeta.textContent = describeNodeMeta(node);
    openInRedBtn.hidden = !editorEnabled;

    if (node.func) {
      nodeCodeWrap.hidden = false;
      nodeCode.textContent = node.func;
    } else if (node.info) {
      nodeCodeWrap.hidden = false;
      nodeCode.textContent = node.info;
    } else {
      nodeCodeWrap.hidden = true;
      nodeCode.textContent = "";
    }
  }

  function renderGraph(): void {
    tabSummary.textContent = summaryText;
    svg.replaceChildren();

    const defs = svgEl("defs");
    const glow = svgEl("filter");
    glow.setAttribute("id", "nr-glow");
    glow.innerHTML = `<feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.45"/>`;
    defs.append(glow);
    svg.append(defs);

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const NODE_W = 166;
    const NODE_H = 40;

    // 1. Fils de liaison (courbes de Bézier cubiques style Node-RED)
    const wiresLayer = svgEl("g");
    wiresLayer.setAttribute("class", "nr-wires");
    const isLive = lastClockMode === "node-red";

    for (const source of nodes) {
      if (source.type === "comment") continue;
      const x1 = source.x + NODE_W / 2;
      const y1 = source.y;
      for (const branch of source.wires) {
        for (const targetId of branch) {
          const target = byId.get(targetId);
          if (!target) continue;
          const x2 = target.x - NODE_W / 2;
          const y2 = target.y;
          const dx = Math.max(58, Math.abs(x2 - x1) * 0.52);
          const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

          const baseWire = svgEl("path");
          baseWire.setAttribute("d", d);
          baseWire.setAttribute("fill", "none");
          baseWire.setAttribute(
            "stroke",
            source.id === selectedNodeId || target.id === selectedNodeId
              ? "#d4b483"
              : "rgba(235, 228, 214, 0.28)",
          );
          baseWire.setAttribute("stroke-width", "2.2");
          wiresLayer.append(baseWire);

          if (isLive) {
            const pulseWire = svgEl("path");
            pulseWire.setAttribute("d", d);
            pulseWire.setAttribute("fill", "none");
            pulseWire.setAttribute("stroke", "#f0d7a8");
            pulseWire.setAttribute("stroke-width", "2");
            pulseWire.setAttribute("stroke-dasharray", "5 26");
            pulseWire.setAttribute("class", "nr-wire-pulse");
            wiresLayer.append(pulseWire);
          }
        }
      }
    }
    svg.append(wiresLayer);

    // 2. Nœuds et commentaires
    const nodesLayer = svgEl("g");
    for (const node of nodes) {
      if (node.type === "comment") {
        const g = svgEl("g");
        g.setAttribute("transform", `translate(${node.x}, ${node.y})`);
        const label = svgEl("text");
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "middle");
        label.setAttribute("fill", "#d4b483");
        label.setAttribute("font-size", "12");
        label.setAttribute("letter-spacing", "0.03em");
        label.textContent = `✦ ${node.name}`;
        g.append(label);
        nodesLayer.append(g);
        continue;
      }

      const palette = styleForType(node.type);
      const selected = node.id === selectedNodeId;
      const g = svgEl("g");
      g.setAttribute("class", selected ? "nr-node is-selected" : "nr-node");
      g.setAttribute("transform", `translate(${node.x - NODE_W / 2}, ${node.y - NODE_H / 2})`);
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `${node.name} (${node.type})`);

      const rect = svgEl("rect");
      rect.setAttribute("width", String(NODE_W));
      rect.setAttribute("height", String(NODE_H));
      rect.setAttribute("rx", "9");
      rect.setAttribute("fill", palette.fill);
      rect.setAttribute("stroke", selected ? "#f0d7a8" : palette.accent);
      rect.setAttribute("stroke-width", selected ? "2.4" : "1.35");
      rect.setAttribute("filter", "url(#nr-glow)");

      const stripe = svgEl("rect");
      stripe.setAttribute("x", "0");
      stripe.setAttribute("y", "0");
      stripe.setAttribute("width", "32");
      stripe.setAttribute("height", String(NODE_H));
      stripe.setAttribute("rx", "9");
      stripe.setAttribute("fill", palette.accent);
      stripe.setAttribute("fill-opacity", "0.24");

      const badge = svgEl("text");
      badge.setAttribute("x", "16");
      badge.setAttribute("y", String(NODE_H / 2 + 1));
      badge.setAttribute("text-anchor", "middle");
      badge.setAttribute("dominant-baseline", "middle");
      badge.setAttribute("fill", palette.accent);
      badge.setAttribute("font-size", node.type.startsWith("http") ? "9.5" : "13");
      badge.setAttribute("font-weight", "600");
      badge.textContent = palette.badge;

      const title = svgEl("text");
      title.setAttribute("x", "40");
      title.setAttribute("y", String(NODE_H / 2 + 1));
      title.setAttribute("dominant-baseline", "middle");
      title.setAttribute("fill", "#ebe4d6");
      title.setAttribute("font-size", "12.5");
      title.setAttribute("font-weight", "500");
      const rawTitle = node.name.trim() || node.type;
      title.textContent = rawTitle.length > 18 ? `${rawTitle.slice(0, 17)}…` : rawTitle;

      g.append(rect, stripe, badge, title);

      // Port d'entrée / de sortie style Node-RED
      if (node.type !== "inject" && node.type !== "http in" && node.type !== "websocket in" && node.type !== "catch") {
        const inPort = svgEl("rect");
        inPort.setAttribute("x", "-4");
        inPort.setAttribute("y", String(NODE_H / 2 - 4));
        inPort.setAttribute("width", "8");
        inPort.setAttribute("height", "8");
        inPort.setAttribute("rx", "2");
        inPort.setAttribute("fill", "#1a1c24");
        inPort.setAttribute("stroke", palette.accent);
        inPort.setAttribute("stroke-width", "1.3");
        g.append(inPort);
      }
      if (node.wires.flat().length > 0) {
        const outPort = svgEl("rect");
        outPort.setAttribute("x", String(NODE_W - 4));
        outPort.setAttribute("y", String(NODE_H / 2 - 4));
        outPort.setAttribute("width", "8");
        outPort.setAttribute("height", "8");
        outPort.setAttribute("rx", "2");
        outPort.setAttribute("fill", "#1a1c24");
        outPort.setAttribute("stroke", palette.accent);
        outPort.setAttribute("stroke-width", "1.3");
        g.append(outPort);
      }

      const selectThis = () => {
        selectedNodeId = node.id;
        renderGraph();
      };
      g.addEventListener("click", selectThis);
      g.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          selectThis();
        }
      });

      nodesLayer.append(g);
    }
    svg.append(nodesLayer);
    renderInspector();
  }

  function open(preferredTab?: "editor" | "diagram"): void {
    opened = true;
    studio.hidden = false;
    toggleBtn.setAttribute("aria-pressed", "true");
    const targetTab = preferredTab ?? (editorEnabled ? "editor" : "diagram");
    applyTab(targetTab);
    syncBodyClasses();
  }

  function close(): void {
    if (!opened) return;
    opened = false;
    studio.hidden = true;
    toggleBtn.setAttribute("aria-pressed", "false");
    syncBodyClasses();
  }

  function toggle(): void {
    if (opened) close();
    else open();
  }

  toggleBtn.addEventListener("click", () => toggle());
  railEditorLink.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    open("editor");
  });
  tabEditor.addEventListener("click", () => applyTab("editor"));
  tabDiagram.addEventListener("click", () => applyTab("diagram"));
  sizeToggle.addEventListener("click", () => {
    wide = !wide;
    syncBodyClasses();
  });
  reloadBtn.addEventListener("click", () => {
    if (activeTab === "editor" && editorEnabled) {
      iframeLoaded = true;
      iframe.src = `/red/?t=${Date.now()}`;
    } else {
      void refreshFlowMap();
    }
  });
  openInRedBtn.addEventListener("click", () => {
    if (editorEnabled) applyTab("editor");
  });
  closeBtn.addEventListener("click", () => close());

  return {
    open,
    close,
    toggle,
    isOpen: () => opened,
    setEditorAvailable(enabled: boolean) {
      editorEnabled = enabled;
      extLink.hidden = !enabled;
      tabEditor.title = enabled
        ? "Éditer et déployer visuellement les flux Node-RED en direct"
        : "L’éditeur complet /red est désactivé sur cet hébergement distant";
      if (opened && activeTab === "editor") {
        disabledNote.hidden = enabled;
        iframe.hidden = !enabled;
        if (enabled) ensureIframe();
      }
    },
    syncStatus(info) {
      const prevMode = lastClockMode;
      lastClockMode = info.mode;
      const stateTxt =
        info.mode === "node-red"
          ? `Flux actif · ${info.rateLabel}${info.liveIss ? " · ISS direct" : ""}`
          : info.mode === "local"
            ? "Horloge locale (hors ligne)"
            : "Connexion…";
      liveStatus.textContent = stateTxt;
      liveStatus.classList.toggle("is-live", info.mode === "node-red");
      if (opened && activeTab === "diagram" && prevMode !== info.mode) {
        renderGraph();
      }
    },
  };
}
