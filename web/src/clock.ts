import solar, {
  type BodyPosition,
  type IssTelemetry,
  type SimState,
  type SolarCommand,
  type Tick,
} from "../../ephemeris/solar.js";

export type ClockMode = "connecting" | "node-red" | "local" | "stopped";

export class ObservatoryClock {
  mode: ClockMode = "connecting";
  serverBodies: BodyPosition[] | null = null;
  issLive: IssTelemetry | null = null;
  private state: SimState;
  private anchorJd: number;
  private anchorPerf: number;
  private ws: WebSocket | null = null;
  private holdUntil = 0;
  private reconnectTimer: number | null = null;
  private stopped = false;

  constructor(private readonly onChange: () => void) {
    this.state = solar.initialState(Date.now());
    this.anchorJd = this.state.jd;
    this.anchorPerf = performance.now();
  }

  jdNow(): number {
    if (!this.state.playing) return this.state.jd;
    const elapsed = (performance.now() - this.anchorPerf) / 1000;
    return this.anchorJd + this.state.rateDaysPerSec * elapsed;
  }

  playing(): boolean {
    return this.state.playing;
  }

  rate(): number {
    return this.state.rateDaysPerSec;
  }

  command(command: SolarCommand): void {
    if (this.stopped) return;
    const now = Date.now();
    const folded: SimState = {
      ...this.state,
      jd: this.jdNow(),
      updatedAtMs: now,
    };
    const next = solar.reduce(folded, command, now, { issTelemetry: this.issLive });
    if (!next.accepted) return;
    this.adopt(next.state);
    this.holdUntil = performance.now() + 700;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    }
    this.onChange();
  }

  useLocal(): void {
    if (this.stopped) return;
    this.mode = "local";
    this.adopt({ ...this.state, jd: this.jdNow(), updatedAtMs: Date.now() });
    this.onChange();
  }

  stop(): void {
    this.stopped = true;
    this.mode = "stopped";
    this.adopt({ ...this.state, jd: this.jdNow(), playing: false, updatedAtMs: Date.now() });
    if (this.reconnectTimer != null) {
      window.clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.close(1000, "Arrêt propre");
      } catch {
        // Fermeture silencieuse
      }
    }
  }

  startAutoReconnect(onSync: (info: { editor: boolean; shutdown: boolean }) => void): void {
    if (this.reconnectTimer != null) return;
    this.reconnectTimer = window.setInterval(() => {
      if (this.stopped || this.mode !== "local" || this.ws || document.hidden) return;
      void fetch("/api/health", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok || this.stopped) return;
          const health = (await response.json()) as { editor?: boolean; shutdown?: boolean };
          onSync({
            editor: health.editor === true,
            shutdown: health.shutdown === true,
          });
          this.connectSocket();
        })
        .catch(() => undefined);
    }, 5000);
  }

  connectSocket(): void {
    if (this.stopped || this.ws) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}//${location.host}/api/ws/solar`);
    this.ws = socket;
    const giveUp = window.setTimeout(() => {
      if (this.stopped) return;
      if (this.mode === "connecting" || socket.readyState !== WebSocket.OPEN) {
        socket.close();
        if (this.mode !== "local") this.useLocal();
      }
    }, 2500);
    socket.addEventListener("open", () => {
      window.clearTimeout(giveUp);
      if (this.stopped) return;
      this.mode = "node-red";
      this.onChange();
    });
    socket.addEventListener("message", (event) => {
      if (this.stopped || typeof event.data !== "string") return;
      let tick: Tick;
      try {
        tick = JSON.parse(event.data) as Tick;
      } catch {
        return;
      }
      if (!tick || tick.type !== "tick" || !Number.isFinite(tick.jd)) return;
      this.serverBodies = tick.bodies;
      if (tick.issLive) this.issLive = tick.issLive;
      this.mode = "node-red";
      if (performance.now() < this.holdUntil) {
        this.onChange();
        return;
      }
      this.reconcile(tick);
      this.onChange();
    });
    socket.addEventListener("close", () => {
      window.clearTimeout(giveUp);
      this.ws = null;
      if (!this.stopped && this.mode !== "local") this.useLocal();
    });
    socket.addEventListener("error", () => socket.close());
  }

  private reconcile(tick: Tick): void {
    const localJd = this.jdNow();
    const error = tick.jd - localJd;
    const tolerance = Math.max(0.05, Math.abs(tick.rateDaysPerSec) * 0.45);
    const rateChanged = Math.abs(tick.rateDaysPerSec - this.state.rateDaysPerSec) > 1e-9;
    if (Math.abs(error) > tolerance || tick.playing !== this.state.playing || rateChanged) {
      this.adopt({
        jd: tick.jd,
        playing: tick.playing,
        rateDaysPerSec: tick.rateDaysPerSec,
        updatedAtMs: Date.now(),
      });
      return;
    }
    this.adopt({
      jd: localJd + error * 0.35,
      playing: tick.playing,
      rateDaysPerSec: tick.rateDaysPerSec,
      updatedAtMs: Date.now(),
    });
  }

  private adopt(state: SimState): void {
    this.state = state;
    this.anchorJd = state.jd;
    this.anchorPerf = performance.now();
  }
}
