# Season Config

The Season Config is the set of questions Scouts answer for one season's game. It is plain data in `src/seasons/`, one JSON file per version, and changing the questions never needs a code change.

## What a version looks like

```json
{
  "season": "demo",
  "version": 2,
  "match": {
    "stages": {
      "Autonomous": [{ "code": "auto_moved", "label": "Left the starting line", "type": "yes-no", "required": true }],
      "Teleop": [{ "code": "tele_scored", "label": "Game pieces scored", "type": "counter" }]
    }
  },
  "pit": {
    "groups": [
      {
        "name": "Drivetrain",
        "questions": [{ "code": "drive_type", "label": "Drivetrain", "type": "single-choice", "options": ["Swerve", "Tank", "Other"] }]
      }
    ]
  }
}
```

- **Match questions** go under the five Match Stages: `Pre-Match`, `Autonomous`, `Teleop`, `Endgame` and `Post-Match`. Scouts always see them in that order. Leave out a Stage with no questions.
- **Pit questions** go in named groups, shown in the order you list them. A season with no pit groups has no Pit Reports.
- **Question types:** `counter` (plus and minus buttons, a whole number from `min`, default 0), `yes-no`, `single-choice`, `multiple-choice`, `number` (typed, optional `min` and `max`) and `text`.
- **`required: true`** means a Scout can't Complete the Report without answering it.

## Rules

The app checks these when it starts, and `npm test` checks them too, listing every problem at once.

- **Codes** are lower-case letters, digits and underscores, starting with a letter, such as `tele_scored`. A code is the question's column header in the Event Sheet, so keep it short and stable.
- **A code is used once per version**, across match and pit questions together.
- **A code keeps its type in every version of the season.** If `tele_scored` is a counter in version 1, it is a counter in every later version. For a different kind of answer, use a new code.
- **Choice questions** need a list of options with no repeats. A multiple-choice option can't contain a comma, because the Sheet separates selections with commas.

## Changing the questions mid-season

Never edit a version that has shipped. Reports already made with it were answered against exactly those questions. Add a new version instead:

1. Copy the newest file, for example `demo-v2.json` to `demo-v3.json`.
2. In the copy, set `"version": 3` and make your changes.
3. In `src/seasons/index.ts`, import the new file and add it to the end of the list.
4. Run `npm test`. The test in `src/seasons/seasons.test.ts` fails with "Version 3 is new" and the line to add. Add that line to `FINGERPRINTS` and run `npm test` again.
5. Deploy the app.

If `npm test` says a version "has changed since it shipped", an old file was edited. Put it back with `git checkout -- src/seasons/<file>` and make the change in a new version.

## What a new version does

- **New Reports use the newest version.** A Draft keeps the version it was started with, even if the app updates in the middle of a match, and so does a Complete Report that is edited later.
- **Every row in the Event Sheet records its version,** in the `Config version` column.
- **Columns are only ever added.** A new code becomes a new column on the right the first time a Report answers it. A question you remove keeps its column, which stays blank for Reports made with the new version. Strategists' formulas never break.
- **Keep a code to keep a column.** Renaming a label, changing options, making a question required or changing `min` and `max` all keep the same code and the same column.
- **Phones that haven't updated yet** keep scouting on the older version, and a Hub on the newer app still collects their Reports. A Hub that is behind a phone asks for the app to be updated.

## A new season

A new game gets a new set of files with a new `season` name, starting again at version 1. Remove the old season's files from `src/seasons/index.ts`, and empty `FINGERPRINTS` before recording the new ones. Every Report from the old season should be Uploaded first.
