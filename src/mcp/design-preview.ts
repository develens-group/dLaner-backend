import { Resvg } from '@resvg/resvg-js';
const fontFiles = [
  require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
  require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
];
import type { CompactScene } from './scene-schema';

const xml = (value: string | number | undefined | null) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
const color = (value: unknown, fallback: string) =>
  typeof value === 'string' &&
  /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(value)
    ? value
    : fallback;

/** Bounded, network-free vector thumbnail. The editable scene remains authoritative. */
export function renderDesignPreview(scene: CompactScene): Buffer {
  const bounds = scene.elements.flatMap((e) => {
    const points = e.points?.length
      ? e.points
      : [
          [0, 0],
          [
            e.width ?? 100,
            e.height ??
              (e.text?.split('\n').length ?? 1) * (e.fontSize ?? 20) * 1.3,
          ],
        ];
    const radius = Math.hypot(e.width ?? 0, e.height ?? 0);
    return points.map(([x, y]) => ({
      x: e.x + x,
      y: e.y + y,
      margin: e.angle ? radius : (e.strokeWidth ?? 1) + 8,
    }));
  });
  const minX =
    bounds.reduce((v, p) => Math.min(v, p.x - p.margin), Infinity) - 16;
  const minY =
    bounds.reduce((v, p) => Math.min(v, p.y - p.margin), Infinity) - 16;
  const width = Math.max(
    1,
    bounds.reduce((v, p) => Math.max(v, p.x + p.margin), -Infinity) - minX + 16,
  );
  const height = Math.max(
    1,
    bounds.reduce((v, p) => Math.max(v, p.y + p.margin), -Infinity) - minY + 16,
  );
  const shapes = scene.elements
    .map((e) => {
      const w = e.width ?? 100,
        h = e.height ?? 50;
      const stroke = color(e.strokeSolid ?? e.strokeColor, '#252432');
      const fill = color(e.backgroundSolid ?? e.backgroundColor, 'transparent');
      const attrs = `stroke="${xml(stroke)}" fill="${xml(fill)}" stroke-width="${e.strokeWidth ?? 1}" stroke-linejoin="round"`;
      let body = '';
      switch (e.type) {
        case 'text': {
          const size = e.fontSize ?? 20;
          const lines = (e.text ?? '').split('\n');
          const anchor =
            e.textAlign === 'center'
              ? 'middle'
              : e.textAlign === 'right'
                ? 'end'
                : 'start';
          const tx = anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0;
          body = `<text x="${tx}" fill="${xml(color(e.backgroundSolid ?? e.backgroundColor, stroke))}" font-family="sans-serif" font-size="${size}" font-weight="${xml(e.fontWeight ?? 400)}" text-anchor="${anchor}">${lines.map((line, i) => `<tspan x="${tx}" y="${size + i * size * (e.lineHeight ?? 1.3)}">${xml(line)}</tspan>`).join('')}</text>`;
          break;
        }
        case 'ellipse':
          body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
          break;
        case 'diamond':
          body = `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" ${attrs}/>`;
          break;
        case 'line':
        case 'arrow': {
          const points = e.points ?? [
            [0, 0],
            [w, h],
          ];
          body = `<polyline points="${points.map((p) => p.join(',')).join(' ')}" ${attrs.replace(/fill="[^"]*"/, 'fill="none"')}/>`;
          if (e.type === 'arrow' && e.endArrowhead !== null) {
            const end = points[points.length - 1],
              prev = points[points.length - 2];
            const angle = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
            const len = 10 + (e.strokeWidth ?? 1) * 2;
            const wings = [-0.45, 0.45].map(
              (a) =>
                `${end[0] - len * Math.cos(angle + a)},${end[1] - len * Math.sin(angle + a)}`,
            );
            body += `<polyline points="${wings[0]} ${end.join(',')} ${wings[1]}" fill="none" stroke="${xml(stroke)}" stroke-width="${e.strokeWidth ?? 1}"/>`;
          }
          break;
        }
        default:
          body = `<rect width="${w}" height="${h}" rx="${Array.isArray(e.borderRadius) ? e.borderRadius[0] : (e.borderRadius ?? 0)}" ${attrs}/>`;
      }
      return `<g transform="translate(${e.x} ${e.y}) rotate(${((e.angle ?? 0) * 180) / Math.PI} ${w / 2} ${h / 2})" opacity="${(e.opacity ?? 100) / 100}">${body}</g>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(1200 * Math.min(1, width / height)))}" height="${Math.max(1, Math.round(1200 * Math.min(1, height / width)))}" viewBox="${minX} ${minY} ${width} ${height}"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/>${shapes}</svg>`;
  return new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles,
      defaultFontFamily: 'DejaVu Sans',
    },
    imageRendering: 0,
  })
    .render()
    .asPng();
}
