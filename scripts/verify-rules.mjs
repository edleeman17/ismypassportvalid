// Monthly gov.uk rule drift detector (run by .github/workflows/verify-rules.yml).
//
// For each curated country it fetches the live gov.uk entry-requirements text,
// extracts the "passport validity" subsection, and hashes it. It compares each
// hash to a stored baseline (scripts/rule-snapshots.json). When gov.uk's wording
// changes, the workflow opens an issue listing those countries for a HUMAN to
// re-verify the structured rule in countries.json — we never auto-edit a rule.
//
// Deterministic, no API key, no LLM. Detects that the source moved; you interpret.
import fs from "node:fs";
import crypto from "node:crypto";

const SNAP = "scripts/rule-snapshots.json";
const countries = JSON.parse(fs.readFileSync("src/countries.json", "utf8"));
const slugs = Object.entries(countries)
  .filter(([k]) => k !== "_meta")
  .map(([, c]) => c.govukSlug);

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
const strip = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Pull the "passport validity" section out of the entry-requirements HTML body.
// Falls back to the whole body (section:"full") if no matching heading is found,
// so a change is never silently missed.
function passportSection(body) {
  const clean = body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const headings = [...clean.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)];
  for (let i = 0; i < headings.length; i++) {
    const text = strip(headings[i][2]);
    if (/passport/i.test(text) && /valid/i.test(text)) {
      const start = headings[i].index + headings[i][0].length;
      const end = i + 1 < headings.length ? headings[i + 1].index : clean.length;
      return { section: text, text: strip(clean.slice(start, end)) };
    }
  }
  return { section: "full", text: strip(clean) };
}

async function fetchSection(slug) {
  const res = await fetch(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`, {
    headers: { Accept: "application/json", "User-Agent": "ismypassportvalid rule-verifier (+https://ismypassportvalid.co.uk)" },
  });
  if (!res.ok) throw new Error(`gov.uk ${res.status}`);
  const data = await res.json();
  const part = (data?.details?.parts ?? []).find((p) => p.slug === "entry-requirements");
  if (!part) throw new Error("no entry-requirements part");
  return passportSection(part.body);
}

const baseline = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, "utf8")) : null;
const firstRun = !baseline || Object.keys(baseline).length === 0;
const snapshot = {};
const changed = [];
const errors = [];

for (const slug of slugs) {
  try {
    const { section, text } = await fetchSection(slug);
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    snapshot[slug] = { hash, section, excerpt: text.slice(0, 200) };
    if (!firstRun && baseline[slug] && baseline[slug].hash !== hash) {
      changed.push({ slug, section, excerpt: text.slice(0, 280) });
    }
  } catch (e) {
    errors.push({ slug, error: String(e.message || e) });
    // Keep the old snapshot entry on a fetch error so we don't lose the baseline.
    if (baseline?.[slug]) snapshot[slug] = baseline[slug];
  }
}

fs.writeFileSync(SNAP, JSON.stringify(snapshot, null, 2) + "\n");

// Build a markdown report for the issue body.
let report = "";
if (firstRun) {
  report = `Baseline created for ${slugs.length} countries. No comparison this run.\n`;
} else if (changed.length) {
  report =
    `gov.uk passport-validity wording changed for **${changed.length}** ${changed.length === 1 ? "country" : "countries"} since the last check. ` +
    `**Re-verify each rule in \`src/countries.json\` against gov.uk, then update its \`lastVerified\`.**\n\n` +
    changed
      .map(
        (c) =>
          `### ${c.slug}\n` +
          `- Source: https://www.gov.uk/foreign-travel-advice/${c.slug}/entry-requirements\n` +
          `- Section: _${c.section}_\n` +
          `- Now reads: "${c.excerpt}${c.excerpt.length >= 280 ? "…" : ""}"\n`,
      )
      .join("\n");
} else {
  report = `Checked ${slugs.length} countries. No passport-validity wording changes.\n`;
}
if (errors.length) {
  report += `\n---\n⚠️ Could not fetch ${errors.length}: ${errors.map((e) => `${e.slug} (${e.error})`).join(", ")}\n`;
}

console.log(report);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${firstRun ? 0 : changed.length}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `firstrun=${firstRun ? 1 : 0}\n`);
}
fs.writeFileSync("verify-report.md", report);
