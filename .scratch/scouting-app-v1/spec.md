# Spec: Scouting app v1

Status: ready-for-agent

## Problem Statement

Team 578 scouts other FRC robots at every event so that Strategists can plan matches and alliance selection. The current tooling is a fork of ScoutingPASS plus a set of Python scripts and an Excel workbook. Over several seasons it has turned into spaghetti code that students can't maintain:

- Each new season means hand-editing a JavaScript config, a spreadsheet template and hardcoded column letters in a script, all separately.
- The match schedule and the Scout PINs are pasted directly into the source, and real student names, PINs and an API key are committed to git.
- Scouts can't reliably fix a mistake.
- Duplicate scans and wrong-team Reports have to be caught by eye in the spreadsheet.
- Data reaches the spreadsheet only through a QR scanner. There's no path for a device that has a connection.
- An attempted React rewrite (ScoutingApp) was abandoned partway through.

## Solution

A new, small, local-first scouting app that students can maintain, used for Match Scouting and Pit Scouting.

- Scouts log in on their own device or a shared one with a personal PIN, then fill in Match Reports and Pit Reports, all of it offline.
- Complete Reports Upload to the team's Google Sheets whenever the device is online, or when a Scout asks. With no connection, a Report travels as a QR code to a Hub, which Uploads it later.
- Each season's questions live in one versioned Season Config file. Starting a new game means editing that file and nothing else.
- Admins run everything from Google Sheets:
  - A Season Sheet holds the roster and PINs.
  - A "Create event" menu item sets up an Event Sheet and pulls the qualification schedule from The Blue Alliance.
  - Columns in the Event Sheet are generated from the Season Config.
- Strategists do all analysis in the Event Sheets.
- The app's only view of the data is Coverage: which Stations in which matches have been scouted.

## User Stories

### Device setup and login

1. As an Admin, I want to enter the team access code once on a device, so that the device can download the Event Bundle and Upload Reports without outsiders being able to write to our Sheets.
2. As an Admin, I want the access code never to appear in the repo, so that publishing the code doesn't expose our Sheets.
3. As a Scout, I want the device to download the Event Bundle while it has a connection, so that I can scout all day with no signal.
4. As a Scout, I want to pick my name from the roster and enter my PIN, so that my Reports are credited to me.
5. As a Scout, I want my PIN checked on the device even when offline, so that I can log in in the stands.
6. As a Scout, I want to stay logged in until I log out, so that I don't retype my PIN for every match.
7. As a Scout sharing a tablet, I want to log out so the next Scout can log in with their own PIN, so that our Reports aren't credited to each other.
8. As a Scout, I want to be sure no one else can log in as me without my PIN, so that bad data can't be pinned on me.
9. As an Admin, I want to assign and change PINs in the Season Sheet, so that I can reset a forgotten PIN without touching code.
10. As an Admin, I want student names and PINs kept out of git, so that we stop publishing student data.
11. As a Scout, I want a clear message when the device has no Event Bundle yet, so that I know to connect before the event starts.
12. As a Scout, I want the app to keep working when I reload or lose signal, so that a flaky connection never blocks scouting.

### Match Scouting

13. As a Scout, I want to choose a match number and a Station, so that I'm recording the right robot.
14. As a Scout, I want the team number filled in from the schedule once I've chosen the match and Station, so that I don't record the wrong team.
15. As a Scout, I want to type the match number and team number by hand when the schedule doesn't cover the match (playoffs, practice, off-season events), so that I can still scout.
16. As a Scout, I want Match Report questions grouped by Match Stage (Pre-Match, Autonomous, Teleop, Endgame, Post-Match), so that I can follow the match as it happens.
17. As a Scout, I want counter questions with large plus and minus buttons that never double-count, so that I can tally game pieces accurately while watching.
18. As a Scout, I want yes/no, single choice, multiple choice, number and free text questions, so that I can record whatever the season needs.
19. As a Scout, I want to see which required questions I still haven't answered, so that I can finish the Report quickly.
20. As a Scout, I want my Report saved as a Draft as I go, so that nothing is lost if the app closes or the device sleeps.
21. As a Scout, I want to mark a Report Complete only when every required question is answered, so that incomplete data never reaches the Strategists.
22. As a Scout, I want to start the next match straight after completing a Report, so that I keep up with a fast schedule.
23. As a Scout, I want to see a list of my Reports and whether each is Draft or Complete and Uploaded or not, so that I know what's still pending.

### Pit Scouting

24. As a Scout, I want to choose a team from the event's team list, or type a team number, to start a Pit Report, so that I can interview teams in the pits.
25. As a Scout, I want Pit Reports to use the same question types and the same Draft/Complete flow as Match Reports, so that I only learn one way of working.
26. As a Scout, I want pit questions to come from the pit section of the Season Config, so that pit questions can change without code changes.

### Corrections

27. As a Scout, I want to edit a Complete Report, so that I can fix a mistake I notice later.
28. As a Scout, I want an edited Report to replace its earlier version in the Sheet instead of adding a row, so that corrections never create duplicates.
29. As a Scout, I want to Void a Report I made by mistake, for example on the wrong team, so that it's ignored in analysis.
30. As an Admin, I want to Void a Report from the Event Sheet, so that I can remove bad data without asking the Scout.
31. As an Admin, I want a Voided Report to stay Void even if an older copy of it is Uploaded again later, so that bad data doesn't come back.
32. As a Strategist, I want Voided Reports to stay visible but flagged, so that I can see what was excluded and why.
33. As a Strategist, I want two Scouts' Reports on the same robot in the same match both kept, so that I can compare them or average them.

### Uploading

34. As a Scout, I want Complete Reports to Upload automatically when the device is online, so that I don't have to remember to do it.
35. As a Scout, I want an "Upload now" button, so that I can push my Reports as soon as I reach a connection.
36. As a Scout, I want a count of Reports waiting to Upload, so that I know whether my data has reached the Sheet.
37. As a Scout, I want Uploading the same Report twice to be harmless, so that retries after a dropped connection can't create duplicates.
38. As a Scout, I want a clear error when an Upload fails, for example because of a wrong access code or no connection, with my Reports kept safely on the device, so that I can try again.
39. As a Strategist, I want each Report to land in the Event Sheet for its own event, so that events never mix.
40. As a Strategist, I want a newer edit of a Report never overwritten by an older copy, for example one that reaches the Hub late, so that the Sheet always shows the latest version.

### QR fallback and the Hub

41. As a Scout with no connection, I want to show a Complete Report as a QR code, so that a Hub can collect it.
42. As a Hub operator, I want to scan Scouts' QR codes with the device camera, so that any phone or tablet can act as the Hub.
43. As a Hub operator, I want to scan with the KU061 handheld scanner acting as a keyboard, so that the scanner we already own keeps working.
44. As a Hub operator, I want each scan confirmed with the Scout, match, Station and team, so that I can tell a good scan from a bad one.
45. As a Hub operator, I want scanning the same QR twice to be harmless, so that I don't have to track what I've already scanned.
46. As a Hub operator, I want scanned Reports Uploaded with the original Scout's identity, not mine, so that credit and accountability stay correct.
47. As a Scout, I want to mark my QR-collected Reports as handed off, so that my pending count reflects reality.

### Coverage

48. As a Scout lead, I want to see Coverage as a grid of matches by Stations, so that I can spot robots nobody has scouted.
49. As a Scout lead, I want Coverage built from everyone's Uploads when the device is online, so that it reflects the whole team.
50. As a Scout lead, I want Coverage shown from this device's own Reports when offline, clearly labelled as local only, so that I still get some picture without signal.
51. As a Scout lead, I want Stations with more than one Report highlighted, so that I can see where effort was duplicated.
52. As a Scout lead, I want Voided Reports left out of Coverage, so that a wrong-team Report doesn't hide a gap.

### Season and event setup

53. As an Admin, I want to type an event key into the Season Sheet and choose "Create event", so that the Event Sheet, the schedule and the current event are all set up in one step.
54. As an Admin, I want the schedule fetched from The Blue Alliance by the script, so that the TBA key never sits in the app or the repo.
55. As an Admin, I want to re-run the schedule fetch, so that I can pick up a schedule published late.
56. As an Admin, I want one Event Sheet per event, so that question changes between events never mix column layouts.
57. As an Admin, I want the roster and PINs entered once per season in the Season Sheet, so that I don't re-enter them for every event.
58. As a student maintainer, I want each season's questions defined in one Season Config file in the repo, so that a new game means editing one file and no code.
59. As a student maintainer, I want to add a new Season Config version when the questions change mid-season, so that earlier Reports stay tied to the questions they actually answered.
60. As a Scout, I want a Draft to keep the questions it was started with even if the app updates in the middle of a match, so that my in-progress Report doesn't change under me.
61. As a Strategist, I want a new column added when a question is added, with old columns left in place, so that formulas and pivots I've built don't break.
62. As a Strategist, I want every Report row to carry its Season Config version, so that I can tell which questions it answered.
63. As a Strategist, I want question codes as column headers, so that columns are stable and easy to reference in formulas.

### Maintenance and delivery

64. As a student maintainer, I want the app written in TypeScript and React, which some students have already used, so that I can contribute quickly.
65. As a student maintainer, I want the behaviour covered by tests that drive the scouting core the way the UI does, so that I can change code without fear.
66. As a student maintainer, I want the Apps Script logic tested on my laptop without a real Google account, so that server changes are safe too.
67. As a student maintainer, I want the app deployed automatically when changes land on main, once the repo is on GitHub, so that releasing needs no special knowledge.
68. As a Scout, I want the app installable on my phone's home screen and working offline after the first load, so that I can open it in the stands.
69. As a Scout, I want to be told when a new version of the app is available, and offered the update only between Reports, so that an update never interrupts a match.

## Implementation Decisions

### Architecture (see ADR 0001)

- **Static PWA.** A static, local-first PWA built with TypeScript, React and Vite, hosted on GitHub Pages and deployed by a GitHub Action on push to main. Until the repo is pushed, it runs from the Vite dev server.
- **Storage on the device.** Device storage uses IndexedDB through Dexie. The app shell is cached by a service worker so it works offline.
- **The only server.** The single server-side piece is one Google Apps Script bound to the Season Sheet, published as a web app that anyone can call. It is protected by the team access code, which is stored in the script's properties. The TBA API key is stored there too.
- **Sheets.** There is one Season Sheet per season and one Event Sheet per event. The app knows exactly one script URL.

### Modules

**Season Config**
- Plain data, one file per version, kept in the repo. Versions are appended and never edited in place, and the app ships every version of the current season.
- A config contains:
  - a version number
  - a match section organised by the five fixed Match Stages (Pre-Match, Autonomous, Teleop, Endgame, Post-Match), in that order. Every match question belongs to exactly one Match Stage, and a Stage may have no questions.
  - a pit section, which is an ordered list of named groups chosen by the config, because Match Stages don't apply to Pit Scouting
  - questions in each Match Stage or group
- Each question has:
  - a stable code, used as the Sheet column header
  - a label
  - a type: counter, yes/no, single choice, multiple choice, number or free text
  - a required flag
  - options, for the choice types. A multiple-choice option can't contain a comma, because the Sheet separates selections with commas.
  - optional min/max, for counter and number
- The config is validated when loaded. Codes must be unique across a version, and a code that is reused across versions must keep its type.

**Report model**
- Every Report has:
  - a unique ID, generated on the device when the Report is created
  - its kind: Match Report or Pit Report
  - the event key
  - the Scout ID
  - the Season Config version
  - its status: Draft or Complete
  - a voided flag
  - created and updated timestamps
  - answers, keyed by question code
- A Match Report also has a match number, a Station and a team number. A Pit Report has a team number.
- A Report also records, on the device, whether it has been Uploaded or handed off by QR.

**Scouting core** (the main module, with no React in it)
- Owns all behaviour: login, logout and the current Scout; creating Reports, answering questions, completing, editing and Voiding; the Upload queue; Hub intake; and Coverage.
- Every UI screen calls into it. Its rough public operations:
  - setting the access code
  - refreshing the Event Bundle
  - logging in and out
  - starting a Match Report or a Pit Report
  - answering
  - completing
  - Voiding
  - listing Reports
  - uploading pending Reports
  - encoding a Report as a QR code
  - accepting a scanned QR
  - getting Coverage
- Persists through Dexie. Talks to the outside world only through the Sheet gateway.

**Sheet gateway**
- A small interface with two operations:
  - **Fetch the Event Bundle**, given the access code. It returns:
    - the current event key and its team list
    - the qualification schedule (match number to six Stations and their team numbers)
    - the roster (Scout ID, display name, PIN hash, salt)
    - a Coverage snapshot (match and Station to a count of non-Void Match Reports)
  - **Upload a batch of Reports**, given the access code. It returns one result per Report ID: stored, ignored as stale, or rejected with a reason.
- Coverage arrives with the Event Bundle, so refreshing Coverage means refreshing the bundle. That keeps the gateway at two operations.
- Implementations:
  - an HTTP client to the Apps Script, used in production
  - an in-memory fake, used in tests and local development

**Login**
- PINs are four digits and assigned by Admins in the Season Sheet.
- The script sends only salted SHA-256 hashes in the Event Bundle, and the device checks a login against them offline.
- This is deliberately weak: it stops casual impersonation, not a determined attacker. Reports aren't signed. The Hub and the script trust the Scout ID on each Report.

**Upload rules** (enforced in the script)
- Each Report is routed to the Event Sheet for its event key. An unknown event key is rejected.
- A Report is upserted by its ID, and the write happens only when the incoming updated time is at least the stored one. An older copy is ignored as stale.
- A Void set in the Sheet is never cleared by an Upload.

**When Uploads happen**
- When a Report is completed while online, when the connection comes back, and when a Scout presses "Upload now".
- The pending count is shown in the app at all times.

**QR codec**
- One Report per QR code, inside a compact, versioned envelope.
- The payload must be plain ASCII text, because the KU061 sends what it scans as keystrokes.
- It must survive a round trip without losing anything and stay scannable from a phone screen at the size of a typical Season Config. The exact encoding is chosen during implementation, guided by those limits.

**Hub**
- A screen in the same app, open to any logged-in Scout.
- It reads QR codes from the camera or from keyboard-style input sent by the scanner.
- It confirms each scan (Scout, match, Station, team), stores the Report under its original Scout and puts it in the Upload queue.
- A Report it already has is a no-op, unless the scanned copy is newer.

**Apps Script**
- **Logic.** Written as plain functions over 2D arrays, with a thin adapter to the real Sheets service. The functions handle:
  - checking the access code
  - routing by event key
  - the upsert and stale-copy rule
  - adding columns from question codes (only ever appended)
  - building the Event Bundle, including PIN hashing
  - building the Coverage snapshot
- **Season Sheet tabs:** Settings (current event), Scouts (ID, name, PIN) and Events (event key, Event Sheet ID).
- **Event Sheet tabs:** Schedule, Teams, Match Reports and Pit Reports. The Teams tab exists because the team list is published before the schedule, and Pit Scouting starts before qualification matches.
- **Report columns:**
  - fixed metadata columns first: Report ID, event key, kind, match number, Station, team number, Scout ID, Scout name, config version, Void, created, updated, uploaded at, and uploaded via (device or Hub)
  - then one column per question code, in order of first appearance
- **"Create event" menu item.** Copies a blank Event Sheet, records it in the Events tab, fetches the TBA qualification schedule and team list, and marks the event as current.
- **"Refresh schedule" menu item.** Fetches the schedule again.

**UI**
- Thin React screens over the scouting core:
  - device setup
  - login
  - home (pending count and the Scout's Reports)
  - Match Report form
  - Pit Report form
  - QR display
  - Hub
  - Coverage
- App updates are offered only when no Draft is open.

## Testing Decisions

- **What a good test looks like.** A good test drives the system through the same public operations its callers use and checks only what can be observed from outside: Report status, what the gateway received, what Coverage returns, what the Sheet tables contain. Tests never reach into internal state or assert on how something is done.
- **Seam 1: the scouting core.**
  - Tests use real Dexie on an in-memory IndexedDB (fake-indexeddb) and replace only the Sheet gateway with its in-memory fake.
  - They cover:
    - login against hashed PINs, both offline and with a wrong PIN
    - Draft to Complete, including blocking on missing required answers
    - edit and Void
    - the Upload queue, including retries and idempotency
    - QR encode/decode round-trips, including the size limit
    - Hub intake of duplicate and newer copies
    - Coverage when online and offline, with Void and duplicates
    - a Draft keeping its config version across an app update
- **Seam 2: the Apps Script logic.**
  - Tests are plain Vitest tests in Node over 2D-array tables.
  - They cover:
    - access code rejection
    - routing by event key
    - the upsert, stale-copy and sticky-Void rules
    - appending columns when the config version changes
    - Event Bundle contents and PIN hashing
    - the Coverage snapshot
  - The thin Sheets adapter isn't automated. It gets a manual check against a test Season Sheet.
- **One shared contract.** The fake gateway and the script logic both build on the same Report and Event Bundle type definitions, so the two seams can't drift apart. Season Config validation is tested as part of whichever seam loads the config.
- **Not unit-tested:** React components, which stay thin enough that the core tests cover their behaviour.
- **Prior art:** none. The repo is new, and the earlier projects (ScoutingPASS, ScoutingApp) have no automated tests. These tests set the pattern.

## Out of Scope

- **Analysis in the app.** Analysis, charts and team rankings live in the Event Sheets, built by Strategists. The app shows Coverage only.
- **Assigning Scouts** to matches or Stations.
- **Admin screens in the app** of any kind, including an in-app question editor. Admins work in the Sheets and the Season Config file.
- **Extra question types** such as timers, cycle timers and field-image taps, until a season's game needs them.
- **Playoff schedules from TBA.** Playoff matches are entered by hand.
- **Stronger security:** signing Reports, verifying identity on the server, or protecting against a determined attacker.
- **Moving old data across** from ScoutingPASS, Excel or ScoutingApp.
- **Photos** in Pit Reports.
- **Use by other teams**, or any other backend than Google Sheets.

## Further Notes

- **Vocabulary.** Use the vocabulary in `GLOSSARY.md` throughout. In particular: Scout, not scouter; Station, not robot position; Match Stage, not phase or period; Complete, not submitted; Void, not delete; Upload, not sync.
- **Lessons from the existing projects:**
  - ScoutingPASS hand-edits a separate schedule, PIN list and spreadsheet template every season. This design replaces all of them with the Season Config and the Event Bundle.
  - Don't copy ScoutingPASS's committed TBA key or student roster into this repo.
- **Dry run.** Before the 2027 season, scout an off-season event or scrimmage with the full chain: Event Bundle, offline scouting, QR to the Hub, Upload, and Coverage.
- **QR size.** Each Report travels in a single QR code, so keep question codes short in the Season Config.
