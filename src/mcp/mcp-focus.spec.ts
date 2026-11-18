import { changedElementIds } from './mcp-focus';
describe('MCP saved design focus', () => {
  it('prefers additions over changed existing elements', () => {
    expect(
      changedElementIds(
        { elements: [{ id: 'old', text: 'old' }] },
        { elements: [{ id: 'old', text: 'new' }, { id: 'added' }] },
      ),
    ).toEqual(['added']);
  });
  it('focuses edited content when no element was added', () => {
    expect(
      changedElementIds(
        { elements: [{ id: 'old', text: 'old' }] },
        { elements: [{ id: 'old', text: 'new' }] },
      ),
    ).toEqual(['old']);
  });
  it('accepts only existing visible explicit targets', () => {
    expect(
      changedElementIds(
        {},
        { elements: [{ id: 'one' }, { id: 'gone', isDeleted: true }] },
        ['one', 'one', 'gone', 'other'],
      ),
    ).toEqual(['one']);
  });
  it('leaves unchanged content alone', () => {
    expect(
      changedElementIds(
        { elements: [{ id: 'one' }] },
        { elements: [{ id: 'one' }] },
      ),
    ).toEqual([]);
  });
});
