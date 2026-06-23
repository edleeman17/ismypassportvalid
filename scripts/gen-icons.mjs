// Generate favicons + Apple touch icon + PWA icons from the 🛂 Twemoji SVG,
// composited on the site's navy (#0b1d3a) so they're opaque (Apple) and on-brand.
// Source glyph: Twemoji (CC-BY 4.0), U+1F6C2 PASSPORT CONTROL.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = process.argv[2]; // path to 1f6c2.svg
const OUT = "public";
fs.mkdirSync(OUT, { recursive: true });

// Pull the inner paths out of the Twemoji svg (drop its <svg ...> wrapper).
const raw = fs.readFileSync(SRC, "utf8");
const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

// Compose: navy rounded square + the passport glyph scaled to ~76% and centred.
const NAVY = "#0b1d3a";
const scale = 0.76;
const off = (36 - 36 * scale) / 2; // 4.32
const composed =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">` +
  `<rect width="36" height="36" rx="7" fill="${NAVY}"/>` +
  `<g transform="translate(${off} ${off}) scale(${scale})">${inner}</g>` +
  `</svg>`;

fs.writeFileSync(path.join(OUT, "favicon.svg"), composed);

const png = (size, name) =>
  sharp(Buffer.from(composed), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(OUT, name))
    .then(() => console.log(`  ${name} (${size}px)`));

await Promise.all([
  png(16, "favicon-16x16.png"),
  png(32, "favicon-32x32.png"),
  png(180, "apple-touch-icon.png"),
  png(192, "icon-192.png"),
  png(512, "icon-512.png"),
]);

const manifest = {
  name: "Is My Passport Valid?",
  short_name: "Passport Valid",
  description: "Check if your UK passport is valid for your trip and return to the UK.",
  start_url: "/",
  display: "standalone",
  background_color: "#f7f4ec",
  theme_color: NAVY,
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
fs.writeFileSync(path.join(OUT, "site.webmanifest"), JSON.stringify(manifest, null, 2));
console.log("  favicon.svg + site.webmanifest");
