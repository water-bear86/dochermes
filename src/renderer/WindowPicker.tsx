import type { ReactElement } from 'react';

import type { WindowSourceOption } from '../shared/types';

interface WindowPickerProps {
  open: boolean;
  sources: WindowSourceOption[];
  selectedSourceId?: string;
  onRefresh: () => void;
  onClose: () => void;
  onSelectSource: (source: WindowSourceOption) => void;
}

export function WindowPicker({
  open,
  sources,
  selectedSourceId,
  onRefresh,
  onClose,
  onSelectSource
}: WindowPickerProps): ReactElement | null {
  if (!open) {
    return null;
  }

  return (
    <section className="window-picker" aria-label="Available windows">
      <div className="section-heading">
        <h2>Choose the trading window to inspect</h2>
        <button type="button" className="ghost" onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="source-list">
        {sources.map((source) => (
          <button
            type="button"
            className={`source-option ${selectedSourceId === source.id ? 'selected' : ''}`}
            key={source.id}
            onClick={() => {
              onSelectSource(source);
            }}
          >
            <img src={source.thumbnailDataUrl} alt="" />
            <span>{source.name}</span>
            <small>{source.kind}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
