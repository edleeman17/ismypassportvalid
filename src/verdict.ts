// Pure verdict logic. No DOM, no network — unit-testable.

export type Anchor = "arrival" | "departure";

export interface CountryRule {
  /** Months the passport must remain valid beyond the anchor date. 0 = just unexpired (duration of stay). */
  validBeyondMonths: number;
  /** Optional: use exact days instead of months (e.g. Turkey 150 days, South Africa 30 days). Takes precedence over months when set. */
  validBeyondDays?: number;
  /** "arrival" = counts from outbound date; "departure" = counts from the day you leave the country (return date). */
  anchor: Anchor;
  /** Optional: passport must have been issued within this many years before arrival (Schengen 10-year rule). */
  issuedWithinYears?: number;
}

export interface Country {
  name: string;
  govukSlug: string;
  zone?: string;
  rule: CountryRule;
  quote: string;
  sourceUrl: string;
  lastVerified: string;
}

export interface VerdictInput {
  /** ISO date strings, YYYY-MM-DD. */
  passportExpiry: string;
  passportIssue?: string;
  outboundDate: string;
  returnDate: string;
  country: Country;
}

export type CheckStatus = "pass" | "fail" | "unknown";

export interface Check {
  id: "destination-validity" | "destination-issue" | "return-to-uk";
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface Verdict {
  /** true only if every applicable check passed and none are unknown. */
  ok: boolean;
  /** true if a result could not be computed (e.g. missing issue date). */
  incomplete: boolean;
  checks: Check[];
}

// ---- date helpers (UTC, no timezone drift) ----

function parse(iso: string): Date {
  // Treat YYYY-MM-DD as UTC midnight.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add months, clamping to the last valid day of the target month (e.g. Jan 31 + 1mo = Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const d = parse(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fmt(target);
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

function onOrAfter(a: string, b: string): boolean {
  return parse(a).getTime() >= parse(b).getTime();
}

function human(iso: string): string {
  return parse(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---- verdict ----

export function computeVerdict(input: VerdictInput): Verdict {
  const { passportExpiry, passportIssue, outboundDate, returnDate, country } = input;
  const { rule } = country;
  const checks: Check[] = [];

  // 1. Destination validity-beyond rule.
  const anchorDate = rule.anchor === "departure" ? returnDate : outboundDate;
  const hasBuffer = (rule.validBeyondDays ?? 0) > 0 || rule.validBeyondMonths > 0;
  const requiredUntil =
    rule.validBeyondDays != null
      ? addDays(anchorDate, rule.validBeyondDays)
      : addMonths(anchorDate, rule.validBeyondMonths);
  const validOk = onOrAfter(passportExpiry, requiredUntil);
  const anchorWord = rule.anchor === "departure" ? "you leave" : "you arrive in";
  const bufferText =
    rule.validBeyondDays != null
      ? `${rule.validBeyondDays} days`
      : `${rule.validBeyondMonths} month${rule.validBeyondMonths === 1 ? "" : "s"}`;
  checks.push({
    id: "destination-validity",
    label: `${country.name} entry — passport validity`,
    status: validOk ? "pass" : "fail",
    detail: hasBuffer
      ? `Needs to be valid until at least ${human(requiredUntil)} (${bufferText} after ${anchorWord} ${country.name}). Yours expires ${human(passportExpiry)}.`
      : `Needs to be valid for your whole stay. Yours expires ${human(passportExpiry)}.`,
  });

  // 2. Issue-date rule (only if the country has one).
  if (rule.issuedWithinYears) {
    if (passportIssue) {
      const issueDeadline = addYears(passportIssue, rule.issuedWithinYears);
      const issueOk = onOrAfter(issueDeadline, outboundDate);
      checks.push({
        id: "destination-issue",
        label: `${country.name} entry — issue date`,
        status: issueOk ? "pass" : "fail",
        detail: `Must have been issued less than ${rule.issuedWithinYears} years before you arrive (${human(outboundDate)}). Yours was issued ${human(passportIssue)}.`,
      });
    } else {
      checks.push({
        id: "destination-issue",
        label: `${country.name} entry — issue date`,
        status: "unknown",
        detail: `${country.name} also requires the passport to be issued less than ${rule.issuedWithinYears} years before arrival. Enter your passport issue date to check this.`,
      });
    }
  }

  // 3. Return to the UK — British citizen: passport must simply be unexpired on the return date.
  const returnOk = onOrAfter(passportExpiry, returnDate);
  checks.push({
    id: "return-to-uk",
    label: "Return to the UK",
    status: returnOk ? "pass" : "fail",
    detail: `As a British citizen you need a passport that is still valid on your return date (${human(returnDate)}). Yours expires ${human(passportExpiry)}.`,
  });

  const incomplete = checks.some((c) => c.status === "unknown");
  const ok = checks.every((c) => c.status === "pass");

  return { ok, incomplete, checks };
}
