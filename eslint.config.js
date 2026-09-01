import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
    // data/ is the compose postgres volume: root-owned, so walking it fails
    // the whole run with EACCES.
    ignores: ['**/dist/**', '**/node_modules/**', '**/migrations/**', 'data/**'],
})
