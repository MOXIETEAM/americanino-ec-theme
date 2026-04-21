# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Shopify theme called **Horizon** (v3.5.0) — a complete storefront theme built with Liquid, vanilla JavaScript (ES modules), and CSS. There is no build step or bundler; files in `assets/` are served directly by Shopify's CDN.

## Development workflow

Shopify themes are developed and deployed via the Shopify CLI. All preview, push, and pull operations require a connected Shopify store.

```bash
# Authenticate with Shopify
shopify auth login

# Start local dev server (live preview against connected store)
shopify theme dev --store=<store-handle>

# Push theme to store
shopify theme push --store=<store-handle>

# Pull latest theme from store
shopify theme pull --store=<store-handle>
```

There is no lint, test, or build command — the JS is authored as plain ES modules and shipped as-is. The `assets/jsconfig.json` configures type-checking (ES2020, `strictNullChecks`, `noImplicitAny`) for IDE support only.

## Architecture

### Liquid layer

- `layout/theme.liquid` — root shell for every page. Renders header-group, footer-group, and `{{ content_for_layout }}`. Sets CSS variables for header height inline to prevent layout shift.
- `layout/password.liquid` — alternate layout for password-protected stores.
- `templates/*.json` — declarative JSON files that define which sections appear on each page type.
- `sections/` — full-width page sections configurable in the Shopify theme editor.
- `blocks/` — sub-section components that sections can contain (e.g. product card, carousel slide).
- `snippets/` — reusable Liquid partials rendered via `{% render %}`. Key ones:
  - `snippets/scripts.liquid` — loads all JS modules and defines the global `Theme` object (routes, translations).
  - `snippets/stylesheets.liquid` — loads CSS.
  - `snippets/color-schemes.liquid` — generates CSS custom property overrides per color scheme.

### JavaScript layer

All JS files in `assets/` are native ES modules loaded via `<script type="module">`. They communicate through a browser import map defined in `snippets/scripts.liquid`, which maps `@theme/*` aliases to their CDN URLs:

```js
import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';
```

**Core abstractions:**

- `assets/component.js` — `Component` base class (extends `HTMLElement`). All custom elements extend this. Provides:
  - `this.refs` — auto-populated map of child elements with `ref="name"` attributes.
  - Declarative event wiring via `on:*` attributes.
  - Declarative shadow DOM hydration.

- `assets/events.js` — `ThemeEvents` namespace + typed `CustomEvent` subclasses (`VariantUpdateEvent`, `CartAddEvent`, `CartUpdateEvent`, `FilterUpdateEvent`, etc.). All cross-component communication uses these events dispatched on `document`.

- `assets/section-renderer.js` — `SectionRenderer` singleton. Fetches re-rendered section HTML via Shopify's Section Rendering API and morphs it into the DOM. Used after cart/variant updates.

- `assets/section-hydration.js` — `hydrateSection()` — updates only nodes with `data-hydration-key` attributes on idle, preserving state for elements that shouldn't re-mount.

- `assets/morph.js` — DOM morphing utility (similar to morphdom) used by `SectionRenderer` to minimize destructive DOM updates.

- `assets/utilities.js` — shared utilities: `requestIdleCallback`, `yieldToMainThread`, `isLowPowerDevice`, `supportsViewTransitions`, header height CSS variable calculations.

### Global runtime object

`snippets/scripts.liquid` injects a `Theme` global at page load:

```js
Theme.routes    // Shopify route URLs (cart, search, etc.)
Theme.translations  // i18n strings from locale files
Theme.template  // current template name
```

The `Shopify` global is injected by Shopify and typed in `assets/global.d.ts`.

### Localization

`locales/en.default.json` is the source of truth. Schema files (e.g. `locales/en.default.schema.json`) provide translations for the theme editor UI. All user-facing strings must use `{{ 'key' | t }}` in Liquid or be passed through `Theme.translations` in JS.

### Settings

`config/settings_schema.json` defines all theme-level settings available in the Shopify customizer. `config/settings_data.json` stores the current saved values — this file is auto-generated and should generally not be hand-edited.

## Key patterns

- **Custom elements over frameworks**: Every interactive UI piece is a custom HTML element that extends `Component`. Register with `customElements.define('element-name', ClassName)` at the bottom of each file.
- **Event-driven updates**: Components don't call each other directly. They dispatch `ThemeEvents` on `document` and listen for them. This decouples sections that may or may not be present on a given page.
- **Section Rendering API**: When cart or variant state changes, the relevant section IDs are re-fetched from Shopify and morphed into the DOM rather than hand-manipulating the DOM.
- **`ref` attributes**: To reference child elements inside a `Component`, add `ref="name"` in Liquid and access via `this.refs.name` in JS — no `querySelector` needed.

---

## Moxie working rules

### Behavior

- Act as a Shopify expert (Liquid, CSS, JS, theme and app optimization).
- One solution at a time, well thought out. If it doesn't work, move to the next.
- If unsure about something, do NOT invent — look it up and return with verified information. Do not answer Shopify questions from memory alone when there is doubt; verify against official docs.
- Always read a file before touching it.

### Customization philosophy

The goal is to **never break the base theme** so upstream updates can be applied without conflicts.

**Decision tree (in priority order):**

1. **Solvable with CSS only?** → Override in `assets/`. Do not touch the original Liquid.
2. **Requires a minimal Liquid change?** → Modify the original with the smallest possible change. Mark it with `{%- comment -%} MOXIE: [description] {%- endcomment -%}`.
3. **Requires a structural change?** → Create a new custom file based on the original. Do not modify the original.

**Before creating anything new:**

1. **Audit the base theme**: Check whether an existing section, block, snippet, or JS component already does what's needed, or something close.
2. **Understand the native pattern**: Read how the theme solves similar features (sliders, tabs, accordions, modals, lazy loading). Use the same internal system.
3. **Reuse before reinventing**: If the theme has a slider with its own JS, use it. If it has a component system, extend it. Only create custom JS or bring in a framework if the theme offers nothing viable.

### JS — integration with the base theme

Before writing custom JS:

1. Identify Horizon's component system: `Component<Refs>` base class with `ref=` attributes and `on:event=` declarative listeners (see `assets/component.js`).
2. Use that same system for custom components — extend `Component`, use `this.refs`, dispatch/listen via `ThemeEvents`.
3. Reuse existing JS for: sliders, modals/drawers, lazy loading, product/cart data fetching.
4. Only create independent JS if the theme has nothing that covers the need, or adapting existing code would be more complex than building from scratch.

### Naming conventions for Moxie custom files

| Type | Convention | Example |
|------|-----------|---------|
| Section | `custom_[descriptor].liquid` | `custom_hero.liquid` |
| Block | `custom_[descriptor].liquid` | `custom_promo_banner.liquid` |
| Snippet | `custom_[descriptor].liquid` | `custom_product_badge.liquid` |
| Preset name | `"Moxie [description]"` | `"Moxie Hero"` |
| Preset category | `"Moxie"` | — |

The **"Moxie"** prefix identifies custom components in the Theme Editor.

### Animations in custom sections

Include a subtle reveal on load or re-render, aligned with the base theme's style. Use the theme's animation variables, restrict motion, and always include a fallback for `prefers-reduced-motion`.
