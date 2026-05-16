import fs from 'node:fs';
import path from 'node:path';

const targets = [
  'apps/shopify-app/shopify.app.toml',
  'apps/shopify-app/shopify.app.clever-route.toml',
  'infra/caddy/Caddyfile',
  'infra/compose/docker-compose.prod.yml',
  'infra/compose/docker-compose.clever-route.yml',
  'infra/env/shopify-app.env.example',
  'infra/env/shopify-app-clever-route.env.example',
  'infra/env/delivery-api.env.example',
  'infra/env/delivery-api-clever-route.env.example',
  'docs/deployment/aws-single-eip-deployment-2026-05-14.md'
];

const forbidden = ['shopify', 'example'];
const urlPattern = /https?:\/\/[^\s`\)\]\"']+/g;
const violations = [];

for (const relativePath of targets) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(urlPattern)) {
      const url = match[0];
      let hostname;
      try {
        hostname = new URL(url).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (forbidden.some((word) => hostname.includes(word))) {
        violations.push(`${relativePath}:${index + 1}: ${url}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Public URL hostnames must not contain "shopify" or "example":');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('public-url-host-scan-ok');
