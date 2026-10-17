# Apps Script setup and manual check

The Apps Script is the app's only server (see `docs/adr/0001-google-sheets-as-the-only-backend.md`). Its logic is tested automatically, but the thin adapter to Google Sheets is not. Follow these steps whenever the script changes, using a **test** Season Sheet, never the real one.

## 1. Build the script

```sh
npm run build:script
```

This writes one file, `dist-script/Code.js`.

## 2. Make a test Season Sheet

In Google Sheets, create a spreadsheet called `Scouting Season (test)`, ideally in its own folder. This is the **Season Sheet**. Leave it empty: the script adds the `Settings` and `Events` tabs, and creates each Event Sheet in the same folder.

## 3. Install the script

1. In the Season Sheet, choose **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the contents of `dist-script/Code.js`, then save.
3. Open **Project Settings** (the gear icon). Under **Script Properties**, add:
   - `ACCESS_CODE`: a code of your choice. Admins type it into each device.
   - `TBA_KEY`: a read API key from The Blue Alliance. Log in at thebluealliance.com, open **Account**, and add a **Read API Key**.

   Keep both out of git and out of chat.
4. Reload the Season Sheet. A **Scouting** menu appears next to **Help**.

## 4. Deploy it as a web app

1. Choose **Deploy → New deployment**, select type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
2. Choose **Deploy** and authorize it. Google warns that the app isn't verified; choose **Advanced**, then **Go to … (unsafe)**. It is your own script.
3. Copy the **Web app URL** (it ends in `/exec`).

The web app runs as the account that deployed it, so that account must be able to open every Event Sheet. Run **Create event** from the same account, or share the Season Sheet's folder with it.

## 5. Point the app at it

Create `.env.local` in the repo root. It is gitignored.

```sh
VITE_SCRIPT_URL=https://script.google.com/macros/s/…/exec
```

Then run `npm run dev`. Without `VITE_SCRIPT_URL`, the dev server uses an in-memory fake instead of your script.

## 6. Check it by hand

Use a past event that TBA has a schedule for, such as `2025nyro`.

1. **Create event:** choose **Scouting → Create event…** and enter the event key. The first time, Google asks for permission to manage spreadsheets, Drive files and external requests. Expect a message with the number of teams and qualification matches. Then check:
   - The Season Sheet has a `Settings` tab with Current event set to the key, and an `Events` tab with the key and an Event Sheet ID.
   - A spreadsheet `Scouting <event key>` is in the same folder, with a `Schedule` tab (Match, then Red 1 to Blue 3, qualification matches only) and a `Teams` tab.
2. **Create it again:** run **Create event…** with the same key. Expect "already had an Event Sheet, so it was reused", and no second spreadsheet.
3. **Typo:** run **Create event…** with a key TBA doesn't know, such as `2025nyrx`. Expect a warning; choose **No**, and nothing changes.
4. **Wrong access code:** on the app's Device setup screen, enter a wrong code. Expect "Wrong access code".
5. **Right access code:** enter the code from step 3. Expect the home screen to show the event key and its number of qualification matches.
6. **Team filled in:** choose **New Match Report**, enter match 1 and pick a Station. Each Station shows its team number, and the chosen team appears as "from the schedule". Compare it with the Schedule tab.
7. **Manual entry:** enter a match number past the end of the schedule, such as 200. Expect a note that the match isn't in the schedule, and a team number field.
8. **First Upload:** answer the required questions, choose Complete, then **Upload now**. Expect "Uploaded 1 Report" and the Report marked Uploaded. In the Event Sheet, the `Match Reports` tab should have the metadata columns, then one column per question code, and one row for the Report.
9. **Nothing to resend:** **Upload now** is disabled while 0 Reports are waiting.
10. **Second Report:** complete another Match Report and upload it. Expect a second row, with no duplicate of the first.
11. **Offline:** turn off the network (on the computer running `npm run dev`, so the page still loads) and reload the app. The event and schedule are still there, and a new Match Report still fills in the team. Turn the network back on.
12. **Refresh schedule:** in the Schedule tab, delete a few rows, then choose **Scouting → Refresh schedule**. Expect the rows back. In the app, choose **Refresh**, and expect the same number of matches as before.
13. **Unknown event:** in the Season Sheet's Settings tab, change Current event to `2026nope`. In the app, choose **Refresh**. Expect an error saying `2026nope` isn't in the Events tab, and the app keeps its old Event Bundle. Then put the setting back.

## Updating the script later

Rebuild, paste the new `Code.js`, then choose **Deploy → Manage deployments**, edit the existing deployment, set **Version** to **New version** and deploy. The URL stays the same, so devices keep working. If the new version needs new permissions, Google asks you to authorize again.

## Typing a schedule by hand

For an event TBA doesn't cover, such as a scrimmage, run **Create event…** anyway and choose **Yes** at the warning. Then fill in the Event Sheet:

- **Schedule tab:** one row per match, with the match number under `Match` and team numbers under `Red 1` to `Blue 3`. Leave a cell blank if you don't know the team; Scouts type it in.
- **Teams tab:** one team number per row under `Team`. Teams in the schedule are added to the list automatically.

**Refresh schedule** never wipes a tab when TBA has nothing for it. When TBA does return a schedule or team list, it replaces that tab.

## Rules for the Event Sheet

- **Leave the Report tabs alone,** apart from the Void column (from ticket 07). Every Upload rewrites those tabs, which turns formulas in them into plain values and could clash with columns you add.
- **Do analysis in other tabs** or other spreadsheets that reference the Report tabs.
- **The Season Sheet's Settings and Events tabs** are rewritten by the menu actions too, so keep formulas out of them.
