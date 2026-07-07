import * as THREE from "three";

/**
 * Procedural clinical stimulus painters.
 *
 * ISHIHARA-STYLE PLATES: pseudo-isochromatic dot fields. Figure and ground
 * dots are matched in luminance but separated along dichromatic confusion
 * lines (red-green axis for protan/deutan screening, blue-yellow for tritan)
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

export function makeRDSTexture(seed: number): THREE.CanvasTexture {
  const key = `rds-${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#0B0F2A";
  g.fillRect(0, 0, S, S);
  const r = rng(seed);
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? "#EAF0FF" : v < 0.75 ? "#9AA3C7" : "#2D234F";
    const x = r() * S;
    const y = r() * S;
    const d = 1.5 + r() * 2.5;
    g.fillRect(x, y, d, d);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
