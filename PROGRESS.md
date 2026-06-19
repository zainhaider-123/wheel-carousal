# Vanilla JS Carousel Conversion Progress

## Goal
Convert the existing GSAP-based wheel carousel in `main.js` to pure vanilla JavaScript with **no external libraries or CDNs**, using a top-level `config` object for customization.

## Files changed
- `index.html` – unchanged (already loads only `main.js`)
- `style.css` – added transition states and toggle classes
- `main.js` – fully rewritten in vanilla JS
- `PROGRESS.md` – this file

## Completed work
- [x] Explored original GSAP implementation (`MotionPathPlugin`, `Draggable`, `gsap.utils.*`, tweens)
- [x] Created a `config` object at the top of `main.js` for carousel customization:
  - `boxColors`, `activeColor`
  - `pathRadius`, `pathTopOffset`, `visibleBoxes`, `boxSpacing`
  - `normalScale`, `hoverScale`, `activeScale`
  - `animationDurationMs`, `useBackEase`
  - `showOverflow`, `showPath`
- [x] Replaced GSAP utilities with small vanilla helpers (`toArray`, `wrap`, `normalize`, `snap`, `clamp`, `easeOutBack`)
- [x] Replaced `gsap.to`/`gsap.timeline` with a tiny `requestAnimationFrame` tween engine
- [x] Replaced `MotionPathPlugin` with pure math (circular arc) and manual tangent angle
- [x] Replaced `Draggable` with native `pointerdown`/`pointermove`/`pointerup` events
- [x] Replaced hover/click tweens with state-driven `renderCarousel()` + CSS transitions
- [x] **Path alignment fix**: boxes are translated by the SVG's actual offset inside `.wrapper`, so they sit exactly on the generated arc path
- [x] **Centering fix**: arc is recalculated relative to wrapper width/height; initial progress centers the middle box
- [x] Window resize recalculates arc and re-renders carousel
- [x] Wired prev/next buttons and overflow/path toggle
- [x] Boxes are read from static HTML (no dynamic `.box` creation)
- [x] Browser testing skipped per user request

## How to verify locally
1. Open the project in any static server (e.g. VS Code Live Server on `http://localhost:5500`).
2. Open `index.html` in a browser.
3. Confirm:
   - Boxes appear along the arc path.
   - Clicking a box centers it and turns it red.
   - Hover scales a box up.
   - Prev/Next buttons rotate the carousel.
   - Dragging left/right rotates the carousel and snaps to a box on release.
   - "Show path" reveals the SVG arc.
   - "Show overflow" reveals boxes outside the wrapper bounds.

## Notes
- The original GSAP back-out ease is replicated with the standard `c1 = 1.70158` back-out formula.
- The generated SVG arc matches the original: radius 1280, arc span = `numBoxes * 2 * positionAngleInDegrees`.
- Drag bounds match the original (`positionStep` to `1 - positionStep`).
