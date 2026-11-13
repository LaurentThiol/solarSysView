import solar, { type BodyPosition, type SimState, type Tick } from "../../ephemeris/solar.js";

export type ClockMode = "connecting" | "node-red" | "local";

export class ObservatoryClock {
  mode: ClockMode = "connecting";
  serverBodies: BodyPosition[] | null = null;
  private state: SimState;
  private anchorJd: number;
  private anchorPerf: number;
  private ws: WebSocket | null = null;
  private holdUntil = 0;

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

  command(command: { type: string; rateDaysPerSec?: number; jd?: number }): void {
    const now = Date.now();
    const folded: SimState = {
      ...this.state,
      jd: this.jdNow(),
      updatedAtMs: now,
    };
    const next = solar.reduce(folded, command, now);
    if (!next.accepted) return;
    this.adopt(next.state);
    this.holdUntil = performance.now() + 700;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    }
    this.onChange();
  }

  useLocal(): void {
    this.mode = "local";
    this.adopt({ ...this.state, jd: this.jdNow(), updatedAtMs: Date.now() });
    this.onChange();
  }

  connectSocket(): void {
    if (this.ws) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}//${location.host}/api/ws/solar`);
    this.ws = socket;
    const giveUp = window.setTimeout(() => {
      if (this.mode === "connecting") {
        socket.close();
        this.useLocal();
      }
    }, 2500);
    socket.addEventListener("open", () => {
      window.clearTimeout(giveUp);
      this.mode = "node-red";
      this.onChange();
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let tick: Tick;
      try {
        tick = JSON.parse(event.data) as Tick;
      } catch {
        return;
      }
      if (!tick || tick.type !== "tick" || !Number.isFinite(tick.jd)) return;
      this.serverBodies = tick.bodies;
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
      if (this.mode !== "local") this.useLocal();
    });
    socket.addEventListener("error", () => socket.close());
  }

  private reconcile(tick: Tick): void {
    const localJd = this.jdNow();
    const error = tick.jd - localJd;
    const tolerance = Math.max(0.05, Math.abs(tick.rateDaysPerSec) * 0.45);
    if (Math.abs(error) > tolerance || tick.playing !== this.state.playing) {
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
