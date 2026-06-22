// Contextual Amazon affiliate items per destination. Used at runtime (results) and
// mirrored in scripts/prerender.mjs for the static per-country SEO pages.
import travel from "./travel.json";
import config from "./config.json";

export interface AffiliateItem {
  label: string;
  url: string;
}

const powerQueries = (travel as Record<string, unknown>)._powerQueries as Record<string, string | null>;

function amazonUrl(query: string): string {
  return `https://www.${config.amazonDomain}/s?k=${encodeURIComponent(query)}&tag=${config.amazonTag}`;
}

export function amazonItems(slug: string, name: string): AffiliateItem[] {
  const t = (travel as Record<string, { power?: string; drivable?: boolean }>)[slug] ?? {};
  const out: { label: string; q: string }[] = [
    { label: `${name} travel guide`, q: `${name} travel guide` },
    { label: `${name} map`, q: `${name} travel map` },
  ];
  const pq = t.power ? powerQueries[t.power] : null;
  if (pq) out.push({ label: "Travel plug adapter", q: pq });
  if (t.drivable) out.push({ label: "European driving kit", q: "European car driving kit" });
  return out.map((i) => ({ label: i.label, url: amazonUrl(i.q) }));
}
