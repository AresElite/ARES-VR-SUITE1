import * as THREE from "three";

/**
 * Procedural established plate-design stimulus painters.
 *
 * ISHIHARA-STYLE PLATES: pseudo-isochromatic dot fields. Figure and ground
 * dots are matched in luminance but separated along dichromatic confusion
 * lines (red-green axis for protan/deutan performance-baseline testing, blue-yellow for tritan)
 * so the digit is invisible without normal color discrimination. Control
 * plates separate figure/ground by luminance so every athlete can read them
 * (malingering / comprehension check). Headset note: this is a SCREENING
 * instrument — display gamut and calibration differ from printed plates.
 *
 * RANDOM-DOT STEREOGRAM DISCS: dense random-dot fields with zero monocular
 * form cues. Depth is created dichoptically by horizontally offsetting the
 * left-eye and right-eye copies of the same texture (true retinal disparity
 * — the VR displays replace Randot polarization with per-eye rendering).
 */

const cache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Confusion-line palettes (approximations of printed pseudo-isochromatic inks). */
const PALETTES = {
  // red-green axis: figure oranges/reds vs ground olives/greens (protan/deutan)
  rg: {
    figure: ["#C4694B", "#D2794F", "#B85E45", "#CC8557"],
    ground: ["#8A9A50", "#7C8B49", "#9AA85F", "#6F7E44"],
  },
  // blue-yellow axis (tritan)
  by: {
    figure: ["#4E7FBE", "#5B8CC9", "#4472AE", "#6B98D2"],
    ground: ["#B0A34E", "#C0B159", "#A29445", "#CBBd66"],
  },
  // control: luminance-separated — readable with any color vision
  control: {
    figure: ["#E8E8EC", "#DDDDE4", "#F0F0F4", "#D4D4DC"],
    ground: ["#4A4A55", "#3E3E48", "#55555F", "#44444E"],
  },
} as const;

export function makePlateTexture(digit: number, axis: "control" | "rg" | "by", seed: number): THREE.CanvasTexture {
  const key = `p-${digit}-${axis}-${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;

  // digit mask
  const mask = document.createElement("canvas");
  mask.width = S;
  mask.height = S;
  const mg = mask.getContext("2d")!;
  mg.fillStyle = "#000";
  mg.fillRect(0, 0, S, S);
  mg.fillStyle = "#fff";
  mg.font = `bold ${Math.round(S * 0.62)}px Poppins, Arial, sans-serif`;
  mg.textAlign = "center";
  mg.textBaseline = "middle";
  mg.fillText(String(digit), S / 2, S / 2 + S * 0.03);
  const maskData = mg.getImageData(0, 0, S, S).data;
  const inFigure = (x: number, y: number) => maskData[(Math.round(y) * S + Math.round(x)) * 4] > 128;

  // plate background (dark neutral so the disc reads as a plate)
  g.fillStyle = "#141421";
  g.fillRect(0, 0, S, S);
  const r = rng(seed);
  const pal = PALETTES[axis];
  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.48;
  // dense non-overlapping-ish dot packing
  for (let i = 0; i < 1400; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * R;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    const dotR = 3 + r() * 8;
    const set = inFigure(x, y) ? pal.figure : pal.ground;
    g.fillStyle = set[Math.floor(r() * set.length)];
    // luminance jitter so brightness never gives the figure away (non-control)
    if (axis !== "control") g.globalAlpha = 0.82 + r() * 0.18;
    g.beginPath();
    g.arc(x, y, dotR, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/**
 * CONTRAST GRATING DISCS: Gabor-style sinusoidal luminance gratings on a
 * mean-luminance field (CSF testing in the Pelli-Robson / CSV-1000 lineage).
 * Michelson contrast is exact: L = mean * (1 ± c/100). A contrast of 0
 * produces a statistically identical uniform disc — the perfect distractor.
 */
export function makeGratingTexture(contrastPct: number, cycles: number, angleDeg: number, seed: number): THREE.CanvasTexture {
  const key = `g-${contrastPct}-${cycles}-${angleDeg}-${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(S, S);
  const mean = 128;
  const amp = (contrastPct / 100) * mean;
  const th = (angleDeg * Math.PI) / 180;
  const kx = (Math.cos(th) * cycles * Math.PI * 2) / S;
  const ky = (Math.sin(th) * cycles * Math.PI * 2) / S;
  const r = rng(seed);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - S / 2;
      const dy = y - S / 2;
      // soft circular window so the disc edge never reveals the grating
      const w = Math.max(0, 1 - Math.pow(Math.hypot(dx, dy) / (S / 2), 6));
      const v = mean + amp * w * Math.sin(kx * x + ky * y) + (r() - 0.5) * 1.5;
      const i = (y * S + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v + 2;
      img.data[i + 2] = v + 6;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export function makeRDSTexture(seed: number): THREE.CanvasTexture {
  const key = `rds-${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#0B0F2A";
  g.fillRect(0, 0, S, S);
  const r = rng(seed);
  // SOFT dots. Stereopsis is a HYPERACUITY — the visual system resolves
  // disparities far below one pixel by reading intensity gradients. Hard-edged
  // dots alias sub-pixel shifts away and hard-cap the test at ~1 pixel
  // (~144 arcsec on Quest 3). Smooth, band-limited dots let a sub-pixel shift
  // register as a real luminance change, which is what makes fine disparity
  // measurable at all on a fixed-resolution display.
  for (let i = 0; i < 1500; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 5 + r() * 5;
    const bright = r() < 0.55;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    if (bright) {
      grd.addColorStop(0, "rgba(234,240,255,0.95)");
      grd.addColorStop(0.55, "rgba(200,210,235,0.55)");
      grd.addColorStop(1, "rgba(234,240,255,0)");
    } else {
      grd.addColorStop(0, "rgba(45,35,79,0.95)");
      grd.addColorStop(0.55, "rgba(35,30,60,0.55)");
      grd.addColorStop(1, "rgba(45,35,79,0)");
    }
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // sub-pixel-accurate sampling: linear filtering, no mipmaps, wrap so a UV
  // shift never exposes an edge
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}


/**
 * LANDOLT C — drawn on a TRANSPARENT canvas, at an absolute luminance.
 *
 * The previous version painted the optotype onto its own little mid-grey panel so the
 * surround was controlled. It was physically correct and it looked like a slide deck:
 * grey boxes floating in an arena. That is not an instrument an athlete respects.
 *
 * The surround is now the WORLD — a full luminance dome that the drill drives — so the
 * optotype needs no backing plate at all. It is drawn at an absolute grey level on a
 * transparent canvas and rendered unlit, so what the athlete sees is exactly the
 * luminance we asked for, sitting directly on the field we built for it.
 */
export function makeLandoltTexture(
  targetLum: number,
  gapDeg: number,
  seed: number,
): THREE.CanvasTexture {
  const key = `lc-${Math.round(targetLum)}-${gapDeg}-${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, S, S); // transparent — the WORLD is the background

  // Landolt proportions: outer diameter D, stroke D/5, gap D/5.
  const D = S * 0.82;
  const stroke = D / 5;
  const R = (D - stroke) / 2;
  const cx = S / 2, cy = S / 2;
  const gapRad = stroke / R;
  const a0 = (gapDeg * Math.PI) / 180 - gapRad / 2;
  const a1 = (gapDeg * Math.PI) / 180 + gapRad / 2;

  const L = Math.max(0, Math.min(255, Math.round(targetLum)));
  g.strokeStyle = `rgb(${L},${L},${L})`;
  g.lineWidth = stroke;
  g.lineCap = "butt";
  g.beginPath();
  g.arc(cx, cy, R, a1, a0 + Math.PI * 2);
  g.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  cache.set(key, tex);
  return tex;
}

/**
 * MOTTLE — low-frequency background clutter.
 *
 * A uniform field is the easy case and almost never the sport case. A ball against a
 * packed stand, dappled light through trees, a mottled pitch — the background is
 * BUSY, and busy backgrounds destroy detection far more than they lower contrast.
 * This paints band-limited noise around the field's mean, so the mean luminance (and
 * therefore the stated contrast) is preserved while the field becomes hostile.
 */
export function makeMottleTexture(bgLum: number, amount: number, seed: number): THREE.CanvasTexture {
  const key = `mo-${Math.round(bgLum)}-${amount.toFixed(2)}-${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(S, S);
  const r = rng(seed);

  // a few octaves of smooth blobs — clutter, not television static
  const blobs = Array.from({ length: 26 }, () => ({
    x: r() * S, y: r() * S, s: 18 + r() * 55, a: (r() - 0.5) * 2,
  }));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const b of blobs) {
        const d2 = ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.s * b.s);
        v += b.a * Math.exp(-d2);
      }
      const L = Math.max(0, Math.min(255, bgLum + v * amount * 46));
      const i = (y * S + x) * 4;
      img.data[i] = L;
      img.data[i + 1] = L;
      img.data[i + 2] = L;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  cache.set(key, tex);
  return tex;
}
