(function () {
  const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;
  const SOL_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{40,88}\b/g;
  const PAIR_RE = /\b([A-Z]{2,12})\s*\/\s*([A-Z]{2,12})\b/;
  const CHAIN_RE = /\b(?:chain|network)?\s*[:=]?\s*(ethereum|solana|base|arbitrum|optimism|polygon|avalanche|bsc|sui|aptos)\b/i;
  const ORDER_SIZE_RE =
    /\b(?:size|amount|qty|quantity|position size|notional|value|stake)\s*[:=]?\s*\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?(?:\s*[A-Za-z%]{1,12})?)\b/i;
  const LEVERAGE_RE = /\bleverage\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?x)\b/i;
  const ORDER_DIR_RE = /\b(buy|sell|long|short)\b/i;
  const ORDER_TYPE_RE = /\b(market|limit|stop(?:-loss)?|take(?:-profit)?|tp|sl)\b/i;

  const MAX_TEXT_LENGTH = 30000;
  const MAX_FIELD_LENGTH = 160;

  const FIELD_ALIASES = {
    pair: ['pair', 'trading-pair', 'symbol', 'market'],
    chain: ['chain', 'network'],
    orderDirection: ['side', 'direction', 'order-side', 'order-direction'],
    orderType: ['order-type', 'type'],
    orderSize: ['size', 'amount', 'qty', 'quantity', 'order-size', 'notional', 'value', 'stake'],
    leverage: ['leverage'],
    tokenAddress: ['token-address', 'tokenAddress', 'contract-address', 'contractAddress', 'mint', 'ca'],
    pairAddress: ['pair-address', 'pairAddress', 'pool-address', 'poolAddress']
  };
  const DIRECT_FIELD_ATTRIBUTES = {
    pair: ['data-pair'],
    chain: ['data-chain'],
    orderDirection: ['data-side', 'data-order-side', 'data-order-direction'],
    orderType: ['data-order-type'],
    orderSize: ['data-size', 'data-order-size', 'data-amount', 'data-quantity'],
    leverage: ['data-leverage'],
    tokenAddress: ['data-token-address', 'data-contract-address', 'data-mint'],
    pairAddress: ['data-pair-address', 'data-pool-address']
  };

  function clampText(input, maxLength = MAX_TEXT_LENGTH) {
    return String(input || '').slice(0, maxLength);
  }

  function clampField(input) {
    const value = String(input || '').trim().replace(/\s+/g, ' ');
    return value ? value.slice(0, MAX_FIELD_LENGTH) : undefined;
  }

  function sanitizeUrl(rawUrl) {
    try {
      const parsed = new URL(String(rawUrl || ''));
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      return undefined;
    }
  }

  function routeFromLocation(locationLike) {
    const hostname = clampField(locationLike?.hostname);
    const pathname = clampField(locationLike?.pathname || '/');
    if (!hostname) {
      return undefined;
    }

    return `${hostname}${pathname || '/'}`.slice(0, 140);
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

  function normalizeAlias(alias) {
    return alias.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function collectElements(documentLike) {
    if (!documentLike || typeof documentLike.querySelectorAll !== 'function') {
      return [];
    }

    return Array.from(
      documentLike.querySelectorAll(
        'input, textarea, select, [contenteditable="true"], [data-testid], [aria-label], [data-dochermes-field], [data-token-address], [data-pair-address], [data-pair], [data-chain], [data-side], [data-size], [data-leverage], [data-order-type]'
      )
    ).slice(0, 500);
  }

  function readElementPieces(element) {
    const getAttribute = typeof element.getAttribute === 'function' ? (name) => element.getAttribute(name) || '' : () => '';
    const pieces = [
      getAttribute('aria-label'),
      getAttribute('name'),
      getAttribute('placeholder'),
      getAttribute('data-testid'),
      getAttribute('data-dochermes-field'),
      getAttribute('data-token-address'),
      getAttribute('data-pair-address'),
      getAttribute('data-pair'),
      getAttribute('data-chain'),
      getAttribute('data-side'),
      getAttribute('data-size'),
      getAttribute('data-leverage'),
      getAttribute('data-order-type'),
      'value' in element ? String(element.value || '') : '',
      element.textContent || ''
    ];

    return pieces.map(clampField).filter(Boolean);
  }

  function collectStructuredFields(elements) {
    const fields = {};
    const aliases = Object.entries(FIELD_ALIASES).map(([field, names]) => [
      field,
      new Set(names.map(normalizeAlias))
    ]);

    for (const element of elements) {
      const pieces = readElementPieces(element);
      const joined = pieces.join(' ');
      const explicitField = clampField(
        typeof element.getAttribute === 'function' ? element.getAttribute('data-dochermes-field') : ''
      );
      const explicitValue =
        clampField('value' in element ? element.value : '') ||
        clampField(typeof element.getAttribute === 'function' ? element.getAttribute('data-value') : '') ||
        clampField(element.textContent);

      for (const [field, attributes] of Object.entries(DIRECT_FIELD_ATTRIBUTES)) {
        if (fields[field]) {
          continue;
        }

        for (const attribute of attributes) {
          const directValue = clampField(typeof element.getAttribute === 'function' ? element.getAttribute(attribute) : '');
          if (directValue) {
            fields[field] = directValue;
            break;
          }
        }
      }

      if (explicitField && explicitValue) {
        const normalizedExplicit = normalizeAlias(explicitField);
        for (const [field, knownAliases] of aliases) {
          if (knownAliases.has(normalizedExplicit) && !fields[field]) {
            fields[field] = explicitValue;
          }
        }
      }

      for (const [field, knownAliases] of aliases) {
        if (fields[field]) {
          continue;
        }

        for (const piece of pieces) {
          const [left, ...right] = piece.split(/[:=]/);
          const normalizedLeft = normalizeAlias(left);
          if (knownAliases.has(normalizedLeft) && right.join(':').trim()) {
            fields[field] = clampField(right.join(':'));
            break;
          }
        }
      }

      if (!fields.pair) {
        fields.pair = firstMatch(joined, PAIR_RE, (match) => `${match[1]}/${match[2]}`);
      }
      if (!fields.chain) {
        fields.chain = firstMatch(joined, CHAIN_RE, (match) => match[1].toLowerCase());
      }
      if (!fields.orderSize) {
        fields.orderSize = firstMatch(joined, ORDER_SIZE_RE, (match) => match[1]);
      }
      if (!fields.leverage) {
        fields.leverage = firstMatch(joined, LEVERAGE_RE, (match) => match[1].toLowerCase());
      }
      if (!fields.orderDirection) {
        fields.orderDirection = firstMatch(joined, ORDER_DIR_RE, (match) => match[1].toLowerCase());
      }
      if (!fields.orderType) {
        fields.orderType = firstMatch(joined, ORDER_TYPE_RE, (match) => match[1].toLowerCase());
      }
    }

    return fields;
  }

  function firstMatch(text, regex, read) {
    const match = text.match(regex);
    return match ? clampField(read(match)) : undefined;
  }

  function collectAddresses(text, fields) {
    const addresses = new Set([
      ...(text.match(EVM_ADDRESS_RE) || []),
      ...(text.match(SOL_ADDRESS_RE) || [])
    ]);

    if (fields.tokenAddress) {
      addresses.add(fields.tokenAddress);
    }

    if (fields.pairAddress) {
      addresses.add(fields.pairAddress);
    }

    return [...addresses].map(clampField).filter(Boolean).slice(0, 3);
  }

  function extractContextFromDocument(documentLike, locationLike) {
    const bodyText = clampText(documentLike?.body?.innerText || '');
    const elements = collectElements(documentLike);
    const structuredFields = collectStructuredFields(elements);
    const title = clampField(documentLike?.title);
    const route = routeFromLocation(locationLike);
    const url = sanitizeUrl(locationLike?.href);
    const context = {
      title,
      url,
      route,
      pair: structuredFields.pair || firstMatch(bodyText, PAIR_RE, (match) => `${match[1]}/${match[2]}`),
      chain: structuredFields.chain || firstMatch(bodyText, CHAIN_RE, (match) => match[1].toLowerCase()),
      orderDirection:
        structuredFields.orderDirection || firstMatch(bodyText, ORDER_DIR_RE, (match) => match[1].toLowerCase()),
      orderType: structuredFields.orderType || firstMatch(bodyText, ORDER_TYPE_RE, (match) => match[1].toLowerCase()),
      orderSize: structuredFields.orderSize || firstMatch(bodyText, ORDER_SIZE_RE, (match) => match[1]),
      leverage: structuredFields.leverage || firstMatch(bodyText, LEVERAGE_RE, (match) => match[1].toLowerCase()),
      addresses: []
    };

    context.addresses = collectAddresses(bodyText, structuredFields);

    return {
      context,
      confidence: detectConfidence(context)
    };
  }

  function extractContext() {
    return extractContextFromDocument(document, window.location);
  }

  const api = {
    clampText,
    extractContext,
    extractContextFromDocument,
    sanitizeUrl
  };

  globalThis.DocHermesContextExtractor = api;

  if (globalThis.chrome?.runtime?.onMessage) {
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
  }
})();
