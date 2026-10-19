# Apps Script setup and manual check

The Apps Script is the app's only server (see `docs/adr/0001-google-sheets-as-the-only-backend.md`). Its logic is tested automatically, but the thin adapter to Google Sheets is not. Follow these steps whenever the script changes, using a **test** Season Sheet, never the real one.

## 1. Build the script

```sh
npm run build:script
```

This writes one file, `dist-script/Code.js`.

## 2. Make a test Season Sheet

In Google Sheets, create a spreadsheet called `Scouting Season (2026)`, ideally in its own folder. This is the **Season Sheet**. Leave it empty: the script adds the `Settings`, `Scouts` and `Events` tabs, and creates each Event Sheet in the same folder.

## 3. Install the script

1. In the Season Sheet, choose **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the contents of `dist-script/Code.js`, then save.
3. Open **Project Settings** (the gear icon). Under **Script Properties**, add:
   - `ACCESS_CODE`: a code of your choice. Admins type it into each device.
   - `TBA_KEY`: a read API key from The Blue Alliance. Log in at thebluealliance.com, open **Account**, and add a **Read API Key**.

   Keep both out of git and out of chat.

## 4. Deploy it as a web app

1. Choose **Deploy → New deployment**, select type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
2. Choose **Deploy** and authorize it. Google warns that the app isn't verified; choose **Advanced**, then **Go to … (unsafe)**. It is your own script.
3. Copy the **Web app URL** (it ends in `/exec`).
4. Reload the Season Sheet. A **Scouting** menu appears next to **Help**.

The web app runs as the account that deployed it, so that account must be able to open every Event Sheet. Run **Create event** from the same account, or share the Season Sheet's folder with it.

## 5. Point the app at it

Create `.env.local` in the repo root. It is gitignored. Set a variable to the URL collected from step 3 above from "Deploy it as a web app".

```sh
VITE_SCRIPT_URL=https://script.google.com/macros/s/…/exec
```

Then run `npm run dev`. Without `VITE_SCRIPT_URL`, the dev server uses an in-memory fake instead of your script.

## 6. Check it by hand

Use a past event that TBA has a schedule for, such as `2025nyro`.

1. **Create event:** choose **Scouting → Create event…** and enter the event key. The first time, Google asks for permission to manage spreadsheets, Drive files and external requests. Expect a message with the number of teams and qualification matches. Then check:
   - The Season Sheet has a `Settings` tab with Current event set to the key, an empty `Scouts` tab, and an `Events` tab with the key, an Event Sheet ID and the event's name from TBA.
   - A spreadsheet `Scouting <event key> <event name>` is in the same folder, with a `Schedule` tab (Match, then Red 1 to Blue 3, qualification matches only) and a `Teams` tab.
2. **Create it again:** run **Create event…** with the same key. Expect "already had an Event Sheet, so it was reused", and no second spreadsheet.
3. **Typo:** run **Create event…** with a key TBA doesn't know, such as `2025nyrx`. Expect a warning; choose **No**, and nothing changes.
4. **Scouts:** in the new `Scouts` tab, add two made-up test Scouts (never real students in a test sheet you share), for example `t1`, `Test Scout One`, `0123` and `t2`, `Test Scout Two`, `4567`.
5. **Wrong access code:** on the app's Device setup screen, enter a wrong code. Expect "Wrong access code".
6. **Right access code:** enter the `ACCESS_CODE` from section 3. Expect the Log in screen, with "<event name> (<event key>)" and both test Scouts.
7. **Log in:** choose `Test Scout One` and enter a wrong PIN. Expect "Wrong PIN". Enter `0123`. Expect the home screen, showing "Logged in as Test Scout One" and the number of qualification matches.
8. **Team filled in:** choose **New Match Report**, enter match 1 and pick a Station. Each Station shows its team number, and the chosen team appears as "from the schedule". Compare it with the Schedule tab.
9. **Manual entry:** enter a match number past the end of the schedule, such as 200. Expect a note that the match isn't in the schedule, and a team number field.
10. **First Upload:** answer the required questions, choose Complete, then **Upload now**. Expect "Uploaded 1 Report" and the Report marked Uploaded. In the Event Sheet, the `Match Reports` tab should have the metadata columns, then one column per question code, and one row for the Report, with `t1` as Scout ID and `Test Scout One` as Scout.
11. **Nothing to resend:** **Upload now** is disabled while 0 Reports are waiting.
12. **Second Report:** complete another Match Report and upload it. Expect a second row, with no duplicate of the first.
13. **Offline:** turn off the network (on the computer running `npm run dev`, so the page still loads) and reload the app. The event and schedule are still there, and a new Match Report still fills in the team. Log out and log back in with `0123`: the PIN is checked on the device. Turn the network back on.
14. **Refresh schedule:** in the Schedule tab, delete a few rows, then choose **Scouting → Refresh schedule**. Expect the rows back. In the app, choose **Refresh**, and expect the same number of matches as before.
15. **Unknown event:** in the Season Sheet's Settings tab, change Current event to `2026nope`. In the app, choose **Refresh**. Expect an error saying `2026nope` isn't in the Events tab, and the app keeps its old Event Bundle. Then put the setting back.
16. **Edit:** open an Uploaded Report, choose **Edit**, change an answer and choose **Done**. Expect it Not uploaded; upload it. The Report's row in `Match Reports` changes in place, with a later `Updated`, and no new row appears.
17. **Void on the device:** open a Report, choose **Void** and confirm. Upload it. Its row stays, with the Void checkbox ticked.
18. **Void in the Sheet:** in `Match Reports`, tick the Void checkbox of a Report that isn't Void. In the app, edit that Report and upload it. Expect the edit in the row, and the Void still ticked.
19. **Shared device:** log out. Expect the Log in screen. Log in as `Test Scout Two` with `0123` (the other Scout's PIN); expect "Wrong PIN". Log in with `4567`. The home screen lists only Test Scout Two's Reports, and a new Report Uploads with `t2`.
20. **Stays logged in:** reload the page. Expect to still be logged in.
21. **Roster problems:** in the Scouts tab, change a PIN to `12`. In the app, choose **Refresh**. Expect an error naming the Scouts tab row, and the app keeps working with its old Event Bundle. Put the PIN back.
22. **Pit Report:** choose **New Pit Report**. Expect the Teams tab's teams as buttons. Pick one, answer the required question, choose Complete and upload. In the Event Sheet, the `Pit Reports` tab should have the same metadata columns as `Match Reports`, with Match and Station blank, then one column per pit question code. Start another Pit Report by typing a team number that isn't listed, and expect it to upload the same way.
23. **Automatic Upload:** complete a Match Report without pressing **Upload now**. Within a few seconds, expect the line at the top to say "Nothing waiting to Upload", the Report marked Uploaded, and its row in the Event Sheet.
24. **Offline, then back:** on the phone, turn on airplane mode without reloading the page. Complete two Reports. Expect the top line to say "2 Reports waiting to Upload · Offline". Turn airplane mode off. Expect both to Upload without pressing anything, and two new rows in the Sheet, with no duplicates.
25. **Script refuses:** in Apps Script, change the `ACCESS_CODE` Script Property to something else. Complete a Report. Expect the top line to say "Last Upload failed: Wrong access code", and the Report still pending. Put the property back and press **Upload now**. Expect it to Upload, and the failure message gone.
26. **Every screen:** while a Report is waiting, open New Match Report, a Report and the Log in screen. Expect the pending count at the top of each.
27. **QR handoff:** you need two devices: a Scout's phone and a Hub, which can be the computer running `npm run dev`, with the KU061 connected. Log the Hub in as `Test Scout Two`. On the phone, logged in as `Test Scout One`, turn on airplane mode and complete a Report. Open it and choose **Show QR code for a Hub**.
28. **Scanner:** on the Hub, choose **Hub**, click in the Scanner input box and scan the phone's QR code with the KU061. Expect "Added", with Test Scout One, the match, Station and team. Scan it again. Expect "Already had this one".
29. **Camera:** on a Hub opened at `http://localhost:5173` (browsers only allow the camera on HTTPS or localhost), choose **Scan with the camera** and hold the phone's QR code up to it. Expect the same confirmation. The camera doesn't work on a phone pointed at the computer's network address; use the deployed HTTPS app for that (see `docs/deploy.md`).
30. **Hub Upload:** when the Hub is online, expect its Received here list to show the Report as Uploaded. In the Event Sheet, its row has Scout ID `t1`, Scout `Test Scout One`, and Uploaded via `hub`.
31. **Handed off:** on the phone, choose **The Hub has it: mark as handed off**. Expect the Report marked Handed off and nothing waiting. Turn airplane mode off. Expect the phone not to Upload it again.
32. **Coverage:** first, as each test Scout, complete a Report on the same match and Station. Then on the Hub, online, choose **Coverage**. Expect "From everyone's Uploads" and a grid of every qualification match by the six Stations, with each Station's team number. The Stations of the Reports Uploaded in earlier steps are green, the shared Station is amber with ×2, and the Report Voided in step 17 isn't counted.
33. **Void in the Sheet:** in `Match Reports`, tick the Void checkbox of a Report on a green Station. Choose **Refresh** on Coverage. Expect that Station grey, or one fewer on an amber one.
34. **Coverage offline:** on the phone, turn on airplane mode and choose **Coverage**. Expect "This device only… This device is offline", with only the phone's own Complete, non-Void Match Reports counted.
35. **Event name on devices:** on Home, Login and Coverage, expect "<event name> (<event key>)". In the `Events` tab, shorten the name, choose **Refresh** in the app, and expect the shorter name.
36. **Event TBA doesn't have:** run **Create event…** with a made-up key such as `2025scrim` and choose **Yes** at the warning. When it asks for the event name, leave it blank. Expect an `Events` row with no name, a spreadsheet called `Scouting 2025scrim`, and "2025scrim" alone in the app after **Refresh**. Then set Current event back to the real event.
37. **Name filled in later:** in the `Events` tab, clear the real event's name, then choose **Scouting → Refresh schedule**. Expect TBA's name back in the cell. Change the name to something of your own and run **Refresh schedule** again. Expect your name kept.

## Updating the script later

Rebuild, paste the new `Code.js`, then choose **Deploy → Manage deployments**, edit the existing deployment, set **Version** to **New version** and deploy. The URL stays the same, so devices keep working. If the new version needs new permissions, Google asks you to authorize again.

## Managing Scouts

The Season Sheet's `Scouts` tab has one row per Scout: `Scout ID`, `Name` and `PIN`.

- **Scout ID:** short and never reused, such as `s01`. It goes on every Report the Scout makes, so don't change it during a season.
- **PIN:** four digits. Sheets drops a leading zero from a number like `0123`, but the script puts it back.
- **Changes reach devices on their next Refresh.** A Scout taken off the tab is logged out of every device after its next Refresh.
- If a row has a problem, such as a three-digit PIN or a Scout ID used twice, devices can't download the Event Bundle until it's fixed. They keep working with the bundle they already have.

The Season Sheet holds every PIN in plain text. Share it only with Admins.

## Typing a schedule by hand

For an event TBA doesn't cover, such as a scrimmage, run **Create event…** anyway and choose **Yes** at the warning. It then asks for the event's name, which devices show next to the event key; leave it blank to show only the key. Then fill in the Event Sheet:

- **Schedule tab:** one row per match, with the match number under `Match` and team numbers under `Red 1` to `Blue 3`. Leave a cell blank if you don't know the team; Scouts type it in.
- **Teams tab:** one team number per row under `Team`. Teams in the schedule are added to the list automatically.

**Refresh schedule** never wipes a tab when TBA has nothing for it. When TBA does return a schedule or team list, it replaces that tab.

## Rules for the Event Sheet

- **To Void a Report,** tick its Void checkbox. No Upload ever clears it. Leave the rest of the Report tabs alone. Every Upload rewrites those tabs, which turns formulas in them into plain values and could clash with columns you add.
- **Do analysis in other tabs** or other spreadsheets that reference the Report tabs.
- **The Season Sheet's Settings and Events tabs** are rewritten by the menu actions too, so keep formulas out of them.
- **The event's name** in the `Events` tab can be edited, for example to shorten a long name from TBA. The menu actions only fill in an empty name, never replace one. Devices show the change after their next Refresh.
