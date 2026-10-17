import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { formSections } from '../core/seasonConfig';
import type { Screen } from './App';
import { QuestionInput } from './QuestionInput';

interface Props {
  core: ScoutingCore;
  reportId: string;
  navigate: (screen: Screen) => void;
}

/** The form for a Match Report or a Pit Report. Both use the same Draft-to-Complete flow. */
export function ReportForm({ core, reportId, navigate }: Props) {
  const report = useLiveQuery(() => core.getReport(reportId), [reportId]);
  const unanswered = useLiveQuery(() => core.unansweredRequired(reportId), [reportId], []);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (!report) return <main className="muted">Loading…</main>;

  const sections = formSections(core.seasonConfigFor(report.configVersion), report.kind);
  const isDraft = report.status === 'draft';
  const canChange = !report.voided && (isDraft || editing);
  const labelOf = (code: string) =>
    sections.flatMap((s) => s.questions).find((q) => q.code === code)?.label ?? code;

  /** Back to the home screen. Edits to a Complete Report Upload as the Scout leaves it. */
  function leave() {
    if (editing) void core.uploadInBackground();
    navigate({ name: 'home' });
  }

  function run(action: () => Promise<void>) {
    setError(null);
    action().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }

  return (
    <main>
      <button className="link" onClick={leave}>
        ‹ Home
      </button>
      <h1>{report.kind === 'match' ? `Match ${report.matchNumber} · ${report.station}` : `Pit · Team ${report.teamNumber}`}</h1>
      <p className="muted">
        {report.kind === 'match' ? `Team ${report.teamNumber}` : 'Pit Report'} · <span className={`badge ${report.status}`}>{isDraft ? 'Draft' : 'Complete'}</span>
        {report.voided && (
          <>
            {' '}
            · <span className="badge void">Void</span>
          </>
        )}
      </p>
      {report.voided && <p className="muted">This Report is Void. It is kept, but left out of analysis.</p>}
      {editing && <p className="muted">Editing. Changes are saved as you make them, and Upload when you leave this Report.</p>}

      {sections.map(({ title, questions }) => (
        <section key={title}>
          <h2>{title}</h2>
          {questions.map((question) => (
            <QuestionInput
              key={question.code}
              core={core}
              reportId={report.id}
              question={question}
              value={report.answers[question.code]}
              disabled={!canChange}
              run={run}
            />
          ))}
        </section>
      ))}

      {error && <p className="error">{error}</p>}

      {isDraft && !report.voided && (
        <>
          {unanswered.length > 0 && (
            <p className="muted">Still to answer: {unanswered.map(labelOf).join(', ')}</p>
          )}
          <button
            className="primary"
            disabled={unanswered.length > 0}
            onClick={() =>
              run(async () => {
                await core.complete(report.id);
                navigate({ name: 'home' });
              })
            }
          >
            Complete
          </button>
        </>
      )}

      {!isDraft && !report.voided && (
        <button className="primary" onClick={() => (editing ? leave() : setEditing(true))}>
          {editing ? 'Done' : 'Edit'}
        </button>
      )}

      {!report.voided && (
        <button
          className="secondary"
          onClick={() => {
            const question = 'Void this Report? Use this for a mistake, such as the wrong team. It is kept but left out of analysis, and this can’t be undone.';
            if (window.confirm(question)) run(() => core.voidReport(report.id));
          }}
        >
          Void
        </button>
      )}
    </main>
  );
}
