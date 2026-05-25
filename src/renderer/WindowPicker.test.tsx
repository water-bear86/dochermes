import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { WindowSourceOption } from '../shared/types';
import { WindowPicker } from './WindowPicker';

const sources: WindowSourceOption[] = [
  {
    id: 'window:1',
    name: 'Trading Terminal',
    kind: 'window',
    thumbnailDataUrl: 'data:image/png;base64,preview1'
  },
  {
    id: 'screen:0',
    name: 'Desktop',
    kind: 'screen',
    thumbnailDataUrl: 'data:image/png;base64,preview2'
  }
];

describe('WindowPicker', () => {
  it('renders nothing when closed', () => {
    const markup = renderToStaticMarkup(
      <WindowPicker
        open={false}
        sources={sources}
        selectedSourceId="window:1"
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onSelectSource={vi.fn()}
      />
    );

    expect(markup).toBe('');
  });

  it('renders available sources and selected state when open', () => {
    const markup = renderToStaticMarkup(
      <WindowPicker
        open
        sources={sources}
        selectedSourceId="window:1"
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onSelectSource={vi.fn()}
      />
    );

    expect(markup).toContain('Choose the trading window to inspect');
    expect(markup).toContain('Trading Terminal');
    expect(markup).toContain('Desktop');
    expect(markup).toContain('source-option selected');
    expect(markup).toContain('Refresh');
    expect(markup).toContain('Close');
  });
});
