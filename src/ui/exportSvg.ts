import { bounds } from '../domain/view.ts';
import type { EditorNode } from '../domain/types.ts';

const SVG_RULE = /\.(wire|gbody|open|bubble|pin|gname|val|node|label|src|sw|swv|outlamp|enode)\b/;
const NS = 'http://www.w3.org/2000/svg';

/** Collects the circuit's CSS with the theme variables resolved, so the file looks the same outside the app. */
function circuitStyles(): string {
  const root = getComputedStyle(document.documentElement);
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSStyleRule && SVG_RULE.test(rule.selectorText)) rules.push(rule.cssText);
    }
  }
  return rules.join('\n').replace(/var\((--[\w-]+)\)/g, (_, name) => root.getPropertyValue(name).trim());
}

/** Downloads the circuit (without the grid, pan or zoom) as a standalone SVG. */
export function downloadCircuitSvg(svg: SVGSVGElement, nodes: EditorNode[]) {
  const b = bounds(nodes);
  const content = svg.querySelector('#circuit-content');
  if (!b || !content) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('.gridfill, .hit, .wirehit, .pin-in, .pout').forEach((el) => el.remove());
  clone.querySelector('#circuit-content')!.removeAttribute('transform');
  clone.removeAttribute('class');
  clone.removeAttribute('role');
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('viewBox', `${b.minX} ${b.minY} ${b.width} ${b.height}`);
  clone.setAttribute('width', String(b.width));
  clone.setAttribute('height', String(b.height));

  const root = getComputedStyle(document.documentElement);
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x', String(b.minX));
  bg.setAttribute('y', String(b.minY));
  bg.setAttribute('width', String(b.width));
  bg.setAttribute('height', String(b.height));
  bg.setAttribute('fill', root.getPropertyValue('--stage').trim() || '#fff');
  const style = document.createElementNS(NS, 'style');
  style.textContent = `text{font-family:ui-monospace,Menlo,monospace}${circuitStyles()}`;
  clone.insertBefore(bg, clone.firstChild);
  clone.insertBefore(style, clone.firstChild);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'logiclab-circuit.svg';
  a.click();
  URL.revokeObjectURL(url);
}
