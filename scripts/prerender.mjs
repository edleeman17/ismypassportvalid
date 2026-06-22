// Post-build prerender: turn the single built index.html into one static page per
// destination (/spain/, /portugal/, ...), each with its own title/meta/H1/visible
// content + JSON-LD + a prefill flag. Also writes robots.txt and (if SITE_URL set)
// sitemap.xml. Run after `vite build`.
import fs from "node:fs";
import path from "node:path";

const dist = "dist";
// Public origin for canonical tags + sitemap. Override per-build with SITE_URL=...
const SITE_URL = (process.env.SITE_URL || "https://ismypassportvalid.co.uk").replace(/\/$/, "");
const countries = JSON.parse(fs.readFileSync("src/countries.json", "utf8"));
const travel = JSON.parse(fs.readFileSync("src/travel.json", "utf8"));
const config = JSON.parse(fs.readFileSync("src/config.json", "utf8"));
const visa = JSON.parse(fs.readFileSync("src/visa.json", "utf8"));
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const powerQueries = travel._powerQueries;
const climateItems = {
  beach: { icon: "🧴", label: "Reef-safe suncream", blurb: "Don't get caught out", q: "reef safe suncream" },
  tropical: { icon: "🦟", label: "Mosquito repellent", blurb: "Bite-free evenings", q: "mosquito repellent deet travel" },
  cold: { icon: "🧤", label: "Thermal base layers", blurb: "Stay warm out there", q: "thermal base layers" },
};
const amazonUrl = (q) =>
  `https://www.${config.amazonDomain}/s?k=${encodeURIComponent(q)}&tag=${config.amazonTag}`;
function amazonItems(slug, name) {
  const t = travel[slug] ?? {};
  const out = [
    { icon: "📘", label: `${name} guidebook`, blurb: "Plan it like a local", q: `${name} travel guide` },
  ];
  if (t.climate && climateItems[t.climate]) out.push(climateItems[t.climate]);
  if (t.longHaul) out.push({ icon: "🛌", label: "Neck pillow", blurb: "Survive the long flight", q: "travel neck pillow" });
  const pq = t.power ? powerQueries[t.power] : null;
  if (pq) out.push({ icon: "🔌", label: "Travel plug adapter", blurb: "Keep your phone charged", q: pq });
  if (t.drivable)
    out.push({ icon: "🚗", label: "European driving kit", blurb: "Driving over? Stay road-legal", q: "European car driving kit" });
  out.push({ icon: "🧳", label: "Packing cubes", blurb: "Pack smarter, fit more in", q: "packing cubes" });
  out.push({ icon: "🗺️", label: `${name} map`, blurb: "Find your way around", q: `${name} travel map` });
  return out.map((i) => ({ icon: i.icon, label: i.label, blurb: i.blurb, url: amazonUrl(i.q) }));
}
function visaNote(c) {
  if (visa[c.govukSlug]) return visa[c.govukSlug];
  if (c.zone === "schengen") return "No visa needed for short stays (up to 90 days in any 180).";
  return "Check the visa requirements for your trip on gov.uk.";
}

const entries = Object.entries(countries)
  .filter(([k]) => k !== "_meta")
  .sort((a, b) => a[1].name.localeCompare(b[1].name));

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const linksHtml =
  `<span class="dests-label">Check by destination</span>` +
  entries.map(([slug, c]) => `<a href="/${slug}/">${esc(c.name)}</a>`).join("");

function ruleSentence(c) {
  const r = c.rule;
  const anchor = r.anchor === "departure" ? "after you leave" : "after you arrive in";
  if (r.validBeyondDays) return `valid for at least ${r.validBeyondDays} days ${anchor} ${c.name}`;
  if (r.validBeyondMonths > 0)
    return `valid for at least ${r.validBeyondMonths} month${r.validBeyondMonths === 1 ? "" : "s"} ${anchor} ${c.name}`;
  return `valid for the duration of your stay in ${c.name}`;
}

function page({ title, desc, h1, introHtml, contentHtml, slug }) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${esc(desc)}" />`,
  );
  html = html.replace(/(<h1 data-seo-h1>)[\s\S]*?(<\/h1>)/, `$1${esc(h1)}$2`);
  html = html.replace(/(<p data-seo-intro>)[\s\S]*?(<\/p>)/, `$1${introHtml}$2`);
  html = html.replace(/(<section data-seo-content>)[\s\S]*?(<\/section>)/, `$1${contentHtml}$2`);
  html = html.replace(/(<nav class="dests"[^>]*data-seo-links>)[\s\S]*?(<\/nav>)/, `$1${linksHtml}$2`);

  const head = [
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
  ];
  if (SITE_URL) {
    const url = slug ? `${SITE_URL}/${slug}/` : `${SITE_URL}/`;
    head.unshift(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`);
  }
  if (slug) {
    const c = countries[slug];
    const jsonld = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `Is my UK passport valid for ${c.name}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `To enter ${c.name}, a British citizen's passport must be ${ruleSentence(c)}. ${c.quote}`,
          },
        },
      ],
    };
    head.push(`<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`);
    head.push(`<script>window.__PREFILL_SLUG__=${JSON.stringify(slug)}</script>`);
  }
  return html.replace("</head>", `  ${head.join("\n    ")}\n  </head>`);
}

// Homepage
const homeContent = `<div class="card seo-block"><h2>How long does my passport need to be valid?</h2><p>It depends where you're going. Many countries require your passport to be valid for <strong>6 months after you arrive</strong>; the Schengen area needs it valid <strong>3 months after you leave</strong> and issued within the last 10 years; others just need it valid for your stay. Choose your destination above, or pick a country below.</p></div>`;
fs.writeFileSync(
  path.join(dist, "index.html"),
  page({
    title: "Is My Passport Valid? Free UK Passport Expiry Checker",
    desc: "Check if your UK passport is valid for your destination and your return to the UK. Entry rules sourced from gov.uk. Instant yes/no.",
    h1: "Is my passport valid?",
    introHtml: `For <strong>British citizen</strong> passport holders. We check your destination's entry rules <em>and</em> your return to the UK.`,
    contentHtml: homeContent,
    slug: null,
  }),
);

// Per-country pages
for (const [slug, c] of entries) {
  const sentence = ruleSentence(c);
  const content = `<div class="card seo-block">
      <h2>Is my UK passport valid for ${esc(c.name)}?</h2>
      <p class="rule-line">To enter ${esc(c.name)}, your passport must be ${esc(sentence)}.</p>
      <blockquote>${esc(c.quote)}</blockquote>
      <p class="visa-line">🛂 <strong>Visa:</strong> ${esc(visaNote(c))}</p>
      ${
        c.zone === "schengen"
          ? `<p class="etias-line">✈️ <strong>EU travel:</strong> the EU is introducing the EES (biometric entry/exit checks) and ETIAS (a paid visa-waiver authorisation — not a visa). Start dates have shifted, so <a href="${esc(config.etiasUrl)}" target="_blank" rel="noopener">check gov.uk</a> before you go.</p>`
          : ""
      }
      <p><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Official ${esc(c.name)} entry requirements on gov.uk →</a></p>
      <p>Enter your passport and travel dates above for an instant yes/no for your exact trip, including your return to the UK.</p>
    </div>
    ${
      config.insuranceUrl && config.insuranceUrl !== "#"
        ? `<div class="actions">
      <a class="act act-primary" href="${esc(config.insuranceUrl)}" target="_blank" rel="sponsored noopener">🛡️ Get travel insurance for ${esc(c.name)} →</a>
    </div>`
        : ""
    }
    <div class="card ess">
      <h2>Travel essentials for ${esc(c.name)}</h2>
      <p class="ess-sub">Handpicked on Amazon for your trip 👇</p>
      <div class="ess-grid">${amazonItems(slug, c.name)
        .map(
          (i) => `<a class="ess-card" href="${esc(i.url)}" target="_blank" rel="sponsored noopener">
          <span class="ess-icon">${i.icon}</span>
          <span class="ess-title">${esc(i.label)}</span>
          <span class="ess-blurb">${esc(i.blurb)}</span>
          <span class="ess-cta">View on Amazon →</span>
        </a>`,
        )
        .join("")}</div>
      <p class="fine">As an Amazon Associate we earn from qualifying purchases.</p>
    </div>`;
  const dir = path.join(dist, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.html"),
    page({
      title: `Is my passport valid for ${c.name}? UK passport rules`,
      desc: `Check if your UK passport meets ${c.name}'s entry requirements and your return to the UK. Your passport must be ${sentence}. Source: gov.uk.`,
      h1: `Is my passport valid for ${c.name}?`,
      introHtml: `Check if your <strong>UK passport</strong> is valid for <strong>${esc(c.name)}</strong> — and for getting back into the UK.`,
      contentHtml: content,
      slug,
    }),
  );
}

// robots.txt + sitemap.xml
fs.writeFileSync(
  path.join(dist, "robots.txt"),
  SITE_URL ? `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n` : `User-agent: *\nAllow: /\n`,
);

if (SITE_URL) {
  const urls = [`${SITE_URL}/`, ...entries.map(([slug]) => `${SITE_URL}/${slug}/`)];
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);
  console.log(`prerender: homepage + ${entries.length} country pages; sitemap @ ${SITE_URL}`);
} else {
  console.log(
    `prerender: homepage + ${entries.length} country pages. SITE_URL unset → canonical/sitemap skipped (set SITE_URL for public deploy).`,
  );
}
