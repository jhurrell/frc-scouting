# 10: Coverage

**What to build:** A Scout lead opens Coverage and sees a grid of matches by Stations showing which ones have Match Reports. When online, it comes from everyone's Uploads, via a Coverage snapshot in the Event Bundle. When offline, it shows only this device's Reports and says so clearly. Stations with more than one Report are highlighted, and Voided Reports don't count.

See the spec: Sheet gateway (Coverage snapshot), user stories 48–52.

**Blocked by:** 04, 07

**Status:** ready-for-agent

- [ ] The Event Bundle includes a Coverage snapshot: match and Station to a count of non-Void Match Reports.
- [ ] Refreshing Coverage downloads the Event Bundle again. The gateway keeps its two operations.
- [ ] The grid shows every scheduled match by the six Stations, with the empty cells easy to see.
- [ ] Offline, Coverage is built from local Reports and labelled as local only.
- [ ] Stations with more than one Report are highlighted.
- [ ] Voided Reports never count toward Coverage.
- [ ] Tests cover the snapshot built by the script logic (including Void and duplicates) and the core's online and offline Coverage.
