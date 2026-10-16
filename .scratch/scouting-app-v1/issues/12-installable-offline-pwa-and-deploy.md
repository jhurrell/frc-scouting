# 12: Installable offline PWA and deploy

**What to build:** A Scout installs the app to their phone's home screen, and it opens and works with no connection after the first load. When a new version is available, the app offers it only when no Draft is open, so an update never interrupts a match. A GitHub Action is ready to build and deploy the app to GitHub Pages on every push to main.

See the spec: Architecture, user stories 12, 67–69.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The app has a web manifest and can be installed on iOS and Android.
- [ ] A service worker caches the app so it loads and runs with no connection after the first visit.
- [ ] A new version is detected and offered to the Scout, but only while no Draft is open.
- [ ] A GitHub Actions workflow builds the app and deploys it to GitHub Pages on push to main, with the right base path for a project page.
- [ ] Verified manually: install, go offline, reload and scout. The deploy can only be verified once the repo is pushed to GitHub, so note that in the ticket when closing it.
