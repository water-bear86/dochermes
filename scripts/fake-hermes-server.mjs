#!/usr/bin/env node

import http from 'node:http';

const DEFAULT_PORT = 8642;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MODE = 'success';
const DEFAULT_AUTH_TOKEN = 'fake-hermes-token';
const DEFAULT_DELAY_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;

const MODE_ALIASES = new Map([
  ['success', 'success'],
  ['text-image', 'success'],
  ['text+image', 'success'],
  ['auth', 'auth-required'],
  ['auth-required', 'auth-required'],
  ['text-only', 'text-only'],
  ['no-image', 'text-only'],
  ['timeout', 'timeout'],
  ['delayed', 'timeout'],
  ['offline-ish', 'timeout']
]);

const rawMode = String(process.env.HERMES_FAKE_MODE ?? process.env.FAKE_HERMES_MODE ?? DEFAULT_MODE).trim().toLowerCase();
const mode = MODE_ALIASES.get(rawMode) ?? DEFAULT_MODE;
const port = readPort(process.env.HERMES_FAKE_PORT ?? process.env.PORT, DEFAULT_PORT);
const host = String(process.env.HERMES_FAKE_HOST ?? process.env.HOST ?? DEFAULT_HOST);
const authToken = String(process.env.HERMES_FAKE_AUTH_TOKEN ?? process.env.FAKE_HERMES_AUTH_TOKEN ?? DEFAULT_AUTH_TOKEN);
const timeoutDelayMs = readNonNegativeInteger(
  process.env.HERMES_FAKE_DELAY_MS ?? process.env.FAKE_HERMES_DELAY_MS,
  DEFAULT_DELAY_MS
);

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    writeJson(response, 500, {
      error: {
        code: 'fake_hermes_internal_error',
        message: error instanceof Error ? error.message : 'Unknown fake Hermes server error.'
      }
    });
  });
});

server.listen(port, host, () => {
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  const baseUrl = `http://${host}:${boundPort}`;

  console.log('Fake Hermes server fixture');
  console.log(`Mode: ${mode}`);
  console.log(`URL: ${baseUrl}`);
  console.log(`Chat endpoint: ${baseUrl}/v1/chat/completions`);
  console.log(`Auth: ${mode === 'auth-required' ? `required, use Authorization: Bearer ${authToken}` : 'not required'}`);
  console.log(`Capabilities: text=${mode === 'timeout' ? 'delayed' : 'yes'} image=${mode === 'text-only' ? 'no' : 'yes'}`);
  console.log('Boundary: advisory risk-coaching fixture only; no wallet control, signing, routing, private keys, or execution.');
});

process.on('SIGINT', () => closeServer('SIGINT'));
process.on('SIGTERM', () => closeServer('SIGTERM'));

async function handleRequest(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);

  if (mode === 'timeout') {
    await delay(timeoutDelayMs);
  }

  if (mode === 'auth-required' && !isAuthorized(request)) {
    writeJson(response, 401, {
      error: {
        code: 'unauthorized',
        message: 'Fake Hermes auth-required mode expected a bearer token.'
      }
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, {
      status: 'ok',
      service: 'fake-hermes',
      mode,
      advisoryOnly: true
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/models') {
    writeJson(response, 200, {
      object: 'list',
      data: [
        {
          id: 'hermes-agent',
          object: 'model',
          owned_by: 'fake-hermes'
        }
      ]
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/capabilities') {
    writeJson(response, 200, {
      text: true,
      image: mode !== 'text-only',
      chatCompletions: true,
      advisoryOnly: true,
      executionCapability: false,
      walletControl: false,
      signing: false,
      routing: false,
      privateKeyAccess: false
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const body = await readJsonBody(request);
    const hasImage = requestIncludesImage(body);

    if (mode === 'text-only' && hasImage) {
      writeJson(response, 400, {
        error: {
          code: 'image_input_not_supported',
          message: 'Fake Hermes text-only mode accepts text prompts but rejects image input.'
        }
      });
      return;
    }

    writeJson(response, 200, buildChatCompletionResponse(body, hasImage));
    return;
  }

  writeJson(response, 404, {
    error: {
      code: 'not_found',
      message: `Fake Hermes route not found: ${request.method ?? 'UNKNOWN'} ${url.pathname}`
    }
  });
}

function buildChatCompletionResponse(body, hasImage) {
  const prompt = extractLastUserText(body);
  const promptSummary = prompt ? ` Received prompt: "${truncate(prompt, 96)}"` : '';
  const imageSummary = hasImage
    ? ' Screenshot input was received and treated as context only.'
    : ' No screenshot input was received.';

  return {
    id: 'chatcmpl_fake_hermes_0001',
    object: 'chat.completion',
    created: 1_800_000_000,
    model: readModel(body),
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content:
            'Fake Hermes advisory response: pause, define invalidation, size conservatively, and avoid execution unless your prewritten plan is still valid.' +
            imageSummary +
            promptSummary
        }
      }
    ],
    usage: {
      prompt_tokens: 42,
      completion_tokens: 32,
      total_tokens: 74
    }
  };
}

function readModel(body) {
  if (body && typeof body === 'object' && typeof body.model === 'string' && body.model.trim()) {
    return body.model.trim();
  }

  return 'hermes-agent';
}

function extractLastUserText(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
    return '';
  }

  for (let index = body.messages.length - 1; index >= 0; index -= 1) {
    const message = body.messages[index];
    if (!message || typeof message !== 'object' || message.role !== 'user') {
      continue;
    }

    return extractTextContent(message.content);
  }

  return '';
}

function extractTextContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((item) => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function requestIncludesImage(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if ('image_url' in value || 'image' in value) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => requestIncludesImage(item));
  }

  return Object.values(value).some((item) => requestIncludesImage(item));
}

function isAuthorized(request) {
  const authorization = request.headers.authorization;
  return authorization === `Bearer ${authToken}`;
}

async function readJsonBody(request) {
  const rawBody = await readBody(request);

  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function readPort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
    return parsed;
  }

  return fallback;
}

function readNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return fallback;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function closeServer(signal) {
  console.log(`\nFake Hermes server received ${signal}; shutting down.`);
  server.close(() => {
    process.exit(0);
  });
}
