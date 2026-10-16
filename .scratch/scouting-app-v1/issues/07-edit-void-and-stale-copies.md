# 07: Edit, Void and stale copies

**What to build:** A Scout edits a Complete Report and Uploads it again, and the edit replaces the earlier row instead of adding one. A Scout can Void a Report on the device. An Admin can Void a Report by ticking its Void cell in the Event Sheet, and it stays Void even if an older copy is Uploaded later. An older copy of a Report never overwrites a newer one. Voided Reports stay in the Sheet, flagged.

See the spec: Upload rules, user stories 27–33, 40.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Editing a Complete Report keeps it Complete, updates its updated timestamp and puts it back in the pending Upload queue.
- [ ] A Scout can Void their own Report on the device, and the Void is Uploaded.
- [ ] The script writes an incoming Report only when its updated time is at least the stored one. Otherwise it returns "ignored as stale".
- [ ] A Void set in the Sheet is never cleared by any Upload.
- [ ] Voided rows remain in the Sheet with the Void column set.
- [ ] Two Reports from different Scouts on the same Station in the same match are both kept.
- [ ] Node tests over tables cover: an edit updating the same row, a stale copy ignored, the Sheet's Void surviving a later Upload, and two Scouts on one Station. Core tests cover edit and Void.
