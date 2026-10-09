import { fileURLToPath } from 'node:url';
export default {
  root: fileURLToPath(new URL('../tests/fixtures/original-gps-preview/', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 4188, strictPort: true },
};
