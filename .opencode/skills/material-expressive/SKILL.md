---
name: Material Expressive UI
description: Use when styling screens, components, or design tokens for the Family Game Hub. Implements Material 3 Expressive ideas in plain CSS without the Material Web component library.
---

# Material Expressive UI

Material 3 Expressive is a design language, not a dependency. Implement it with CSS custom properties and plain HTML. Do **not** add `@material/web`, Lit, or a bundler without explicit approval.

## Tokens

Put these on `:root` in `web/styles.css`:

```css
:root {
  --bg: #0b1220;
  --surface: #111a2b;
  --surface-2: #18233a;
  --surface-3: #22304c;
  --on-surface: #f4f1ff;
  --on-surface-muted: #aeb8d0;
  --outline: #3b4a66;

  --primary: #ff8a6b;
  --on-primary: #2a0b04;
  --primary-container: #5a1f12;
  --on-primary-container: #ffdbd2;

  --secondary: #5eead4;
  --on-secondary: #00201c;
  --tertiary: #c4b5fd;
  --error: #ffb4ab;

  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 28px;
  --radius-pill: 999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 180ms;
  --duration-base: 280ms;
  --duration-slow: 420ms;
}
```

Use tonal layers (`surface`, `surface-2`, `surface-3`) instead of heavy shadows. Shadows are soft and rare.

## Type scale

| Role | Size / line-height | Weight |
|---|---|---|
| Display | 32 / 38 | 800 |
| Headline | 26 / 32 | 750 |
| Title | 20 / 26 | 650 |
| Body | 16 / 24 | 450 |
| Label | 14 / 20 | 600 |
| Caption | 12 / 16 | 500 |

- Tight letter-spacing on display text (`-0.02em`).
- Body text never below 16 px on mobile.
- Use `font-variant-numeric: tabular-nums` for scores and numbers.
- Nepali fallback: `"Noto Sans Devanagari", "Mangal", sans-serif`; line-height 1.6; never all-caps.

## Shape and layout

- Cards: `--radius-lg` (28 px), generous padding (20–24 px).
- Buttons: pill (`--radius-pill`), min height 48 px.
- Inputs: 18 px radius, 52 px height, 16 px text.
- Chips: pill, tonal background, no border unless selected.
- Expressive accents: oversized numerals, sticker-like category chips, one organic blob per screen (SVG or `::before`), not on every card.
- 8 px spacing grid. Screen padding 16–20 px, plus safe-area insets.
- One clear primary action per screen; secondary actions are text or tonal buttons.

## Components

- **Filled button:** primary background, on-primary text, no gradient.
- **Tonal button:** `surface-3` background, on-surface text.
- **Card:** surface-2, 1 px outline at low opacity, 28 px radius.
- **Private card:** darker surface, primary border, "Only you" label, large reveal button.
- **Dialog/sheet:** bottom sheet on mobile, 28 px top corners, drag handle.
- **Waiting state:** player avatars/chips plus "3 of 7 ready", not a lone spinner.
- **Results:** one oversized answer/score, then supporting detail, then next action.

## Motion

- Use `--ease-emphasized` for movement, `--ease-spring` for playful pops.
- 180–420 ms. Never animate text size or layout.
- Respect `prefers-reduced-motion`.
- Use the `frontend-motion` skill for GSAP patterns.

## Accessibility

- Contrast at least 4.5:1 for body text, 3:1 for large text.
- Visible `:focus-visible` ring: 2 px `--secondary`, 2 px offset.
- Tap targets at least 48×48 px, with 8 px gaps.
- Never rely on color alone; pair it with a label or icon.
- Motion and sound are optional enhancements.

## Anti-patterns

- Generic purple/blue gradient backgrounds.
- Glassmorphism on every surface.
- More than three accent colors on one screen.
- Tiny uppercase labels everywhere.
- Animating every list item on every state update.
