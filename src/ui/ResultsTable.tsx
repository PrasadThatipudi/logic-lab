import { useState } from 'react';
import type { TestResult, TestSummary } from '../domain/testcases.ts';

type Filter = 'all' | 'pass' | 'fail';
const bits = (o?: Record<string, number>) => Object.entries(o ?? {}).map(([k, v]) => `${k}=${v}`).join(' ');
// a single output is shown as a bare value, several as name=value pairs
const out = (o?: Record<string, number>) => (Object.keys(o ?? {}).length > 1 ? bits(o) : Object.values(o ?? {}).join(' '));

function Row({ r }: { r: TestResult }) {
  if (r.status === 'invalid') {
    return (
      <tr className="invalid">
        <td><span className="mark warn" aria-label="invalid">!</span></td>
        <td>{r.id}</td>
        <td colSpan={3} className="mono">{r.error}</td>
      </tr>
    );
  }
  const pass = r.status === 'pass';
  return (
    <tr className={pass ? 'pass' : 'fail'}>
      <td><span className={`mark ${pass ? 'ok' : 'no'}`} aria-label={pass ? 'passed' : 'failed'}>{pass ? '✓' : '✕'}</span></td>
      <td>{r.id}</td>
      <td className="mono">{bits(r.inputs)}</td>
      <td className="mono">{out(r.expected)}</td>
      <td className="mono got">{out(r.actual)}</td>
    </tr>
  );
}

export function ResultsTable({ summary }: { summary: TestSummary }) {
  const [filter, setFilter] = useState<Filter>('all');
  const { results, passed, failed, invalid } = summary;
  const shown = results.filter((r) => filter === 'all' || (filter === 'pass' ? r.status === 'pass' : r.status !== 'pass'));
  const tab = (f: Filter, label: string, n: number, cls = '') => (
    <button type="button" className={`tab ${cls}${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label} ({n})</button>
  );
  return (
    <div id="results">
      <h3 className="results-title">Results</h3>
      <div className="tabs">
        {tab('all', 'All', results.length)}
        {tab('pass', 'Passed', passed, 'ok')}
        {tab('fail', 'Failed', failed + invalid, 'no')}
      </div>
      <table className="results">
        <thead><tr><th /><th>#</th><th>Input</th><th>Expected</th><th>Got</th></tr></thead>
        <tbody>
          {shown.map((r, i) => <Row key={`${r.id}-${i}`} r={r} />)}
          {!shown.length && <tr><td colSpan={5} className="none">No matching cases</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
