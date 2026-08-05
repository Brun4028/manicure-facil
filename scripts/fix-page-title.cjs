// Adiciona `import { usePageTitle } from "@/hooks/use-page-title";` nas rotas
// que chamam usePageTitle() mas ainda não importam o hook.
const fs = require("fs");
const path = require("path");

const dir = path.resolve("src/routes");
const targets = ["_authenticated", "auth.tsx"];

const files = [];
for (const t of targets) {
  const p = path.join(dir, t);
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(p)) {
      if (f.endsWith(".tsx")) files.push(path.join(p, f));
    }
  } else {
    files.push(p);
  }
}

let count = 0;
for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  // Já importa? pula.
  if (/from\s+"@\/hooks\/use-page-title"/.test(src)) continue;
  // Chama o hook mas não importa? adiciona o import.
  if (/\busePageTitle\s*\(/.test(src)) {
    const hookImport = `import { usePageTitle } from "@/hooks/use-page-title";\n`;
    const reactImport = src.match(/^import .* from "react";/m);
    if (reactImport) {
      const at = reactImport.index + reactImport[0].length;
      src = src.slice(0, at) + "\n" + hookImport + src.slice(at);
    } else {
      src = hookImport + src;
    }
    fs.writeFileSync(file, src);
    console.log(`✅ import adicionado: ${path.relative(process.cwd(), file)}`);
    count++;
  }
}
console.log(`\n${count} imports adicionados.`);
