# Design System Master File

> **LOGIC:** When building a specific page, first check
> `design-system/agesci-canicattini-1/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** AGESCI Canicattini 1
**Generated:** 2026-11-04 13:50:55
**Category:** Event Management

## Brand Identity Override

The repository's existing brand is authoritative over generated recommendations.
Preserve the AGESCI Canicattini 1 name, existing logo and texture assets, violet
and yellow palette, and current typography. Do not recolor or replace assets,
load a new font, introduce Tailwind, or add a dark theme as part of this design
system.

The skill's first style query (`live event presentation`) had no match. Its
retry (`vibrant colorful geometric`) returned **Vibrant & Block-based**,
**Memphis Design**, and **Minimalism & Swiss Style**. Use only the bold, clear
hierarchy and restrained block structure that fits the existing interface.
Reject its neon palette, continuous animated patterns, scroll snapping, and
highly playful Memphis effects. The generated hero-centric/marketing pattern
does not describe the multi-step setup or live presentation workflow; do not add
a sticky CTA or change established navigation.

The typography search returned no pairing suitable for this Italian product.
Retain Montserrat in the assembly tools and the existing Georgia/Palatino
display treatments; retain the home page's existing system-font body. The
`html-tailwind` search is not an implementation stack for this vanilla
HTML/CSS/JavaScript repository; only its general advice to reuse semantic
tokens is applicable.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#462678` | `--v` |
| On Primary | `#FFFFFF` | `--w` |
| Secondary | `#6B478D` | `--v2` |
| On Secondary | `#FFFFFF` | `--w` |
| Accent/CTA | `#FDC500` | `--y` |
| On Accent/CTA | `#211638` | `--vd` |
| Background (site/tools) | `#F4F1EA` | `--bg` |
| Background (presentation stage) | `#ECE9E6` | `--bg` in presentation scope |
| Foreground | `#211638` | `--vd` |
| Card / surface | `#FFFFFF` | `--w` |
| Muted text | `#6B478D` | `--v2` |
| Border | `#AEB0D9` | `--vl` |
| Destructive / error | `#E74030` | `--r` |
| Success | `#21A067` | `--g` |
| Ring | `#462678` | `--v` |

**Color Notes:** The palette and aliases above are already used by the project.
Keep the two existing background contexts distinct. Do not add a competing
`--color-*` palette. Verify each text/background pairing: measured ratios are
10.29:1 for `--v` on the site background, 6.40:1 for `--v2` on that background,
and 10.65:1 for `--vd` on `--y`. Existing `--g`, `--r`, and `--vl` are not
automatically suitable for small white text or essential boundaries; adjust
their component treatment while retaining the brand hue.

For compact status badges and action buttons, use the existing contrast-checked
variants `--g-strong` (`#176B46`) and `--r-strong` (`#B02A1F`) with white text;
use `--vd` text on `--o` or `--o-strong` for an indicator. Keep the original
status colors for charts and decorative uses.

### Typography

- **Interface Font:** Montserrat (already loaded by assembly tools)
- **Home Body Font:** system UI (existing)
- **Display Fonts:** Georgia/Palatino serif fallbacks (existing headings)
- **Mood:** clear, community-oriented, familiar, readable
- **Google Fonts:** keep the existing Montserrat stylesheet links; do not add
  font families or external font dependencies.

**Existing CSS font stacks:**
```css
font-family: Montserrat, system-ui, sans-serif;
font-family: system-ui, sans-serif;
font-family: Georgia, serif;
```

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` / `0.25rem` | Tight gaps |
| `--space-2` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-3` | `12px` / `0.75rem` | Compact component gaps |
| `--space-4` | `16px` / `1rem` | Standard component padding |
| `--space-6` | `24px` / `1.5rem` | Card and section padding |
| `--space-8` | `32px` / `2rem` | Large gaps |

These are additions for repeated spacing only; the CSS currently has no shared
spacing variables. Preserve the fixed measurements that size the presentation
stage and its slide layouts.

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-card` | `0 2px 10px rgba(33,22,56,0.08)` | Cards |
| `--shadow-raised` | `0 6px 22px rgba(33,22,56,0.16)` | Elevated controls and menus |
| `--shadow-overlay` | `0 10px 32px rgba(33,22,56,0.24)` | Dialogs |

Use the existing presentation shadow-color variables for the slide stage;
these complete shadow values apply to the site and admin surfaces.

---

## Component Specs

### Buttons

```css
/* Primary action: use existing .button / button conventions */
.button {
  background: var(--y);
  color: var(--vd);
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  transition: background-color 200ms ease, box-shadow 200ms ease;
  cursor: pointer;
}

.button:hover {
  background: var(--y);
  filter: brightness(0.96);
}

.button:focus-visible {
  outline: 3px solid var(--v);
  outline-offset: 3px;
}

/* Secondary actions remain visually quieter */
.button.secondary {
  background: transparent;
  color: var(--v);
  border: 2px solid var(--v);
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  transition: background-color 200ms ease, color 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: var(--w);
  border-radius: 16px;
  padding: 24px;
  box-shadow: var(--shadow-card);
  transition: box-shadow 200ms ease;
}

.card[role="button"]:hover,
a.card:hover {
  box-shadow: var(--shadow-raised);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid var(--vl);
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus-visible {
  border-color: var(--v);
  outline: 3px solid var(--v);
  outline-offset: 2px;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--w);
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-overlay);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Vibrant & Block-based

**Keywords:** Bold, energetic, playful, block layout, geometric shapes, high color contrast, duotone, modern, energetic

**Best For:** Startups, creative agencies, gaming, social media, youth-focused, entertainment, consumer

**Key Effects:** Clear hierarchy, generous grouping, restrained hover/focus
feedback, and short transitions (150-250ms). Keep presentation motion subtle;
avoid continuous decorative animation and scroll snapping.

### Workflow Pattern

**Pattern Name:** Task-focused assembly and presentation tools

- **Flow:** Preserve the existing sequence: public home → reserved access →
  setup or regia → live presentation. Maintain clear status and next actions
  during each task.
- **CTA Placement:** One visually prominent action per task area; retain the
  existing navigation and action locations in the setup and regia.
- **Section Order:** Keep each existing workflow's order and status context;
  this marketing-page section sequence does not apply to the admin tools.

---

## Anti-Patterns (Do NOT Use)

- Do not replace the existing access/setup workflow with a marketing signup
  pattern or introduce a countdown absent from the product.

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y
- ❌ **Unverified dark mode** — The repository currently implements a light
  theme only; do not claim dark-mode support.
- ❌ **Color-only status** — Include visible text or another non-color cue for
  live, warning, error, and success states.
- ❌ **Motion without preference support** — Respect `prefers-reduced-motion`
  for decorative transitions and animations.

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
