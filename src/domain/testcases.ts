import { evaluateOutputs } from './circuit.ts';
import type { Bit, Circuit } from './types.ts';

export interface TestCase { id: string; inputs?: Record<string, Bit>; expected?: Record<string, Bit>; error?: string }
export interface TestResult {
  id: string;
  status: 'pass' | 'fail' | 'invalid';
  error?: string;
  inputs?: Record<string, Bit>;
  expected?: Record<string, Bit>;
  actual?: Record<string, Bit>;
  wrong?: string[];
}
export interface TestSummary { results: TestResult[]; total: number; passed: number; failed: number; invalid: number }

/**
 * Supported formats (pasted as text). Every case lists a value for each input and each output.
 *  Lines:       A=0,B=1->Y=0        (also "=>", spaces allowed; several outputs: A=1,B=1->S=0,C=1)
 *               With a single output the right side may be a bare value: A=0,B=1->0.  # starts a comment.
 *  CSV/TSV/TXT: header row of input names + one column per output (or "expected"/"output"/"out" when there is one output),
 *               optional "id"/"name" column. Lines starting with # are ignored.
 *  JSON: [{ "id": "t1", "inputs": {"A":0,"B":1}, "expected": {"Y":1} }, ...]  (also "expected": 1 for one output,
 *        or flat: {"A":0,"B":1,"Y":1})  or { "tests": [...] }
 */

const BOOLS = new Map<string, Bit>([['0', 0], ['1', 1], ['true', 1], ['false', 0], ['t', 1], ['f', 0], ['high', 1], ['low', 0]]);

function toBit(v: unknown): Bit | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v === 0 || v === 1 ? (v as Bit) : null;
  if (typeof v === 'string') return BOOLS.get(v.trim().toLowerCase()) ?? null;
  return null;
}

const ID_COLS = new Set(['id', 'name', 'case', 'test']);
const EXPECTED_COLS = new Set(['expected', 'output', 'out']);
const outNames = (circuit: Circuit) => circuit.outputs.map((o) => o.name);
const list = (names: string[]) => names.join(', ') || '(none)';

/** Returns { cases: [{id, inputs?, expected?, error?}] } or throws Error with a file-level message. */
export function parseTestFile(input: string | null | undefined, circuit: Circuit): { cases: TestCase[] } {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('The test box is empty.');
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return parseJson(trimmed, circuit);
  return /->|=>/.test(text) ? parseLines(text, circuit) : parseCsv(text, circuit);
}

function parseLines(text: string, circuit: Circuit): { cases: TestCase[] } {
  const outputs = outNames(circuit);
  const cases: TestCase[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const id = `#${cases.length + 1}`;
    const fail = (error: string) => cases.push({ id, error: `Line ${i + 1}: ${error}` });
    const parts = line.split(/->|=>/);
    if (parts.length !== 2) return fail('expected "inputs->outputs", e.g. A=0,B=1->Y=0.');

    const inputs: Record<string, Bit> = {};
    for (const pair of parts[0].split(/[,;\s]+/).filter(Boolean)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(pair);
      if (!m) return fail(`cannot read "${pair}" (use name=0 or name=1).`);
      if (!circuit.inputs.includes(m[1])) return fail(`unknown input "${m[1]}". Circuit inputs are: ${list(circuit.inputs)}.`);
      const b = toBit(m[2]);
      if (b === null) return fail(`invalid value "${m[2]}" for input ${m[1]} (use 0 or 1).`);
      inputs[m[1]] = b;
    }
    const missing = circuit.inputs.find((n) => !(n in inputs));
    if (missing) return fail(`missing input "${missing}".`);

    const expected: Record<string, Bit> = {};
    const right = parts[1].split(/[,;\s]+/).filter(Boolean);
    for (const pair of right) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(pair);
      const bare = !m && outputs.length === 1 && right.length === 1;
      if (!bare && !m) return fail(`cannot read "${pair}" (use ${outputs[0]}=0 or ${outputs[0]}=1).`);
      const name = bare ? outputs[0] : m![1];
      const raw = bare ? pair : m![2];
      if (!outputs.includes(name)) return fail(`unknown output "${name}". Circuit outputs are: ${list(outputs)}.`);
      const b = toBit(raw);
      if (b === null) return fail(`invalid expected value "${raw}" for ${name} (use 0 or 1).`);
      expected[name] = b;
    }
    const lacking = outputs.find((n) => !(n in expected));
    if (lacking) return fail(`missing expected value for output "${lacking}".`);
    cases.push({ id, inputs, expected });
  });
  if (!cases.length) throw new Error('No test cases found.');
  return { cases };
}

function parseCsv(text: string, circuit: Circuit): { cases: TestCase[] } {
  const outputs = outNames(circuit);
  const rows = text.split(/\r?\n/)
    .map((raw, i) => ({ line: i + 1, raw: raw.trim() }))
    .filter((r) => r.raw && !r.raw.startsWith('#'));
  if (rows.length < 2) throw new Error('The tests need a header row and at least one test case.');
  const split = (s: string) => s.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
  const header = split(rows[0].raw);
  if (new Set(header).size !== header.length) throw new Error('Header contains duplicate column names.');

  const taken = (h: string) => circuit.inputs.some((n) => n.toLowerCase() === h) || outputs.some((n) => n.toLowerCase() === h);
  const idIdx = header.findIndex((h) => ID_COLS.has(h.toLowerCase()) && !taken(h.toLowerCase()));
  const inCol: Record<string, number> = {}, outCol: Record<string, number> = {};
  header.forEach((h, i) => {
    if (i === idIdx) return;
    const asOutput = outputs.find((n) => n.toLowerCase() === h.toLowerCase());
    if (circuit.inputs.includes(h)) inCol[h] = i;
    else if (asOutput) outCol[asOutput] = i;
    else if (EXPECTED_COLS.has(h.toLowerCase()) && outputs.length === 1) outCol[outputs[0]] = i;
    else throw new Error(`Unknown column "${h}". Circuit inputs are: ${list(circuit.inputs)}; outputs: ${list(outputs)}.`);
  });
  for (const name of circuit.inputs) {
    if (!(name in inCol)) throw new Error(`Missing input column "${name}". Header has: ${header.join(', ')}.`);
  }
  for (const name of outputs) {
    if (!(name in outCol)) {
      throw new Error(`No expected-output column found for "${name}". Add a column named "${name}"${outputs.length === 1 ? ' (or "expected")' : ''}.`);
    }
  }

  const cases = rows.slice(1).map((r, n): TestCase => {
    const cells = split(r.raw);
    const id = (idIdx >= 0 && cells[idIdx]) || `#${n + 1}`;
    if (cells.length !== header.length) {
      return { id, error: `Line ${r.line}: expected ${header.length} columns but found ${cells.length}.` };
    }
    const inputs: Record<string, Bit> = {}, expected: Record<string, Bit> = {};
    for (const name of circuit.inputs) {
      const b = toBit(cells[inCol[name]]);
      if (b === null) return { id, error: `Line ${r.line}: invalid value "${cells[inCol[name]]}" for input ${name} (use 0 or 1).` };
      inputs[name] = b;
    }
    for (const name of outputs) {
      const b = toBit(cells[outCol[name]]);
      if (b === null) return { id, error: `Line ${r.line}: invalid expected value "${cells[outCol[name]]}" for ${name} (use 0 or 1).` };
      expected[name] = b;
    }
    return { id, inputs, expected };
  });
  return { cases };
}

function parseJson(text: string, circuit: Circuit): { cases: TestCase[] } {
  const outputs = outNames(circuit);
  // deno-lint-ignore no-explicit-any
  let data: any;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`Invalid JSON: ${(e as Error).message}`); }
  if (!Array.isArray(data)) data = data && data.tests;
  if (!Array.isArray(data)) throw new Error('JSON must be an array of test cases or an object with a "tests" array.');
  if (!data.length) throw new Error('The tests contain no test cases.');

  // deno-lint-ignore no-explicit-any
  const cases = data.map((item: any, n: number): TestCase => {
    const id = item && item.id != null ? String(item.id) : `#${n + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { id, error: 'Test case must be an object.' };
    const src = item.inputs && typeof item.inputs === 'object' ? item.inputs : item;
    const inputs: Record<string, Bit> = {};
    for (const name of circuit.inputs) {
      if (!(name in src)) return { id, error: `Missing input "${name}".` };
      const b = toBit(src[name]);
      if (b === null) return { id, error: `Invalid value ${JSON.stringify(src[name])} for input ${name} (use 0 or 1).` };
      inputs[name] = b;
    }
    const expected: Record<string, Bit> = {};
    for (const name of outputs) {
      let raw: unknown;
      const exp = item.expected ?? item.output;
      if (exp && typeof exp === 'object') raw = exp[name];
      else if (outputs.length === 1) raw = exp;
      raw ??= item[name];
      if (raw === undefined) return { id, error: `Missing expected output "${name}".` };
      const b = toBit(raw);
      if (b === null) return { id, error: `Invalid expected value ${JSON.stringify(raw)} for ${name} (use 0 or 1).` };
      expected[name] = b;
    }
    return { id, inputs, expected };
  });
  return { cases };
}

/** Runs every case; never stops on failures. A case passes only if every output matches. */
export function runTests(circuit: Circuit, cases: TestCase[]): TestSummary {
  const results = cases.map((c): TestResult => {
    if (c.error) return { id: c.id, status: 'invalid', error: c.error };
    const actual = evaluateOutputs(circuit, c.inputs!);
    const wrong = outNames(circuit).filter((n) => actual[n] !== c.expected![n]);
    return { id: c.id, status: wrong.length ? 'fail' : 'pass', inputs: c.inputs, expected: c.expected, actual, wrong };
  });
  const count = (s: TestResult['status']) => results.filter((r) => r.status === s).length;
  return { results, total: results.length, passed: count('pass'), failed: count('fail'), invalid: count('invalid') };
}
