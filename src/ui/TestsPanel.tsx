import type { TestSummary } from '../domain/testcases.ts';
import { ResultsTable } from './ResultsTable.tsx';

export interface TestOutcome { summary?: TestSummary; error?: string }

interface Props {
  text: string;
  onText: (text: string) => void;
  canRun: boolean;
  onRun: () => void;
  onClear: () => void;
  outcome: TestOutcome | null;
}

export function TestsPanel({ text, onText, canRun, onRun, onClear, outcome }: Props) {
  const summary = outcome?.summary;
  const allPassed = !!summary && summary.passed === summary.total;

  return (
    <aside className="tests" aria-label="Test cases">
      <div className="tests-head">
        <h2>Tests</h2>
        <div id="status" className={`status${summary ? (allPassed ? ' ok' : ' no') : ''}`} role="status">
          {summary ? (allPassed ? 'All tests passed' : `${summary.passed} / ${summary.total} passed`) : ''}
        </div>
      </div>
      <textarea
        id="tests-text"
        rows={9}
        spellCheck={false}
        aria-label="Test cases"
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder={'A=0,B=0->Y=0\nA=1,B=1->Y=1\n# lines starting with # are ignored'}
      />
      <div className="file-row">
        <button id="run" className="primary run" disabled={!canRun} onClick={onRun} title="Run tests (Ctrl/⌘+Enter)" aria-keyshortcuts="Control+Enter Meta+Enter">▶ Run Tests</button>
        <button type="button" id="clear-tests" disabled={!text && !outcome} onClick={onClear}>Clear</button>
      </div>
      {outcome?.error && <div className="error-line" role="alert">{outcome.error}</div>}
      {summary && <ResultsTable summary={summary} />}
    </aside>
  );
}
