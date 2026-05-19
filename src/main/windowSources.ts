import { desktopCapturer } from 'electron';

import type { WindowSourceKind, WindowSourceOption } from '../shared/types';

interface SourceLike {
  id: string;
  name: string;
  thumbnail: {
    toDataURL: () => string;
  };
}

const PREVIEW_SIZE = {
  width: 420,
  height: 260
};

const CAPTURE_SIZE = {
  width: 1440,
  height: 1000
};

export function toWindowSourceOption(source: SourceLike): WindowSourceOption {
  return {
    id: source.id,
    name: source.name,
    kind: inferSourceKind(source.id),
    thumbnailDataUrl: source.thumbnail.toDataURL()
  };
}

export function prioritizeWindowSources(sources: WindowSourceOption[]): WindowSourceOption[] {
  return sources
    .filter((source) => source.name.trim().length > 0)
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'window' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

export async function listWindowSources(): Promise<WindowSourceOption[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: PREVIEW_SIZE,
    fetchWindowIcons: false
  });

  return prioritizeWindowSources(sources.map(toWindowSourceOption));
}

export async function captureWindowSource(sourceId: string): Promise<string> {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: CAPTURE_SIZE,
    fetchWindowIcons: false
  });
  const source = sources.find((candidate) => candidate.id === sourceId);

  if (!source) {
    throw new Error('The selected trading window is no longer available. Select a window again.');
  }

  if (source.thumbnail.isEmpty()) {
    throw new Error('Window capture returned an empty screenshot. Check screen recording permissions.');
  }

  return source.thumbnail.toDataURL();
}

function inferSourceKind(sourceId: string): WindowSourceKind {
  return sourceId.startsWith('screen:') ? 'screen' : 'window';
}
