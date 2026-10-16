# 03: First Upload to an Event Sheet

**What to build:** An Admin enters the team access code on a device once. A Scout presses "Upload now", and their Complete Match Reports appear as rows in a test Event Sheet: one row per Report, with metadata columns followed by one column per question code. Uploading the same Reports again changes nothing. This is the first slice through the Apps Script. It sets up:

- the script logic as plain functions over 2D arrays, with Node tests
- the thin adapter to the Sheets service
- the HTTP Sheet gateway in the app

See the spec: ADR 0001, Sheet gateway, Upload rules, Apps Script.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The device setup screen stores the access code locally. The code never appears in the repo.
- [ ] The Apps Script web app accepts an upload batch and rejects a wrong access code. The code is stored in script properties.
- [ ] The script routes each Report to the Event Sheet listed for its event key in the Season Sheet's Events tab, and rejects an unknown event key with a reason.
- [ ] A Report is upserted by its ID: a new ID adds a row, and an existing ID updates its row in place.
- [ ] The Match Reports tab gets the fixed metadata columns (as listed in the spec) and then one column per question code. Columns are appended the first time a code is seen and are never removed or reordered.
- [ ] The gateway returns one result per Report ID, and the device marks stored Reports as Uploaded.
- [ ] Only Complete Reports are sent. Drafts never leave the device.
- [ ] The HTTP gateway and the fake gateway implement the same interface and use the shared types.
- [ ] Node tests over 2D-array tables cover: access code rejection, routing, unknown event key, insert vs update, and appending columns.
- [ ] Manually checked against a real test Season Sheet and Event Sheet, with the steps written down so a student can repeat them.
