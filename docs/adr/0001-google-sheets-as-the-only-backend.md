# Google Sheets as the only backend

The app is a static, local-first PWA, and its only server-side piece is one Google Apps Script bound to the Season Sheet. That script accepts Uploads, sends each one to the right Event Sheet, serves the Event Bundle and holds the TBA key. We chose this over a hosted database such as Neon or Supabase because the main goal of the rebirth is a system students can maintain. A Sheet is something they already understand, it is where analysis already happens, and it leaves no backend to run.

## Consequences

- Analysis lives in the Event Sheets. The app shows only Coverage.
- There is one Event Sheet per event, so a question change between events never mixes column layouts. Data that lasts the whole season (the roster and PINs) lives once, in the Season Sheet.
- Event Sheet columns are generated from the Season Config and are only ever added, never removed or reordered by hand.
- Uploads are idempotent by Report ID, because Sheets has no transactions or unique constraints to fall back on.
- Devices know one script URL. Every Report carries its event key, which is used for routing and for spotting misrouted Reports.
