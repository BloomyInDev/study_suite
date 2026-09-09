import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // data/ is the compose postgres volume: root-owned, so walking it fails
        // the whole run with EACCES.
        ignores: ['**/dist/**', '**/node_modules/**', '**/migrations/**', 'data/**'],
    },
    {
        // The push service worker. It is plain JS — public/ is copied verbatim, so
        // it is never bundled — which means typescript-eslint's blanket `no-undef`
        // suppression does not cover it, and its one global is neither `window` nor
        // `process`.
        files: ['apps/web/public/sw.js'],
        languageOptions: { globals: { self: 'readonly' } },
    },
)
