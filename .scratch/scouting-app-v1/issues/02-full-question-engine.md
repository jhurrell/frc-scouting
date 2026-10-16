# 02: Full question engine

**What to build:** A Scout fills in a Match Report whose questions are grouped by the five Match Stages, in order. All six question types work. The Scout can't mark the Report Complete until every required question is answered, and the app shows which required questions are still missing. A broken Season Config is rejected when it's loaded, with a clear error.

See the spec: Season Config, Report model, user stories 16–21.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Question types supported: counter, yes/no, single choice, multiple choice, number and free text.
- [x] Counter and number questions respect their optional min and max.
- [x] Match questions appear grouped by Match Stage in a fixed order: Pre-Match, Autonomous, Teleop, Endgame, Post-Match. A Stage with no questions is skipped.
- [x] Completing a Report fails while any required question is unanswered, and the core reports which ones.
- [x] The form shows the unanswered required questions.
- [x] Season Config validation rejects: duplicate question codes in one version, a choice question without options, a match question with no Match Stage, and a code reused across versions with a different type.
- [x] Every behaviour above is covered by tests through the scouting core's public operations.

## Comments

**2026-10-16, implementation:**
- `npm test` passes (32 tests, 19 of them new), and `npm run build` type-checks and builds. The dev server serves the app. The form has not been clicked through in a browser yet.
- The scouting core now validates the Season Configs when it starts, replacing the type cast. It collects every problem and throws them together.
- New core operations: `clearAnswer`, `toggleChoice` (one transaction per tap, like counters) and `unansweredRequired`. `complete` throws `UnansweredRequiredError` listing the missing codes.
- Decisions beyond the ticket:
  - Question codes must be lower-case letters, digits and underscores, starting with a letter.
  - Options are allowed only on choice questions, and min/max only on counter and number questions.
  - Every version must belong to one season, and version numbers must be unique.
  - Blank text and an empty multiple-choice selection count as unanswered. A yes/no answered "No" counts as answered.
  - Tapping a selected yes/no or single-choice option clears it.
  - A number with no min has no lower limit. A counter's minimum defaults to 0.
- The demo Season Config (`demo-v1.json`) was edited in place to show every question type. That's fine before any real event, but real Season Configs must get a new version instead.
