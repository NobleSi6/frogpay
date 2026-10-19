const http = require('node:http');

const PORT = 8080;
const MAX_BODY_BYTES = 1024 * 1024;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/alerts') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const chunks = [];
  let bodyBytes = 0;
  let bodyTooLarge = false;

  req.on('data', (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      bodyTooLarge = true;
      chunks.length = 0;
      return;
    }

    if (!bodyTooLarge) {
      chunks.push(chunk);
    }
  });

  req.on('end', () => {
    if (bodyTooLarge) {
      res.writeHead(413);
      res.end('Payload too large');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    if (!payload || !Array.isArray(payload.alerts)) {
      res.writeHead(400);
      res.end('Invalid Alertmanager payload');
      return;
    }

    for (const alert of payload.alerts) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          source: 'alertmanager',
          status: alert?.status ?? payload.status ?? 'unknown',
          alertname: alert?.labels?.alertname,
          severity: alert?.labels?.severity,
          component: alert?.labels?.component,
          summary: alert?.annotations?.summary,
        }),
      );
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ received: payload.alerts.length }));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FrogPay Alert Receiver listening on ${PORT}`);
});
