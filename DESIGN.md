---
version: "alpha"
name: "Chalkboard"
description: "Chalkboard-style landing page. Ideal for education, tutoriais, restaurants, projetos nostálgicos, menus criativos. AI-ready template."
colors:
  primary: "#2D4A3E"
  secondary: "#1A1A2E"
  tertiary: "#F5F5DC"
  neutral: "#FFF59D"
  surface: "#F48FB1"
  accent: "#81D4FA"
typography:
  h1:
    fontFamily: Caveat
    fontSize: 2.25rem
    fontWeight: 700
  body-md:
    fontFamily: Caveat
    fontSize: 1rem
    fontWeight: 400
  label-caps:
    fontFamily: Caveat
    fontSize: 0.75rem
    fontWeight: 500
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    padding: 12px
---

## Overview

Chalkboard-style landing page. Ideal for education, tutoriais, restaurants, projetos nostálgicos, menus criativos. AI-ready template. Chalkboard lettering is one of the few typographic traditions that never fully migrated to digital — and that's precisely what makes it powerful. Before vinyl signage and LED menus, every café, schoolroom, and butcher shop communicated through chalk on slate. The medium forced economy: you wrote what mattered, erased what didn't, and the impermanence was the point. There's a reason blackboards survived the overhead projector, the whiteboard, and the smartboard in cultural memory.

The craft revival of the 2010s turned chalkboard art into a full discipline — Dana Tanamachi's work for Google and Starbucks proved that hand-drawn chalk could hold its own against any polished brand system. But the aesthetic predates that moment by centuries. Victorian pub signs, French bistro menus, one-room schoolhouses — chalk was the original responsive medium. It adapted to whatever surface and whatever message the day demanded.

What designers often miss: chalkboard isn't nostalgic decoration. It's a signal of impermanence, craft, and human presence. When you deploy it, you're telling people that this message was made by a hand, today, for them.

- Density: 5/10 — Balanced
- Variance: 8/10 — Expressive
- Motion: 8/10 — Cinematic

- **Style:** Hand-drawn, Educational, Textured, Nostalgic
- **Keywords:** chalkboard, chalk, blackboard, hand-drawn, sketch, educational, classroom, texture, dusty, white on dark
- **Era:** Timeless / Educational
- **Light/Dark:** ✗ No / ✓ Only

## Colors

- **Chalkboard Green** (#2D4A3E) — Primary surface or dominant color
- **Deep Slate** (#1A1A2E) — Secondary surface or text color
- **Chalk White** (#F5F5DC) — Light surface, card backgrounds
- **Pastel Chalk Yellow** (#FFF59D) — Warning states, attention indicators
- **Chalk Pink** (#F48FB1) — Primary text color
- **Chalk Blue** (#81D4FA) — Secondary accent
- **Chalk Orange** (#FFAB91) — Warm accent, call-to-action secondary


## Typography

- **Display / Hero:** Caveat — Weight 700, tight tracking, used for headline impact
- **Accent:** cursive or handwriting fonts — Used for decorative or emphasis text
- **Body:** Caveat — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Caveat — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem


## Layout

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Asymmetric composition.
- **Feature sections:** Asymmetric grid with varied card sizes. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).


## Elevation & Depth

Chalk-like text rendering with text-shadow glow, rough/grainy background texture via CSS noise, hand-drawn border style (dashed/irregular), subtle dust particle animation, sketch-style illustrations via SVG filters

- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
- **Entry animations:** Fade + translate-Y (16px → 0) over 540ms ease-out. Staggered cascades for lists: 120ms between items.
- **Hover states:** Scale(1.03) + shadow lift over 200ms.
- **Page transitions:** Fade + slide (300ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.


## Shapes

Base corner radius: 8px. See rounded tokens in front matter for the full scale.


## Components

- **Primary Button:** Subtly rounded (0.5rem) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Subtly rounded (0.5rem) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.


## Do's and Don'ts

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No pure white (#FFFFFF) backgrounds — use off-white or dark surfaces
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

- Do Dark chalkboard background
- Do Chalk-like white text with glow
- Do Hand-drawn dashed borders
- Do Grainy texture overlay
- Do Pastel chalk accent colors
- Do Handwriting-style typography


## Use Case

Education, Tutorials, Restaurants, Nostalgic projects, Creative menus

<!-- Source: https://designmd.app/library/chalkboard · designmd.app -->

---

## Split-wise Adaptations (approved 2026-10-01)

These override the sections above for this app. They exist so the design meets SPEC.md §11 (mobile and accessibility) and WCAG AA.

**Colour roles** (contrast measured on Chalkboard Green `#2D4A3E`):
- **Page:** Chalkboard Green with a CSS grain texture. Dark only (`color-scheme: dark`).
- **Body text:** Chalk White `#F5F5DC` (8.8:1). Secondary text is muted chalk `#C9C9B0` (5.8:1).
- **Headings and large accents:** Chalk Pink `#F48FB1`, with a soft chalk glow. Pink is *not* used for body text, because it measures 4.4:1, below AA.
- **Interactive accent:** Chalk Blue `#81D4FA`, used for links, focus rings and active nav (5.9:1).
- **Primary button:** a Chalk Blue fill with Deep Slate `#1A1A2E` text (10.3:1). This follows the Components section; the front-matter `button-primary` would be green on green, so it's invisible.
- **Money and states:** these were added because SPEC §11 needs green = owed to you, orange/red = you owe.
  - *You lent / owed to you:* chalk green `#A5D6A7` (5.9:1).
  - *You borrowed / you owe:* Chalk Orange `#FFAB91` (5.3:1).
  - *Errors:* chalk red `#FFAAAA` (5.4:1).
  - *Warnings:* Pastel Chalk Yellow.
  - Always pair the colour with text, never colour alone.
- **No pure white anywhere.**

**Type:**
- **Caveat** is used for all text, self-hosted through `@fontsource`; the CSP blocks Google Fonts.
- Sizes are larger than the scale above, because Caveat runs small: body is 1.25rem, and inputs are at least 18px so iOS never zooms.
- **Money amounts use JetBrains Mono** with tabular figures. It's the doc's "technical values" font, and its digits scan more easily than handwriting.

**Mobile rules (unchanged from before):**
- Tap targets are at least 44×44px.
- Inputs are at least 44px tall.
- The focus ring is a 2px Chalk Blue outline, offset 2px.
- Layout is mobile-first, with content capped at a readable width (`max-w-2xl`) rather than the 1280px landing-page grid.

**Motion and texture:**
- Grain texture, chalk glow on headings, and dashed chalk borders on cards and lists.
- List items fade and rise in (540ms, staggered 120ms). Buttons lift on hover and press down when tapped.
- **Skeleton shimmer instead of spinners.** Buttons show animated dots while saving.
- No dust particles and no page transitions, for performance on phones.
- **All motion is off under `prefers-reduced-motion`.**

**Icons:** the app's inline SVG icons follow Lucide's stroke style, so no icon package is needed. No emojis.
