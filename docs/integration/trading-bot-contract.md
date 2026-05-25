# Trading Bot Integration Contract

DocHermes is the coaching layer. The trading bot remains the system that owns market data, routing, order placement, wallet integration, and position tracking.

This contract is intentionally advisory-first. It defines how a bot can ask DocHermes/Hermes for risk guidance, how the user decision is recorded, and how later outcomes can improve personal coaching.

## Boundaries

DocHermes must not:

- hold private keys
- request seed phrases
- request wallet approvals
- sign transactions
- route orders
- place trades
- withdraw funds
- bypass user confirmation

The bot may use DocHermes output to shape its UI, warnings, and policy checks. The bot must own any execution decision and any final pre-trade confirmation.

## Flow

```text
Signal discovered by bot
-> Bot sends signal context to DocHermes
-> DocHermes adds local memory, rules, and selected-window context
-> Hermes returns a coach assessment
-> Bot shows trade card
-> User approves, resizes, waits, rejects, or overrides
-> Bot executes only if its own execution policy allows it
-> Bot sends outcome back to DocHermes for memory
```

## Signal Input

The bot should send a compact signal object before execution.

```json
{
  "schemaVersion": "dochermes.signal.v1",
  "signalId": "sig_123",
  "createdAt": "2026-05-23T15:00:00.000Z",
  "source": {
    "type": "wallet-alert",
    "label": "tracked-wallet",
    "confidence": "medium"
  },
  "asset": {
    "symbol": "ABC",
    "tokenAddress": "optional",
    "chain": "solana",
    "pairAddress": "optional"
  },
  "market": {
    "tokenAgeMinutes": 42,
    "liquidityUsd": 118000,
    "holderConcentration": "elevated",
    "recentVolumeTrend": "expanding",
    "poolAddress": "optional",
    "dex": "optional",
    "priceChange": {
      "m5Percent": 12.4,
      "h1Percent": 41.8,
      "h24Percent": 88.2
    },
    "volumeUsd": {
      "m5": 42000,
      "h1": 310000,
      "h24": 1800000
    },
    "transactions": {
      "m5Buys": 43,
      "m5Sells": 18,
      "h1Buys": 412,
      "h1Sells": 190
    }
  },
  "analysisContext": {
    "technicalIndicators": [
      {
        "name": "rsi",
        "timeframe": "5m",
        "value": 78.2,
        "interpretation": "overbought"
      }
    ],
    "sentiment": {
      "score": 0.35,
      "label": "moderately-positive",
      "sources": ["rss-news", "social-summary"]
    },
    "providerEvidence": [
      {
        "provider": "coingecko",
        "kind": "pool-data",
        "observedAt": "2026-05-23T15:00:00.000Z"
      }
    ]
  },
  "proposedTrade": {
    "side": "buy",
    "size": 0.5,
    "unit": "SOL",
    "strategy": "early-momentum"
  },
  "botContext": {
    "platform": "optional",
    "routePreview": "optional",
    "executionCapability": true
  }
}
```

## Market And Analysis Context

Trading bots and Hermes may enrich a signal with read-only market evidence:

- pool liquidity, reserves, DEX, token age, recent transactions, and volume
- OHLCV or price-change windows such as 5m, 1h, and 24h
- technical indicators such as RSI, MACD, moving averages, Bollinger bands, or stochastic signals
- compact market-sentiment summaries from news or social feeds
- provider provenance such as CoinGecko, Binance, a DEX API, browser DOM extraction, or the bot's own market data layer

DocHermes should treat this as evidence for coaching, not as execution authority. Provider API keys, raw account exports, unsanitized order books, private trading history, and wallet credentials should not be required in this contract.

## Coach Assessment Output

Hermes should return structured guidance that the bot can render as a trade card.

```json
{
  "schemaVersion": "dochermes.assessment.v1",
  "signalId": "sig_123",
  "risk": "high",
  "recommendedAction": "wait",
  "recommendedSize": {
    "value": 0.08,
    "unit": "SOL"
  },
  "reason": "This resembles prior early-entry trades where oversized allocation performed poorly.",
  "plan": {
    "entry": "Wait for confirmation above current range.",
    "invalidation": "Exit if liquidity drops by 20% or price loses support.",
    "takeProfit": "Reduce 50% at 2x.",
    "maxHoldTimeMinutes": 45
  },
  "memory": {
    "matchedPriorTrades": 14,
    "summary": "Immediate entries under similar conditions averaged -22%; confirmation entries averaged +8%."
  },
  "warnings": [
    {
      "level": "guardrail",
      "code": "oversize",
      "message": "Proposed size exceeds the recommended risk budget for this setup."
    }
  ]
}
```

## User Decision Event

The bot should report what the user did with the card.

```json
{
  "schemaVersion": "dochermes.decision.v1",
  "signalId": "sig_123",
  "decidedAt": "2026-05-23T15:03:00.000Z",
  "action": "resized",
  "requestedSize": {
    "value": 0.5,
    "unit": "SOL"
  },
  "finalSize": {
    "value": 0.08,
    "unit": "SOL"
  },
  "override": {
    "used": false,
    "note": ""
  }
}
```

Allowed decision actions:

- `accepted-recommended`
- `resized`
- `waited`
- `set-alert`
- `created-plan`
- `rejected`
- `overrode`

## Execution Gate Decision

When a bot is ready to decide whether its own execution flow may continue, it can derive a local gate decision from the trade card and the optional user decision event.

This is policy metadata for the bot. It is not an order, route, signature request, transaction, or execution approval from DocHermes.

```json
{
  "schemaVersion": "dochermes.execution-gate.v1",
  "signalId": "sig_123",
  "evaluatedAt": "2026-05-23T15:03:30.000Z",
  "mode": "policy",
  "status": "requires-override",
  "canContinueToBotConfirmation": false,
  "requiresExplicitOverride": true,
  "overrideAccepted": false,
  "reasons": ["Daily loss policy requires explicit user override."],
  "executionBoundary": {
    "docHermesCanExecute": false,
    "botOwnsExecution": true,
    "advisoryOnly": true,
    "prohibitedActions": [
      "hold-private-keys",
      "request-seed-phrase",
      "request-wallet-approval",
      "sign-transaction",
      "route-order",
      "place-trade",
      "submit-transaction",
      "withdraw-funds"
    ],
    "note": "DocHermes provides local coaching metadata only. The trading bot owns confirmation, routing, signing, and execution."
  }
}
```

Gate statuses:

- `allowed`: the user chose a continuing action and no policy override is required.
- `warn`: guardrail mode has warnings, but the user chose a continuing action.
- `requires-override`: policy mode has a violation and the user has not recorded explicit override metadata.
- `override-accepted`: policy mode has a violation and the user recorded explicit override metadata.
- `not-requested`: the user chose to wait, set an alert, create a plan, reject, or has not chosen a continuing action.

The only continuation hint is `canContinueToBotConfirmation`. Even when it is `true`, the bot still owns final confirmation, routing, signing, and order placement. Local override notes are intentionally not exported through this bot-facing gate payload.

## Outcome Event

Outcome data closes the coaching loop.

```json
{
  "schemaVersion": "dochermes.outcome.v1",
  "signalId": "sig_123",
  "positionId": "optional",
  "closedAt": "2026-05-23T15:48:00.000Z",
  "outcome": {
    "status": "closed",
    "pnlPercent": 8.4,
    "maxDrawdownPercent": 12.1,
    "maxRunupPercent": 103.0,
    "holdTimeMinutes": 45
  },
  "review": {
    "followedPlan": true,
    "mistakeTags": [],
    "notes": "Waited for confirmation, scaled out at target."
  }
}
```

## Mode Semantics

### Advisory Mode

DocHermes gives recommendations. The bot does not need an override to continue.

### Guardrail Mode

DocHermes warns when the proposed action violates user rules or local risk policy. The bot can continue after showing the warning.

### Policy Mode

DocHermes marks violations that require an explicit user override before the bot may continue. The bot still owns enforcement at execution time.

## Privacy

The bot should only send the minimum useful signal context. Screenshots, memory summaries, monitoring context, and source history should follow the user's active DocHermes privacy preset.

Maximum privacy means:

- no screenshot image
- no real window title
- no memory context
- no monitoring context
- placeholder metadata only where a schema requires a field

## Open Questions

- Which bot event transport should ship first: local HTTP, WebSocket, IPC, or file-based dropbox?
- How should each bot map `canContinueToBotConfirmation` into its own pre-trade confirmation UI?
- How much market data should the bot pass directly versus letting Hermes infer from screenshot/context?
- What is the minimum outcome data needed for useful personal memory without becoming surveillance-heavy?
