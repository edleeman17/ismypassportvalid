import { describe, it, expect } from "vitest";
import { addMonths, addYears, computeVerdict, type Country } from "../src/verdict";

const spain: Country = {
  name: "Spain",
  govukSlug: "spain",
  zone: "schengen",
  rule: { validBeyondMonths: 3, anchor: "departure", issuedWithinYears: 10 },
  quote: "...",
  sourceUrl: "https://www.gov.uk/foreign-travel-advice/spain/entry-requirements",
  lastVerified: "2026-06-22",
};

const usa: Country = {
  name: "United States",
  govukSlug: "usa",
  rule: { validBeyondMonths: 0, anchor: "departure" },
  quote: "...",
  sourceUrl: "https://www.gov.uk/foreign-travel-advice/usa/entry-requirements",
  lastVerified: "2026-06-22",
};

const sixMonthArrival: Country = {
  name: "Thailand",
  govukSlug: "thailand",
  rule: { validBeyondMonths: 6, anchor: "arrival" },
  quote: "...",
  sourceUrl: "https://www.gov.uk/foreign-travel-advice/thailand/entry-requirements",
  lastVerified: "2026-06-22",
};

describe("date helpers", () => {
  it("adds months", () => {
    expect(addMonths("2026-06-22", 3)).toBe("2026-09-22");
  });
  it("clamps end-of-month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("adds years", () => {
    expect(addYears("2016-06-22", 10)).toBe("2026-06-22");
  });
});

describe("Spain (Schengen) — 3 months after departure + 10yr issue", () => {
  it("passes when comfortably valid", () => {
    const v = computeVerdict({
      passportExpiry: "2027-06-01",
      passportIssue: "2020-01-01",
      outboundDate: "2026-08-01",
      returnDate: "2026-08-15",
      country: spain,
    });
    expect(v.ok).toBe(true);
    expect(v.incomplete).toBe(false);
  });

  it("fails when within 3 months of return date", () => {
    const v = computeVerdict({
      passportExpiry: "2026-09-30", // return 15 Aug + 3mo = 15 Nov; expires before that
      passportIssue: "2020-01-01",
      outboundDate: "2026-08-01",
      returnDate: "2026-08-15",
      country: spain,
    });
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "destination-validity")?.status).toBe("fail");
  });

  it("fails the 10-year issue rule", () => {
    const v = computeVerdict({
      passportExpiry: "2027-06-01",
      passportIssue: "2016-07-01", // +10yr = 1 Jul 2026, arrival 1 Aug 2026 -> too old
      outboundDate: "2026-08-01",
      returnDate: "2026-08-15",
      country: spain,
    });
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "destination-issue")?.status).toBe("fail");
  });

  it("is incomplete without issue date", () => {
    const v = computeVerdict({
      passportExpiry: "2027-06-01",
      outboundDate: "2026-08-01",
      returnDate: "2026-08-15",
      country: spain,
    });
    expect(v.incomplete).toBe(true);
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "destination-issue")?.status).toBe("unknown");
  });
});

describe("USA — must be valid for duration of stay", () => {
  it("passes when valid past return", () => {
    const v = computeVerdict({
      passportExpiry: "2026-12-01",
      outboundDate: "2026-08-01",
      returnDate: "2026-08-20",
      country: usa,
    });
    expect(v.ok).toBe(true);
  });
});

describe("6-month-on-arrival country (Thailand)", () => {
  it("anchors on outbound date", () => {
    const v = computeVerdict({
      passportExpiry: "2027-02-15", // arrival 1 Aug + 6mo = 1 Feb 2027 -> ok
      outboundDate: "2026-08-01",
      returnDate: "2026-08-20",
      country: sixMonthArrival,
    });
    expect(v.checks.find((c) => c.id === "destination-validity")?.status).toBe("pass");
  });

  it("fails when under 6 months from arrival", () => {
    const v = computeVerdict({
      passportExpiry: "2026-11-01", // arrival 1 Aug + 6mo = 1 Feb 2027 -> fail
      outboundDate: "2026-08-01",
      returnDate: "2026-08-20",
      country: sixMonthArrival,
    });
    expect(v.ok).toBe(false);
  });
});

describe("return-to-UK leg", () => {
  it("fails when passport expires before return", () => {
    const v = computeVerdict({
      passportExpiry: "2026-08-10",
      outboundDate: "2026-08-01",
      returnDate: "2026-08-20",
      country: usa,
    });
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "return-to-uk")?.status).toBe("fail");
  });

  it("passes but flags tight when passport expires on the return date", () => {
    const v = computeVerdict({
      passportExpiry: "2026-08-20",
      outboundDate: "2026-08-01",
      returnDate: "2026-08-20",
      country: usa,
    });
    expect(v.ok).toBe(true); // legally valid up to and including the expiry date
    expect(v.tight).toBe(true); // ...but only just — cutting it close
    expect(v.checks.find((c) => c.id === "return-to-uk")?.tight).toBe(true);
  });

  it("does not flag tight with comfortable margin", () => {
    const v = computeVerdict({
      passportExpiry: "2027-06-01",
      outboundDate: "2026-08-01",
      returnDate: "2026-08-20",
      country: usa,
    });
    expect(v.ok).toBe(true);
    expect(v.tight).toBe(false);
  });
});
