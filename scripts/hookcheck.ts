import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

/**
 * RULES-OF-HOOKS GUARD.
 *
 * A conditional hook is not a lint nit in this app — it is a black screen. React
 * responds to a changing hook count by tearing down the component tree, and in an
 * R3F app that means the entire canvas unmounts and the athlete, mid-session and
 * wearing a headset, is left staring into a black void with no way out.
 *
 * That is exactly what happened: a hook was declared beside the code that used it,
 * below three early returns. This scans for any hook call that appears AFTER a
 * top-level `return` inside a component, and fails the build if it finds one.
 */
const files: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(f)) files.push(p);
  }
})("src");

const HOOK = /^\s*(?:const|let)?\s*[\w{[\],\s:]*=?\s*\b(use[A-Z]\w*)\s*\(/;
const RETURN = /^\s{2}(?:return\s|if\s*\([^)]*\)\s*return\b)/;
const COMPONENT = /^(?:export\s+)?function\s+[A-Z]\w*\s*\(/;

const issues: string[] = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  let inComponent = false;
  let sawReturn = false;
  let compLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (COMPONENT.test(L)) { inComponent = true; sawReturn = false; compLine = i + 1; continue; }
    if (!inComponent) continue;
    if (/^}/.test(L)) { inComponent = false; continue; }
    // a top-level return inside the component body
    if (RETURN.test(L)) { sawReturn = true; continue; }
    const m = L.match(HOOK);
    if (m && sawReturn && !/^\s*\/\//.test(L)) {
      issues.push(`${f}:${i + 1}  ${m[1]}() is called AFTER an early return (component at line ${compLine})`);
    }
  }
}

console.log(`scanned ${files.length} components for conditional hooks`);
console.log(issues.length
  ? "CONDITIONAL HOOKS (these WILL blank the canvas):\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — every hook runs unconditionally, before any early return");
if (issues.length) process.exit(1);
