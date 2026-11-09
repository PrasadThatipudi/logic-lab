// Boolean expression tokenizer + recursive-descent parser.
// Precedence (high -> low): NOT, AND/NAND, XOR/XNOR, OR/NOR. All binary ops are left-associative.
// Styles:
//   'words'   - multi-letter variables, keyword/symbol operators:  Y = (A AND B) XOR NOT C
//   'algebra' - single-letter variables, juxtaposition is AND:      Y = AB + BC + AC   (A' or !A is NOT)

import type { Bit, Expr, Op, Style } from './types.ts';

export class ParseError extends Error {
  pos?: number;
  constructor(message: string, pos?: number) {
    super(pos == null ? message : `${message} (at position ${pos + 1})`);
    this.pos = pos;
  }
}

interface Token { t: string; pos: number; name?: string; value?: Bit }

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR']);
const SYMBOLS: Record<string, string> = {
  '&': 'AND', '*': 'AND', '.': 'AND', '·': 'AND', '∧': 'AND',
  '|': 'OR', '+': 'OR', '∨': 'OR',
  '^': 'XOR', '⊕': 'XOR',
  '!': 'NOT', '~': 'NOT', '¬': 'NOT',
};

export function tokenize(src: string, style: Style = 'words'): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { tokens.push({ t: c, pos: i }); i++; continue; }
    if (c === "'") { tokens.push({ t: 'POSTNOT', pos: i }); i++; continue; }
    if (c === '=') { tokens.push({ t: '=', pos: i }); i++; continue; }
    if ((c === '&' || c === '|') && src[i + 1] === c) {
      tokens.push({ t: SYMBOLS[c], pos: i }); i += 2; continue; // && and ||
    }
    if (SYMBOLS[c]) { tokens.push({ t: SYMBOLS[c], pos: i }); i++; continue; }
    if (style === 'algebra' && /[A-Za-z0-9_]/.test(c)) {
      if (c === '0' || c === '1') tokens.push({ t: 'CONST', value: Number(c) as Bit, pos: i });
      else if (/[A-Za-z_]/.test(c)) tokens.push({ t: 'VAR', name: c, pos: i });
      else throw new ParseError(`Invalid token "${c}"`, i);
      i++;
      continue;
    }
    const m = /^[A-Za-z0-9_]+/.exec(src.slice(i));
    if (m) {
      const w = m[0];
      const up = w.toUpperCase();
      if (KEYWORDS.has(up)) tokens.push({ t: up, pos: i });
      else if (w === '0' || w === '1') tokens.push({ t: 'CONST', value: Number(w) as Bit, pos: i });
      else if (/^[A-Za-z_]/.test(w)) tokens.push({ t: 'VAR', name: w, pos: i });
      else throw new ParseError(`Invalid token "${w}"`, i);
      i += w.length;
      continue;
    }
    throw new ParseError(`Unexpected character "${c}"`, i);
  }
  return tokens;
}

const OPERAND_START = new Set(['VAR', 'CONST', '(', 'NOT']);

function describe(tok?: Token) {
  if (!tok) return 'end of expression';
  if (tok.t === 'VAR') return `variable "${tok.name}"`;
  if (tok.t === 'CONST') return `constant ${tok.value}`;
  return `"${tok.t === 'POSTNOT' ? "'" : tok.t}"`;
}

/** Returns { output: string, ast }. Accepts an optional "Name = expr" prefix. */
export function parse(src: string, style: Style = 'words'): { output: string; ast: Expr; named: boolean } {
  if (!src || !src.trim()) throw new ParseError('Expression is empty');
  let output = 'Y';
  const prefix = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(src);
  if (prefix) {
    output = prefix[1];
    // blank out the prefix so error positions still refer to the original text
    src = ' '.repeat(prefix[0].length) + src.slice(prefix[0].length);
    if (!src.trim()) throw new ParseError('Expression is empty after "="');
  }
  const tokens = tokenize(src, style);
  const implicitAnd: Op | null = style === 'algebra' ? 'AND' : null;
  let p = 0;
  const peek = (): Token | undefined => tokens[p];
  const next = (): Token | undefined => tokens[p++];

  const binary = (ops: string[], sub: () => Expr, implicit: Op | null = null) => (): Expr => {
    let left = sub();
    for (let tok = peek(); tok && (ops.includes(tok.t) || (implicit && OPERAND_START.has(tok.t))); tok = peek()) {
      if (!ops.includes(tok.t)) { left = { type: implicit!, args: [left, sub()] }; continue; }
      const op = next()!;
      const after = peek();
      if (!after || !OPERAND_START.has(after.t)) {
        throw new ParseError(`Expected an operand after ${describe(op)}, found ${describe(after)}`, after?.pos ?? src.length);
      }
      left = { type: op.t as Op, args: [left, sub()] };
    }
    return left;
  };

  let or: () => Expr = () => { throw new Error('unreachable'); };
  const primary = (): Expr => {
    const tok = next();
    if (!tok) throw new ParseError('Unexpected end of expression', src.length);
    if (tok.t === 'VAR') return { type: 'VAR', name: tok.name! };
    if (tok.t === 'CONST') return { type: 'CONST', value: tok.value! };
    if (tok.t === '(') {
      if (peek()?.t === ')') throw new ParseError('Empty parentheses', tok.pos);
      const e = or();
      const close = next();
      if (!close || close.t !== ')') throw new ParseError('Missing closing ")"', tok.pos);
      return e;
    }
    throw new ParseError(`Expected a variable, constant or "(", found ${describe(tok)}`, tok.pos);
  };
  const postfix = (): Expr => {
    let e = primary();
    while (peek()?.t === 'POSTNOT') { next(); e = { type: 'NOT', args: [e] }; }
    return e;
  };
  const unary = (): Expr => {
    if (peek()?.t === 'NOT') { next(); return { type: 'NOT', args: [unary()] }; }
    return postfix();
  };
  const and: () => Expr = binary(['AND', 'NAND'], unary, implicitAnd);
  const xor: () => Expr = binary(['XOR', 'XNOR'], and);
  or = binary(['OR', 'NOR'], xor);

  const ast = or();
  if (p < tokens.length) {
    const tok = peek()!;
    if (tok.t === ')') throw new ParseError('Unmatched ")"', tok.pos);
    throw new ParseError(`Unexpected ${describe(tok)}; expected an operator`, tok.pos);
  }
  return { output, ast, named: !!prefix };
}

const PREC: Record<string, number> = { OR: 1, NOR: 1, XOR: 2, XNOR: 2, AND: 3, NAND: 3 };
const ALGEBRA_OP: Record<string, string> = { OR: ' + ', XOR: ' ^ ', AND: '' };

/** Renders an AST back to text in the given style (inverse of parse, used to convert between styles). */
export function format(ast: Expr, style: Style = 'words'): string {
  const fmt = (e: Expr): string => {
    if (e.type === 'VAR') {
      if (style === 'algebra' && e.name.length > 1) throw new ParseError(`Algebra style needs single-letter variables, found "${e.name}"`);
      return e.name;
    }
    if (e.type === 'CONST') return String(e.value);
    if (e.type === 'NOT') {
      const [a] = e.args;
      const atom = a.type === 'VAR' || a.type === 'CONST' || (style === 'algebra' && a.type === 'NOT');
      if (style === 'algebra') return atom ? `${fmt(a)}'` : `(${fmt(a)})'`;
      return a.type === 'NOT' || a.type === 'VAR' || a.type === 'CONST' ? `NOT ${fmt(a)}` : `NOT (${fmt(a)})`;
    }
    if (style === 'algebra' && !(e.type in ALGEBRA_OP)) {
      return fmt({ type: 'NOT', args: [{ type: e.type.replace(/^N(?=AND|OR)/, '').replace(/^XNOR$/, 'XOR') as Op, args: e.args }] });
    }
    const [l, r] = e.args;
    const side = (c: Expr, right: boolean) => {
      const text = fmt(c);
      const needs = PREC[c.type] !== undefined && (PREC[c.type] < PREC[e.type] || (right && PREC[c.type] === PREC[e.type]));
      return needs && !(style === 'algebra' && !(c.type in ALGEBRA_OP)) ? `(${text})` : text;
    };
    const op = style === 'algebra' ? ALGEBRA_OP[e.type] : ` ${e.type} `;
    return `${side(l, false)}${op}${side(r, true)}`;
  };
  return fmt(ast);
}

/** One output per line (or per ";"). Blank statements are dropped. */
export function splitStatements(src: string | null | undefined): string[] {
  return String(src ?? '').split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);
}

/** Rewrites expression(s) from one style to another; throws ParseError if it cannot be represented. */
export function convertExpression(src: string, from: Style, to: Style): string {
  if (from === to || !src.trim()) return src;
  return splitStatements(src).map((st) => {
    const { output, ast } = parse(st, from);
    return `${output} = ${format(ast, to)}`;
  }).join('\n');
}
