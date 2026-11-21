import { build } from 'esbuild'

// Harness browser plugins are closure factories, not native browser ESM imports.
// React comes from the host's module table to share the renderer's hook dispatcher.
await build({
  entryPoints: ['src/client.tsx'], outfile: 'lib/client.js', bundle: true,
  platform: 'browser', target: 'es2022', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-image-to-text", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
