import { chooseLandTitle } from './land-title';
describe('unique land titles', () => {
  it('numbers default names and skips occupied numbers', () => {
    expect(chooseLandTitle('Untitled design', [], true)).toBe(
      'Untitled design 1',
    );
    expect(
      chooseLandTitle(
        '  UNTITLED   design ',
        ['Untitled design 1', 'Untitled design 2'],
        true,
      ),
    ).toBe('Untitled design 3');
  });
  it.each(['MY LAND', ' My   Land ', '\uff2d\uff59 \uff2c\uff41\uff4e\uff44'])(
    'rejects equivalent name %s',
    (title) => {
      expect(() => chooseLandTitle(title, ['My Land'])).toThrow(
        'You already have a land with this name',
      );
    },
  );
  it('normalizes valid names and rejects empty names', () => {
    expect(chooseLandTitle('  New   land ', ['Other'])).toBe('New land');
    expect(() => chooseLandTitle('   ', [])).toThrow();
  });
  it('keeps explicit names including a numbered default unchanged', () => {
    expect(chooseLandTitle('Untitled design 4', [], true)).toBe(
      'Untitled design 4',
    );
    expect(() =>
      chooseLandTitle('Untitled design 4', ['Untitled design 4'], true),
    ).toThrow();
  });
});
