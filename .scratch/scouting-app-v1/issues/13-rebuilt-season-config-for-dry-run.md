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
