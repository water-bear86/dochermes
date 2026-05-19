import { describe, expect, it } from 'vitest';

import { prioritizeWindowSources, toWindowSourceOption } from './windowSources';

describe('toWindowSourceOption', () => {
  it('maps an Electron desktop source into a serializable window option', () => {
    const option = toWindowSourceOption({
      id: 'window:71:0',
      name: 'Photon Trading',
      thumbnail: {
        toDataURL: () => 'data:image/png;base64,preview'
      }
    });

    expect(option).toEqual({
      id: 'window:71:0',
      name: 'Photon Trading',
      kind: 'window',
      thumbnailDataUrl: 'data:image/png;base64,preview'
    });
  });

  it('labels screen sources distinctly from application windows', () => {
    const option = toWindowSourceOption({
      id: 'screen:0:0',
      name: 'Entire Screen',
      thumbnail: {
        toDataURL: () => 'data:image/png;base64,screen'
      }
    });

    expect(option.kind).toBe('screen');
  });
});

describe('prioritizeWindowSources', () => {
  it('lists named application windows before screen captures', () => {
    const sources = prioritizeWindowSources([
      {
        id: 'screen:0:0',
        name: 'Entire Screen',
        kind: 'screen',
        thumbnailDataUrl: 'data:image/png;base64,screen'
      },
      {
        id: 'window:2:0',
        name: 'Trading App',
        kind: 'window',
        thumbnailDataUrl: 'data:image/png;base64,window'
      }
    ]);

    expect(sources.map((source) => source.id)).toEqual(['window:2:0', 'screen:0:0']);
  });

  it('removes unnamed or unavailable sources from the picker', () => {
    const sources = prioritizeWindowSources([
      {
        id: 'window:1:0',
        name: '',
        kind: 'window',
        thumbnailDataUrl: 'data:image/png;base64,blank'
      },
      {
        id: 'window:2:0',
        name: 'Trading App',
        kind: 'window',
        thumbnailDataUrl: 'data:image/png;base64,window'
      }
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.name).toBe('Trading App');
  });
});
