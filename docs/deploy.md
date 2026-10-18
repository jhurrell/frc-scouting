# Deploying and installing the app

The app is a set of static files hosted on GitHub Pages at **https://jhurrell.github.io/frc-scouting/**. A GitHub Action (`.github/workflows/deploy.yml`) runs the tests, builds the app and publishes it on every push to `main`. You can also run it by hand from the repository's **Actions** tab: choose **Deploy**, then **Run workflow**.

## One-time setup on GitHub

1. **Turn on Pages.** In the repository, open **Settings → Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
2. **Tell the build where the Apps Script is.** Open **Settings → Secrets and variables → Actions**, choose the **Variables** tab, and add a repository variable:
   - **Name:** `VITE_SCRIPT_URL`
   - **Value:** the Apps Script web app URL, ending in `/exec` (see [apps-script-setup.md](apps-script-setup.md#4-deploy-it-as-a-web-app)).

   It's a variable, not a secret: the URL ends up in the published app anyway. What protects the Sheets is the access code, which never goes to GitHub.
3. **Deploy.** Push to `main`, or run the **Deploy** workflow by hand. When it finishes, the workflow run shows the app's address.

If the build fails with "Set the VITE_SCRIPT_URL repository variable", step 2 is missing.

**Changing the Apps Script URL** (only if you make a brand-new deployment rather than a new version of the existing one) means updating the variable and running **Deploy** again.

## Installing on a phone

Install the app **before** setting up the device. On an iPhone, the installed app keeps its own storage, separate from Safari, so an access code entered or Reports made in a Safari tab aren't in the installed app.

- **iPhone or iPad:** open the address in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the address in Chrome, tap the **⋮** menu, then **Add to Home screen** or **Install app**.

Then open the app from the home screen and follow **Setting up a device** in the README. After the first visit, the app opens and works with no connection.

## How updates reach phones

- An open app checks for a new version when it starts, when the connection comes back, when it is brought back to the screen, and every 30 minutes.
- A new version downloads in the background and then waits. The app says "A new version of the app is ready" with an **Update now** link, but only on screens where no Report is being started, filled in or shown as a QR code. So an update never interrupts a match.
- If the Scout ignores it, the new version starts the next time the app is fully closed and reopened.
- Drafts and Reports on the phone are kept through an update. A Draft keeps the Season Config version it was started with (see [season-config.md](season-config.md)).

Before an event, deploy any changes early, and have every Scout open the app on Wi-Fi and choose **Update now** if it's offered.

## Checking a deploy by hand

Do this after the first deploy, and after any change to `src/pwa/`, on one iPhone and one Android phone.

1. **Install:** install the app as above. Expect the red 578 icon on the home screen, and the app opening full screen, with no browser address bar.
2. **Set up:** enter the access code and log in as a made-up test Scout.
3. **Offline:** turn on airplane mode, close the app completely, and open it again. Expect the home screen with the event, not a "no connection" page. Start a Match Report, complete it, and expect "1 Report waiting to Upload". Turn airplane mode off and expect it to Upload.
4. **Update:** push a small visible change, such as a reworded button, and wait for **Deploy** to finish. With a Draft open, expect no offer. Go back to the home screen, switch to another app and back (that makes it check), and expect "A new version of the app is ready". Choose **Update now**. Expect the change, and the Draft still in My Reports.

## Trying a production build on your laptop

```sh
npm run build
npx vite preview
```

The build reads `VITE_SCRIPT_URL` from `.env.local` (see the README).

The service worker only runs in a build, never in `npm run dev`. Browsers only allow it on HTTPS or `localhost`, so a phone pointed at your laptop's network address gets the app without offline support.

To start fresh in Chrome, open DevTools, then **Application → Storage → Clear site data**. That also deletes every Report on that browser, so only do it on a test device.
