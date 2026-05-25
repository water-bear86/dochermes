import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

interface FakeElement {
  value?: string;
  textContent?: string;
  getAttribute: (name: string) => string | null;
}

function loadExtractor() {
  const code = fs.readFileSync(path.join(process.cwd(), 'extensions/dochermes-context/content.js'), 'utf8');
  const context = {
    URL,
    chrome: {
      runtime: {
        onMessage: {
          addListener: vi.fn()
        }
      }
    },
    console,
    document: fakeDocument('', []),
    window: {
      location: {
        href: 'https://example.test/',
        hostname: 'example.test',
        pathname: '/'
      }
    }
  } as unknown as vm.Context & {
    DocHermesContextExtractor: {
      extractContextFromDocument: (
        documentLike: ReturnType<typeof fakeDocument>,
        locationLike: { href: string; hostname: string; pathname: string }
      ) => {
        confidence: 'low' | 'medium' | 'high';
        context: {
          title?: string;
          url?: string;
          route?: string;
          pair?: string;
          chain?: string;
          orderDirection?: string;
          orderType?: string;
          orderSize?: string;
          leverage?: string;
          addresses: string[];
        };
      };
      sanitizeUrl: (rawUrl: string) => string | undefined;
    };
    globalThis: unknown;
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.DocHermesContextExtractor;
}

function fakeElement(attributes: Record<string, string>, value = '', textContent = ''): FakeElement {
  return {
    value,
    textContent,
    getAttribute: (name: string) => attributes[name] ?? null
  };
}

function fakeDocument(bodyText: string, elements: FakeElement[], title = 'Test Trading Page') {
  return {
    title,
    body: {
      innerText: bodyText
    },
    querySelectorAll: () => elements
  };
}

describe('DocHermes browser context content script', () => {
  it('extracts structured DOM fields before falling back to body text', () => {
    const extractor = loadExtractor();
    const tokenAddress = 'So11111111111111111111111111111111111111112';
    const result = extractor.extractContextFromDocument(
      fakeDocument(
        'Fallback body says ETH/USDC on ethereum',
        [
          fakeElement({ 'data-pair': 'SOL/USDC' }),
          fakeElement({ 'data-chain': 'solana' }),
          fakeElement({ 'data-side': 'buy' }),
          fakeElement({ 'data-order-type': 'limit' }),
          fakeElement({ 'data-size': '0.08 SOL' }),
          fakeElement({ 'data-leverage': '2x' }),
          fakeElement({ 'data-token-address': tokenAddress })
        ]
      ),
      {
        href: 'https://trade.example/swap?wallet=secret#panel',
        hostname: 'trade.example',
        pathname: '/swap'
      }
    );

    expect(result.confidence).toBe('high');
    expect(result.context).toMatchObject({
      url: 'https://trade.example/swap',
      route: 'trade.example/swap',
      pair: 'SOL/USDC',
      chain: 'solana',
      orderDirection: 'buy',
      orderType: 'limit',
      orderSize: '0.08 SOL',
      leverage: '2x',
      addresses: [tokenAddress]
    });
    expect(result.context.url).not.toContain('wallet=secret');
  });

  it('falls back to body text when structured DOM fields are missing', () => {
    const extractor = loadExtractor();
    const result = extractor.extractContextFromDocument(
      fakeDocument('Buy SOL/USDC on Base size: 1.25 SOL leverage: 3x market order', []),
      {
        href: 'https://chart.example/pair/SOL-USDC',
        hostname: 'chart.example',
        pathname: '/pair/SOL-USDC'
      }
    );

    expect(result.context).toMatchObject({
      pair: 'SOL/USDC',
      chain: 'base',
      orderDirection: 'buy',
      orderType: 'market',
      orderSize: '1.25 SOL',
      leverage: '3x'
    });
  });

  it('handles sparse pages without crashing', () => {
    const extractor = loadExtractor();
    const result = extractor.extractContextFromDocument(
      fakeDocument('', []),
      {
        href: 'not a url',
        hostname: '',
        pathname: ''
      }
    );

    expect(result.confidence).toBe('low');
    expect(result.context.addresses).toEqual([]);
    expect(result.context.url).toBeUndefined();
  });
});
