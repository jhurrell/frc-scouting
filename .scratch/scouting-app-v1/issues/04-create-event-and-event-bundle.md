# 04: Create an event and download the Event Bundle

**What to build:** An Admin types an event key into the Season Sheet and chooses "Create event". The script copies a blank Event Sheet, records it in the Events tab, fetches the qualification schedule and team list from TBA, and marks the event as current. A device downloads the Event Bundle while online and keeps it for offline use. When a Scout picks a match number and Station, the team number fills in from the schedule. For matches outside the schedule (playoffs, practice, off-season events), the Scout types the match and team numbers.

See the spec: Sheet gateway (Fetch the Event Bundle), Apps Script, user stories 3, 11, 13–15, 53–55.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Season Sheet tabs exist: Settings (current event) and Events (event key, Event Sheet ID).
- [ ] The "Create event" menu item does the whole setup in one step. "Refresh schedule" fetches the schedule and team list again.
- [ ] The TBA key lives only in script properties, never in the app or the repo.
- [ ] Only qualification matches go into the Schedule tab.
- [ ] Fetching the Event Bundle with the access code returns the current event key, the team list and the schedule (match number to six Stations and their team numbers).
- [ ] The device stores the bundle and uses it with no connection, and a "Refresh" action downloads it again.
- [ ] Choosing a match and Station fills in the team number. Manual entry of match and team numbers works when the match isn't in the schedule.
- [ ] A new Report takes its event key from the bundle's current event.
- [ ] Node tests cover bundle building from the Schedule tab. Core tests cover filling in the team and manual entry, using the fake gateway.
