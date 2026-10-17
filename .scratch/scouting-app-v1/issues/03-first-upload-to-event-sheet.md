# 03: First Upload to an Event Sheet

**What to build:** An Admin enters the team access code on a device once. A Scout presses "Upload now", and their Complete Match Reports appear as rows in a test Event Sheet: one row per Report, with metadata columns followed by one column per question code. Uploading the same Reports again changes nothing. This is the first slice through the Apps Script. It sets up:

- the script logic as plain functions over 2D arrays, with Node tests
- the thin adapter to the Sheets service
- the HTTP Sheet gateway in the app

See the spec: ADR 0001, Sheet gateway, Upload rules, Apps Script.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] The device setup screen stores the access code locally. The code never appears in the repo.
- [x] The Apps Script web app accepts an upload batch and rejects a wrong access code. The code is stored in script properties.
- [x] The script routes each Report to the Event Sheet listed for its event key in the Season Sheet's Events tab, and rejects an unknown event key with a reason.
- [x] A Report is upserted by its ID: a new ID adds a row, and an existing ID updates its row in place.
- [x] The Match Reports tab gets the fixed metadata columns (as listed in the spec) and then one column per question code. Columns are appended the first time a code is seen and are never removed or reordered.
- [x] The gateway returns one result per Report ID, and the device marks stored Reports as Uploaded.
- [x] Only Complete Reports are sent. Drafts never leave the device.
- [x] The HTTP gateway and the fake gateway implement the same interface and use the shared types.
- [x] Node tests over 2D-array tables cover: access code rejection, routing, unknown event key, insert vs update, and appending columns.
- [x] Manually checked against a real test Season Sheet and Event Sheet, with the steps written down so a student can repeat them.

## Comments

**2026-10-16, implementation:**
- `npm test` passes (63 tests). `npm run build` and `npm run build:script` both succeed.
- **Not done yet:** the manual check against a real Season Sheet needs a Google account. The steps are written in `docs/apps-script-setup.md`. Tick the last box once someone has run them.
- **Script logic** (`src/script/logic.ts`): plain functions over 2D arrays behind a `SpreadsheetPort`, tested in Node with an in-memory port. The adapter (`appsScriptAdapter.ts`) wraps each request in a script lock, so two Uploads can't overwrite each other.
- **Contract test:** `HttpSheetGateway` is tested against the real script logic through a fake `fetch`, so the app and the script can't disagree about the protocol.
- **Script build:** `npm run build:script` bundles everything into one `dist-script/Code.js` to paste into the script editor.
- Decisions beyond the ticket:
  - **Minimal Event Bundle from the script.** The script already serves an Event Bundle with just the current event (from the Settings tab), so the real app can start Reports. Ticket 04 adds the schedule and teams.
  - **One endpoint.** Both requests are POSTs with the access code in the JSON body, never the URL. The body is sent as `text/plain`, because Apps Script can't answer a CORS preflight.
  - **Device-only upload state.** "Uploaded" is stored on the device as the `updatedAt` the Sheet last stored. A Report that changes later becomes pending again on its own, which ticket 07 relies on.
  - **Script-side checks.** The script rejects Drafts and malformed Reports. Text that starts like a formula (`=`, `+`, `-`, `@`) is stored with a leading apostrophe, so nobody can inject a formula into the Sheet.
  - **Multiple choice in the Sheet.** Selections are written as one cell, separated by commas (`Park, Climb`).
  - **Pit Reports already route** to a `Pit Reports` tab, so ticket 06 only needs the UI.
  - **Cleared answers clear their cell.** Every question-code column is rewritten on each Upload, so a cleared answer clears its cell.
  - **Configuring the URL.** `VITE_SCRIPT_URL` in `.env.local` points the app at the script. Without it, the dev server uses the in-memory fake.
- **Known limitation:** each Upload rewrites the whole Report tab, so formulas in that tab become values. The setup doc tells Strategists to do analysis in other tabs.

**2026-10-17, manual check:** The user ran every step in `docs/apps-script-setup.md` against a real test Season Sheet and Event Sheet.
