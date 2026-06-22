import "./styles.css";
import rawCountries from "./countries.json";
import rawAliases from "./aliases.json";
import { computeVerdict, type Country, type Verdict } from "./verdict";
import { amazonItems } from "./affiliate";

// Strip the _meta key; everything else is a Country keyed by gov.uk slug.
const countries = Object.fromEntries(
  Object.entries(rawCountries as Record<string, unknown>).filter(([k]) => k !== "_meta"),
) as Record<string, Country>;
const aliases = rawAliases as Record<string, string[]>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("checker");
const resultEl = $<HTMLElement>("result");
const errorEl = $<HTMLParagraphElement>("form-error");

// ---- destination combobox ----
// Searchable index: one entry per country, plus one per alias (city/island/resort/airport code).
interface Entry {
  label: string;
  slug: string;
  hint?: string; // country name, shown when the match is an alias
}
const index: Entry[] = [];
for (const [slug, c] of Object.entries(countries)) {
  index.push({ label: c.name, slug });
  for (const a of aliases[slug] ?? []) index.push({ label: a, slug, hint: c.name });
}

const searchInput = $<HTMLInputElement>("dest-search");
const hidden = $<HTMLInputElement>("destination");
const list = $<HTMLUListElement>("dest-list");
let matches: Entry[] = [];
let activeIdx = -1;

function search(q: string): Entry[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const starts: Entry[] = [];
  const contains: Entry[] = [];
  for (const e of index) {
    const l = e.label.toLowerCase();
    if (l.startsWith(s)) starts.push(e);
    else if (l.includes(s)) contains.push(e);
  }
  return [...starts, ...contains].slice(0, 8);
}

function renderList() {
  if (!matches.length) {
    list.innerHTML = `<li class="combo-empty">No match — try the country name.</li>`;
    list.classList.remove("hidden");
    searchInput.setAttribute("aria-expanded", "true");
    return;
  }
  list.innerHTML = matches
    .map(
      (e, i) =>
        `<li role="option" data-i="${i}" class="${i === activeIdx ? "active" : ""}">
          <span>${esc(e.label)}</span>${e.hint ? `<span class="h">${esc(e.hint)}</span>` : ""}
        </li>`,
    )
    .join("");
  list.classList.remove("hidden");
  searchInput.setAttribute("aria-expanded", "true");
}

function closeList() {
  list.classList.add("hidden");
  searchInput.setAttribute("aria-expanded", "false");
  activeIdx = -1;
}

function choose(e: Entry) {
  hidden.value = e.slug;
  searchInput.value = e.hint ? `${e.label} (${e.hint})` : e.label;
  closeList();
}

searchInput.addEventListener("input", () => {
  hidden.value = ""; // typing invalidates a previous pick
  matches = search(searchInput.value);
  activeIdx = -1;
  renderList();
});

searchInput.addEventListener("keydown", (ev) => {
  if (list.classList.contains("hidden") || !matches.length) return;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    activeIdx = (activeIdx + 1) % matches.length;
    renderList();
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    activeIdx = (activeIdx - 1 + matches.length) % matches.length;
    renderList();
  } else if (ev.key === "Enter") {
    if (activeIdx >= 0) {
      ev.preventDefault();
      choose(matches[activeIdx]);
    }
  } else if (ev.key === "Escape") {
    closeList();
  }
});

list.addEventListener("mousedown", (ev) => {
  // mousedown (not click) so it fires before the input blur
  const li = (ev.target as HTMLElement).closest("li[data-i]");
  if (!li) return;
  ev.preventDefault();
  choose(matches[Number(li.getAttribute("data-i"))]);
});

searchInput.addEventListener("blur", () => setTimeout(closeList, 120));
searchInput.addEventListener("focus", () => {
  if (searchInput.value && !hidden.value) {
    matches = search(searchInput.value);
    renderList();
  }
});

// Prefill destination from a prerendered per-country page (e.g. /spain/ sets this).
const prefill = (window as unknown as { __PREFILL_SLUG__?: string }).__PREFILL_SLUG__;
if (prefill && countries[prefill]) {
  hidden.value = prefill;
  searchInput.value = countries[prefill].name;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const slug = hidden.value;
  const expiry = $<HTMLInputElement>("expiry").value;
  const issue = $<HTMLInputElement>("issue").value || undefined;
  const outbound = $<HTMLInputElement>("outbound").value;
  const ret = $<HTMLInputElement>("return").value;

  const country = countries[slug];
  if (!country) {
    return showError("Pick a destination from the list (e.g. start typing Lanzarote, then choose it).");
  }
  if (!expiry || !outbound || !ret) {
    return showError("Please fill in your passport expiry, outbound and return dates.");
  }
  if (ret < outbound) {
    return showError("Your return date is before your outbound date.");
  }

  const verdict = computeVerdict({
    passportExpiry: expiry,
    passportIssue: issue,
    outboundDate: outbound,
    returnDate: ret,
    country,
  });

  render(verdict, country);
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

function showError(msg: string) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function render(v: Verdict, country: Country) {
  const banner = v.incomplete
    ? {
        cls: "maybe",
        icon: "?",
        title: "Almost — we need a bit more",
        sub: "Some checks passed but one needs more info (see below).",
      }
    : v.ok
      ? {
          cls: "ok",
          icon: "✓",
          title: "YES — looks valid",
          sub: `Based on gov.uk rules for ${country.name} and your return to the UK.`,
        }
      : {
          cls: "no",
          icon: "✗",
          title: "NO — there's a problem",
          sub: "At least one requirement is not met (see below).",
        };

  const checksHtml = v.checks
    .map(
      (c) => `<li>
        <span class="m ${c.status}">${c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "?"}</span>
        <span><span class="lbl">${esc(c.label)}</span><br><span class="det">${esc(c.detail)}</span></span>
      </li>`,
    )
    .join("");

  resultEl.innerHTML = `
    <div class="verdict ${banner.cls}">
      <div class="mark">${banner.icon}</div>
      <div class="title">${banner.title}</div>
      <div class="sub">${esc(banner.sub)}</div>
    </div>

    <ul class="checks card">${checksHtml}</ul>

    <div class="card src">
      <h2>Source — gov.uk</h2>
      <blockquote>${esc(country.quote)}</blockquote>
      <p style="margin:0.75rem 0 0;font-size:0.9rem;">
        <a href="${esc(country.sourceUrl)}" target="_blank" rel="noopener">
          Read the official ${esc(country.name)} entry requirements →
        </a>
      </p>
      <p class="verified">Rule recorded ${esc(country.lastVerified)}. Always re-check before travel.</p>
      <details id="live-details">
        <summary>Show live gov.uk wording</summary>
        <div id="live" class="govuk-content">Expand to load the latest wording from gov.uk.</div>
      </details>
    </div>

    <div class="card seo-block">
      <h2>Travel essentials for ${esc(country.name)}</h2>
      <div class="links">
        ${amazonItems(country.govukSlug, country.name)
          .map((i) => `<a href="${esc(i.url)}" target="_blank" rel="sponsored noopener">${esc(i.label)}</a>`)
          .join("")}
      </div>
      <p class="fine">As an Amazon Associate we earn from qualifying purchases.</p>
    </div>
  `;
  resultEl.classList.remove("hidden");

  // Lazy-load the live gov.uk wording only when the panel is first opened —
  // keeps the proxy (a metered Pages Function) calls to a minimum.
  const det = document.getElementById("live-details") as HTMLDetailsElement | null;
  let loaded = false;
  det?.addEventListener("toggle", () => {
    if (det.open && !loaded) {
      loaded = true;
      document.getElementById("live")!.textContent = "Loading from gov.uk…";
      loadLive(country.govukSlug);
    }
  });
}

async function loadLive(slug: string) {
  const el = document.getElementById("live");
  if (!el) return;
  try {
    const res = await fetch(`/api/advice/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const parts: Array<{ slug: string; body: string }> = data?.details?.parts ?? [];
    const part = parts.find((p) => p.slug === "entry-requirements");
    if (!part) throw new Error("no entry-requirements part");
    el.innerHTML = part.body;
  } catch {
    el.innerHTML = `Couldn't load live gov.uk text. <a href="https://www.gov.uk/foreign-travel-advice/${esc(slug)}/entry-requirements" target="_blank" rel="noopener">Open it on gov.uk →</a>`;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

// Contextual affiliate / useful links (placeholders — swap in real affiliate URLs).
const links = [
  { label: "Renew your passport (gov.uk)", href: "https://www.gov.uk/renew-adult-passport", aff: false },
  { label: "Travel insurance", href: "#", aff: true },
  { label: "eSIM data abroad", href: "#", aff: true },
];
$<HTMLDivElement>("affiliate").innerHTML = links
  .map(
    (l) =>
      `<a href="${l.href}" target="_blank" rel="${l.aff ? "sponsored noopener" : "noopener"}">${l.label}</a>`,
  )
  .join("");
