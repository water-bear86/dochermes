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
    "recentVolumeTrend": "expanding"
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
- Should policy mode block inside the bot, DocHermes, or both?
- How much market data should the bot pass directly versus letting Hermes infer from screenshot/context?
- What is the minimum outcome data needed for useful personal memory without becoming surveillance-heavy?
