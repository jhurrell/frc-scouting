import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import { MATCH_STAGES, type Question, type Report } from '../shared/contract';
import type { Screen } from './App';

interface Props {
  core: ScoutingCore;
  reportId: string;
  navigate: (screen: Screen) => void;
}

export function MatchReportForm({ core, reportId, navigate }: Props) {
  const report = useLiveQuery(() => core.getReport(reportId), [reportId]);
  const [error, setError] = useState<string | null>(null);

  if (!report) return <main className="muted">Loading…</main>;
  if (report.kind !== 'match') return <main>Not a Match Report.</main>;

  const config = core.seasonConfigFor(report.configVersion);
  const isDraft = report.status === 'draft';

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
                question={question}
                report={report}
                disabled={!isDraft}
                onAdjust={(delta) => run(() => core.adjustCounter(report.id, question.code, delta))}
              />
            ))}
          </section>
        );
      })}

      {error && <p className="error">{error}</p>}

      {isDraft && (
        <button
          className="primary"
          onClick={() =>
            run(async () => {
              await core.complete(report.id);
              navigate({ name: 'home' });
            })
          }
        >
          Complete
        </button>
      )}
    </main>
  );
}

interface QuestionInputProps {
  question: Question;
  report: Report;
  disabled: boolean;
  onAdjust: (delta: 1 | -1) => void;
}

function QuestionInput({ question, report, disabled, onAdjust }: QuestionInputProps) {
  if (question.type !== 'counter') {
    // The other question types arrive with the full question engine (ticket 02).
    return <p className="muted">{question.label}: not supported yet</p>;
  }
  const value = report.answers[question.code] as number;
  return (
    <div className="counter">
      <span className="counter-label">{question.label}</span>
      {/* onClick only: adding touch handlers too would count a tap twice. */}
      <button aria-label={`${question.label} minus one`} disabled={disabled} onClick={() => onAdjust(-1)}>
        −
      </button>
      <output>{value}</output>
      <button aria-label={`${question.label} plus one`} disabled={disabled} onClick={() => onAdjust(1)}>
        +
      </button>
    </div>
  );
}
