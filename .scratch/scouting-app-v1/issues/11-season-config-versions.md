# 11: Season Config versions

**What to build:** A student maintainer adds a new Season Config version when the questions change partway through a season, without editing the old one. The app ships every version of the season. New Reports use the latest version, but a Draft keeps the version it was started with, even if the app updates. Every row in the Sheet carries its version. New question codes add columns and old columns stay put, so Strategists' formulas never break.

See the spec: Season Config, user stories 58–63.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [x] Several Season Config versions are loaded side by side, and new Reports use the newest one.
- [x] A Draft started on an older version keeps rendering and validating with that version after an update.
- [x] Every Uploaded row records its Season Config version.
- [x] Uploading Reports from two versions into one Event Sheet appends any new columns and never removes or reorders existing ones.
- [x] Validation across versions rejects a reused code with a changed type.
- [x] Tests cover: a Draft keeping its version, new Reports getting the latest, and appending columns across versions in the script logic.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (220 tests). `npm run build` succeeds. The script didn't change.
- **Already built by earlier tickets:** loading every version side by side, new Reports on the newest version, each Report keeping its own version for its form and checks, the `Config version` column, columns only ever appended, and rejecting a code reused with a changed type. This ticket adds the tests that were missing and closes the gaps below.
- **Tests:**
  - A Draft started on version 1 keeps its questions and required checks when the app reloads with version 2. A version 2 question is refused on it, and the next new Report gets version 2.
  - A Complete Report edited after an update keeps its version, and each Report Uploads with its own version.
  - A Hub on the new version collects a Report from a phone that hasn't updated.
  - In the script, a version 1 Report that arrives after version 2 rows leaves the columns exactly as they were.
- **Guard against editing a shipped version:** a test records a fingerprint of every shipped version. Editing one in place fails `npm test` with "has changed since it shipped. Put it back and add a new version instead", and removing one fails too. A new version fails with the exact line to add. All three messages were checked.
- **A Report on a version the app doesn't have,** for example after a rolled-back deployment, used to crash the Report form. It now says which version is missing and to reload the app, and the Report still Uploads.
- **`docs/season-config.md`** is the student maintainer's guide: the file format, the rules, the steps for adding a version, what a new version does to the Sheet, and starting a new season.
- **Browser check:** in headless Chrome against the dev server, a Draft was changed to version 9 in IndexedDB and the page reloaded. Home listed it, opening it showed the missing-version message with no page errors, and ‹ Home went back.
- **No manual check against a Season Sheet** is needed: the script didn't change, and its column and version behaviour is covered by its tests and by step 10 of `docs/apps-script-setup.md`.
- **Version 3 added:** `demo-v3.json` maps the ScoutingPASS 2026 Rebuilt match and pit configs, following `docs/season-config.md`. It reuses `auto_moved`, `notes`, `drive_type`, `can_climb` and `pit_notes` with their existing types, and the fingerprint test recorded it. The form was checked in headless Chrome: a Match Report and a Pit Report each completed and Uploaded.
