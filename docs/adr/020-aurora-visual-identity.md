# ADR-020 — Adopt the Aurora visual identity

- **Status** : Accepted
- **Date** : 2026-06-16
- **Category** : UI
- **Supersedes** : the "editorial" visual identity defined in the design spec
  `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` (visual sections only)

## Context

The app shipped with an "editorial" identity: Instrument-Serif italic signature
figures, a warm cream-on-ink palette (paper / ink / brass), flat opaque cards. A
full external UI/UX redesign — **Aurora** — was commissioned: a deep glass canvas,
a single vivid accent, **bold Geist** figures, soft motion, and a **light theme** in
addition to dark.

Aurora is delivered as a handoff (`design_handoff_aurora`) that keeps every existing
CSS variable **name** and changes only their **values**, so the bulk of the reskin is
a token swap rather than a component rewrite. The handoff also proposes structural and
UX changes per screen (bento dashboard, richer transactions, an import hub, …), scoped
separately in `docs/superpowers/specs/2026-06-16-aurora-redesign-design.md`.

This is a global, hard-to-reverse change of visual direction, so it warrants a decision
record. The product scope (ADR-009) and the privacy invariant (ADR-002) are **not**
affected.

## Decision

1. **Adopt Aurora as the app's visual identity**, retiring the editorial identity.
   Instrument Serif is removed; signature figures become **bold Geist**. The serif-`ƒ`
   brand mark is replaced by the rising-line mark.
2. **Ship a dark + light theme**, switchable via a `data-theme` attribute on `<html>`,
   persisted locally. **Lime is the only accent** — the handoff's violet / cyan / coral
   `data-accent` variants and the accent-swatch UI are **not** shipped (YAGNI for a
   single-user app; reintroducible later since the variant CSS exists upstream).
3. **Implement the look via a token swap**: replace the `globals.css` token block with
   Aurora values (same variable names) and merge additive Tailwind keys; introduce glass
   `.tile` / `.aurora-bg` primitives. ~90% of the app reskins with no component edits.
4. **`main` is authoritative over the handoff for behaviour.** The handoff governs the
   _look & feel_ only; where it describes features that already exist, exist differently,
   or were removed, the real code wins (see the reconciliation table in the redesign spec).

## Alternatives considered

- **Keep the editorial identity.** Rejected: the maintainer commissioned and validated
  the Aurora direction; the editorial serif look is being retired deliberately.
- **Ship the full theme/accent switcher (2 themes × 4 accents).** Rejected as YAGNI for
  one user — 8 combinations to validate per screen for no real benefit. Dark + light with
  a fixed lime accent covers the actual need.
- **One big-bang reskin PR.** Rejected: un-reviewable and un-bisectable, against the MVP
  light-PR-gate. The work is sequenced look-first then screen-by-screen.

## Consequences

- **Easier:** a single token swap reskins most of the app; future palette tweaks stay in
  one CSS file; a light theme finally exists (the old `:root` was dark-only and the
  "Clair" option was a stub).
- **Harder / new risks:** glass surfaces use `backdrop-filter`, which has a GPU cost and
  fractional-width measurement pitfalls under Electron/WSLg (mitigated by the chart
  `ResizeObserver` rounding guard). Every token must now be validated in **both** themes —
  the pre-existing light-theme sidebar contrast bug shows the light path was never
  exercised. Motion must stay reduced-motion safe (transform/opacity from-states only).
- **Privacy (ADR-002) unchanged:** the only new stateful bit is the theme choice, stored
  locally; zero network, CSP stays `'self'`.
- **Docs:** the visual sections of the `2026-05-14` design spec are rewritten to Aurora in
  the same doc PR, and the out-of-repo `finance-dashboard-design` skill is updated to match.

> Not reflected in the README (no stack / persistence / model change). The design spec and
> the `finance-dashboard-design` skill are the surfaces updated alongside this ADR.
