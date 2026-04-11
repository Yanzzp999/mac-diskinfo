---
name: apple-hig
description: Apple Human Interface Guidelines reference adapted for this repository. Use when designing or refining Apple platform user interfaces, accessibility, typography, motion, layout, or component choices.
source_url: https://github.com/openclaw/skills/tree/main/skills/kdbhalala/apple-hig
---

# Apple Human Interface Guidelines Skill

This skill is adapted from the upstream `apple-hig` skill and packaged inside this repository so it can be reused by Codex App, Cursor, and Antigravity.

## Repository Focus

`mac-diskinfo` is a macOS Electron app. When this skill is used here:

- prioritize macOS guidance first
- apply general Apple design principles second
- only use iOS, watchOS, tvOS, or visionOS patterns when explicitly requested

## Core Design Principles

### Clarity

- Text must stay legible at every size.
- Icons should be precise and easy to distinguish.
- Decoration should be subtle and should not compete with content.
- The main task should remain obvious without extra explanation.

### Deference

- Content should lead and chrome should support it.
- Use blur, translucency, and layering carefully.
- Avoid heavy bezels, gradients, and shadows unless they communicate state.

### Depth

- Use motion and layering to explain hierarchy.
- Keep transitions smooth and spatially understandable.
- Make interactivity discoverable without clutter.

## Platform Guidance

### macOS

- Prefer SF Pro and native-looking spacing.
- Design for mouse, trackpad, and keyboard.
- Use resizable windows, sidebars, toolbars, split views, and context menus.
- Support keyboard shortcuts and full keyboard access where practical.
- See [references/macos.md](references/macos.md).

### iOS and iPadOS

- Touch-first, safe-area aware, and Dynamic Type friendly.
- Relevant only when a task explicitly targets mobile or companion surfaces.
- See [references/ios.md](references/ios.md).

### watchOS

- Favor glanceable information and brief interactions.
- See [references/watchos.md](references/watchos.md).

### tvOS

- Design for long-distance readability and focus-driven navigation.
- See [references/tvos.md](references/tvos.md).

### visionOS

- Treat depth, glass, and gaze interaction as first-class constraints.
- See [references/visionos.md](references/visionos.md).

## Typography

### San Francisco

- Use SF Pro for iOS, macOS, and tvOS.
- Use SF Compact for watchOS.
- Use SF Mono for code or tabular data when helpful.
- Support Dynamic Type or equivalent scalable text behavior where the platform allows it.

### SF Symbols

- Match symbol weight to nearby text.
- Prefer filled symbols for selected or active states.
- Use multicolor or palette modes only when they add meaning.

## Color

- Prefer semantic system colors over fixed hex values.
- Ensure strong contrast in both light and dark appearance.
- Use accent color only for interactive emphasis.
- Avoid pure black for large dark surfaces; use near-black tones instead.

## Layout And Spacing

- Use an 8pt base spacing rhythm.
- Keep comfortable margins around dense data views.
- Respect safe areas on platforms that have them.
- For macOS, favor generous breathing room over mobile-style edge hugging.

## Components

### macOS-first choices for this repo

- sidebars for section navigation
- toolbars for primary actions
- split views for master-detail layouts
- tables or lists for structured data
- inspectors or detail panes for secondary metadata
- context menus for advanced per-item actions

See [references/macos-components.md](references/macos-components.md).

### iOS component references

If a task truly targets iPhone or iPad, use the component notes in [references/ios-components.md](references/ios-components.md).

## Accessibility

- Provide meaningful labels for interactive elements.
- Preserve logical focus order.
- Support keyboard navigation on macOS.
- Respect reduced motion preferences.
- Meet at least WCAG AA contrast targets.
- Test large text or constrained layouts before shipping UI changes.

## Motion

- Use quick transitions for local feedback.
- Use standard transitions for view changes.
- Prefer continuity over spectacle.
- Replace sliding or parallax-heavy effects when reduced motion is enabled.

## Dark Mode

- Verify layouts in both light and dark modes.
- Use semantic foreground and background tokens when available.
- Elevate surfaces with subtle separation, not bright borders everywhere.

## Project Checklist

- Does the UI feel like a Mac app rather than a generic web dashboard?
- Are typography, spacing, and icon weights consistent?
- Are important actions discoverable in the toolbar, sidebar, or context menu?
- Is contrast still clear in light and dark appearance?
- Are keyboard and accessibility paths preserved?
- Is motion restrained and optional?

## References

- [iOS patterns](references/ios.md)
- [macOS patterns](references/macos.md)
- [watchOS patterns](references/watchos.md)
- [tvOS patterns](references/tvos.md)
- [visionOS patterns](references/visionos.md)
- [iOS components](references/ios-components.md)
- [macOS components](references/macos-components.md)
