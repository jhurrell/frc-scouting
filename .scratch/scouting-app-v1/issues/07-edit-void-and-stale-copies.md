# 07: Edit, Void and stale copies

**What to build:** A Scout edits a Complete Report and Uploads it again, and the edit replaces the earlier row instead of adding one. A Scout can Void a Report on the device. An Admin can Void a Report by ticking its Void cell in the Event Sheet, and it stays Void even if an older copy is Uploaded later. An older copy of a Report never overwrites a newer one. Voided Reports stay in the Sheet, flagged.

See the spec: Upload rules, user stories 27–33, 40.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] Editing a Complete Report keeps it Complete, updates its updated timestamp and puts it back in the pending Upload queue.
- [x] A Scout can Void their own Report on the device, and the Void is Uploaded.
- [x] The script writes an incoming Report only when its updated time is at least the stored one. Otherwise it returns "ignored as stale".
- [x] A Void set in the Sheet is never cleared by any Upload.
- [x] Voided rows remain in the Sheet with the Void column set.
- [x] Two Reports from different Scouts on the same Station in the same match are both kept.
- [x] Node tests over tables cover: an edit updating the same row, a stale copy ignored, the Sheet's Void surviving a later Upload, and two Scouts on one Station. Core tests cover edit and Void.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (105 tests). `npm run build` and `npm run build:script` both succeed.
- **Editing:** a Complete Report has **Edit** and **Void** buttons. Edit unlocks the questions, and each change saves at once, as in a Draft.
  - The Report stays Complete, so a change that would leave a required question unanswered is refused. The old answer stays.
  - Every change gives the Report a new updated time, which puts it back in the Upload queue.
- **Void is one-way, with a confirm.** There's no un-Void, because the Sheet's Void is sticky: an un-Void could never reach the Sheet, so the device would only disagree with it. A Void Report can't be edited.
- **A Draft can be Voided too.** That's how a Scout drops a wrong-team Draft. A Void Draft can't be completed, so it never leaves the device.
- **Stale outcomes:** the device counts a stale copy as done, because the Sheet already has something newer. The Upload message reports it separately. The fake gateway now ignores stale copies too, like the script.
- **Script rules:**
  - An equal updated time is written again, so a retry is harmless.
  - A copy older than the stored one is ignored as stale, and if a batch is all stale, the tab isn't rewritten.
  - **Sticky Void:** a Void cell counts as set when it is ticked, or holds TRUE, yes, y, x, void or 1. Once set, no Upload clears it. This covers a Void set by an Admin and one set by a device.
  - **Comparing times:** times are compared as dates, not text, in case Sheets turns the `Updated` cell into a date.
- **Void checkboxes:** after each write, the adapter turns the Void column of the Report tabs into checkboxes.

**2026-10-17, manual check:** The user checked edit and Void, on the device and in the Sheet, against a real test Event Sheet using steps 14–16 of `docs/apps-script-setup.md`.
