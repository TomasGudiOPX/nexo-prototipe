import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../public/nexo-prototipo.html", import.meta.url);
const script = '<script src="/nexo-ragflow.js"></script>';
let html = readFileSync(file, "utf8");
if (!html.includes(script)) {
  if (!html.includes("</body>")) throw new Error("Prototype HTML has no closing body tag");
  html = html.replace("</body>", `${script}</body>`);
  writeFileSync(file, html, "utf8");
}
