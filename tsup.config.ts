import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  banner: { js: '#!/usr/bin/env node' },
  external: ['playwright-core'],
  onSuccess: async () => {
    const dashDir = join('dist', 'dashboard');
    mkdirSync(dashDir, { recursive: true });
    for (const file of ['index.html', 'app.js', 'style.css']) {
      try {
        copyFileSync(join('src', 'dashboard', file), join(dashDir, file));
      } catch {
        // Dashboard files may not exist yet
      }
    }
    // DeepSeek PoW WASM blob — required at runtime; tsup bundles the module
    // that reads it, so the file must sit next to the output bundle.
    try {
      copyFileSync(
        join('src', 'providers', 'deepseek', 'deepseek-hash-v1.wasm.b64'),
        join('dist', 'deepseek-hash-v1.wasm.b64'),
      );
    } catch {
      // WASM file may not exist yet
    }
  },
});
