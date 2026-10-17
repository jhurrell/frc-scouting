# 08: Automatic Upload and the pending count

**What to build:** Complete Reports Upload without the Scout thinking about it: when a Report is completed while online, and when the connection comes back. "Upload now" is still there. The app always shows how many Reports are waiting. When an Upload fails (wrong access code, no connection, the script unreachable), the Scout sees a clear message and the Reports stay safely on the device to be retried.

See the spec: Uploading, user stories 34–38.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] Completing a Report while online triggers an Upload.
- [x] Regaining a connection triggers an Upload of everything pending.
- [x] A pending count is visible from every screen.
- [x] A failed Upload leaves every Report on the device, still pending, and shows a clear reason.
- [x] Rejections for individual Reports are shown per Report and don't block the rest of the batch.
- [x] Retrying after a partial failure never duplicates rows, because Uploads are idempotent.
- [x] Core tests cover: automatic Upload on Complete, retry after a gateway failure, the pending count, and rejections for individual Reports, all using the fake gateway with simulated failures.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (165 tests). `npm run build` and `npm run build:script` both succeed. The script didn't change.
- **What triggers an Upload:** completing a Report, Voiding one, leaving a Report the Scout was editing, the connection coming back, the app starting, and **Upload now**. The automatic ones only run while the browser says it's online.
- **Watching the connection** is an optional dependency of the core. The app passes the browser's online events; tests pass a fake. Without one, nothing Uploads automatically, so the older tests have no background Uploads racing them.
- **One Upload at a time.** A request made during an Upload waits, then runs once, so Reports completed meanwhile go in the next batch. The fake gateway can now pause an Upload and records every batch, so tests can check this.
- **Upload status.** The device keeps how the last attempt went: the reason if the whole batch failed, and each rejected Report with the version that was rejected. It survives a reload.
  - A line at the top of every screen shows the pending count, "Offline" when the browser says so, the last failure, and how many were not accepted.
  - A rejected Report shows "Not accepted" and the reason on its row in My Reports. Changing the Report hides the old reason, since the new version hasn't been refused.
  - A failed attempt keeps the earlier rejections, because it learned nothing new about them.
- **No duplicate rows on retry:** the script upserts by Report ID, which ticket 03's tests already cover. The new tests check that a retry sends the same Report IDs again and the Sheet holds each once.
- Decisions beyond the ticket:
  - **No timed retries.** If the browser says online but there's no internet, which is common on event Wi-Fi, a failed Upload waits for the next trigger. Scouts complete a Report every few minutes, so that comes soon. A timer could be added later.
  - **Not done here:** Device setup stores a new access code even when the Event Bundle download then says it's wrong. That was already the case before this ticket.
- **Blank screen after the first automatic Upload, found in manual testing.** My Reports read inside a Dexie read transaction, added in `d4b0f3d` to fix the list not refreshing. In a real browser, IndexedDB committed that transaction early ("PrematureCommitError") once this ticket added another nested read, and the error blanked the home screen. The in-memory IndexedDB the tests use doesn't commit early, so no test caught it. My Reports now starts all its reads at once, before awaiting anything, so Dexie sees them without a transaction. Checked in headless Chrome against the dev server: completing, editing, Voiding, reloading, and going offline and back all work with no page errors.
- **Manual check:** steps 23–26 of `docs/apps-script-setup.md` passed against a real Season Sheet.
