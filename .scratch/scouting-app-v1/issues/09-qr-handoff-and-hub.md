# 09: QR handoff and the Hub

**What to build:** A Scout with no connection shows a Complete Report as a QR code. A logged-in Scout running the Hub screen scans it, with the device camera or the KU061 handheld scanner acting as a keyboard. The Hub confirms each scan (Scout, match, Station, team) and stores the Report under its original Scout. Rescanning does nothing, and a newer copy replaces an older one. The Hub Uploads the Reports later. The Scout can mark Reports as handed off, so their pending count stays accurate.

See the spec: QR codec, Hub, user stories 41–47.

**Blocked by:** 05, 07

**Status:** ready-for-agent

- [x] One Report per QR code, in a compact, versioned envelope, using plain ASCII text only.
- [x] Encoding and decoding loses nothing, for every question type.
- [x] The Hub screen accepts camera scans and keystroke-style input from the scanner.
- [x] Each scan shows a confirmation with the Scout, match, Station and team.
- [x] A Report the Hub already has is ignored unless the scanned copy is newer.
- [x] Reports from the Hub keep the original Scout's ID and are Uploaded marked as coming from the Hub.
- [x] A Scout can mark a Report as handed off, and it no longer counts as pending on their device.
- [x] Core tests cover: QR round-trips, a duplicate scan, a newer scan, an older scan, the original Scout kept, and handed-off Reports leaving the pending count.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (195 tests). `npm run build` and `npm run build:script` both succeed.
- **The QR envelope** is one line of printable ASCII text: `SR1|id|kind|event|scout|version|void|created|updated|match|station|team|answers…|checksum`. The full format is documented at the top of the codec in the core.
  - Answers go in the order of the Report's Season Config version, without their question codes, because every device ships every version. A typical demo Match Report is about 150 characters.
  - Text answers are escaped, so emoji, accents and `|` survive a keyboard-style scanner. Empty text and no answer stay different.
  - Timestamps are milliseconds in base 36, and they round-trip exactly.
  - A 32-bit FNV-1a checksum catches a character a scanner dropped or changed.
  - **Size limit:** 600 characters, which is a QR code of version 19 or smaller at error correction level M. A longer Report gets a clear error asking for shorter text answers.
- **Libraries:** `qrcode` draws the QR code, and `jsqr` reads it from the camera. A test draws a real QR code and reads it back. `jsqr` is plain JavaScript with no runtime download, so it works offline.
- **Hub intake** checks every answer and required question against the Season Config before storing the Report under its original Scout. A Season Config version the app doesn't have gets "Update the app". The Hub then Uploads the Report through the normal queue.
- **Uploaded via Hub:** an Upload request can now list `hubReportIds`. The script writes `hub` in the Uploaded via column for those Reports and `device` for the rest. Older clients that don't send the list are unaffected.
- **Handed off** is tied to the version handed off, like Uploaded. Editing or Voiding the Report afterwards makes it pending again, so the change still reaches the Sheet.
- Decisions beyond the ticket:
  - **The Hub can't change the Reports it collects.** They belong to their Scouts, and the Hub operator's My Reports only lists their own.
  - **One bundle, not split.** Loading the camera code only when needed failed offline in the browser check and blanked the page. The bundle stays whole, and the size warning limit was raised to 700 kB with a comment.
  - **Camera on HTTPS only.** Browsers only allow the camera on HTTPS or localhost, so the camera can't be tested on a phone against the dev server. The KU061 and typing work anywhere.
- **Browser check:** in headless Chrome against the dev server, a Scout offline showed a QR code. A Hub read it through Chrome's fake camera, fed with the QR code from the Scout's screen. The same text typed as a scanner would gave "Already had this one", and a changed character gave a checksum error. Back online, the Hub Uploaded the Report, and the Scout marked it handed off.
- **Not done yet:** a manual check with the KU061, a phone and a real Season Sheet, steps 27–31 of `docs/apps-script-setup.md`. The script changed, so rebuild, paste and redeploy it first.
