# Is My Passport Valid?

A free tool that tells a **British citizen** passport holder whether their passport
is valid for a trip — checking the destination's entry rules **and** the return
to the UK — with an obvious yes/no and the official gov.uk source alongside.

**Live:** https://ismypassportvalid.co.uk

## Privacy

Your passport dates never leave your browser. The verdict is computed entirely
client-side — no passport data is sent to a server, logged or stored. Analytics
are cookieless (self-hosted Plausible), so there's no consent banner and no
tracking. This repository is public so you can verify all of that for yourself.

## How it works

- **Curated rules.** Each destination's passport rule is taken from the official
  [gov.uk foreign travel advice](https://www.gov.uk/foreign-travel-advice)
  entry-requirements page and stored as a structured rule in
  [`src/countries.json`](src/countries.json) (how long the passport must stay
  valid, whether it's measured from arrival or departure, and any issue-date
  rule), with the exact gov.uk URL, a quote and a `lastVerified` date.
- **Verdict logic.** [`src/verdict.ts`](src/verdict.ts) is pure and unit-tested
  ([`tests/verdict.test.ts`](tests/verdict.test.ts)). It checks the destination
  validity rule, the issue-date rule where one applies, and the return-to-UK
  leg, and flags passes that only just scrape through.
- **Live wording.** Each result can fetch the current gov.uk entry-requirements
  text through a thin proxy ([`functions/api/advice/[country].ts`](functions/api/advice/%5Bcountry%5D.ts))
  so you can self-verify against the source.
- **SEO pages.** [`scripts/prerender.mjs`](scripts/prerender.mjs) generates a
  static page per country and per searchable place/island, plus the homepage,
  an About page, an EES/ETIAS guide and the sitemap.
- **Schengen calculator.** A separate [90/180-day calculator](https://ismypassportvalid.co.uk/schengen-calculator/)
  ([`src/schengen.ts`](src/schengen.ts)).

## Not official advice

Entry rules change and this tool may be out of date or wrong. Always confirm on
gov.uk and with your airline before you travel. See [the About page](https://ismypassportvalid.co.uk/about/).

## Develop

```bash
npm install
npm run dev        # vite dev server
npm test           # vitest (verdict logic)
npm run build      # tsc + vite build + prerender
```

## Project structure

```
index.html                     # main app shell
schengen-calculator/index.html # calculator entry
src/
  main.ts          # form, combobox, render
  verdict.ts       # pure verdict logic (tested)
  schengen.ts      # 90/180 calculator
  countries.json   # curated gov.uk rules (the heart of accuracy)
  aliases.json     # cities/islands/airport codes -> country
  travel.json      # per-country power/climate/drivable flags
  visa.json        # curated visa notes
  affiliate.ts     # contextual Amazon links
functions/api/advice/[country].ts  # gov.uk proxy (Cloudflare Pages Function)
scripts/prerender.mjs              # static page + sitemap generation
```

## Contributing

Rule accuracy is the whole point, and a wrong rule is the one dangerous failure.
If you change a rule in `countries.json`:

1. Verify it against that country's live gov.uk entry-requirements page.
2. Keep the `sourceUrl` and `quote` matching what gov.uk actually says.
3. Update `lastVerified` to the date you checked.

Watch the gov.uk slug too — some differ from the obvious name (`czechia`,
`netherlands`, `usa`, `united-arab-emirates`).

## Licence

[MIT](LICENSE). Entry-rule text is public sector information from gov.uk, licensed
under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
