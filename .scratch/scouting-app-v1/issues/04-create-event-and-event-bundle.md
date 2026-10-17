# 04: Create an event and download the Event Bundle

**What to build:** An Admin types an event key into the Season Sheet and chooses "Create event". The script copies a blank Event Sheet, records it in the Events tab, fetches the qualification schedule and team list from TBA, and marks the event as current. A device downloads the Event Bundle while online and keeps it for offline use. When a Scout picks a match number and Station, the team number fills in from the schedule. For matches outside the schedule (playoffs, practice, off-season events), the Scout types the match and team numbers.

See the spec: Sheet gateway (Fetch the Event Bundle), Apps Script, user stories 3, 11, 13–15, 53–55.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] Season Sheet tabs exist: Settings (current event) and Events (event key, Event Sheet ID).
- [x] The "Create event" menu item does the whole setup in one step. "Refresh schedule" fetches the schedule and team list again.
- [x] The TBA key lives only in script properties, never in the app or the repo.
- [x] Only qualification matches go into the Schedule tab.
- [x] Fetching the Event Bundle with the access code returns the current event key, the team list and the schedule (match number to six Stations and their team numbers).
- [x] The device stores the bundle and uses it with no connection, and a "Refresh" action downloads it again.
- [x] Choosing a match and Station fills in the team number. Manual entry of match and team numbers works when the match isn't in the schedule.
- [x] A new Report takes its event key from the bundle's current event.
- [x] Node tests cover bundle building from the Schedule tab. Core tests cover filling in the team and manual entry, using the fake gateway.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (88 tests). `npm run build` and `npm run build:script` both succeed.
- **Season Sheet menu:** opening the Season Sheet adds a **Scouting** menu with **Create event…** and **Refresh schedule**. The Admin types the event key into a prompt.
- **The TBA key** is the `TBA_KEY` script property. TBA is called only from the menu actions, never from the web app.
- Decisions beyond the ticket:
  - **A Teams tab in the Event Sheet.** TBA publishes the team list before the schedule, and Pit Scouting (ticket 06) needs teams before any qualification match. The Event Bundle's team list is the Teams tab plus anyone in the schedule. The spec now lists the tab.
  - **Create event reuses an existing Event Sheet.** Running it again for a known event key fetches the schedule again and makes that event current, without making a second spreadsheet. This is also how an Admin switches back to an earlier event.
  - **Unknown events.** If TBA doesn't know the key, the menu warns about a typo and asks before creating the event. This lets a scrimmage that TBA doesn't cover have its schedule typed in by hand.
  - **TBA never wipes hand-typed data.** Refresh replaces the Schedule or Teams tab only when TBA returns something for it.
  - **Hand-edited schedules work.** The script reads the Schedule tab by its headers, skips rows without a match number and leaves blank cells out of the bundle.
  - **B teams.** Team keys with a letter suffix (`frc578B` at off-season events) can't be a team number, so their Schedule cell is left blank and the Scout types the team.
  - **Event Sheets go in the Season Sheet's folder.** That needs Drive permission. The web app runs as the account that deployed it, so that account must be able to open every Event Sheet (documented).
  - **Bundle errors.** If the current event isn't in the Events tab, downloading the Event Bundle now fails with a clear error, where before it served a bundle that couldn't Upload. The device keeps its previous bundle.
  - **The schedule decides the team.** A typed team number that contradicts the schedule is refused. If the schedule is wrong, the Admin fixes or refreshes it.
  - **The app's Station picker** is six large buttons in alliance colours. Each one shows the scheduled team number once a match number is entered.
  - **Tab writes clear first.** Every tab write now clears the tab and then writes the full table, so a shorter schedule leaves no old rows behind. This also applies to the Report tabs, where it changes nothing because their tables only grow.
- **Dev demo bundle:** now 18 teams and 12 qualification matches.

**2026-10-17, manual check:** The user checked the menu, the Station picker and the bundle against a real test Season Sheet using `docs/apps-script-setup.md`.
