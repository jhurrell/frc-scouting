import { useState, type ReactNode } from 'react';
import type { ScoutingCore } from '../core/scoutingCore';
import type { Answer, Question } from '../shared/contract';

interface Props {
  core: ScoutingCore;
  reportId: string;
  question: Question;
  value: Answer | undefined;
  disabled: boolean;
  /** Runs a core operation and shows any error it throws. */
  run: (action: () => Promise<void>) => void;
}

export function QuestionInput({ core, reportId, question, value, disabled, run }: Props) {
  const { code } = question;
  const label = (
    <span className="question-label">
      {question.label}
      {question.required && <span className="required" aria-label="required"> *</span>}
    </span>
  );

  // Single taps only: onClick, never touch handlers as well, which would count a tap twice.
  switch (question.type) {
    case 'counter':
      return (
        <div className="question counter">
          {label}
          <button aria-label={`${question.label} minus one`} disabled={disabled} onClick={() => run(() => core.adjustCounter(reportId, code, -1))}>
            −
          </button>
          <output>{value as number}</output>
          <button aria-label={`${question.label} plus one`} disabled={disabled} onClick={() => run(() => core.adjustCounter(reportId, code, 1))}>
            +
          </button>
        </div>
      );

    case 'yes-no':
    case 'single-choice': {
      const options: [string, Answer][] =
        question.type === 'yes-no' ? [['Yes', true], ['No', false]] : question.options!.map((o) => [o, o]);
      return (
        <div className="question">
          {label}
          <div className="choices" role="radiogroup">
            {options.map(([text, option]) => {
              const selected = value === option;
              return (
                <button
                  key={text}
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  // Tapping the selected option again clears the answer.
                  onClick={() => run(() => (selected ? core.clearAnswer(reportId, code) : core.answer(reportId, code, option)))}
                >
                  {text}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case 'multiple-choice': {
      const selected = (value as string[] | undefined) ?? [];
      return (
        <div className="question">
          {label}
          <div className="choices">
            {question.options!.map((option) => (
              <button
                key={option}
                role="checkbox"
                aria-checked={selected.includes(option)}
                disabled={disabled}
                onClick={() => run(() => core.toggleChoice(reportId, code, option))}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      );
    }

    case 'number':
      return <NumberInput {...{ core, reportId, question, value, disabled, run, label }} />;

    case 'text':
      return (
        <label className="question">
          {label}
          <textarea
            rows={3}
            disabled={disabled}
            defaultValue={(value as string | undefined) ?? ''}
            onChange={(e) => run(() => core.answer(reportId, code, e.target.value))}
          />
        </label>
      );
  }
}

/** Keeps what the Scout is typing locally, and saves it whenever it is a valid number. */
function NumberInput({ core, reportId, question, value, disabled, run, label }: Props & { label: ReactNode }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));

  function onChange(next: string) {
    setText(next);
    if (next.trim() === '') return run(() => core.clearAnswer(reportId, question.code));
    run(() => core.answer(reportId, question.code, Number(next)));
  }

  const range = [question.min, question.max].some((b) => b !== undefined)
    ? `${question.min ?? ''}–${question.max ?? ''}`
    : undefined;

  return (
    <label className="question">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={question.min}
        max={question.max}
        placeholder={range}
        disabled={disabled}
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
