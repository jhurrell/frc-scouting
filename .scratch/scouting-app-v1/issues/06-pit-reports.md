# 06: Pit Reports

**What to build:** A Scout starts a Pit Report by picking a team from the event's team list, or typing a team number. They fill in the pit questions, grouped as the Season Config's pit section defines, and complete the Report with the same Draft-to-Complete flow as a Match Report. Uploaded Pit Reports land in the Event Sheet's Pit Reports tab.

See the spec: Season Config (pit section), Report model, user stories 24–26.

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] The Season Config's pit section is an ordered list of named groups. Match Stages are not used for pit questions.
- [ ] A Pit Report records the team number and no match or Station.
- [ ] Choosing a team from the Event Bundle's team list and typing a team number both work.
- [ ] Required questions, validation and the Draft-to-Complete flow behave exactly as for Match Reports.
- [ ] Pit Reports Upload to the Pit Reports tab with the same metadata columns and appended question-code columns.
- [ ] Tests cover starting and completing a Pit Report through the core, and routing Pit Reports to the right tab in the script logic.
