import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { MATCH_STAGES } from '../shared/contract';
import type { Screen } from './App';
import { QuestionInput } from './QuestionInput';

interface Props {
  core: ScoutingCore;
  reportId: string;
  navigate: (screen: Screen) => void;
}

export function MatchReportForm({ core, reportId, navigate }: Props) {
  const report = useLiveQuery(() => core.getReport(reportId), [reportId]);
  const unanswered = useLiveQuery(() => core.unansweredRequired(reportId), [reportId], []);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (!report) return <main className="muted">Loading…</main>;
  if (report.kind !== 'match') return <main>Not a Match Report.</main>;

  const config = core.seasonConfigFor(report.configVersion);
  const isDraft = report.status === 'draft';
  const canChange = !report.voided && (isDraft || editing);
  const labelOf = (code: string) =>
    MATCH_STAGES.flatMap((s) => config.match.stages[s] ?? []).find((q) => q.code === code)?.label ?? code;

  function run(action: () => Promise<void>) {
    setError(null);
    action().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }

  return (
    <main>
      <button className="link" onClick={() => navigate({ name: 'home' })}>
        ‹ Home
      </button>
      <h1>
        Match {report.matchNumber} · {report.station}
      </h1>
      <p className="muted">
        Team {report.teamNumber} · <span className={`badge ${report.status}`}>{isDraft ? 'Draft' : 'Complete'}</span>
        {report.voided && (
          <>
            {' '}
            · <span className="badge void">Void</span>
          </>
        )}
      </p>
      {report.voided && <p className="muted">This Report is Void. It is kept, but left out of analysis.</p>}
      {editing && <p className="muted">Editing. Changes are saved as you make them and Uploaded again.</p>}

      {MATCH_STAGES.map((stage) => {
        const questions = config.match.stages[stage];
        if (!questions?.length) return null;
        return (
          <section key={stage}>
            <h2>{stage}</h2>
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
        );
      })}

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
        <button className="primary" onClick={() => (editing ? navigate({ name: 'home' }) : setEditing(true))}>
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
