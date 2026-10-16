# 11: Season Config versions

**What to build:** A student maintainer adds a new Season Config version when the questions change partway through a season, without editing the old one. The app ships every version of the season. New Reports use the latest version, but a Draft keeps the version it was started with, even if the app updates. Every row in the Sheet carries its version. New question codes add columns and old columns stay put, so Strategists' formulas never break.

See the spec: Season Config, user stories 58–63.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Several Season Config versions are loaded side by side, and new Reports use the newest one.
- [ ] A Draft started on an older version keeps rendering and validating with that version after an update.
- [ ] Every Uploaded row records its Season Config version.
- [ ] Uploading Reports from two versions into one Event Sheet appends any new columns and never removes or reorders existing ones.
- [ ] Validation across versions rejects a reused code with a changed type.
- [ ] Tests cover: a Draft keeping its version, new Reports getting the latest, and appending columns across versions in the script logic.
