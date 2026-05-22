const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const SOL_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{40,88}\b/g;
const PAIR_RE = /\b([A-Z]{2,12})\s*\/\s*([A-Z]{2,12})\b/;
const CHAIN_RE = /\b(ethereum|solana|base|arbitrum|optimism|polygon|avalanche|bsc|sui|aptos)\b/i;
const ORDER_SIZE_RE =
  /\b(?:size|amount|qty|quantity|position size|notional|value)\s*[:=]?\s*\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?(?:\s*[A-Za-z%]{1,12})?)\b/i;
const LEVERAGE_RE = /\bleverage\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?x)\b/i;
const ORDER_DIR_RE = /\b(buy|sell|long|short)\b/i;
const ORDER_TYPE_RE = /\b(market|limit|stop(?:-loss)?|take(?:-profit)?|tp|sl)\b/i;

function clampText(input, maxLength = 30000) {
  return input.slice(0, maxLength);
}

function detectConfidence(context) {
  let score = 0;
  if (context.pair) score += 1;
  if (context.chain) score += 1;
  if (context.orderSize) score += 1;
  if (context.leverage) score += 1;
  if (context.orderDirection) score += 1;
  if (context.addresses.length > 0) score += 1;

  if (score >= 5) {
    return 'high';
  }

  if (score >= 3) {
    return 'medium';
  }

  return 'low';
}

function collectFieldFromInputs(regex) {
  const candidates = [];
  const elements = document.querySelectorAll('input, textarea, [contenteditable="true"], [data-testid], [aria-label]');

  for (const element of elements) {
    const aria = element.getAttribute('aria-label') || '';
    const name = element.getAttribute('name') || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const dataTestId = element.getAttribute('data-testid') || '';
    const value = 'value' in element ? String(element.value || '') : '';
    const combined = `${aria} ${name} ${placeholder} ${dataTestId} ${value}`.trim();
    if (!combined) {
      continue;
    }

    const match = combined.match(regex);
    if (match?.[1]) {
      candidates.push(match[1].trim());
    } else if (match?.[0]) {
      candidates.push(match[0].trim());
    }
  }

  return candidates[0];
}

function extractContext() {
  const bodyText = clampText(document.body?.innerText || '');
  const title = document.title || '';
  const url = window.location.href;
  const route = `${window.location.hostname}${window.location.pathname}`.slice(0, 140);
  const context = {
    title,
    url,
    route,
    pair: undefined,
    chain: undefined,
    orderDirection: undefined,
    orderType: undefined,
    orderSize: undefined,
    leverage: undefined,
    addresses: []
  };

  const pairMatch = bodyText.match(PAIR_RE);
  if (pairMatch) {
    context.pair = `${pairMatch[1]}/${pairMatch[2]}`;
  }

  const chainMatch = bodyText.match(CHAIN_RE);
  if (chainMatch?.[1]) {
    context.chain = chainMatch[1].toLowerCase();
  }

  const sizeMatch = bodyText.match(ORDER_SIZE_RE);
  if (sizeMatch?.[1]) {
    context.orderSize = sizeMatch[1];
  }

  const leverageMatch = bodyText.match(LEVERAGE_RE);
  if (leverageMatch?.[1]) {
    context.leverage = leverageMatch[1].toLowerCase();
  }

  const directionMatch = bodyText.match(ORDER_DIR_RE);
  if (directionMatch?.[1]) {
    context.orderDirection = directionMatch[1].toLowerCase();
  }

  const typeMatch = bodyText.match(ORDER_TYPE_RE);
  if (typeMatch?.[1]) {
    context.orderType = typeMatch[1].toLowerCase();
  }

  const sizeFromInputs = collectFieldFromInputs(ORDER_SIZE_RE);
  if (sizeFromInputs && !context.orderSize) {
    context.orderSize = sizeFromInputs;
  }

  const leverageFromInputs = collectFieldFromInputs(LEVERAGE_RE);
  if (leverageFromInputs && !context.leverage) {
    context.leverage = leverageFromInputs.toLowerCase();
  }

  const addresses = new Set([
    ...(bodyText.match(EVM_ADDRESS_RE) || []),
    ...(bodyText.match(SOL_ADDRESS_RE) || [])
  ]);
  context.addresses = [...addresses].slice(0, 3);

  return {
    context,
    confidence: detectConfidence(context)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'dochermes:extract-context') {
    return;
  }

  try {
    const extracted = extractContext();
    sendResponse({
      ok: true,
      confidence: extracted.confidence,
      context: extracted.context
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown extraction error'
    });
  }
});
