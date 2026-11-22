---
version: 2
name: Vincithe1 Blueprint
description: Vincithe1.com design system. A drafting-table blueprint look taken from the WNB schematic sheets (WNB-L01 logo, WNB-01 money bag). Structure follows the SpaceX DESIGN.md in the awesome-design library (ghost buttons, tracked caps, technical calm).

colors:
  void: "#061430"        # page background (deep navy)
  ink: "#08193b"         # menus, inputs
  panel: "#0c2350"       # cards (at 78% opacity)
  blueprint: "#1748a6"   # schematic frames, subscribe block
  line: "rgba(205,222,255,.20)"
  line-strong: "rgba(205,222,255,.38)"
  text: "#eef3ff"
  dim: "#a3b6dc"
  accent: "#f2c94c"      # the ONE accent: signal yellow (CTAs, corner ticks, focus)
  status: "#5fe39a"      # live / success only
  paper: "#f4f1e8"       # design drawing cards

typography:
  display: "Big Shoulders Display 900, uppercase"
  body: "DM Sans 400/500/700"
  label: "JetBrains Mono 500, uppercase, letter-spacing .14em to .2em"

shape:
  radius: "2px controls, 4px surfaces. No pills."
  corners: "Yellow 12px corner ticks on panels, tiles, hero schematic"

background: "Fixed drafting grid: 24px minor + 120px major lines over navy, two soft blue glows"

components:
  button: "Mono caps, 1px ghost outline; primary = solid yellow on navy"
  eyebrow: "Boxed mono label with a yellow diamond, reads like a drawing tag (SHEET 01 ...)"
  hero: "Left copy, right schematic frame: chrome WNB logo video (screen blend), dimension lines, center marks, pause button"
  brand-sheets: "Blueprints full color; designs on paper cards labeled DWG 01-05"
  footer: "Engineering title block: drawn by / sheet (updates per page) / location / label / WNB mark"

rules:
  - "One accent color. Yellow is for actions and marks, not decoration."
  - "No emojis in UI copy."
  - "Animate transform and opacity only; respect prefers-reduced-motion."
  - "Visible focus ring (2px yellow) on every interactive element."
---
