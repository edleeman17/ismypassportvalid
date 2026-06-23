// Generate the 1200x630 Open Graph / Twitter share card: navy passport-cover
// styling, the 🛂 glyph and a Spectral title matching the site. Output:
// public/og.png. librsvg resolves fonts via fontconfig, so we point a throwaway
// fontconfig file at scripts/assets (where Spectral lives) before rendering.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ASSETS = path.resolve("scripts/assets");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "og-fc-"));
const fcFile = path.join(tmp, "fonts.conf");
fs.writeFileSync(
  fcFile,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
    <dir>${ASSETS}</dir>
    <cachedir>${path.join(tmp, "cache")}</cachedir>
    <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  </fontconfig>`,
);
process.env.FONTCONFIG_FILE = fcFile;

// Import sharp only after fontconfig env is set, so librsvg picks it up.
const { default: sharp } = await import("sharp");

const OUT = "public";
fs.mkdirSync(OUT, { recursive: true });

const NAVY = "#0b1d3a";
const CREAM = "#f0e9da";
const GOLD = "#c9a14a";

const glyph = fs
  .readFileSync(path.join(ASSETS, "twemoji-1f6c2.svg"), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");

const W = 1200;
const H = 630;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="10" fill="none" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="2"/>
  <g transform="translate(96 205)">
    <rect x="-18" y="-18" width="236" height="236" rx="34" fill="#0f254a"/>
    <g transform="translate(20 20) scale(4.9)">${glyph}</g>
  </g>
  <text x="372" y="268" font-family="Spectral" font-size="94" fill="${CREAM}">Is my passport</text>
  <text x="372" y="372" font-family="Spectral" font-size="94" fill="${CREAM}">valid?</text>
  <text x="376" y="452" font-family="Spectral" font-size="36" fill="${GOLD}">Instant yes/no — including your return home.</text>
  <text x="376" y="518" font-family="Spectral" font-size="30" fill="#9fb0c8">ismypassportvalid.co.uk · sourced from gov.uk</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, "og.png"));
fs.rmSync(tmp, { recursive: true, force: true });
console.log("  og.png (1200x630)");
