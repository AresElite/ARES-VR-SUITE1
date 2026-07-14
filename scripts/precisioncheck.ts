import { classifyPrecision, profilePrecision, precisionGate, PERFECT_R, GOOD_R } from "@/ares/precision";

const issues: string[] = [];
const flag = (s: string) => issues.push(s);

// ---- 1. ZONE BOUNDARIES are exactly where the spec says they are.
const R = 0.10; // a 10cm-radius target
if (classifyPrecision(0.000, R) !== "perfect") flag("dead centre is not PERFECT");
if (classifyPrecision(R * 0.10, R) !== "perfect") flag("edge of the middle 10% is not PERFECT");
if (classifyPrecision(R * 0.101, R) !== "good") flag("just outside 10% is not GOOD");
if (classifyPrecision(R * 0.70, R) !== "good") flag("70% is not GOOD");
if (classifyPrecision(R * 0.701, R) !== "poor") flag("just outside 70% is not POOR");
if (classifyPrecision(R * 0.99, R) !== "poor") flag("outer edge is not POOR");

// ---- 2. NORMALIZATION: the same absolute miss must classify DIFFERENTLY on a
// big vs a small target. This is the whole point of dividing by the radius.
const miss = 0.05; // 5cm off centre
if (classifyPrecision(miss, 0.20) !== "good") flag("5cm on a 20cm target should be GOOD");
if (classifyPrecision(miss, 0.06) !== "poor") flag("5cm on a 6cm target should be POOR");

// ---- 3. BIAS vs NOISE. An athlete who always misses low-left is MISCALIBRATED.
// An athlete whose misses scatter is NOISY. The profile must tell them apart.
const biased = profilePrecision(Array.from({ length: 200 }, () => ({
  distM: 0.05, radiusM: 0.10, dx: -0.05 + (Math.random() - 0.5) * 0.004, dy: -0.03, dz: 0,
})));
const noisy = profilePrecision(Array.from({ length: 200 }, () => {
  const a = Math.random() * Math.PI * 2;
  return { distM: 0.05, radiusM: 0.10, dx: Math.cos(a) * 0.05, dy: Math.sin(a) * 0.05, dz: 0 };
}));
if (Math.abs(biased.biasX) < 0.03) flag("a systematically biased athlete shows no bias");
if (biased.spreadM > 0.01) flag("a biased-but-consistent athlete shows high spread");
if (Math.abs(noisy.biasX) > 0.015) flag("a randomly scattered athlete shows a false bias");
if (noisy.spreadM < 0.02) flag("a scattered athlete shows no spread");

// ---- 4. THE INDEX must rank a centre-finder above an edge-grazer, decisively.
const centre = profilePrecision(Array.from({ length: 100 }, () => ({ distM: 0.005, radiusM: 0.10 })));
const edge = profilePrecision(Array.from({ length: 100 }, () => ({ distM: 0.09, radiusM: 0.10 })));
const mid = profilePrecision(Array.from({ length: 100 }, () => ({ distM: 0.04, radiusM: 0.10 })));
if (!(centre.localizationIndex > mid.localizationIndex && mid.localizationIndex > edge.localizationIndex)) {
  flag("localization index is not monotonic: centre > mid > edge");
}
if (edge.localizationIndex > 20) flag("an athlete who only ever grazes the edge still scores well");

// ---- 5. THE GATE. Completion alone must NOT unlock the next tier.
const g1 = precisionGate(96, 30);   // completes everything, never finds the centre
const g2 = precisionGate(96, 80);   // completes everything AND finds the centre
const g3 = precisionGate(70, 95);   // beautiful hands, cannot complete
if (g1.ready) flag("GATE: high completion with poor localization was allowed to advance");
if (!g2.ready) flag("GATE: high completion WITH good localization was blocked");
if (g3.ready) flag("GATE: low completion was allowed to advance on precision alone");

console.log("ZONE BOUNDARIES   perfect <= 10% · good <= 70% · poor > 70%   (normalized by target radius)");
console.log(`centre-finder     index ${centre.localizationIndex}   perfect ${centre.perfectPct}%  good ${centre.goodPct}%  poor ${centre.poorPct}%`);
console.log(`mid-target        index ${mid.localizationIndex}   perfect ${mid.perfectPct}%  good ${mid.goodPct}%  poor ${mid.poorPct}%`);
console.log(`edge-grazer       index ${edge.localizationIndex}   perfect ${edge.perfectPct}%  good ${edge.goodPct}%  poor ${edge.poorPct}%`);
console.log("");
console.log(`biased athlete    bias (${biased.biasX.toFixed(3)}, ${biased.biasY.toFixed(3)})  spread ${biased.spreadM.toFixed(3)}m  -> MISCALIBRATED`);
console.log(`noisy athlete     bias (${noisy.biasX.toFixed(3)}, ${noisy.biasY.toFixed(3)})  spread ${noisy.spreadM.toFixed(3)}m  -> NOISY`);
console.log("");
console.log(`gate 96%/30 -> ${g1.ready ? "ADVANCE" : "HOLD"}: ${g1.reason}`);
console.log(`gate 96%/80 -> ${g2.ready ? "ADVANCE" : "HOLD"}: ${g2.reason}`);
console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n") : "0 ISSUES — zones, normalization, bias/noise separation, index monotonicity, and the gate all hold");
