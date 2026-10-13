#!/usr/bin/env node

/**
 * FrogPay Webhook Test Receiver (TSK-SCRUM-305)
 * Receptor local de webhooks para simular respuestas de pago desde el simulador.
 * Elias Lecoña (Dev 2) usa este script para probar reintentos de webhook.
 *
 * Usage:
 *   node webhook-receiver.js --port 4001 --fail-chance 0.3
 *   node webhook-receiver.js --port 4001 --fail-count 2
 */

const http = require('http');
const url = require('url');

const args = process.argv.slice(2);
const port = parseInt(args.find(a => a.startsWith('--port'))?.split('=')[1] || '4001');
const failChance = parseFloat(args.find(a => a.startsWith('--fail-chance'))?.split('=')[1] || '0');
const failCount = parseInt(args.find(a => a.startsWith('--fail-count'))?.split('=')[1] || '0');

let requestCount = 0;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);

  console.log(`[${new Date().toISOString()}] ${requestId} ${req.method} ${req.url}`);

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });

  req.on('end', () => {
    requestCount++;
    let statusCode = 200;
    let responseBody = { success: true, requestId, requestCount };

    const shouldFail =
      (failChance > 0 && Math.random() < failChance) ||
      (failCount > 0 && requestCount <= failCount);

    if (shouldFail) {
      statusCode = 500;
      responseBody = {
        success: false,
        error: 'Simulated Webhook Server Error',
        requestId,
        requestCount,
      };
      console.log(`[${new Date().toISOString()}] ${requestId} RETURNING 500 (fail-chance=${failChance}, fail-count=${failCount}, requestCount=${requestCount})`);
    } else {
      console.log(`[${new Date().toISOString()}] ${requestId} RETURNING 200`);
    }

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'X-Webhook-Request-Id': requestId,
    });
    res.end(JSON.stringify(responseBody));
  });
});

server.listen(port, () => {
  console.log(`FrogPay Webhook Test Receiver (TSK-SCRUM-305) listening on http://localhost:${port}`);
  console.log(`Configuration:`);
  console.log(`  Port: ${port}`);
  console.log(`  Fail chance: ${failChance}`);
  console.log(`  Fail first ${failCount} requests`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  POST http://localhost:${port}/webhook/simulator`);
  console.log(`  POST http://localhost:${port}/webhook/deposit`);
  console.log(`  POST http://localhost:${port}/v1/webhook/pago`);
  console.log('');
  console.log('Logs will show request details and response status.');
});
