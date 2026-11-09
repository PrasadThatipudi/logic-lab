import type { NodeType } from '../domain/types.ts';

const GW = 64;
const AND = 'M0,-24 H28 A28,24 0 0 1 28,24 H0 Z';
const OR = 'M0,-24 Q34,-24 56,0 Q34,24 0,24 Q16,0 0,-24 Z';
const NEG = new Set<string>(['NAND', 'NOR', 'XNOR', 'NOT']);

/** Body, input stubs and output bubble/lead for a logic gate, drawn with its origin at the left-centre. */
export function GateShape({ type }: { type: NodeType }) {
  const base = type.replace(/^N(?=AND|OR)/, '').replace(/3$/, '').replace(/^XNOR$/, 'XOR');
  const out = type === 'NOT' ? 54 : 56;
  let body;
  if (type === 'NOT') body = <path d="M0,-18 L50,0 L0,18 Z" />;
  else if (base === 'AND') body = <path d={AND} />;
  else if (base === 'OR') body = <path d={OR} />;
  else {
    body = (
      <>
        <g transform="translate(8,0) scale(.857,1)"><path d={OR} /></g>
        <path className="open" d="M0,-24 Q16,0 0,24" />
      </>
    );
  }
  const showStubs = !(base === 'AND' || type === 'NOT');
  return (
    <>
      <g className="gbody">{body}</g>
      {NEG.has(type)
        ? <circle className="bubble" cx={out + 4} cy={0} r={4} />
        : <line className="pin" x1={out} y1={0} x2={GW} y2={0} />}
      {showStubs && (
        <>
          <line className="pin" x1={0} y1={-10} x2={9} y2={-10} />
          <line className="pin" x1={0} y1={10} x2={9} y2={10} />
        </>
      )}
    </>
  );
}
