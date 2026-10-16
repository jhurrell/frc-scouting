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

  if (!report) return <main className="muted">Loading…</main>;
  if (report.kind !== 'match') return <main>Not a Match Report.</main>;

  const config = core.seasonConfigFor(report.configVersion);
  const isDraft = report.status === 'draft';
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
      </p>

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
                disabled={!isDraft}
                run={run}
              />
            ))}
          </section>
        );
      })}

      {error && <p className="error">{error}</p>}

      {isDraft && (
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
    </main>
  );
}
