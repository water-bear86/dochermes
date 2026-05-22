const extractButton = document.getElementById('extract');
const copyButton = document.getElementById('copy');
const payloadField = document.getElementById('payload');
const statusField = document.getElementById('status');

function setStatus(message) {
  statusField.textContent = message;
}

function toPayloadText(context) {
  const lines = ['DOCHERMES_CONTEXT', 'source: browser-dom'];

  if (context.route) {
    lines.push(`route: ${context.route}`);
  }
  if (context.pair) {
    lines.push(`pair: ${context.pair}`);
  }
  if (context.chain) {
    lines.push(`chain: ${context.chain}`);
  }
  if (context.orderDirection) {
    lines.push(`order-direction: ${context.orderDirection}`);
  }
  if (context.orderType) {
    lines.push(`order-type: ${context.orderType}`);
  }
  if (context.orderSize) {
    lines.push(`size: ${context.orderSize}`);
  }
  if (context.leverage) {
    lines.push(`leverage: ${context.leverage}`);
  }
  if (Array.isArray(context.addresses) && context.addresses.length > 0) {
    lines.push(`token-address: ${context.addresses[0]}`);
  }
  if (context.url) {
    lines.push(`url: ${context.url}`);
  }

  return lines.join('\n');
}

function withActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || typeof tab.id !== 'number') {
      callback(new Error('No active tab available.'));
      return;
    }

    callback(null, tab.id);
  });
}

extractButton.addEventListener('click', () => {
  setStatus('Extracting...');
  withActiveTab((error, tabId) => {
    if (error) {
      setStatus(error.message);
      return;
    }

    chrome.tabs.sendMessage(tabId, { type: 'dochermes:extract-context' }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(`Extraction failed: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response || !response.ok || !response.context) {
        setStatus('No context extracted on this page.');
        return;
      }

      const payload = toPayloadText(response.context);
      payloadField.value = payload;
      copyButton.disabled = payload.trim().length === 0;
      setStatus(`Extracted with ${response.confidence || 'low'} confidence.`);
    });
  });
});

copyButton.addEventListener('click', async () => {
  const payload = payloadField.value.trim();
  if (!payload) {
    setStatus('Nothing to copy.');
    return;
  }

  try {
    await navigator.clipboard.writeText(payload);
    setStatus('Copied. DocHermes clipboard monitor can ingest this context.');
  } catch (error) {
    setStatus(`Copy failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
});
