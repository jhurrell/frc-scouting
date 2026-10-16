# 01: Walking skeleton: one Match Report on the device

**What to build:** A Scout opens the app locally, starts a Match Report, answers a single counter question and marks it Complete. The Report is still there, Complete, after a reload. This ticket also lays the foundations every later ticket builds on:

- a TypeScript, React and Vite project
- Vitest, with an in-memory IndexedDB
- the shared Report and Event Bundle types
- the scouting core, with no React in it
- Dexie persistence
- the in-memory fake Sheet gateway

See the spec: `.scratch/scouting-app-v1/spec.md` (Modules, Testing Decisions).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The app runs from the Vite dev server, and the tests run with one command.
- [ ] A tiny Season Config (version 1, one Match Stage, one counter question) is loaded as data. No question is hardcoded in UI code.
- [ ] Through the scouting core, a Scout can start a Match Report (match number, Station, team number typed in), answer the counter, and complete the Report.
- [ ] A Report is a Draft until it is completed, and it carries a device-generated unique ID, its event key, its Season Config version and created/updated timestamps.
- [ ] Reports are persisted in IndexedDB and are still there after a reload.
- [ ] The counter's plus and minus change the value by exactly one per press, with no double counting.
- [ ] The shared Report and Event Bundle types exist in one place, ready for both the app and the Apps Script logic to use.
- [ ] An in-memory fake Sheet gateway implements the two gateway operations (fetch the Event Bundle, upload a batch of Reports).
- [ ] The core's tests drive it only through its public operations, using real Dexie on an in-memory IndexedDB.
- [ ] Thin React screens: home (a list of this device's Reports with their status) and the Match Report form.
