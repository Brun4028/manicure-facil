// Analyzes which package.json dependencies are actually imported in src/
// Usage: node scripts/analyze-unused-deps.mjs
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

const srcFiles = [];
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (["node_modules", ".output", "dist", ".git", ".tanstack"].includes(f)) continue;
      walk(p);
    } else if (/(\.tsx?|\.jsx?|\.mjs?)$/.test(f)) {
      srcFiles.push(p);
    }
  }
}
walk(".");

const srcText = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const srcTextLower = srcText.toLowerCase();

const used = new Set();
const maybe = new Set();
for (const [dep] of Object.entries(allDeps)) {
  const name = dep.startsWith("@") ? dep : dep.split("/")[0];
  const scoped = dep.includes("/") && dep.startsWith("@");
  // Build a few candidate import specifiers
  const candidates = [dep];
  if (!scoped) {
    candidates.push(name);
  }
  // For scoped packages, also match without subpath e.g. "@radix-ui/react-dialog"
  let found = false;
  for (const c of candidates) {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`['"]${escaped}(/[^'"]*)?['"]`, "g");
    if (re.test(srcText)) {
      found = true;
      break;
    }
  }
  // Heuristic: also match bare name appearing after "from \"" or "import \"" (loose)
  if (!found && !scoped) {
    const re = new RegExp(`from ['"]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/[^'"]*)?['"]`, "g");
    if (re.test(srcText)) found = true;
  }
  if (found) {
    used.add(dep);
  } else if (srcTextLower.includes(name.replace(/-/g, ""))) {
    maybe.add(dep);
  }
}

console.log("=== POSSIBLY UNUSED DEPENDENCIES ===");
for (const d of Object.keys(allDeps).sort()) {
  if (!used.has(d) && !maybe.has(d)) {
    console.log(`  ${d}  (${allDeps[d]})`);
  }
}
console.log("\n=== AMBIGUOUS (string match, check manually) ===");
for (const d of [...maybe].sort()) {
  console.log(`  ${d}`);
}
console.log("\n=== TOTAL ===");
console.log(`  deps in package.json: ${Object.keys(allDeps).length}`);
console.log(`  definitely used: ${used.size}`);
console.log(`  possibly unused: ${Object.keys(allDeps).length - used.size}`);
