import type { TestSummary } from '../domain/testcases.ts';

export interface TestOutcome { summary?: TestSummary; error?: string }

interface Props {
  text: string;
  onText: (text: string) => void;
  canRun: boolean;
  onRun: () => void;
  outcome: TestOutcome | null;
}

export function TestsPanel({ text, onText, canRun, onRun, outcome }: Props) {
  const failed = outcome?.summary?.results.filter((r) => r.status === 'fail') ?? [];
  const invalid = outcome?.summary?.results.filter((r) => r.status === 'invalid') ?? [];
  const allPassed = !!outcome?.summary && !failed.length && !invalid.length;

  return (
    <aside className="tests" aria-label="Test cases">
      <h2>Tests</h2>
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
        <button id="run" className="primary" disabled={!canRun} onClick={onRun}>Test</button>
      </div>
      <div id="status" className="status" role="status">{allPassed ? 'All tests passed' : ''}</div>
      {outcome?.error && <div className="error-line" role="alert">{outcome.error}</div>}
      <div id="results">
        {failed.length > 0 && (
          <>
            <h3 className="bad">Failed ({failed.length})</h3>
            {failed.map((r, i) => (
              <div className="case fail" key={`${r.id}-${i}`}>
                <b>{r.id}</b>
                <div className="mono">inputs: {Object.entries(r.inputs ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')}</div>
                <div>
                  {(r.wrong ?? []).map((n) => (
                    <div key={n}>
                      {n}: expected <b className="good">{r.expected?.[n]}</b> · actual <b className="bad">{r.actual?.[n]}</b>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {invalid.length > 0 && (
          <>
            <h3>Invalid cases ({invalid.length})</h3>
            {invalid.map((r, i) => (
              <div className="case invalid" key={`${r.id}-${i}`}><b>{r.id}</b><div className="mono">{r.error}</div></div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
