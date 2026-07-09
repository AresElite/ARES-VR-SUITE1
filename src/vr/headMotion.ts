import * as THREE from "three";

/**
 * Head angular velocity from the XR camera pose (IMU-driven in-headset).
 * PHASE 1 PROTOTYPE: this drives the *experience* of head-velocity-gated
 * optotypes (the DVA/GST analog). It is design validation only — validated
 * velocity dosing and measurement belong to the Phase 2 native build.
 */
class HeadMotion {
  /** smoothed head angular speed, degrees/second */
  velDegS = 0;
  private prev = new THREE.Quaternion();
  private has = false;

  update(q: THREE.Quaternion, dt: number): void {
    if (dt <= 0) return;
    if (!this.has) {
      this.prev.copy(q);
      this.has = true;
      return;
    }
    const dot = Math.min(1, Math.abs(this.prev.dot(q)));
    const angleRad = 2 * Math.acos(dot);
    const inst = (angleRad * 180) / Math.PI / dt;
    // light exponential smoothing — responsive but not jittery
    this.velDegS += (inst - this.velDegS) * Math.min(1, dt * 12);
    this.prev.copy(q);
  }

  reset(): void {
    this.has = false;
    this.velDegS = 0;
  }
}

export const headMotion = new HeadMotion();
