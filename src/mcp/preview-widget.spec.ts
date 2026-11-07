import { runInNewContext } from 'node:vm';
import { previewWidgetHtml } from './preview-widget';

describe('chat preview widget', () => {
  const setup = () => {
    const nodes: Record<string, Record<string, unknown>> = {};
    const events: Record<string, (event?: unknown) => void> = {};
    const parent = { postMessage: jest.fn() };
    const openExternal = jest.fn();
    const window = {
      parent,
      openai: { openExternal },
      addEventListener: (name: string, fn: (event?: unknown) => void) => {
        events[name] = fn;
      },
    };
    const document = {
      getElementById: (id: string) => (nodes[id] ??= { hidden: true }),
    };
    const script = previewWidgetHtml.match(/<script>([\s\S]*)<\/script>/)![1];
    runInNewContext(script, { window, document, URL, Date });
    return { nodes, events, parent, openExternal };
  };
  it('accepts a host tool result and shows the PNG and editor link', () => {
    const { nodes, events, parent } = setup();
    events.message({
      source: parent,
      data: {
        method: 'ui/notifications/tool-result',
        params: {
          structuredContent: {
            openUrl: 'https://dlander.com/land#mcp=abc',
            expiresAt: '2026-12-01T00:00:00Z',
          },
          _meta: { previewPng: 'aGVsbG8=' },
        },
      },
    });
    expect(nodes.preview.src).toBe('data:image/png;base64,aGVsbG8=');
    expect(nodes.open.href).toBe('https://dlander.com/land#mcp=abc');
    expect(nodes.open.hidden).toBe(false);
  });
  it('ignores messages outside the parent bridge and unsafe editor URLs', () => {
    const { nodes, events, parent } = setup();
    const data = {
      method: 'ui/notifications/tool-result',
      params: { structuredContent: { openUrl: 'javascript:alert(1)' } },
    };
    events.message({ source: parent, data });
    expect(nodes.open.hidden).toBe(true);
    events.message({
      source: {},
      data: {
        ...data,
        params: { structuredContent: { openUrl: 'https://dlander.com/land' } },
      },
    });
    expect(nodes.open.hidden).toBe(true);
  });
});
