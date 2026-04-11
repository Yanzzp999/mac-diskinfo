# Agent Guidance

This repository includes a shared Apple Human Interface Guidelines skill for AI agents.

## When To Use It

- Use the Apple HIG skill for UI, UX, layout, typography, color, motion, accessibility, iconography, and interaction decisions.
- Prefer the macOS and desktop guidance for this project because `mac-diskinfo` is an Electron app for macOS.
- Only apply iOS, watchOS, tvOS, or visionOS patterns when a task explicitly targets those platforms.

## Project-Specific Expectations

- Keep the interface native-feeling for macOS users.
- Favor SF Pro, semantic colors, restrained shadows, clear hierarchy, and spacious layouts.
- Respect reduced motion and strong accessibility defaults.
- Prefer sidebar, toolbar, split-view, table, and inspector-like patterns over mobile-first UI metaphors.
- Preserve the current Electron + React + TypeScript architecture.

## Canonical Skill

- Main skill: [docs/ai/skills/apple-hig/SKILL.md](docs/ai/skills/apple-hig/SKILL.md)
- References live under `docs/ai/skills/apple-hig/references/`

## Tool Notes

- Codex App: reads this `AGENTS.md`.
- Cursor: also has a project rule at `.cursor/rules/apple-hig.mdc`.
- Antigravity: can use this `AGENTS.md`; `GEMINI.md` is also provided as a compatibility shim.
