import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const input = process.stdin;
const output = process.stdout;

function prompt(label, { secret = false, defaultValue = "" } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run `npm run configure` in an interactive terminal.");
  }
  output.write(`${label}${defaultValue ? ` (${defaultValue})` : ""}: `);
  input.setRawMode(true);
  input.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = chunk => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") { cleanup(); reject(new Error("Configuration cancelled.")); return; }
        if (char === "\r" || char === "\n") { cleanup(); output.write("\n"); resolve(value || defaultValue); return; }
        if (char === "\u007f" || char === "\b") {
          if (value.length) { value = value.slice(0, -1); output.write("\b \b"); }
          continue;
        }
        if (char >= " ") { value += char; output.write(secret ? "•" : char); }
      }
    };
    function cleanup() { input.off("data", onData); input.setRawMode(false); }
    input.on("data", onData);
  });
}

function envValue(value) { return JSON.stringify(value); }

try {
  const baseUrl = (await prompt("RAGFlow base URL", { defaultValue: "http://localhost:9380" })).replace(/\/+$/, "");
  const parsedUrl = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("The RAGFlow URL must use HTTP or HTTPS.");
  const apiKey = await prompt("RAGFlow API key (input is masked)", { secret: true });
  if (!apiKey.trim()) throw new Error("An API key is required.");
  const mappingText = await prompt("Dataset ID → chat ID JSON (optional; press Enter to skip)", { defaultValue: "{}" });
  const mapping = JSON.parse(mappingText);
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.values(mapping).some(value => typeof value !== "string")) {
    throw new Error("The chat mapping must be a JSON object with string chat IDs.");
  }
  const contents = [
    "# Server-only RAGFlow configuration. This file is gitignored.",
    `RAGFLOW_BASE_URL=${envValue(baseUrl)}`,
    `RAGFLOW_API_KEY=${envValue(apiKey)}`,
    `RAGFLOW_DATASET_CHAT_IDS=${envValue(JSON.stringify(mapping))}`,
    "",
  ].join("\n");
  await writeFile(fileURLToPath(new URL("../.env", import.meta.url)), contents, { encoding: "utf8", mode: 0o600 });
  output.write("Saved server-only configuration to .env. Restart the frontend to load datasets.\n");
} catch (error) {
  output.write(`${error instanceof Error ? error.message : "Configuration failed."}\n`);
  process.exitCode = 1;
} finally {
  input.pause();
}
