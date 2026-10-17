# 05: Scout login with PINs

**What to build:** A Scout picks their name from the roster and enters their PIN, and the device checks it offline. They stay logged in until they log out, and every Report they create is stamped with their Scout ID. On a shared tablet, the next Scout has to log in with their own PIN. Admins manage names and PINs in the Season Sheet's Scouts tab, and no student names or PINs are ever in the repo.

See the spec: Login, user stories 4–10.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] The Season Sheet has a Scouts tab (Scout ID, name, PIN) maintained by Admins.
- [x] The Event Bundle carries the roster with salted SHA-256 PIN hashes, never the PINs themselves.
- [x] Login succeeds offline with the correct PIN and fails with a wrong one.
- [x] A login lasts until logout and survives a reload.
- [x] Reports can only be started while a Scout is logged in, and each is stamped with that Scout's ID.
- [x] Logging out and logging in as another Scout needs that Scout's PIN.
- [x] The Event Sheet's Scout name column is filled from the roster when a Report is Uploaded.
- [x] A clear message appears when the device has no Event Bundle yet.
- [x] Tests cover: correct and wrong PIN offline, staying logged in after a reload, Reports stamped with the logged-in Scout, switching Scouts, and bundle PIN hashing in the script logic.

## Comments

**2026-10-17, implementation:**
- `npm test` passes (129 tests). `npm run build` and `npm run build:script` both succeed.
- **Manual check:** steps 4–7, 10, 13 and 19–21 of `docs/apps-script-setup.md` passed against a real Season Sheet, including login with PINs hashed by Apps Script's SHA-256, the one piece that isn't tested automatically.
- **PIN hashing:** the hash is lowercase hex SHA-256 of `salt:PIN`. That format is defined once in the shared contract and used by both sides.
  - The script uses `Utilities.computeDigest` and a fresh random salt on every bundle. The device uses Web Crypto.
  - A contract test checks that the device accepts the hash the script logic makes.
  - The script logic's tests use Node's real SHA-256, which is why `@types/node` is now a dev dependency.
- **Login state:** the device stores only the logged-in Scout ID. If a Refresh brings a roster without that Scout, they count as logged out.
- Decisions beyond the ticket:
  - **Only the Scout who made a Report can edit, complete or Void it.** Otherwise, on a shared tablet, someone could change another Scout's Report under their name (user story 8). Admins can still Void any Report in the Sheet.
  - **The Report list shows only the logged-in Scout's Reports.** The Upload queue still covers every Report on the device, whoever is logged in.
  - **Problems in the Scouts tab are loud.** A bad PIN, a missing name or a Scout ID used twice refuses the Event Bundle with the row number, instead of quietly locking someone out. Devices keep their old bundle until it's fixed.
  - **Leading zeros:** Sheets turns a typed `0123` into the number 123, so the script pads numeric PINs back to four digits.
  - **Create event adds an empty Scouts tab** with its headers if there isn't one.
  - **Dev demo Scout:** the dev fake's bundle has a made-up "Demo Scout" with PIN 0000, so local development can log in. No student data is in the repo.
- **Known weakness, as the spec intends:** there's no limit on PIN attempts. Four digits stop casual impersonation, not someone determined.
