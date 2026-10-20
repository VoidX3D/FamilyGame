---
name: Frontend Motion
description: Use when adding transitions, reveals, score pops, or scroll effects with the vendored GSAP and Lenis builds. Covers mobile-safe timing, reduced motion, and cleanup.
---

# Frontend Motion

Vendored files — do not add a bundler:

- `web/vendor/gsap.min.js` — GSAP 3.15
- `web/vendor/lenis.min.js` + `lenis.css` — Lenis 1.3

Load them once in `index.html` / `admin.html` with `defer`, before `app.js`.

## Non-negotiables

- Animate `transform` and `opacity` only. Never animate layout properties.
- UI timing: 150–400 ms. A full-screen reveal may reach 500 ms.
- Respect `prefers-reduced-motion: reduce`; jump to the final state.
- Never block the primary action while an animation runs.
- Kill timelines on screen teardown: `timeline.kill()`, `gsap.killTweensOf(...)`.
- No Lenis on game screens. Players use native scrolling. Lenis is only for long landing/admin pages, if used at all.
- One hero animation per screen. Do not stagger every element on every render.
- Never delay a private card so long that the player cannot read their secret.

## Screen transition

```js
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function enterScreen(root) {
  if (reduce) return;
  gsap.from(root, {
    autoAlpha: 0,
    y: 14,
    duration: 0.28,
    ease: "power2.out",
    clearProps: "all",
  });
}
```

## List stagger

Cap the stagger. Long lists should not take a second to appear.

```js
gsap.from("[data-stagger]", {
  autoAlpha: 0,
  y: 10,
  duration: 0.25,
  stagger: 0.03,
  ease: "power2.out",
  clearProps: "all",
});
```

## Score or number pop

```js
gsap.fromTo(
  "[data-score]",
  { scale: 0.8 },
  { scale: 1, duration: 0.35, ease: "back.out(2)", clearProps: "transform" },
);
```

## Reduced motion helper

```js
const motionOK = !matchMedia("(prefers-reduced-motion: reduce)").matches;
```

## Lenis (optional, long pages only)

```js
if (motionOK && !matchMedia("(pointer: coarse)").matches) {
  const lenis = new Lenis({ smoothWheel: true, syncTouch: false });
  const raf = (time) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  // call lenis.destroy() and cancel the RAF when leaving the page
}
```

## Review checklist

- 360 px wide phone, low-end Android, reduced motion enabled.
- Tap the main button during the animation: it must respond.
- Change screens twice: no duplicate timelines, no stuck opacity.
- No horizontal scroll caused by transforms.
