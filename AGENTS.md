# TX-6 Remote Control

A web-based remote control for the Teenage Engineering TX-6 mixer with MIDI over Bluetooth LE and USB.

## Tech Stack

- **Framework**: Vanilla JS with Alpine.js for reactivity
- **Build**: Vite
- **Styling**: Plain CSS with CSS variables for theming
- **Fonts**: Manrope (variable font, self-hosted in `/public/fonts/`)
- **Deployment**: GitHub Pages via GitHub Actions

## Project Structure

```
tx6/
├── index.html          # Single page app, all views in one file
├── src/
│   ├── main.js         # Alpine.js components, MIDI controller, LFO engine
│   └── style.css       # All styles, CSS variables for theming
├── public/
│   ├── fonts/          # Manrope-VF.woff2
│   ├── service-worker.js   # PWA offline support
│   ├── timing-processor.js # AudioWorklet for precise timing
│   └── manifest.json   # PWA manifest
├── scripts/
│   └── screenshot.js   # Playwright script to generate og image
└── .github/
    └── workflows/      # GitHub Actions for deployment
```

## Key Patterns

### Theming
- CSS variables in `:root` and `.dark-theme`
- Theme toggle cycles: system → light → dark
- Font: Manrope with weights 200, 500, 600

### Canvas Rendering
- Always handle `devicePixelRatio` for HiDPI displays
- Use 0.5px offset for crisp 1px lines
- Sample points should scale with DPR
- Use Manrope font in canvas text: `ctx.font = '500 11px Manrope, sans-serif'`

### Fonts
- Use `font-variant-numeric: tabular-nums` for values that change
- Local @font-face, no external font services

### Service Worker
- Cache version updated on build via `prebuild` script
- Network-first for HTML/CSS/JS, cache-first for assets
- Supports "update available" notification

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (updates SW cache version)
npm run screenshot   # Generate og image
npm run test         # Run tests with vitest
```

## OG Image

- Size: 1200x630 (standard OpenGraph)
- Generated via Playwright in `scripts/screenshot.js`
- Stored in `public/tx6-og-1200.jpg`
- Uses Git LFS for binary files (see `.gitattributes`)

## Related Projects

- [OP1-LFO](https://op1.psimyn.com) - Similar app for OP-1 Field
