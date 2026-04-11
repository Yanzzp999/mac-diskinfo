# iOS Design Patterns

Use this only when a task explicitly targets iPhone or iPad.

## Navigation

- Tab bars fit 3 to 5 peer destinations.
- Navigation bars support hierarchy, titles, back navigation, and search.
- iPad can use sidebars for deeper information architecture.

## Layout

- Respect safe areas, including notch, Dynamic Island, and home indicator zones.
- Support compact and regular size classes.
- Use a clear 8pt spacing rhythm and minimum 44x44pt touch targets.

## Data Display

- Prefer inset grouped or plain lists depending on density.
- Use collection-style grids for repeatable visual content.
- Cards should be lightweight and not overly shadowed.

## Input

- Prefer native button styles, pickers, switches, and segmented controls.
- Use the correct keyboard type for the input task.

## Modality

- Use sheets for secondary tasks.
- Use full-screen modals only when the task needs full attention.
- Use alerts sparingly.

## Interaction

- Support standard gestures like tap, long press, swipe, and pinch.
- Add haptics for meaningful feedback, not for every interaction.

## Accessibility

- Support Dynamic Type.
- Ensure VoiceOver labels and logical reading order.
- Respect Reduce Motion.
