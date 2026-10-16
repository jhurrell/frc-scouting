# 09: QR handoff and the Hub

**What to build:** A Scout with no connection shows a Complete Report as a QR code. A logged-in Scout running the Hub screen scans it, with the device camera or the KU061 handheld scanner acting as a keyboard. The Hub confirms each scan (Scout, match, Station, team) and stores the Report under its original Scout. Rescanning does nothing, and a newer copy replaces an older one. The Hub Uploads the Reports later. The Scout can mark Reports as handed off, so their pending count stays accurate.

See the spec: QR codec, Hub, user stories 41–47.

**Blocked by:** 05, 07

**Status:** ready-for-agent

- [ ] One Report per QR code, in a compact, versioned envelope, using plain ASCII text only.
- [ ] Encoding and decoding loses nothing, for every question type.
- [ ] The Hub screen accepts camera scans and keystroke-style input from the scanner.
- [ ] Each scan shows a confirmation with the Scout, match, Station and team.
- [ ] A Report the Hub already has is ignored unless the scanned copy is newer.
- [ ] Reports from the Hub keep the original Scout's ID and are Uploaded marked as coming from the Hub.
- [ ] A Scout can mark a Report as handed off, and it no longer counts as pending on their device.
- [ ] Core tests cover: QR round-trips, a duplicate scan, a newer scan, an older scan, the original Scout kept, and handed-off Reports leaving the pending count.
