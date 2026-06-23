// Self-host the web fonts: fetch the Google Fonts css2 (with a browser UA so it
// serves woff2), download every woff2 subset locally into public/fonts/, and
// write public/fonts.css pointing at the local files. Removes the third-party
// fonts.googleapis.com / fonts.gstatic.com requests (faster LCP, tighter CSP).
// Committed static output — like gen-icons/gen-og. Re-run to refresh.
import fs from "node:fs";
import path from "node:path";

// Weights actually used: Spectral 700 + 800 (headings/verdict) + 400 italic
// (blockquotes); IBM Plex Mono 400 + 500 (dates / machine-readable text).
const CSS_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Spectral:ital,wght@0,700;0,800;1,400&display=swap";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const outDir = "public/fonts";
fs.mkdirSync(outDir, { recursive: true });

const css = await (await fetch(CSS_URL, { headers: { "User-Agent": UA } })).text();

// Split into "/* subset */ @font-face { ... }" chunks.
const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)];
if (!blocks.length) {
  console.error("No @font-face blocks found — did Google return woff2? css head:\n", css.slice(0, 300));
  process.exit(1);
}

let out = "/* Self-hosted via scripts/gen-fonts.mjs. Do not edit by hand. */\n";
let count = 0;
for (const [, subset, body] of blocks) {
  const family = /font-family:\s*'([^']+)'/.exec(body)?.[1] ?? "font";
  const style = /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal";
  const weight = /font-weight:\s*(\d+)/.exec(body)?.[1] ?? "400";
  const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
  if (!url) continue;
  if (!/^latin(-ext)?$/.test(subset)) continue; // UK site: latin + latin-ext only
  const slug = `${family.toLowerCase().replace(/\s+/g, "-")}-${weight}${style === "italic" ? "i" : ""}-${subset}`;
  const file = `${slug}.woff2`;
  const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer());
  fs.writeFileSync(path.join(outDir, file), buf);
  out +=
    `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;` +
    `src:url(/fonts/${file}) format('woff2');` +
    (range ? `unicode-range:${range};` : "") +
    `}\n`;
  count++;
}
fs.writeFileSync("public/fonts.css", out);
console.log(`gen-fonts: ${count} woff2 files + public/fonts.css`);
