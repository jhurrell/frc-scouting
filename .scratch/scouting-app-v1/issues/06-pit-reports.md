# 06: Pit Reports

**What to build:** A Scout starts a Pit Report by picking a team from the event's team list, or typing a team number. They fill in the pit questions, grouped as the Season Config's pit section defines, and complete the Report with the same Draft-to-Complete flow as a Match Report. Uploaded Pit Reports land in the Event Sheet's Pit Reports tab.

See the spec: Season Config (pit section), Report model, user stories 24–26.

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [x] The Season Config's pit section is an ordered list of named groups. Match Stages are not used for pit questions.
- [x] A Pit Report records the team number and no match or Station.
- [x] Choosing a team from the Event Bundle's team list and typing a team number both work.
- [x] Required questions, validation and the Draft-to-Complete flow behave exactly as for Match Reports.
- [x] Pit Reports Upload to the Pit Reports tab with the same metadata columns and appended question-code columns.
- [x] Tests cover starting and completing a Pit Report through the core, and routing Pit Reports to the right tab in the script logic.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (149 tests). `npm run build` and `npm run build:script` both succeed. The script itself didn't change: it already sent Pit Reports to the Pit Reports tab.
- **One form for both kinds.** The Match Report form became the Report form. Its sections come from one place in the core: the Match Stages in their fixed order for a Match Report, or the pit groups in config order for a Pit Report. Empty groups are left out.
- **Starting a Pit Report.** The Scout picks from the Event Bundle's team list, or types a team number. A typed team doesn't have to be on the list, because Pit Scouting can start before the list is published.
- Decisions beyond the ticket:
  - **Pit group names must not repeat** within a version. The Season Config check now rejects a repeat.
  - **A season with no pit questions has no Pit Reports.** The core refuses to start one, and the home screen hides **New Pit Report**.
  - **Demo Season Config version 2.** Versions are only ever added, never edited, so the pit questions went into a new `demo-v2` that copies version 1's match questions. New Reports now use version 2. A test checks that the shipped versions pass validation together.
  - **Pit Reports in the Sheet** keep the Match and Station columns, left blank, so both Report tabs share one set of metadata columns.
- **Manual check:** step 22 of `docs/apps-script-setup.md` passed against a real Season Sheet.
