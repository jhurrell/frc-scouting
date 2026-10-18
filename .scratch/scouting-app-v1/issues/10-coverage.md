# 10: Coverage

**What to build:** A Scout lead opens Coverage and sees a grid of matches by Stations showing which ones have Match Reports. When online, it comes from everyone's Uploads, via a Coverage snapshot in the Event Bundle. When offline, it shows only this device's Reports and says so clearly. Stations with more than one Report are highlighted, and Voided Reports don't count.

See the spec: Sheet gateway (Coverage snapshot), user stories 48–52.

**Blocked by:** 04, 07

**Status:** ready-for-agent

- [x] The Event Bundle includes a Coverage snapshot: match and Station to a count of non-Void Match Reports.
- [x] Refreshing Coverage downloads the Event Bundle again. The gateway keeps its two operations.
- [x] The grid shows every scheduled match by the six Stations, with the empty cells easy to see.
- [x] Offline, Coverage is built from local Reports and labelled as local only.
- [x] Stations with more than one Report are highlighted.
- [x] Voided Reports never count toward Coverage.
- [x] Tests cover the snapshot built by the script logic (including Void and duplicates) and the core's online and offline Coverage.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (212 tests). `npm run build` and `npm run build:script` both succeed.
- **One count, three places.** A single shared function decides what counts toward Coverage: non-Void Match Reports, per match and Station. The script, the fake Sheet gateway and the device's local Coverage all use it, so they can't disagree.
- **The script's snapshot** reads the current event's `Match Reports` tab by its header. An Admin's Void (ticked or typed) counts as Void, an edited Report counts once because it is one row, and rows without a usable match number or Station are skipped.
- **The fake gateway** now counts Coverage from the Reports Uploaded to it, so local development shows real Coverage.
- **Refreshing Coverage** downloads the Event Bundle again; the gateway still has two operations. It first Uploads this device's pending Reports, so a Scout lead's own Reports are in the snapshot.
- **Offline,** or when the Season Sheet can't be reached, Coverage counts this device's Complete, non-Void Match Reports for the current event, including any received as a Hub, and says why. Drafts don't count, matching the Sheet, which only ever has Complete Reports.
- **The grid** shows every scheduled match by the six Stations with the schedule's team numbers. Green is scouted, grey is a gap, amber is more than one Report with a count. A match that isn't in the schedule but has Reports, such as a playoff, gets its own row, marked with an asterisk. A line above the grid gives "N of M scheduled Stations scouted".
- Decisions beyond the ticket:
  - **Any logged-in Scout can open Coverage.** The app has no Scout lead role, and the Hub is open to anyone the same way.
  - **Coverage isn't live.** It refreshes when the screen opens and when the Scout lead chooses Refresh, because the online count needs a download.
- **Browser check:** in headless Chrome at phone width (390 px) against the dev server, three Reports were completed and one Voided. Coverage showed one green Station, one amber ×2, and the Voided one not counted, with no sideways scroll. Offline, it showed the "This device only" banner. Checked in light and dark mode.
- **Manual check passed** against a real Season Sheet, steps 32–34 of `docs/apps-script-setup.md`, after the script was rebuilt and redeployed.
