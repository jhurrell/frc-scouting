# Alliance Selection: decisions so far

**Status:** needs-info. The grilling was paused on 2026-10-18 so the user could think it over. Pick it up with `/grill-with-docs`, starting from the open questions below.

The terms are already in `GLOSSARY.md` under "Alliance Selection": Rankings, Alliance Selection, Alliance Captain, Alliance, Pick List, Do Not Pick, Picked and Declined.

## Decided

1. **Scope.** The app supports both the **Pick List**, prepared before Alliance Selection, and **live tracking** during Alliance Selection, crossing Teams off the same list.
2. **Vocabulary.** Use FRC's own terms. "Rankings" means only the official order after qualifications, never the Pick List.
3. **Who edits the Pick List.** Several Strategists edit it at the same time.
4. **Connection on the day.** Tracking must work with no reliable connection.
5. **Where it lives.**
   - The Pick List is built in the Event Sheet and reaches devices in the Event Bundle.
   - Tracking happens locally on each device.
   - Nothing done in the app goes back to the Sheet, so the Pick List is never changed by the app.
   - Any Scout can follow Alliance Selection on their own device.
6. **What the Pick List holds.** One ordered list. Each Team has its place in the order, a Do Not Pick mark and a short note from the Strategists.
7. **How much is tracked.** Cross-off only. One tap marks a Team as Picked or Declined, and the list shows the best Team still available. The app doesn't model the Alliances or apply the selection rules.
8. **Alliance Captains.** A separate Alliance Captain mark keeps the Team visible with a badge, not crossed off. The Strategist judges whether that Team is within reach. Once an Alliance Captain is Picked, it is crossed off like any other Team.
9. **Mis-taps.** Tapping a crossed-off Team asks "Put back?" and restores it. Each Team toggles on its own; there's no undo history.
10. **Which Teams are on the Pick List.** Every Team at the event, in this order:
    - Teams the Strategists ranked, in their order.
    - Teams left unranked.
    - Do Not Pick Teams, last.
11. **During Alliance Selection.** The order is only crossed off, never rearranged on a device.

## Open questions

Each has a recommended answer that hasn't been agreed yet.

- **Q12, ADR.** Record decision 5 as ADR 0002, "The Pick List is built in the Event Sheet, and Alliance Selection is tracked on each device", and add a pointer to it in ADR 0001. It amends 0001's consequence that the app shows only Coverage. Analysis still stays in the Sheets. _Recommended: yes._
- **Q13, visibility of notes and Do Not Pick.** Every Scout's phone would show the Strategists' candid notes and Do Not Pick marks. The app has no roles, and the access code unlocks the whole Event Bundle.
  - (a) Everyone sees everything, and the Pick List tab warns Strategists to write notes they would say to that Team.
  - (b) Add a Strategist role in the Scouts tab, and hide the notes and Do Not Pick from everyone else.
  - (c) Keep the notes in the Sheet only.
  - _Recommended: (a). Choose (b) if a careless note being seen by another team would be a real problem._
- **Q14, the Pick List tab.**
  - Four columns: Team, Order, Do Not Pick (a checkbox) and Note.
  - Order is a number and may be a formula. A blank Order means unranked.
  - Create event makes the tab with every Team. Refresh schedule only adds missing Teams at the bottom. The script never changes anything else in that tab.
  - _Recommended: yes._
- **Q15, how long a device's marks last.**
  - Marks are kept per Team number for the current event. They survive a reload and a Refresh, while a newer Pick List updates the order and notes.
  - A **Clear marks** action, with a confirmation, starts over, for example after a practice run of Alliance Selection.
  - _Recommended: yes, including Clear marks._

## Still to explore after those

- When devices must Refresh after the pick-list meeting so they have the final Pick List, and how a Scout can tell how old their copy is.
- Where tracking appears in the app, for example a screen beside Coverage and Hub.
- Whether to pull the Rankings from The Blue Alliance to mark Alliance Captains automatically. Decision 7 leaves this to the Strategist for now.
