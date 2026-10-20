const fs = require('node:fs');
const webhookUrl = process.env.ALERTMANAGER_WEBHOOK_URL;
const outputFile =
  process.env.ALERTMANAGER_CONFIG_PATH ??
  '/config/alertmanager.yml';

if (!webhookUrl) {
  throw new Error('ALERTMANAGER_WEBHOOK_URL must be configured.');
}

let parsedWebhookUrl;
try {
  parsedWebhookUrl = new URL(webhookUrl);
} catch {
  throw new Error('ALERTMANAGER_WEBHOOK_URL debe ser una URL HTTP o HTTPS válida.');
}

if (!['http:', 'https:'].includes(parsedWebhookUrl.protocol)) {
  throw new Error('ALERTMANAGER_WEBHOOK_URL debe usar HTTP o HTTPS.');
}

const config = `global:
  resolve_timeout: 5m

route:
  receiver: frogpay-webhook
  group_by:
    - alertname
    - component
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: frogpay-webhook
    webhook_configs:
      - url: ${JSON.stringify(webhookUrl)}
        send_resolved: true
`;

fs.writeFileSync(outputFile, config, { mode: 0o444 });
fs.chmodSync(outputFile, 0o444);
