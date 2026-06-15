# ADR-018 — Network policy: opt-in market-price feed

- **Status** : Accepted
- **Date** : 2026-06-15
- **Category** : Architecture, Security, Network
- **Related** : ADR-002 (privacy-first local), ADR-009 Amendment 2 §5 (reserved this slot) and
  Amendment 3 (activates investment tracking), ADR-017 (user-managed encrypted sync folder)

## Context

Investment tracking (ADR-009 Amendment 3) wants, in its Phase B, to auto-value securities that
have a public quote — e.g. the maintainer's PEA MSCI World fund — instead of typing the value by
hand each month. That requires fetching a price series from an external provider: the first
outbound call that carries any hint about what the user holds.

ADR-009 Amendment 2 §5 reserved this ADR ("network policy") for exactly this decision and set a
strict bar: opt-in, main-process only, and **structurally unable to reveal user data — bulk
fetch, never per-asset queries**. That bar was written when the product still imagined a market
of privacy-maximalist users.

That premise no longer holds. The product has **one deliberate user, the maintainer**, and no
external users (Amendment 1/2). The "no data leaves" promise is, today, a promise the maintainer
makes to himself plus a public-repo positioning statement — not an obligation to a user base. And
the concrete leak is tiny: requesting the price of a **mainstream** instrument (an MSCI World
ETF) tells a quote provider only that _someone_ looked up an index millions of people track. A
genuinely identifying leak would require a niche, personally-revealing ISIN — which the
maintainer does not hold.

## Decision

1. **An opt-in, off-by-default market-price feed is allowed**, from the **main process only**
   (never the renderer; the renderer CSP stays `'self'`). It is the second sanctioned outbound
   call, alongside the opt-in version check (ADR-002).

2. **Per-instrument quote queries are permitted** — this **supersedes** the "bulk fetch, never
   per-asset queries" line of ADR-009 Amendment 2 §5, for this feed. The request sends only an
   **instrument identifier** (ISIN/ticker) plus the unavoidable IP/User-Agent. It sends **no**
   balances, amounts, quantities, account names, or anything about the user's position size —
   only _which publicly-traded instrument_ to price. The response is a price series.

3. **Default OFF.** The app is fully functional offline: every support can be valued by declared
   value (Phase A). Enabling the feed is an explicit, reversible user action. The settings
   surface states **exactly** what is sent and to whom before the first call.

4. **Honesty over absolutism.** While the feed is OFF, "privé par défaut / 100% local" holds to
   the letter — the default ships zero financial-adjacent traffic. README and privacy copy are
   updated in the same change that ships the feed to state that an opt-in price feed exists and
   precisely what it transmits. (Doc/reality drift is this project's known failure mode; the
   claim must never outrun the code.)

5. **No identity-bound credentials** if avoidable: prefer a provider reachable without an
   account/API key tied to the user. Provider choice is finalised when Phase B is built; nothing
   here commits to one.

## Alternatives considered

- **Bulk price file (download a whole index/provider list, filter locally).** Preserves the
  original "never per-asset" guarantee — the provider cannot tell which instrument the user
  cares about. Rejected as the _default_ because such bulk files are often unavailable for
  arbitrary funds/ETFs and are heavy for one instrument; kept as a **future option** a
  privacy-maximalist deployment could prefer.
- **No feed, manual quotes forever.** This is exactly the OFF state — fully supported, and the
  recommended posture for anyone who wants zero outbound traffic.

## Consequences

- ADR-002 is amended to list this feed among the allowed outbound calls.
- The data-not-packets invariant is preserved in spirit: **no financial data leaves the
  machine** — only public-instrument identifiers, and only for holdings the user explicitly chose
  to value online. Balances, flows, and net worth never transit.
- A privacy-maximalist user (or the maintainer, any day) keeps the feed off and types quotes; the
  product is whole without it.
- This ADR governs **only** the price feed. Any further outbound class (benchmark series, etc.)
  needs its own decision under the same opt-in, main-only, no-financial-data bar.
