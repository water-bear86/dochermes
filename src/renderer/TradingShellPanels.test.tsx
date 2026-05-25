import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  CaptureTargetPanel,
  CoachStatePanel,
  HermesStatusPanel,
  QuestionPanel,
  RequestPreviewPanel,
  TopbarPanel,
  TradeCardPanel
} from './TradingShellPanels';
import type { TradeCardViewModel } from './tradeCardViewModel';

const tradeCard: TradeCardViewModel = {
  token: 'ABC',
  proposedTrade: 'Buy 0.5 SOL',
  strategy: 'early momentum',
  source: 'wallet alert',
  tokenAge: '42 minutes',
  liquidity: '$118,000',
  holderConcentration: 'elevated',
  recentWalletBehavior: 'mixed',
  risk: 'High',
  riskTone: 'high',
  recommendedSize: '0.08 SOL',
  reason: 'This resembles prior oversized early entries.',
  plan: {
    entry: 'Wait for confirmation.',
    invalidation: 'Exit on support loss.',
    takeProfit: 'Reduce 50% at 2x.',
    maxHoldTime: '45 minutes'
  },
  memorySummary: '14 prior matches.',
  warnings: ['Daily loss policy requires review.'],
  overrideRequired: true,
  advisoryNotice: 'DocHermes records coaching decisions only. It cannot route, sign, or execute trades.',
  actions: [
    {
      kind: 'accepted-recommended',
      label: 'Buy recommended size',
      journalLabel: 'Trade card: buy recommended size',
      requiresNote: false
    },
    {
      kind: 'overrode',
      label: 'Override',
      journalLabel: 'Trade card: override',
      requiresNote: true
    }
  ]
};

describe('TradingShellPanels', () => {
  it('renders topbar and status/control strips', () => {
    const markup = renderToStaticMarkup(
      <>
        <TopbarPanel statusText="Paused · window required" />
        <HermesStatusPanel
          statusText="Hermes check-in: connected"
          summary="Text and image routes OK."
          isChecking={false}
          checkedAt="2026-05-25T10:00:00.000Z"
          onCheck={vi.fn()}
        />
        <CoachStatePanel armed={false} onToggle={vi.fn()} />
        <CaptureTargetPanel selectedLabel="Trading Desk" canSelect canUnpair onSelect={vi.fn()} onUnpair={vi.fn()} />
      </>
    );

    expect(markup).toContain('Hermes Coach');
    expect(markup).toContain('Paused · window required');
    expect(markup).toContain('Hermes check-in: connected');
    expect(markup).toContain('Recheck');
    expect(markup).toContain('Coach state');
    expect(markup).toContain('Arm');
    expect(markup).toContain('Trading Desk');
  });

  it('renders request preview and ask question controls', () => {
    const markup = renderToStaticMarkup(
      <>
        <RequestPreviewPanel
          preview={{
            destinationOrigin: 'http://localhost:8642',
            dataSharingScope: 'local-first',
            privacyPreset: 'maximum',
            payloadClasses: ['placeholder screenshot'],
            localOnlyClasses: ['window title', 'memory context']
          }}
        />
        <QuestionPanel
          questionRef={createRef<HTMLTextAreaElement>()}
          question="Should I take this trade now?"
          canAsk
          voiceEnabled
          isVoiceListening={false}
          isSpeechSpeaking={false}
          onQuestionChange={vi.fn()}
          onAsk={vi.fn()}
          onToggleVoice={vi.fn()}
          onStopSpeech={vi.fn()}
        />
      </>
    );

    expect(markup).toContain('Sent to Hermes');
    expect(markup).toContain('http://localhost:8642');
    expect(markup).toContain('Privacy preset');
    expect(markup).toContain('Withheld from Hermes: window title · memory context');
    expect(markup).toContain('Ask Hermes');
    expect(markup).toContain('Capture and ask');
    expect(markup).toContain('Push-to-talk');
  });

  it('renders trade card facts, plan, warnings, timings, and actions', () => {
    const markup = renderToStaticMarkup(
      <TradeCardPanel
        tradeCard={tradeCard}
        noteText="Scale down."
        response="raw coach response"
        requestMetrics={{
          localRiskMs: 3,
          ocrMs: 4,
          requestBuildMs: 5,
          captureMs: 6,
          hermesMs: 700,
          totalMs: 718
        }}
        formatTiming={(value) => `${value ?? 0}ms`}
        onNoteChange={vi.fn()}
        onAction={vi.fn()}
      />
    );

    expect(markup).toContain('Trade card');
    expect(markup).toContain('ABC');
    expect(markup).toContain('Risk');
    expect(markup).toContain('High');
    expect(markup).toContain('Recommended size');
    expect(markup).toContain('0.08 SOL');
    expect(markup).toContain('Daily loss policy requires review.');
    expect(markup).toContain('Capture: 6ms');
    expect(markup).toContain('Buy recommended size');
    expect(markup).toContain('raw coach response');
  });
});
