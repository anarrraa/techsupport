# Tech Success product context

## Register

product

## Users

Internal support staff and managers reviewing Jira SLA observations and monthly
reports. The application supports Mongolian and English. Client login is not
implemented; the unauthenticated backend stays on localhost.

## Product Purpose

Make stored Jira SLA observations understandable and exportable without
recalculating Jira clocks or implying missing history is complete compliance.
See `for-agents/prd-monthly-dashboard.md` and `for-agents/roadmap.md` for scope.

## Brand Personality

Factual, restrained, readable. Preserve the existing Tech Success identity and
`for-agents/design-system-dashboard.md`; this work introduces no new branding.

## Anti-references

Invented metrics, mock results presented as real, decorative status effects,
color-only SLA signals, and unavailable features presented as working controls.

## Design Principles

- State the observation period and coverage alongside results.
- Use existing navigation, typography, semantic colors, and familiar controls.
- Make the selected reporting month consistent across screen and exports.
- Make empty, loading, and failure states actionable and truthful.

## Accessibility & Inclusion

The existing design system requires WCAG AA text contrast, visible keyboard
focus, 44px interaction targets, text with status colors, MN/EN labels, responsive
layouts, and light/dark themes. Respect reduced-motion preferences.
