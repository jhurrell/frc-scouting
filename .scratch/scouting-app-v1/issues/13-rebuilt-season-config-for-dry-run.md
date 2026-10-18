# 13: 2026 Rebuilt Season Config for the dry run

**What to build:** For the off-season dry run, the app has a real Season Config. It's the 2026 Rebuilt match and pit questions ported from the current ScoutingPASS configs, with each match question in a Match Stage and short question codes. A fully filled Match Report from this config still fits in one QR code that a phone screen can show and the KU061 can scan.

See the spec: Further Notes (Dry run, QR size). The source questions are in the sibling ScoutingPASS project's Rebuilt match and pit configs.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Every current Rebuilt match question is mapped to one of the six supported types and to a Match Stage. Questions that need an unsupported type (timers, field images) are listed and either dropped or simplified, with the reason noted.
- [x] Every current Rebuilt pit question is ported into named pit groups.
- [x] Question codes are short and consistent, and the typos in the old codes are fixed.
- [x] The config passes Season Config validation.
- [x] A test fills in every question with its largest realistic answer and asserts that the encoded QR payload fits within the chosen QR size.
- [x] No student names, PINs or API keys come across from the old projects.

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

**2026-10-18, done:**
- **Season name:** the dry run uses a new season, `2026-rebuilt`. Its version 1, `src/seasons/2026-rebuilt-v1.json`, has the same questions as the old `demo` version 3.
  - The `demo` versions are removed. Otherwise their placeholder question codes would have constrained the Rebuilt codes all season.
  - `FINGERPRINTS` starts again with version 1.
  - **Cost:** Reports made with the `demo` versions, on test phones or in test Sheets, now show as on a version the app doesn't have. Upload or clear test phones, and use a fresh test event, since `Config version` restarts at 1.
- **Unsupported types:** the 2026 ScoutingPASS configs had none, so nothing was dropped.
  - The source fields were `radio`, `checkbox`, `number`, `text` and `textarea`, which became single-choice, yes-no, number and text.
  - `event`, `scouter`, `match`, `robot` and `team` became Report metadata.
- **QR size test:** in `src/seasons/seasons.test.ts`, it runs for every shipped version.
  - It answers every question at its longest: the last option, every option of a multiple choice, and the max, or 999 for a counter and 9999 for a number with no max.
  - It uses generous metadata, and 300 characters of ordinary notes shared between the text questions.
  - It checks that a Match Report and a Pit Report each fit in 600 characters and decode unchanged.
  - Version 1 passes: a Match Report is 567 of 600 characters, and a Pit Report 538. At 400 characters of notes it fails at 704 of 600, with "Too many questions to hand a Report to a Hub. See docs/season-config.md."
- **Old test removed:** the demo-based size test in `qrCodec.test.ts` is replaced by this one.
- **Docs:** `docs/season-config.md` has a new section, "Fitting in a QR code", and examples using the new season name. The README status is updated.
- **Browser check:** in headless Chrome against the dev server, a Rebuilt Match Report and a Pit Report each listed their required questions, completed and Uploaded.
- **Decided against:** a live "characters left" count under text boxes. If the dry run shows Scouts need it, it can be its own ticket.
