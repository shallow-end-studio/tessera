import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileApi } from './server/fileApi.js';

// Use a local `tokens/` dir if present (your real, git-ignored set); otherwise
// fall back to the bundled example fixture so a fresh clone runs out of the box.
const localTokens = path.resolve(import.meta.dirname, 'tokens');
const tokensDir = existsSync(localTokens) ? localTokens : path.resolve(import.meta.dirname, 'examples/tokens');

export default defineConfig({
  plugins: [react(), tailwindcss(), fileApi({ tokensDir })],
  server: {
    port: 5180,
    // Token JSON lives under the Vite root; without this, every save retriggers
    // the file watcher and forces a full page reload (losing editor state).
    watch: { ignored: ['**/tokens/**', '**/examples/**'] },
  },
});
