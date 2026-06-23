// Post-build prerender. Turns the single built index.html into a static site:
//   - homepage (WebApplication schema)
//   - one page per country (/spain/, ...) with a visible Q&A block + FAQPage,
//     BreadcrumbList and dateModified schema
//   - one page per searchable place/island/city (/tenerife/, /bali/, ...) that
//     resolves to its parent country's verified rule (long-tail SEO)
//   - /about/ (E-E-A-T: how rules are sourced + verified)
//   - /eu-entry-ees-etias/ (EES/ETIAS hub)
//   - 404, robots.txt, sitemap.xml (with lastmod)
// Run after `vite build`.
import fs from "node:fs";
import path from "node:path";

const dist = "dist";
const SITE_URL = (process.env.SITE_URL || "https://ismypassportvalid.co.uk").replace(/\/$/, "");
const countries = JSON.parse(fs.readFileSync("src/countries.json", "utf8"));
const travel = JSON.parse(fs.readFileSync("src/travel.json", "utf8"));
const config = JSON.parse(fs.readFileSync("src/config.json", "utf8"));
const visa = JSON.parse(fs.readFileSync("src/visa.json", "utf8"));
const aliases = JSON.parse(fs.readFileSync("src/aliases.json", "utf8"));
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const TODAY = new Date().toISOString().slice(0, 10);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- affiliate essentials (mirrors src/affiliate.ts) ----
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
  const out = [{ icon: "📘", label: `${name} guidebook`, blurb: "Plan it like a local", q: `${name} travel guide` }];
  if (t.climate && climateItems[t.climate]) out.push(climateItems[t.climate]);
  if (t.longHaul) out.push({ icon: "🛌", label: "Neck pillow", blurb: "Survive the long flight", q: "travel neck pillow" });
  const pq = t.power ? powerQueries[t.power] : null;
  if (pq) out.push({ icon: "🔌", label: "Travel plug adapter", blurb: "Keep your phone charged", q: pq });
  if (t.drivable) out.push({ icon: "🚗", label: "European driving kit", blurb: "Driving over? Stay road-legal", q: "European car driving kit" });
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
const countrySlugs = new Set(entries.map(([s]) => s));

const linksHtml =
  `<span class="dests-label">Check by destination</span>` +
  entries.map(([slug, c]) => `<a href="/${slug}/">${esc(c.name)}</a>`).join("");

// ---- rule phrasing ----
function ruleSentence(c) {
  const r = c.rule;
  const anchor = r.anchor === "departure" ? "after you leave" : "after you arrive in";
  if (r.validBeyondDays) return `valid for at least ${r.validBeyondDays} days ${anchor} ${c.name}`;
  if (r.validBeyondMonths > 0)
    return `valid for at least ${r.validBeyondMonths} month${r.validBeyondMonths === 1 ? "" : "s"} ${anchor} ${c.name}`;
  return `valid for the duration of your stay in ${c.name}`;
}
function validityPhrase(c) {
  const r = c.rule;
  const anchor = r.anchor === "departure" ? "after the day you leave" : "after you arrive in";
  if (r.validBeyondDays) return `at least ${r.validBeyondDays} days ${anchor} ${c.name}`;
  if (r.validBeyondMonths > 0)
    return `at least ${r.validBeyondMonths} month${r.validBeyondMonths === 1 ? "" : "s"} ${anchor} ${c.name}`;
  return `valid for the whole of your stay in ${c.name}`;
}

// ---- Q&A (visible block + FAQPage schema share the same source) ----
function faqFor(c) {
  const qas = [
    {
      q: `Is my UK passport valid for ${c.name}?`,
      a: `To enter ${c.name}, a British citizen's passport must be ${ruleSentence(c)}, and it must still be valid when you return to the UK. Enter your passport and travel dates above for an exact yes/no.`,
    },
    {
      q: `How long does my passport need to be valid for ${c.name}?`,
      a: `Your passport must be ${validityPhrase(c)}.${c.rule.issuedWithinYears ? ` It must also have been issued less than ${c.rule.issuedWithinYears} years before you arrive.` : ""}`,
    },
    {
      q: `Does ${c.name} require six months' passport validity?`,
      a:
        (c.rule.validBeyondMonths ?? 0) >= 6
          ? `Yes. ${c.name} requires your passport to be ${validityPhrase(c)}.`
          : `No. ${c.name} does not need a full six months — it requires your passport to be ${validityPhrase(c)}. Don't assume the six-month rule; check the exact requirement above.`,
    },
    {
      q: `Do I need a visa for ${c.name}?`,
      a: visaNote(c),
    },
    {
      q: `My passport expires soon — can I still travel to ${c.name}?`,
      a: `Only if it still meets the rule above on your travel dates. If it doesn't, your airline can refuse to board you. Renew before you travel — use the checker above to see exactly when your passport stops qualifying.`,
    },
  ];
  return qas;
}
function faqForPlace(place, c) {
  return [
    {
      q: `Is ${place} in ${c.name}?`,
      a: `Yes — ${place} is in ${c.name}, so the UK passport entry rules for ${c.name} apply to your trip.`,
    },
    {
      q: `Is my UK passport valid for ${place}?`,
      a: `${place} is in ${c.name}. Your passport must be ${validityPhrase(c)}${c.rule.issuedWithinYears ? `, and issued less than ${c.rule.issuedWithinYears} years before you arrive` : ""}. Enter your dates above for an exact answer including your return to the UK.`,
    },
    {
      q: `Do I need a visa for ${place}?`,
      a: visaNote(c),
    },
  ];
}
function faqBlock(qas) {
  const html =
    `<div class="card faq"><h2>Common questions</h2>` +
    qas
      .map(
        (x) =>
          `<details><summary>${esc(x.q)}</summary><div class="faq-a"><p>${esc(x.a)}</p></div></details>`,
      )
      .join("") +
    `</div>`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qas.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
  return { html, schema };
}

function breadcrumb(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path}`,
    })),
  };
}

const essentialsBlock = (slug, name) =>
  `<div class="card ess">
      <h2>Travel essentials for ${esc(name)}</h2>
      <p class="ess-sub">Handpicked on Amazon for your trip 👇</p>
      <div class="ess-grid">${amazonItems(slug, name)
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

const insuranceBlock = (name) =>
  config.insuranceUrl && config.insuranceUrl !== "#"
    ? `<div class="actions"><a class="act act-primary" href="${esc(config.insuranceUrl)}" target="_blank" rel="sponsored noopener">🛡️ Get travel insurance for ${esc(name)} →</a></div>`
    : "";

const etiasNote = (c) =>
  c.zone === "schengen"
    ? `<p class="etias-line">✈️ <strong>EU travel:</strong> the EU is introducing the EES (biometric entry/exit checks) and ETIAS (a paid visa-waiver authorisation — not a visa). Start dates have shifted — see our <a href="/eu-entry-ees-etias/">EES &amp; ETIAS guide</a> and <a href="${esc(config.etiasUrl)}" target="_blank" rel="noopener">gov.uk</a> before you go.</p>`
    : "";

// ---- page builder ----
function page({ title, desc, h1, introHtml, contentHtml, urlPath = null, prefillSlug = null, schemas = [], noindex = false }) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${esc(desc)}" />`);
  html = html.replace(/(<h1 data-seo-h1>)[\s\S]*?(<\/h1>)/, `$1${esc(h1)}$2`);
  html = html.replace(/(<p data-seo-intro>)[\s\S]*?(<\/p>)/, `$1${introHtml}$2`);
  html = html.replace(/(<section data-seo-content>)[\s\S]*?(<\/section>)/, `$1${contentHtml}$2`);
  html = html.replace(/(<nav class="dests"[^>]*data-seo-links>)[\s\S]*?(<\/nav>)/, `$1${linksHtml}$2`);

  const head = [
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Is My Passport Valid?" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
  ];
  if (noindex) head.push(`<meta name="robots" content="noindex" />`);
  if (SITE_URL && urlPath != null) {
    const url = `${SITE_URL}${urlPath}`;
    const ogImage = `${SITE_URL}/og.png`;
    head.unshift(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`);
    head.push(
      `<meta property="og:image" content="${ogImage}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:image" content="${ogImage}" />`,
    );
  }
  for (const s of schemas) head.push(`<script type="application/ld+json">${JSON.stringify(s)}</script>`);
  if (prefillSlug) head.push(`<script>window.__PREFILL_SLUG__=${JSON.stringify(prefillSlug)}</script>`);
  return html.replace("</head>", `  ${head.join("\n    ")}\n  </head>`);
}

const write = (urlPath, html) => {
  const dir = path.join(dist, urlPath.replace(/^\/|\/$/g, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
};

// ---- homepage ----
const webApp = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Is My Passport Valid?",
  url: `${SITE_URL}/`,
  applicationCategory: "TravelApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
  description: "Check if your UK passport is valid for your destination and your return to the UK, using entry rules sourced from gov.uk.",
};
fs.writeFileSync(
  path.join(dist, "index.html"),
  page({
    title: "Is My Passport Valid? Free UK Passport Expiry Checker",
    desc: "Check if your UK passport is valid for your destination and your return to the UK. Entry rules sourced from gov.uk. Instant yes/no.",
    h1: "Is my passport valid?",
    introHtml: `For <strong>British citizen</strong> passport holders. We check your destination's entry rules <em>and</em> your return to the UK.`,
    contentHtml: `<div class="card seo-block"><h2>How long does my passport need to be valid?</h2><p>It depends where you're going. Many countries require your passport to be valid for <strong>6 months after you arrive</strong>; the Schengen area needs it valid <strong>3 months after you leave</strong> and issued within the last 10 years; others just need it valid for your stay. Choose your destination above, or pick a country below.</p><p><a href="/eu-entry-ees-etias/">Travelling to Europe? Read about EES &amp; ETIAS →</a> · <a href="/schengen-calculator/">Schengen 90/180 day calculator →</a> · <a href="/about/">How we verify these rules →</a></p></div>`,
    urlPath: "/",
    schemas: [webApp],
  }),
);

// ---- per-country pages ----
let placeCount = 0;
const sitemap = [{ loc: `${SITE_URL}/`, lastmod: TODAY }];
for (const [slug, c] of entries) {
  const sentence = ruleSentence(c);
  const faq = faqBlock(faqFor(c));
  const content = `<div class="card seo-block">
      <h2>Is my UK passport valid for ${esc(c.name)}?</h2>
      <p class="rule-line">To enter ${esc(c.name)}, your passport must be ${esc(sentence)}.</p>
      <blockquote>${esc(c.quote)}</blockquote>
      <p class="visa-line">🛂 <strong>Visa:</strong> ${esc(visaNote(c))}</p>
      ${etiasNote(c)}
      <p><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Official ${esc(c.name)} entry requirements on gov.uk →</a></p>
      <p class="verified-line">Rule last verified ${esc(c.lastVerified)} against gov.uk. <a href="/about/">How we verify →</a></p>
      <p>Enter your passport and travel dates above for an instant yes/no for your exact trip, including your return to the UK.</p>
    </div>
    ${faq.html}
    ${insuranceBlock(c.name)}
    ${essentialsBlock(slug, c.name)}`;
  const crumb = breadcrumb([
    { name: "Home", path: "/" },
    { name: c.name, path: `/${slug}/` },
  ]);
  write(
    `/${slug}/`,
    page({
      title: `Is my passport valid for ${c.name}? UK passport rules`,
      desc: `Check if your UK passport meets ${c.name}'s entry requirements and your return to the UK. Your passport must be ${sentence}. Source: gov.uk.`,
      h1: `Is my passport valid for ${c.name}?`,
      introHtml: `Check if your <strong>UK passport</strong> is valid for <strong>${esc(c.name)}</strong> — and for getting back into the UK.`,
      contentHtml: content,
      urlPath: `/${slug}/`,
      prefillSlug: slug,
      schemas: [{ ...faq.schema, dateModified: c.lastVerified }, crumb],
    }),
  );
  sitemap.push({ loc: `${SITE_URL}/${slug}/`, lastmod: c.lastVerified });

  // ---- place/island/city pages for this country ----
  for (const alias of aliases[slug] ?? []) {
    if (/^[A-Z]{3}$/.test(alias)) continue; // skip IATA codes
    if (alias.toLowerCase() === c.name.toLowerCase()) continue;
    const placeSlug = alias
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!placeSlug || countrySlugs.has(placeSlug)) continue; // don't clobber a country page
    const pfaq = faqBlock(faqForPlace(alias, c));
    const pcontent = `<div class="card seo-block">
        <h2>Is my passport valid for ${esc(alias)}?</h2>
        <p class="rule-line">${esc(alias)} is in <a href="/${slug}/">${esc(c.name)}</a>, so ${esc(c.name)}'s UK passport rules apply: your passport must be ${esc(sentence)}.</p>
        <blockquote>${esc(c.quote)}</blockquote>
        <p class="visa-line">🛂 <strong>Visa:</strong> ${esc(visaNote(c))}</p>
        ${etiasNote(c)}
        <p><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Official ${esc(c.name)} entry requirements on gov.uk →</a></p>
        <p class="verified-line">Rule last verified ${esc(c.lastVerified)} against gov.uk.</p>
        <p>Enter your passport and travel dates above for an instant yes/no for ${esc(alias)}, including your return to the UK.</p>
      </div>
      ${pfaq.html}
      ${insuranceBlock(c.name)}
      ${essentialsBlock(slug, c.name)}`;
    const pcrumb = breadcrumb([
      { name: "Home", path: "/" },
      { name: c.name, path: `/${slug}/` },
      { name: alias, path: `/${placeSlug}/` },
    ]);
    write(
      `/${placeSlug}/`,
      page({
        title: `Is my passport valid for ${alias}? (${c.name}) UK rules`,
        desc: `${alias} is in ${c.name}. Check your UK passport meets ${c.name}'s entry requirements and your return to the UK. Your passport must be ${sentence}.`,
        h1: `Is my passport valid for ${alias}?`,
        introHtml: `<strong>${esc(alias)}</strong> is in <strong>${esc(c.name)}</strong> — check your <strong>UK passport</strong> meets the rules, including your return to the UK.`,
        contentHtml: pcontent,
        urlPath: `/${placeSlug}/`,
        prefillSlug: slug,
        schemas: [{ ...pfaq.schema, dateModified: c.lastVerified }, pcrumb],
      }),
    );
    sitemap.push({ loc: `${SITE_URL}/${placeSlug}/`, lastmod: c.lastVerified });
    placeCount++;
  }
}

// ---- About / methodology (E-E-A-T) ----
write(
  "/about/",
  page({
    title: "About & how we verify — Is My Passport Valid?",
    desc: "How Is My Passport Valid? sources and verifies UK passport entry rules from gov.uk, how often they're checked, and our no-liability disclaimer.",
    h1: "About & how we verify",
    introHtml: `A free tool that checks a <strong>British citizen</strong> passport against a destination's entry rules — and the return to the UK.`,
    contentHtml: `<div class="card seo-block">
        <h2>Where our rules come from</h2>
        <p>Every passport rule is taken from the official <a href="https://www.gov.uk/foreign-travel-advice" target="_blank" rel="noopener">gov.uk foreign travel advice</a> entry-requirements page for that country, which we cite and link on each destination page. We turn the free-text rule into a structured check (how long the passport must stay valid, whether it's counted from arrival or departure, and any issue-date rule) so we can give you an exact yes/no for your dates.</p>
        <h2>How current it is</h2>
        <p>Each destination shows the date its rule was last verified against gov.uk. Rules drift, so we re-check them on a monthly cycle, and you can always open the live gov.uk wording from any result. <strong>Always confirm on gov.uk and with your airline before you travel.</strong></p>
        <h2>Your privacy</h2>
        <p>Your passport dates are checked entirely in your browser. They are never sent to us, logged or stored. Analytics are cookieless, so there's no tracking and no consent banner. We set no cookies of our own; some outbound links are affiliate links, and if you click through the destination site (such as Amazon) may set its own cookies.</p>
        <h2>Open source</h2>
        <p>This site is open source — you can read every line, including the privacy claims above, on <a href="https://github.com/edleeman17/ismypassportvalid" target="_blank" rel="noopener">GitHub</a>.</p>
        <h2>No liability</h2>
        <p>This is not official advice and may be out of date or wrong. We accept no responsibility for any loss arising from incorrect or outdated information. The final responsibility for your documents is yours, your airline's and the destination's border authorities'.</p>
      </div>`,
    urlPath: "/about/",
  }),
);
sitemap.push({ loc: `${SITE_URL}/about/`, lastmod: TODAY });

// ---- EES / ETIAS hub ----
const eesFaq = faqBlock([
  { q: "What is the EES?", a: "The EU Entry/Exit System (EES) is an automated border system that records non-EU travellers (including UK citizens) with fingerprints and a facial photo instead of stamping passports. It applies when you enter or leave the Schengen area." },
  { q: "What is ETIAS?", a: "ETIAS is a paid travel authorisation (not a visa) that UK and other visa-exempt travellers will need to apply for online before visiting most of Europe for short stays. It is expected to cost a few euros and last several years." },
  { q: "Do I need ETIAS now?", a: "Not yet. EES rolls out first, with ETIAS expected to follow afterwards. Start dates have moved several times, so check gov.uk before you travel." },
  { q: "Does ETIAS change my passport validity requirement?", a: "No. You still need your passport valid for at least 3 months after you leave the Schengen area and issued within the last 10 years. Check your exact dates with the passport checker." },
]);
write(
  "/eu-entry-ees-etias/",
  page({
    title: "EES & ETIAS explained for UK travellers (2026)",
    desc: "What the EU's EES and ETIAS mean for UK travellers: what they are, when they start, and how they affect your passport. Sourced from gov.uk.",
    h1: "EES & ETIAS for UK travellers",
    introHtml: `The two big changes to entering Europe — explained simply, for <strong>UK passport</strong> holders.`,
    contentHtml: `<div class="card seo-block">
        <h2>EES and ETIAS, in plain English</h2>
        <p>The EU is changing how non-EU visitors enter the Schengen area. Two things matter for UK travellers: the <strong>EES</strong> (a biometric entry/exit system replacing passport stamps) and <strong>ETIAS</strong> (a paid online travel authorisation you'll apply for before you go). Neither is a visa, and neither changes the core passport rule.</p>
        <p class="etias-line">✈️ Start dates have shifted repeatedly. Always check <a href="${esc(config.etiasUrl)}" target="_blank" rel="noopener">gov.uk</a> before you travel.</p>
        <h2>Your passport still needs to qualify</h2>
        <p>For the Schengen area your passport must be valid for at least <strong>3 months after the day you leave</strong> and have been <strong>issued less than 10 years</strong> before you arrive. <a href="/spain/">Check your dates for a Schengen country →</a></p>
      </div>
      ${eesFaq.html}`,
    urlPath: "/eu-entry-ees-etias/",
    schemas: [eesFaq.schema],
  }),
);
sitemap.push({ loc: `${SITE_URL}/eu-entry-ees-etias/`, lastmod: TODAY });

// ---- Schengen calculator (built by Vite as a separate entry) ----
sitemap.push({ loc: `${SITE_URL}/schengen-calculator/`, lastmod: TODAY });

// ---- 404 ----
fs.writeFileSync(
  path.join(dist, "404.html"),
  page({
    title: "Page not found — Is My Passport Valid?",
    desc: "That page doesn't exist. Check whether your UK passport is valid for your destination.",
    h1: "Page not found",
    introHtml: `We couldn't find that page. Search your destination below to check your passport.`,
    contentHtml: `<div class="card seo-block"><h2>Lost your way?</h2><p>Enter your passport and travel dates above, or <a href="/">go back to the homepage</a>.</p></div>`,
    urlPath: null,
    noindex: true,
  }),
);

// ---- robots + sitemap ----
fs.writeFileSync(
  path.join(dist, "robots.txt"),
  SITE_URL ? `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n` : `User-agent: *\nAllow: /\n`,
);
if (SITE_URL) {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemap.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), xml);
  console.log(`prerender: homepage + ${entries.length} country pages + ${placeCount} place pages + about + ees; ${sitemap.length} sitemap URLs @ ${SITE_URL}`);
} else {
  console.log(`prerender: homepage + ${entries.length} country + ${placeCount} place pages. SITE_URL unset → sitemap skipped.`);
}
