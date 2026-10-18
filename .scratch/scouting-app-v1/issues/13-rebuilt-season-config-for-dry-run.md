# 13: 2026 Rebuilt Season Config for the dry run

**What to build:** For the off-season dry run, the app has a real Season Config. It's the 2026 Rebuilt match and pit questions ported from the current ScoutingPASS configs, with each match question in a Match Stage and short question codes. A fully filled Match Report from this config still fits in one QR code that a phone screen can show and the KU061 can scan.

See the spec: Further Notes (Dry run, QR size). The source questions are in the sibling ScoutingPASS project's Rebuilt match and pit configs.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Every current Rebuilt match question is mapped to one of the six supported types and to a Match Stage. Questions that need an unsupported type (timers, field images) are listed and either dropped or simplified, with the reason noted.
- [ ] Every current Rebuilt pit question is ported into named pit groups.
- [ ] Question codes are short and consistent, and the typos in the old codes are fixed.
- [ ] The config passes Season Config validation.
- [ ] A test fills in every question with its largest realistic answer and asserts that the encoded QR payload fits within the chosen QR size.
- [ ] No student names, PINs or API keys come across from the old projects.

## Comments

**2026-10-17, progress from ticket 11:**
- The 2026 Rebuilt match and pit questions are in `src/seasons/demo-v3.json`, as version 3 of the `demo` season, and pass validation.
  - Pre-match fields (event, scouter PIN, match, robot, team) became Report metadata rather than questions.
  - The old code typos (`t=shootspeed`, `t-bulldozw`) are fixed.
  - ScoutingPASS defaults became required questions, and checkboxes became optional yes-no.
  - The pit questions are in four named groups.
  - Nothing from the old projects carried student names, PINs or keys.
- **Measured, not yet tested:** a fully answered Match Report is about 140 of the 600 QR characters, leaving about 340 characters of typical comment text. A Pit Report is about 110, leaving about 340 for comments with a short color and name.
- **Still to do:** the permanent QR size test. Also decide whether the dry run uses a season named for Rebuilt rather than `demo`.
