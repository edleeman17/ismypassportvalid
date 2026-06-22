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
  /** Passed, but with very little margin (see TIGHT_DAYS). UI flags it amber. */
  tight?: boolean;
}

export interface Verdict {
  /** true only if every applicable check passed and none are unknown. */
  ok: boolean;
  /** true if a result could not be computed (e.g. missing issue date). */
  incomplete: boolean;
  /** true if the verdict is a pass but at least one check only just scraped through. */
  tight: boolean;
  checks: Check[];
}

/** A passing check with this many days of slack (or fewer) is flagged "cutting it close". */
export const TIGHT_DAYS = 7;

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

/** Whole days from b to a (a - b). Positive when a is later. */
function daysBetween(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
}

function marginNote(days: number): string {
  return ` ⚠ That's only ${days} day${days === 1 ? "" : "s"} of margin — renew before you travel to avoid being turned away.`;
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
  const validMargin = daysBetween(passportExpiry, requiredUntil);
  const validTight = validOk && validMargin <= TIGHT_DAYS;
  const anchorWord = rule.anchor === "departure" ? "you leave" : "you arrive in";
  const bufferText =
    rule.validBeyondDays != null
      ? `${rule.validBeyondDays} days`
      : `${rule.validBeyondMonths} month${rule.validBeyondMonths === 1 ? "" : "s"}`;
  checks.push({
    id: "destination-validity",
    label: `${country.name} entry — passport validity`,
    status: validOk ? "pass" : "fail",
    tight: validTight,
    detail:
      (hasBuffer
        ? `Needs to be valid until at least ${human(requiredUntil)} (${bufferText} after ${anchorWord} ${country.name}). Yours expires ${human(passportExpiry)}.`
        : `Needs to be valid for your whole stay. Yours expires ${human(passportExpiry)}.`) +
      (validTight ? marginNote(validMargin) : ""),
  });

  // 2. Issue-date rule (only if the country has one).
  if (rule.issuedWithinYears) {
    if (passportIssue) {
      const issueDeadline = addYears(passportIssue, rule.issuedWithinYears);
      const issueOk = onOrAfter(issueDeadline, outboundDate);
      const issueMargin = daysBetween(issueDeadline, outboundDate);
      const issueTight = issueOk && issueMargin <= TIGHT_DAYS;
      checks.push({
        id: "destination-issue",
        label: `${country.name} entry — issue date`,
        status: issueOk ? "pass" : "fail",
        tight: issueTight,
        detail:
          `Must have been issued less than ${rule.issuedWithinYears} years before you arrive (${human(outboundDate)}). Yours was issued ${human(passportIssue)}.` +
          (issueTight ? marginNote(issueMargin) : ""),
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
  const returnMargin = daysBetween(passportExpiry, returnDate);
  const returnTight = returnOk && returnMargin <= TIGHT_DAYS;
  checks.push({
    id: "return-to-uk",
    label: "Return to the UK",
    status: returnOk ? "pass" : "fail",
    tight: returnTight,
    detail:
      `As a British citizen you need a passport that is still valid on your return date (${human(returnDate)}). Yours expires ${human(passportExpiry)}.` +
      (returnTight
        ? ` ⚠ It expires within ${TIGHT_DAYS} days of your return — airlines may refuse to board you. Renew before you travel.`
        : ""),
  });

  const incomplete = checks.some((c) => c.status === "unknown");
  const ok = checks.every((c) => c.status === "pass");
  const tight = ok && checks.some((c) => c.tight);

  return { ok, incomplete, tight, checks };
}
