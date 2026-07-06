import type { TrialSpec } from "@/ares/drillTypes";

export interface PoolSlot {
  slotIndex: number;
  active: boolean;
  spec: TrialSpec | null;
  /** live mutable position — DrillRunner writes this straight to the mesh */
  pos: [number, number, number];
  spawnClock: number;
}

/**
 * TargetSpawner — fixed-size object pool.
 * Meshes are allocated once by DrillRunner; this class only assigns/releases
 * slots, so no geometry or material is ever created mid-drill (GC-quiet on
 * Quest hardware).
 */
export class TargetPool {
  readonly slots: PoolSlot[];
  private byTargetId = new Map<string, PoolSlot>();

  constructor(size: number) {
    this.slots = Array.from({ length: size }, (_, i) => ({
      slotIndex: i,
      active: false,
      spec: null,
      pos: [0, 0, 0],
      spawnClock: 0,
    }));
  }

  acquire(spec: TrialSpec, clock: number): PoolSlot | null {
    const slot = this.slots.find((s) => !s.active);
    if (!slot) return null; // pool exhausted — drill plans are sized to avoid this
    slot.active = true;
    slot.spec = spec;
    slot.pos = [...spec.position];
    slot.spawnClock = clock;
    this.byTargetId.set(spec.id, slot);
    return slot;
  }

  release(targetId: string): void {
    const slot = this.byTargetId.get(targetId);
    if (!slot) return;
    slot.active = false;
    slot.spec = null;
    this.byTargetId.delete(targetId);
  }

  get(targetId: string): PoolSlot | undefined {
    return this.byTargetId.get(targetId);
  }

  releaseAll(): void {
    for (const s of this.slots) {
      s.active = false;
      s.spec = null;
    }
    this.byTargetId.clear();
  }
}
