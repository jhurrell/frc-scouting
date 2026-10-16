# 02: Full question engine

**What to build:** A Scout fills in a Match Report whose questions are grouped by the five Match Stages, in order. All six question types work. The Scout can't mark the Report Complete until every required question is answered, and the app shows which required questions are still missing. A broken Season Config is rejected when it's loaded, with a clear error.

See the spec: Season Config, Report model, user stories 16–21.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Question types supported: counter, yes/no, single choice, multiple choice, number and free text.
- [ ] Counter and number questions respect their optional min and max.
- [ ] Match questions appear grouped by Match Stage in a fixed order: Pre-Match, Autonomous, Teleop, Endgame, Post-Match. A Stage with no questions is skipped.
- [ ] Completing a Report fails while any required question is unanswered, and the core reports which ones.
- [ ] The form shows the unanswered required questions.
- [ ] Season Config validation rejects: duplicate question codes in one version, a choice question without options, a match question with no Match Stage, and a code reused across versions with a different type.
- [ ] Every behaviour above is covered by tests through the scouting core's public operations.
