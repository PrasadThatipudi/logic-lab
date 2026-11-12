import { OUT_X } from './canvas.ts';
import type { EditorNode } from './types.ts';

/** Canvas viewport: nodes are drawn at `pan + position * zoom`. */
export interface View { zoom: number; pan: { x: number; y: number } }

export const DEFAULT_VIEW: View = { zoom: 1, pan: { x: 0, y: 0 } };
export const MIN_ZOOM = 0.25, MAX_ZOOM = 2.5, FIT_MAX_ZOOM = 1.5, ZOOM_STEP = 1.2, FIT_PADDING = 48;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Bounding box of the drawn nodes, including labels and pins; null for an empty circuit. */
export function bounds(nodes: EditorNode[]) {
  if (!nodes.length) return null;
  const minX = Math.min(...nodes.map((n) => n.x)) - 44;
  const maxX = Math.max(...nodes.map((n) => n.x + OUT_X)) + 16;
  const minY = Math.min(...nodes.map((n) => n.y)) - 44;
  const maxY = Math.max(...nodes.map((n) => n.y)) + 36;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** Zoom and pan that centre the whole circuit in a viewport of the given size. */
export function fitView(nodes: EditorNode[], width: number, height: number): View {
  const b = bounds(nodes);
  if (!b || width <= 0 || height <= 0) return DEFAULT_VIEW;
  const zoom = Math.min(FIT_MAX_ZOOM, clampZoom(Math.min((width - FIT_PADDING * 2) / b.width, (height - FIT_PADDING * 2) / b.height)));
  return {
    zoom,
    pan: { x: (width - b.width * zoom) / 2 - b.minX * zoom, y: (height - b.height * zoom) / 2 - b.minY * zoom },
  };
}

/** Scales the view by `factor` while keeping the viewport point (cx, cy) fixed. */
export function zoomAt(view: View, factor: number, cx: number, cy: number): View {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return { zoom, pan: { x: cx - (cx - view.pan.x) * k, y: cy - (cy - view.pan.y) * k } };
}
