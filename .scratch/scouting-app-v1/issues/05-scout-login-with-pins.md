# 05: Scout login with PINs

**What to build:** A Scout picks their name from the roster and enters their PIN, and the device checks it offline. They stay logged in until they log out, and every Report they create is stamped with their Scout ID. On a shared tablet, the next Scout has to log in with their own PIN. Admins manage names and PINs in the Season Sheet's Scouts tab, and no student names or PINs are ever in the repo.

See the spec: Login, user stories 4–10.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The Season Sheet has a Scouts tab (Scout ID, name, PIN) maintained by Admins.
- [ ] The Event Bundle carries the roster with salted SHA-256 PIN hashes, never the PINs themselves.
- [ ] Login succeeds offline with the correct PIN and fails with a wrong one.
- [ ] A login lasts until logout and survives a reload.
- [ ] Reports can only be started while a Scout is logged in, and each is stamped with that Scout's ID.
- [ ] Logging out and logging in as another Scout needs that Scout's PIN.
- [ ] The Event Sheet's Scout name column is filled from the roster when a Report is Uploaded.
- [ ] A clear message appears when the device has no Event Bundle yet.
- [ ] Tests cover: correct and wrong PIN offline, staying logged in after a reload, Reports stamped with the logged-in Scout, switching Scouts, and bundle PIN hashing in the script logic.
