# Apps Script setup and manual check

The Apps Script is the app's only server (see `docs/adr/0001-google-sheets-as-the-only-backend.md`). Its logic is tested automatically, but the thin adapter to Google Sheets is not. Follow these steps whenever the script changes, using a **test** Season Sheet, never the real one.

## 1. Build the script

```sh
npm run build:script
```

This writes one file, `dist-script/Code.js`.

## 2. Make a test Season Sheet and Event Sheet

1. In Google Sheets, create a spreadsheet called `Scouting Season (test)`. This is the **Season Sheet**.
2. Rename the first tab to `Settings` and fill it in:

   |     | A             | B          |
   | --- | ------------- | ---------- |
   | 1   | Setting       | Value      |
   | 2   | Current event | `2026demo` |

3. Add a tab called `Events`:

   |     | A         | B                             |
   | --- | --------- | ----------------------------- |
   | 1   | Event key | Event Sheet ID                |
   | 2   | `2026demo` | _(the Event Sheet ID, below)_ |

4. Create a second spreadsheet called `Scouting 2026demo (test)`. This is the **Event Sheet**. Copy its ID from the address bar: the long part between `/d/` and `/edit`. Paste it into the Events tab.

The script creates the `Match Reports` and `Pit Reports` tabs itself on the first Upload. (From ticket 04, "Create event" does all of step 4 for you.)

## 3. Install the script

1. In the Season Sheet, choose **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the contents of `dist-script/Code.js`, then save.
3. Open **Project Settings** (the gear icon). Under **Script Properties**, add `ACCESS_CODE` with a code of your choice. Keep it out of git and out of chat; Admins type it into each device.

## 4. Deploy it as a web app

1. Choose **Deploy → New deployment**, select type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
2. Choose **Deploy** and authorize it. Google warns that the app isn't verified; choose **Advanced**, then **Go to … (unsafe)**. It is your own script.
3. Copy the **Web app URL** (it ends in `/exec`).

## 5. Point the app at it

Create `.env.local` in the repo root. It is gitignored.

```sh
VITE_SCRIPT_URL=https://script.google.com/macros/s/…/exec
```

Then run `npm run dev`. Without `VITE_SCRIPT_URL`, the dev server uses an in-memory fake instead of your script.

## 6. Check it by hand

1. **Wrong access code:** on the Device setup screen, enter a wrong code. Expect "Wrong access code".
2. **Right access code:** enter the code from step 3. Expect the home screen to show "Event 2026demo".
3. **First Upload:** start a Match Report, answer the required questions, choose Complete, then **Upload now**. Expect "Uploaded 1 Report" and the Report marked Uploaded. In the Event Sheet, the `Match Reports` tab should have the metadata columns, then one column per question code, and one row for the Report.
4. **Nothing to resend:** **Upload now** is disabled while 0 Reports are waiting.
5. **Second Report:** complete another Match Report and upload it. Expect a second row, with no duplicate of the first.
6. **Unknown event:** in the Season Sheet, change Current event to `2026nope` (not in the Events tab). In the app, choose Device setup and enter the code again to download the new Event Bundle. Complete a Report and upload it. Expect it to be rejected with `unknown event key "2026nope"` and stay Not uploaded. Then put the setting back.

## Updating the script later

Rebuild, paste the new `Code.js`, then choose **Deploy → Manage deployments**, edit the existing deployment, set **Version** to **New version** and deploy. The URL stays the same, so devices keep working.

## Rules for the Event Sheet

- **Leave the Report tabs alone,** apart from the Void column (from ticket 07). Every Upload rewrites those tabs, which turns formulas in them into plain values and could clash with columns you add.
- **Do analysis in other tabs** or other spreadsheets that reference the Report tabs.
