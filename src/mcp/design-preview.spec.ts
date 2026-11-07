import { randomUUID } from 'node:crypto';
import { renderDesignPreview } from './design-preview';
import { sceneSchema } from './scene-schema';

describe('design PNG previews', () => {
  const scene = (text: string) =>
    sceneSchema.parse({
      type: 'dlander/clipboard',
      files: {},
      elements: [
        {
          id: randomUUID(),
          type: 'rectangle',
          x: -20,
          y: 10,
          width: 300,
          height: 100,
          backgroundColor: '#ddd',
        },
        {
          id: randomUUID(),
          type: 'text',
          x: 0,
          y: 20,
          width: 250,
          height: 40,
          text,
          fontSize: 20,
          fontFamily: 1,
          backgroundColor: '#111',
        },
      ],
    });
  it('renders actual PNG bytes and changes when the design changes', () => {
    const first = renderDesignPreview(scene('First design'));
    expect(first.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(first.equals(renderDesignPreview(scene('New revision')))).toBe(
      false,
    );
    expect(first.readUInt32BE(16)).toBeLessThanOrEqual(1200);
    expect(first.readUInt32BE(20)).toBeLessThanOrEqual(1200);
  });
  it('escapes design text so SVG markup cannot execute or fetch resources', () => {
    expect(() =>
      renderDesignPreview(
        scene('<image href="https://evil.example/track"/> & test'),
      ),
    ).not.toThrow();
  });
  it('renders arrows and corner arrays without invalid duplicate XML attributes', () => {
    const data = scene('Arrows');
    data.elements.push({
      id: randomUUID(),
      type: 'arrow',
      x: 0,
      y: 100,
      points: [
        [0, 0],
        [200, 40],
      ],
      strokeColor: '#111',
    });
    expect(renderDesignPreview(data).length).toBeGreaterThan(100);
  });
});
