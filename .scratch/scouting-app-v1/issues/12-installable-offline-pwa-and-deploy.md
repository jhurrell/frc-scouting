# 12: Installable offline PWA and deploy

**What to build:** A Scout installs the app to their phone's home screen, and it opens and works with no connection after the first load. When a new version is available, the app offers it only when no Draft is open, so an update never interrupts a match. A GitHub Action is ready to build and deploy the app to GitHub Pages on every push to main.

See the spec: Architecture, user stories 12, 67–69.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] The app has a web manifest and can be installed on iOS and Android.
- [x] A service worker caches the app so it loads and runs with no connection after the first visit.
- [x] A new version is detected and offered to the Scout, but only while no Draft is open.
- [x] A GitHub Actions workflow builds the app and deploys it to GitHub Pages on push to main, with the right base path for a project page.
- [ ] Verified manually: install, go offline, reload and scout. The deploy can only be verified once the repo is pushed to GitHub, so note that in the ticket when closing it.

## Comments

**2026-10-18, implemented:**
- **Manifest and icons:** a web manifest and icons (a red 578 square, also used as the maskable and Apple touch icons).
- **Service worker:** hand-written, in `src/pwa/serviceWorker.js`, with no PWA plugin dependency. The build fills in every built file and a version hash that changes whenever any file does. It caches everything on install, skipping the HTTP cache, serves the app from the cache, and leaves the Apps Script's requests alone.
- **Updates:** the new version waits until the Scout chooses **Update now**, or until the app is fully closed. The offer appears only on screens where no Report is being started, filled in or shown as a QR code. The app checks on start, when the connection comes back, when it returns to the screen, and every 30 minutes.
- **Storage:** the app asks the browser to keep its storage, so unsent Reports aren't cleared when space runs low.
- **Paths:** `base: './'`, so one build works under `/frc-scouting/` or anywhere else.
- **Deploy:** `.github/workflows/deploy.yml` runs `npm test`, builds with the `VITE_SCRIPT_URL` repository variable (it fails with a clear message if that's missing), and publishes to GitHub Pages.
- **Docs:** `docs/deploy.md` has the setup, installing on phones (install before setting up the device, because iOS keeps the home-screen app's storage separate from Safari), how updates reach phones, and a hand check. The README is updated.
- **Checked in headless Chrome,** with the build served under `/frc-scouting/` with Pages' `max-age=600`:
  - Chrome reports no installability errors.
  - The service worker controls the page after the first visit, without a reload.
  - With the server stopped, the app reloads and a Draft can be started.
  - After a second build is "deployed", the update is offered on Home and Coverage, but not with a Draft open or on New Match Report.
  - **Update now** loads the new build, deletes the old cache and keeps the Draft. It also works offline afterwards.
- **Not yet verified:** a real install on iOS and Android, and the GitHub deploy itself. Both need Pages turned on and the `VITE_SCRIPT_URL` variable set (`docs/deploy.md`, "One-time setup on GitHub"), then the hand check in the same file.

**2026-10-18, deployed:**
- The first Deploy run (commit `5d7e7ed`) passed. The app is live at https://jhurrell.github.io/frc-scouting/.
- Pages builds from GitHub Actions, and the `VITE_SCRIPT_URL` repository variable is set.
- Checked the live site in headless Chrome, without entering an access code: there are no installability errors, the service worker takes control on the first visit, and the app reloads to Device setup with the network cut.
- The Pages actions are moved to v5, which run on Node 24.
- **Still to do:** the hand check in `docs/deploy.md` on a real iPhone and Android phone.
