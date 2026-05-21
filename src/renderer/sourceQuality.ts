import type {
  JournalEntry,
  JournalMonitoringSignal,
  MonitoringSignal,
  SourceCategory,
  SourceQualityFinding
} from '../shared/types';

interface BuildSourceQualityAssessmentInput {
  question: string;
  monitorSignals: MonitoringSignal[];
  journalEntries: JournalEntry[];
}

interface SourceHistory {
  total: number;
  good: number;
  neutral: number;
  bad: number;
  unknown: number;
}

interface SourceQualityAssessment {
  warnings: string[];
  warningFindings: Array<{ warning: string; finding: SourceQualityFinding }>;
  findings: SourceQualityFinding[];
}

const MAX_FINDINGS = 6;
const MAX_WARNINGS = 4;

const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const SOL_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{40,88}\b/g;
const URL_RE = /https?:\/\/[^\s]+/g;

const DEX_HOST_RE = /\b(dextools|dexscreener|birdeye|solscan|etherscan|raydium|meteora|jupiter)\b/i;
const TELEGRAM_HOST_RE = /\b(t\.me|telegram|tg:)/i;
const DISCORD_HOST_RE = /\b(discord\.com|discord\.gg|discordapp)/i;
const SOCIAL_HOST_RE = /\b(x\.com|twitter\.com|reddit\.com|instagram\.com|youtube\.com|farcaster\.com)\b/i;

export function buildSourceQualityAssessment(input: BuildSourceQualityAssessmentInput): SourceQualityAssessment {
  const normalizedQuestion = input.question.toLowerCase();
  const rawFindings = collectFindings(normalizedQuestion, input.monitorSignals);
  const findings = dedupeFindings(rawFindings).slice(0, MAX_FINDINGS);

  const sourceHistory = buildSourceHistory(input.journalEntries);
  const warningFindings = findings
    .map((finding) => {
      const tokenKey = normalizedTokenHint(finding.tokenHint);
      return {
        finding,
        warning: buildWarningForFinding(finding, tokenKey ? sourceHistory.get(tokenKey) : undefined)
      };
    })
    .filter(
      (entry): entry is { finding: SourceQualityFinding; warning: string } => typeof entry.warning === 'string' && entry.warning.length > 0
    );

  const uniqueWarningFindings: Array<{ warning: string; finding: SourceQualityFinding }> = [];
  const seen = new Set<string>();

  for (const entry of warningFindings) {
    if (seen.has(entry.warning)) {
      continue;
    }
    seen.add(entry.warning);
    uniqueWarningFindings.push(entry);

    if (uniqueWarningFindings.length >= MAX_WARNINGS) {
      break;
    }
  }

  return {
    warnings: uniqueWarningFindings.map((entry) => entry.warning),
    warningFindings: uniqueWarningFindings,
    findings
  };
}

type MonitoringSignalLike = MonitoringSignal | JournalMonitoringSignal;

function collectFindings(question: string, monitorSignals: MonitoringSignal[]): SourceQualityFinding[] {
  const fromQuestion = collectQuestionFindings(question);
  const fromMonitoring = monitorSignals
    .map((signal) => collectMonitoringFinding(signal))
    .filter((finding): finding is SourceQualityFinding => finding !== null);
  return [...fromQuestion, ...fromMonitoring];
}

function collectQuestionFindings(question: string): SourceQualityFinding[] {
  const findings: SourceQualityFinding[] = [];
  const seen = new Set<string>();

  const lower = question.toLowerCase();
  const urls = [...question.matchAll(URL_RE)];
  for (const match of urls) {
    const rawUrl = match[0] ?? '';
    const finding = urlToFinding(rawUrl, 'Question');
    if (!finding) {
      continue;
    }
    const key = findingKey(finding);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    findings.push(finding);
  }

  const addAddressFindings = (tokenRegex: RegExp, category: SourceCategory, confidence: 'low' | 'medium' | 'high'): void => {
    for (const match of question.matchAll(tokenRegex)) {
      const tokenHint = match[0];
      if (!tokenHint) {
        continue;
      }

      const finding: SourceQualityFinding = {
        category,
        confidence,
        tokenHint,
        provenance: 'Question text',
        reason: `${category} identifier in question`
      };
      const key = findingKey(finding);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      findings.push(finding);
    }
  };

  addAddressFindings(EVM_ADDRESS_RE, 'token-address', 'medium');
  addAddressFindings(SOL_ADDRESS_RE, 'token-address', 'medium');

  const socialSignals: Array<{ category: SourceCategory; confidence: 'low' | 'medium' | 'high'; test: RegExp }> = [
    { category: 'telegram', confidence: 'medium', test: /telegram|t\.me|tg:\/\//i },
    { category: 'discord', confidence: 'medium', test: /discord\.com|discord\.gg|discordapp/i },
    { category: 'social', confidence: 'low', test: /x\.com|twitter\.com|reddit\.com/i }
  ];

  for (const signal of socialSignals) {
    if (!signal.test.test(lower)) {
      continue;
    }

    const finding: SourceQualityFinding = {
      category: signal.category,
      confidence: signal.confidence,
      provenance: 'Question text',
      reason: `Source mention in question (${signal.category})`
    };
    const key = findingKey(finding);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    findings.push(finding);
  }

  return findings;
}

function collectMonitoringFinding(signal: MonitoringSignalLike): SourceQualityFinding | null {
  const confidence = signal.confidence;
  const tokenHint = extractTokenHintFromSignal(signal);
  const category = inferCategoryFromSignal(signal);
  const reason =
    signal.kind === 'dex-url'
      ? 'DEX link copied'
      : signal.kind === 'wallet-address'
        ? 'Wallet reference'
        : signal.kind === 'evm-address'
          ? 'EVM address copied'
          : signal.kind === 'evm-tx-hash'
            ? 'Transaction hash copied'
            : signal.kind === 'sol-address'
              ? 'SOL address copied'
              : signal.message ?? 'Monitoring signal';

  if (category === 'unknown') {
    return null;
  }

  return {
    category,
    confidence,
    provenance: `Clipboard signal (${signal.source})`,
    ...(tokenHint ? { tokenHint } : {}),
    reason,
    detectedAt: signal.detectedAt
  };
}

function buildSourceHistory(entries: JournalEntry[]): Map<string, SourceHistory> {
  const history = new Map<string, SourceHistory>();
  for (const entry of entries) {
    const tokenHints = extractTokenHintsFromEntry(entry);
    if (tokenHints.size === 0) {
      continue;
    }

    const outcome = entry.sourceContext?.outcome ?? 'unknown';
    for (const tokenHint of tokenHints) {
      const key = normalizedTokenHint(tokenHint);
      if (!key) {
        continue;
      }

      const record = history.get(key) ?? { total: 0, good: 0, neutral: 0, bad: 0, unknown: 0 };
      record.total += 1;
      if (outcome === 'good') {
        record.good += 1;
      } else if (outcome === 'neutral') {
        record.neutral += 1;
      } else if (outcome === 'bad') {
        record.bad += 1;
      } else {
        record.unknown += 1;
      }
      history.set(key, record);
    }
  }
  return history;
}

function buildWarningForFinding(finding: SourceQualityFinding, history?: SourceHistory): string | undefined {
  if (!history) {
    if (finding.category === 'unknown') {
      return undefined;
    }
    if (!finding.tokenHint) {
      return `${friendlyCategory(finding.category)} source appears in current context with no prior quality evidence (${confidenceSuffix(finding)}).`;
    }
    return `${friendlyCategory(finding.category)} source ${shortTokenHint(finding.tokenHint)} is first-seen; verify provenance before entering (${confidenceSuffix(finding)}).`;
  }

  if (history.bad > 0) {
    const suffix = history.total > history.bad ? ` of ${history.total} prior similar source entries` : '';
    return `${friendlyCategory(finding.category)} source ${shortTokenLabel(finding)} had prior poor outcomes (${history.bad}${suffix}) (${confidenceSuffix(finding)}).`;
  }

  if (history.total >= 2) {
    return `${friendlyCategory(finding.category)} signal for ${shortTokenLabel(finding)} was seen repeatedly (${history.total} times) but had no explicit "good" outcome (${confidenceSuffix(finding)}).`;
  }

  if (history.total > 1 && history.good === 0) {
    return `${friendlyCategory(finding.category)} source ${shortTokenLabel(finding)} appeared again after being unscored before (${confidenceSuffix(finding)}).`;
  }

  return undefined;
}

function extractTokenHintsFromEntry(entry: JournalEntry): Set<string> {
  const tokens = new Set<string>();
  const baseText = `${entry.question} ${entry.response} ${entry.notes}`;

  for (const match of baseText.matchAll(EVM_ADDRESS_RE)) {
    if (match[0]) {
      tokens.add(match[0]);
    }
  }

  for (const match of baseText.matchAll(SOL_ADDRESS_RE)) {
    if (match[0]) {
      tokens.add(match[0]);
    }
  }

  if (entry.sourceContext?.tokenHint) {
    tokens.add(entry.sourceContext.tokenHint);
  }

  if (!entry.monitoring) {
    return tokens;
  }

  for (const signal of entry.monitoring.signals) {
    const tokenHint = extractTokenHintFromSignal(signal);
    if (tokenHint) {
      tokens.add(tokenHint);
    }
  }

  return tokens;
}

function extractTokenHintFromSignal(signal: MonitoringSignalLike): string | undefined {
  if (signal.kind === 'evm-address' || signal.kind === 'evm-tx-hash' || signal.kind === 'sol-address') {
    if ('value' in signal && signal.value) {
      return signal.value;
    }
    return signal.maskedValue;
  }

  if (signal.kind === 'wallet-address') {
    return signal.maskedValue;
  }

  return undefined;
}

function inferCategoryFromSignal(signal: MonitoringSignalLike): SourceCategory {
  if (signal.kind === 'wallet-address' || signal.kind === 'evm-tx-hash') {
    return 'wallet';
  }
  if (signal.kind === 'evm-address' || signal.kind === 'sol-address') {
    return 'token-address';
  }
  if (signal.kind === 'dex-url') {
    return inferCategoryFromUrl(signal.maskedValue);
  }
  return 'unknown';
}

function urlToFinding(urlCandidate: string, origin: 'Question' | 'Monitoring'): SourceQualityFinding | null {
  const category = inferCategoryFromUrl(urlCandidate);
  if (category === 'unknown') {
    return null;
  }

  const tokenHint = extractTokenHintFromValue(urlCandidate);
  return {
    category,
    confidence: category === 'token-address' ? 'high' : 'medium',
    provenance: `${origin} URL`,
    ...(tokenHint ? { tokenHint } : {}),
    reason: `Detected ${category} link`
  };
}

function inferCategoryFromUrl(rawUrl: string): SourceCategory {
  const rawHost = safeUrlHost(rawUrl);
  if (!rawHost) {
    return 'unknown';
  }

  if (TELEGRAM_HOST_RE.test(rawHost)) {
    return 'telegram';
  }
  if (DISCORD_HOST_RE.test(rawHost)) {
    return 'discord';
  }
  if (SOCIAL_HOST_RE.test(rawHost)) {
    return 'social';
  }
  if (DEX_HOST_RE.test(rawHost)) {
    return 'dex-link';
  }

  if (rawHost.includes('etherscan') || rawHost.includes('solscan') || rawHost.includes('solana.fm')) {
    return 'wallet';
  }

  return 'unknown';
}

function extractTokenHintFromValue(value: string): string | undefined {
  const evmMatch = value.match(EVM_ADDRESS_RE);
  if (evmMatch?.[0]) {
    return evmMatch[0];
  }

  const solMatch = value.match(SOL_ADDRESS_RE);
  return solMatch?.[0];
}

function safeUrlHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return rawUrl.toLowerCase();
  }
}

function shortTokenLabel(signal: SourceQualityFinding): string {
  if (signal.tokenHint) {
    return shortTokenHint(signal.tokenHint);
  }

  return 'unidentified source';
}

function dedupeFindings(rawFindings: Array<SourceQualityFinding | null>): SourceQualityFinding[] {
  const findings: SourceQualityFinding[] = [];
  const seen = new Set<string>();
  for (const finding of rawFindings) {
    if (!finding) {
      continue;
    }
    const key = findingKey(finding);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    findings.push(finding);
  }
  return findings;
}

function findingKey(finding: SourceQualityFinding): string {
  return `${finding.category}|${finding.tokenHint ?? finding.reason}|${finding.provenance}`;
}

function shortTokenHint(tokenHint: string): string {
  if (tokenHint.length <= 10) {
    return tokenHint;
  }

  return `${tokenHint.slice(0, 6)}…${tokenHint.slice(-4)}`;
}

function normalizedTokenHint(tokenHint?: string): string | undefined {
  if (!tokenHint) {
    return undefined;
  }
  return tokenHint.toLowerCase();
}

function friendlyCategory(category: SourceCategory): string {
  const labels: Record<SourceCategory, string> = {
    telegram: 'Telegram',
    discord: 'Discord',
    social: 'Social',
    'dex-link': 'DEX',
    'token-address': 'Token source',
    wallet: 'Wallet',
    unknown: 'Unknown source'
  };
  return labels[category];
}

function confidenceSuffix(finding: SourceQualityFinding): string {
  const sourceHint = finding.tokenHint ? shortTokenHint(finding.tokenHint) : finding.reason;
  return `confidence ${finding.confidence}, provenance ${finding.provenance}, token ${sourceHint}`;
}
