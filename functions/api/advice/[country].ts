// Cloudflare Pages Function: thin CORS pass-through proxy for the gov.uk Content API.
// Returns the raw gov.uk JSON so the same endpoint shape can be served by nginx on
// other hosts (e.g. pi5). The frontend extracts the "entry-requirements" part.
//
// Route: GET /api/advice/:country  ->  https://www.gov.uk/api/content/foreign-travel-advice/:country

interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const country = String(context.params.country || "")
    .toLowerCase()
    .replace(/[^a-z-]/g, ""); // allowlist: lowercase letters + hyphen only

  if (!country) {
    return json({ error: "missing country" }, 400);
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

function json(body: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
