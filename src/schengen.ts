// Schengen 90/180-day calculator. Standalone page (its own Vite entry).
// Rule: a visitor may spend at most 90 days in any rolling 180-day period in
// the Schengen area. We count days present in the 180 days ending on a chosen
// date, and also find the worst (peak) day across the trips entered.
import "./styles.css";

// ---- pure date helpers (UTC) ----
function parse(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
const DAY = 86_400_000;
function addDays(ms: number, n: number): number {
  return ms + n * DAY;
}
function human(iso: string): string {
  return new Date(parse(iso)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export interface Stay {
  start: string;
  end: string;
}
export interface Usage {
  used: number;
  remaining: number;
  windowStart: string;
}

// Days present in the 180-day window ending on refISO (inclusive).
export function usageOn(stays: Stay[], refISO: string): Usage {
  const ref = parse(refISO);
  const windowStart = addDays(ref, -179);
  let used = 0;
  for (const s of stays) {
    const a = Math.max(parse(s.start), windowStart);
    const b = Math.min(parse(s.end), ref);
    if (b >= a) used += (b - a) / DAY + 1;
  }
  return { used, remaining: Math.max(0, 90 - used), windowStart: fmt(windowStart) };
}

// Peak usage on any day across the span of the trips (catches breaches that
// don't fall on the chosen reference date).
export function peakUsage(stays: Stay[]): { date: string; used: number } | null {
  if (!stays.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of stays) {
    lo = Math.min(lo, parse(s.start));
    hi = Math.max(hi, parse(s.end));
  }
  let best = { date: fmt(hi), used: 0 };
  for (let d = lo; d <= hi; d = addDays(d, 1)) {
    const u = usageOn(stays, fmt(d)).used;
    if (u > best.used) best = { date: fmt(d), used: u };
  }
  return best;
}

// ---- DOM ----
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rows = $<HTMLDivElement>("stays");
const today = new Date().toISOString().slice(0, 10);

function addRow(start = "", end = "") {
  const row = document.createElement("div");
  row.className = "stay-row";
  row.innerHTML = `
    <label class="field">Entered Schengen<input type="date" class="s-start" value="${start}" /></label>
    <label class="field">Left Schengen<input type="date" class="s-end" value="${end}" /></label>
    <button type="button" class="act act-soft s-del" aria-label="Remove this trip">✕</button>`;
  row.querySelector(".s-del")!.addEventListener("click", () => {
    row.remove();
    if (!rows.querySelector(".stay-row")) addRow();
  });
  rows.appendChild(row);
}
addRow();

$("add-stay").addEventListener("click", () => addRow());

const refInput = $<HTMLInputElement>("ref-date");
refInput.value = today;

$("calc-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const stays: Stay[] = [];
  for (const row of Array.from(rows.querySelectorAll(".stay-row"))) {
    const start = (row.querySelector(".s-start") as HTMLInputElement).value;
    const end = (row.querySelector(".s-end") as HTMLInputElement).value;
    if (start && end) {
      if (end < start) return showError("One of your trips ends before it starts.");
      stays.push({ start, end });
    }
  }
  if (!stays.length) return showError("Add at least one trip with both dates.");
  const ref = refInput.value || today;
  render(stays, ref);
});

const errorEl = $<HTMLParagraphElement>("calc-error");
function showError(msg: string) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function render(stays: Stay[], ref: string) {
  errorEl.classList.add("hidden");
  const u = usageOn(stays, ref);
  const peak = peakUsage(stays)!;
  const ok = peak.used <= 90;
  const onRef = u.used <= 90;

  const banner = ok
    ? { cls: "ok", icon: "✓", title: "Within the 90/180 limit", sub: `Peak ${peak.used} of 90 days used.` }
    : { cls: "no", icon: "✗", title: "Over the 90/180 limit", sub: `You hit ${peak.used} days on ${human(peak.date)} — over the 90-day cap.` };

  $("calc-result").innerHTML = `
    <div class="verdict ${banner.cls}">
      <div class="mark">${banner.icon}</div>
      <div class="title">${banner.title}</div>
      <div class="sub">${banner.sub}</div>
    </div>
    <ul class="checks card">
      <li><span class="m ${onRef ? "pass" : "fail"}">${onRef ? "✓" : "✗"}</span>
        <span><span class="lbl">On ${human(ref)}</span><br><span class="det">${u.used} of 90 days used in the 180 days from ${human(u.windowStart)}. ${u.remaining} day${u.remaining === 1 ? "" : "s"} remaining.</span></span></li>
      <li><span class="m ${ok ? "pass" : "fail"}">${ok ? "✓" : "✗"}</span>
        <span><span class="lbl">Peak across your trips</span><br><span class="det">Most days used in any 180-day window: <strong>${peak.used}</strong> (on ${human(peak.date)}).</span></span></li>
    </ul>
    <div class="card src">
      <h2>How the rule works</h2>
      <p style="margin:0;font-size:0.9rem;">You may spend at most <strong>90 days in any rolling 180-day period</strong> in the Schengen area as a visitor. The window moves with you — each day looks back 180 days. This tool counts the days you entered above; it doesn't know about other trips, so add them all.</p>
      <p class="verified" style="margin-top:0.6rem;">Not official. Confirm on <a href="https://www.gov.uk/travel-to-eu-schengen-area" target="_blank" rel="noopener">gov.uk</a>. Need passport validity too? <a href="/spain/">Check your passport →</a></p>
    </div>`;
  $("calc-result").classList.remove("hidden");
  $("calc-result").scrollIntoView({ behavior: "smooth", block: "start" });
}
