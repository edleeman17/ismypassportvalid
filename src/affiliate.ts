// Contextual Amazon affiliate items per destination. Used at runtime (results) and
// mirrored in scripts/prerender.mjs for the static per-country SEO pages.
import travel from "./travel.json";
import config from "./config.json";

export interface AffiliateItem {
  icon: string;
  label: string;
  blurb: string;
  url: string;
}

const powerQueries = (travel as Record<string, unknown>)._powerQueries as Record<string, string | null>;

function amazonUrl(query: string): string {
  return `https://www.${config.amazonDomain}/s?k=${encodeURIComponent(query)}&tag=${config.amazonTag}`;
}

const climateItems: Record<string, { icon: string; label: string; blurb: string; q: string }> = {
  beach: { icon: "🧴", label: "Reef-safe suncream", blurb: "Don't get caught out", q: "reef safe suncream" },
  tropical: { icon: "🦟", label: "Mosquito repellent", blurb: "Bite-free evenings", q: "mosquito repellent deet travel" },
  cold: { icon: "🧤", label: "Thermal base layers", blurb: "Stay warm out there", q: "thermal base layers" },
};

interface TravelMeta {
  power?: string;
  drivable?: boolean;
  climate?: string;
  longHaul?: boolean;
}

export function amazonItems(slug: string, name: string): AffiliateItem[] {
  const t = (travel as Record<string, TravelMeta>)[slug] ?? {};
  const out: { icon: string; label: string; blurb: string; q: string }[] = [
    { icon: "📘", label: `${name} guidebook`, blurb: "Plan it like a local", q: `${name} travel guide` },
  ];
  const climate = t.climate ? climateItems[t.climate] : undefined;
  if (climate) out.push(climate);
  if (t.longHaul)
    out.push({ icon: "🛌", label: "Neck pillow", blurb: "Survive the long flight", q: "travel neck pillow" });
  const pq = t.power ? powerQueries[t.power] : null;
  if (pq) out.push({ icon: "🔌", label: "Travel plug adapter", blurb: "Keep your phone charged", q: pq });
  if (t.drivable)
    out.push({ icon: "🚗", label: "European driving kit", blurb: "Driving over? Stay road-legal", q: "European car driving kit" });
  out.push({ icon: "🧳", label: "Packing cubes", blurb: "Pack smarter, fit more in", q: "packing cubes" });
  out.push({ icon: "🗺️", label: `${name} map`, blurb: "Find your way around", q: `${name} travel map` });
  return out.map((i) => ({ icon: i.icon, label: i.label, blurb: i.blurb, url: amazonUrl(i.q) }));
}
