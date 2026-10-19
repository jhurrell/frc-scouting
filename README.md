# Scouting

FRC Team 578's scouting app. Scouts record what other teams' robots do at an event, and the strategy lead and drive team use that data to plan matches and alliance selection.

It is a small web app that works offline, plus one Google Apps Script. All the data lives in Google Sheets. There is no server or database to look after (see [ADR 0001](docs/adr/0001-google-sheets-as-the-only-backend.md)).

```
 Scout's phone ──Upload (online)──────────────┐
      │                                       ▼
      └──QR code (offline)──▶ Hub ──Upload──▶ Apps Script ──▶ Event Sheet (one per event)
                                              │
                                              └── Season Sheet (Scouts, PINs, events)
                                                  The Blue Alliance (schedule, teams)
```

The words used here (Scout, Station, Match Report, Hub, Upload, Void and so on) have exact meanings, defined in [GLOSSARY.md](GLOSSARY.md).

## Contents

- [Status](#status)
- [For Scouts](#for-scouts)
- [For Admins](#for-admins)
- [For Strategists](#for-strategists)
- [For maintainers](#for-maintainers)

## Status

Version 1 is done and live at **https://jhurrell.github.io/frc-scouting/** (see [docs/deploy.md](docs/deploy.md)). The questions are the 2026 Rebuilt Season Config (`src/seasons/2026-rebuilt-v1.json`), ready for the off-season dry run.

The spec and tickets are in `.scratch/scouting-app-v1/`.

## For Scouts

1. **Log in.** Pick your name and enter your 4-digit PIN. Your PIN is checked on the device itself, so this works with no signal. You stay logged in until you choose **Log out**. On a shared device, log out when you're done so the next Scout's Reports aren't credited to you.
2. **Scout a match.** Choose **New Match Report**, enter the match number and pick your Station (Red 1–3 or Blue 1–3). The team number comes from the schedule. If the match isn't in the schedule, such as a playoff or practice match, type the team number in yourself.
3. **Answer the questions** as the match goes, Stage by Stage: Autonomous, Teleop, Endgame, Post-Match. The app saves as you go, so nothing is lost if the phone sleeps. It lists any required questions you haven't answered yet.
4. **Choose Complete.** The Report Uploads by itself whenever the phone is online. The line at the top of the screen shows how many Reports are waiting. **Upload now** sends them straight away.
5. **No signal?** Open the Report and choose **Show QR code for a Hub**. Once the Hub has scanned it, choose **The Hub has it: mark as handed off**. Your phone then won't Upload it again.

**Pit Scouting** works the same way: choose **New Pit Report** and pick the team.

**Made a mistake?** Open the Report and choose **Edit**. The corrected Report Uploads again and replaces the old row in the Sheet. If the whole Report is wrong, for example you scouted the wrong robot, choose **Void**. A Void Report is kept, but it's left out of analysis.

**Coverage** shows which Stations in which matches have been scouted. Grey means nobody has scouted it, green means one Scout has, and amber shows how many Scouts scouted the same robot. Online, it counts everyone's Uploads. Offline, it counts only the Reports on your own device, and it tells you so.

## For Admins

### Once a season

Follow [docs/apps-script-setup.md](docs/apps-script-setup.md). In short:

1. Create the **Season Sheet** in its own Google Drive folder.
2. Paste the Apps Script into it and set two Script Properties:
   - `ACCESS_CODE`: the team's code, typed once into each device.
   - `TBA_KEY`: a read key from The Blue Alliance.
3. Deploy the script as a web app.

### Scouts and PINs

Add one row per Scout to the Season Sheet's `Scouts` tab: `Scout ID` (short, such as `s01`, and never reused), `Name` and a 4-digit `PIN`. To reset a forgotten PIN, change it in the tab. Devices pick up changes on their next **Refresh**.

The Season Sheet holds every PIN in plain text. **Share it only with Admins**, and never copy it into this repo. Share each Event Sheet with Strategists on its own (the Event Sheet IDs in the `Events` tab link to them), never the Drive folder, which holds the Season Sheet too.

### Before each event

1. In the Season Sheet, choose **Scouting → Create event…** and enter the event key from The Blue Alliance, such as `2026nyro`. This makes an Event Sheet in the same folder, pulls the event's name, qualification schedule and team list from The Blue Alliance, and sets it as the current event. Devices show the name next to the event key. To shorten a long name, edit it in the Season Sheet's `Events` tab.
2. On each device, connect to the internet and choose **Refresh**. The device downloads the schedule and roster and can then scout all day with no signal.
3. If the schedule changes, choose **Scouting → Refresh schedule**, then **Refresh** on each device.

For an event TBA doesn't cover, such as a scrimmage, you can type the schedule into the Event Sheet by hand (see [Typing a schedule by hand](docs/apps-script-setup.md#typing-a-schedule-by-hand)).

### Setting up a device

1. Install the app to the home screen first (see [Installing on a phone](docs/deploy.md#installing-on-a-phone)). On an iPhone, the installed app doesn't share storage with Safari.
2. Open it from the home screen, enter the access code on the **Device setup** screen and choose **Save and download the Event Bundle**.

Do this once per device. Don't give the access code to Scouts. After that, the app opens and works with no connection.

When a new version of the app is deployed, it offers **Update now** between Reports, never in the middle of one.

### Running a Hub

A Hub is any device that collects Reports by QR code from Scouts who are offline, then Uploads them when it's online. Usually it's a laptop in the stands. Log in, choose **Hub: collect Reports by QR**, and scan Scouts' QR codes with the USB scanner (click in the Scanner box first) or with the camera. The camera only works on an HTTPS address or `localhost`.

## For Strategists

Every Report for an event is a row in that event's Event Sheet, in the `Match Reports` or `Pit Reports` tab. Each question has its own column, and a few columns at the start record who scouted what, when and how.

- **Do analysis in other tabs or other spreadsheets** that reference the Report tabs. Every Upload rewrites the Report tabs, so formulas or extra columns typed into them get overwritten.
- **To throw out a bad Report,** tick its **Void** checkbox. Nothing ever unticks it. Filter Void rows out of your analysis.
- **Columns never move.** When the questions change mid-season, new questions get new columns on the right and old columns stay put, so your formulas keep working. The `Config version` column tells you which set of questions a row was answered with.

## For maintainers

### Running it locally

You need Node 24 and npm.

```sh
npm install
npm run dev
```

Open the address it prints. With no `.env.local`, the app talks to a built-in fake instead of Google Sheets, so you can try it with no setup:

- **Access code:** any.
- **Scout:** `Demo Scout`, PIN `0000`.
- **Event:** a made-up 12-match event.

To use a real (test) Season Sheet instead, create `.env.local` in the repo root. It is gitignored.

```sh
VITE_SCRIPT_URL=https://script.google.com/macros/s/…/exec
```

### Commands

| Command                | What it does                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`          | Runs the app locally, reloading as you edit.                                         |
| `npm test`             | Runs every automated test once.                                                      |
| `npm run test:watch`   | Reruns tests as you edit.                                                            |
| `npm run typecheck`    | Checks types without building.                                                       |
| `npm run build`        | Builds the app into `dist/`. It needs `VITE_SCRIPT_URL` set.                         |
| `npx vite preview`     | Serves the build from `dist/`, with offline support, at `localhost`.                 |
| `npm run build:script` | Builds the Apps Script into `dist-script/Code.js`, to paste into the Season Sheet.   |

Run `npm test` and `npm run typecheck` before every commit.

### How the code is laid out

```
src/
  core/        Everything the app does, with no UI: Reports, login, Upload, the Hub, Coverage, QR codes.
               Stores data in the browser's IndexedDB using Dexie. Most tests live here.
  ui/          React screens. They call the core and show what it returns.
  gateway/     How the app talks to the Apps Script (httpSheetGateway), and an in-memory fake for tests and dev.
  script/      The Apps Script. logic.ts is plain, tested code; appsScriptAdapter.ts is the thin layer that
               touches real Google Sheets, which is checked by hand.
  shared/      contract.ts: the types and rules the app and the script both use.
  pwa/         Offline support: the service worker, the build step that lists the files it keeps, and update checks.
  seasons/     The Season Config: the questions, one JSON file per version.
  dev/         The made-up event used by the dev fake.
public/                  Files copied into the build as they are: the web manifest and the icons.
.github/workflows/       deploy.yml: tests, builds and publishes the app to GitHub Pages on every push to main.
docs/
  deploy.md              GitHub Pages setup, installing on phones, and how updates reach them.
  season-config.md       How to change the questions.
  apps-script-setup.md   Installing and updating the script, and the manual check list.
  adr/                   Why the big decisions were made.
GLOSSARY.md              What each word means. Use these words in code, UI text and docs.
.scratch/                The spec and tickets.
```

### Common jobs

- **Release a change:** push to `main`. The Deploy action tests, builds and publishes it, and phones offer the update between Reports (see [docs/deploy.md](docs/deploy.md)). If the tests fail, nothing is published.
- **Change the questions:** follow [docs/season-config.md](docs/season-config.md). Never edit a version that has shipped; add a new version. `npm test` stops you if you edit an old one.
- **Start a new season:** see [A new season](docs/season-config.md#a-new-season).
- **Change the Apps Script:** edit `src/script/`, run `npm test`, then `npm run build:script`. Paste `dist-script/Code.js` into the script editor and deploy a new version of the existing deployment, so the URL stays the same. Run the manual check in [docs/apps-script-setup.md](docs/apps-script-setup.md) against a **test** Season Sheet first.
- **Change a screen:** the logic belongs in `src/core/` with a test. Keep the screen in `src/ui/` thin. Then try it in a real browser, because the tests run on a fake IndexedDB and can miss real-browser bugs.
- **Change offline support:** after editing `src/pwa/`, check a build with `npx vite preview`: load it, stop the server, reload, and check the app still works. Then build again with a change and check that **Update now** appears on the home screen but not while a Report is open.

### Rules that keep it safe

- **Never commit student names, PINs, the access code or the TBA key.** They live only in the Season Sheet and the Apps Script's Script Properties. Tests and examples use made-up Scouts.
- **Event Sheet columns are only ever added.** Strategists' formulas depend on it.
- **Uploads can be repeated safely.** Each Report has an ID, and Uploading it again updates its row instead of adding a new one. Keep it that way: phones retry, and Hubs and phones can both Upload the same Report.
- **A Report must fit in one QR code** (600 characters). Long free-text answers are what use up the room.

### Working on tickets

The spec and tickets are local markdown files under `.scratch/scouting-app-v1/` (see [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)). Each ticket lists what blocks it and its acceptance criteria. Tick them off, and add a dated comment at the bottom when you finish.
