/**
 * TimingEngine — the drill clock.
 * Runs on accumulated frame deltas (XR frame timing), never on setInterval,
 * so drill timing stays locked to the headset's render clock and pausing is
 * exact. Also provides rhythm (BPM) pulses for rhythm-mode drills.
 */
export class TimingEngine {
  private elapsed = 0;
  private running = false;
  private bpm: number | undefined;
  private lastBeatIndex = -1;

  constructor(bpm?: number) {
    this.bpm = bpm;
  }

  start(): void {
    this.running = true;
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    this.running = true;
  }

  /** Advance by a frame delta (ms). Returns beat index if a new beat fired. */
  tick(deltaMs: number): number | null {
    if (!this.running) return null;
    this.elapsed += deltaMs;
    if (this.bpm) {
      const beatMs = 60000 / this.bpm;
      const idx = Math.floor(this.elapsed / beatMs);
      if (idx !== this.lastBeatIndex) {
        this.lastBeatIndex = idx;
        return idx;
      }
    }
    return null;
  }

  get now(): number {
    return this.elapsed;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** ms until the next beat (rhythm HUD), or null when no BPM set. */
  msToNextBeat(): number | null {
    if (!this.bpm) return null;
    const beatMs = 60000 / this.bpm;
    return beatMs - (this.elapsed % beatMs);
  }
}
