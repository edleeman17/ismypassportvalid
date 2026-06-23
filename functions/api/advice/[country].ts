// Cloudflare Pages Function: thin pass-through proxy for the gov.uk Content API.
// Returns the raw gov.uk JSON; the frontend extracts the "entry-requirements" part.
//
// Route: GET /api/advice/:country  ->  https://www.gov.uk/api/content/foreign-travel-advice/:country
//
// Hardened for the free tier: the :country param is checked against the curated
// allowlist BEFORE any upstream fetch, so junk/random slugs are rejected with no
// Function-quota or gov.uk cost and the edge cache keyspace stays bounded to ~46.
import countries from "../../../src/countries.json";

interface Env {}

// Build the allowlist once at module load from the curated ruleset (drop _meta).
const ALLOWED = new Set(
  Object.keys(countries as Record<string, unknown>).filter((k) => k !== "_meta"),
);

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const country = String(context.params.country || "")
    .toLowerCase()
    .replace(/[^a-z-]/g, "");

  if (!country) {
    return json({ error: "missing country" }, 400);
  }
  // Reject anything not in the curated list before spending a fetch / quota.
  if (!ALLOWED.has(country)) {
    return json({ error: "unknown country" }, 404);
  }

  const upstream = `https://www.gov.uk/api/content/foreign-travel-advice/${country}`;
  try {
    const res = await fetch(upstream, {
      headers: { Accept: "application/json", "User-Agent": "passport-valid (gov.uk content proxy)" },
      cf: { cacheTtl: 21600, cacheEverything: true },
    });
    if (!res.ok) {
      return json({ error: `gov.uk returned ${res.status}` }, res.status === 404 ? 404 : 502);
    }
    const data = await res.json();
    return json(data, 200, "public, max-age=21600");
  } catch {
    return json({ error: "could not reach gov.uk" }, 502);
  }
};

// No Access-Control-Allow-Origin: the frontend calls this same-origin (CORS not
// needed), and omitting it stops other sites using us as a free CORS proxy.
function json(body: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
    },
  });
}
