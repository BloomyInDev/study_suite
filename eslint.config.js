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
        // An event's day, week and hour are Europe/Paris ones, and these all
        // answer in the process timezone or in UTC instead (see AGENTS.md,
        // Time). Not type-aware, so it also catches the rare `Date` that is
        // not an event's: say why on the line that disables it. `.vue` files
        // are not linted at all yet, so the views are not covered.
        files: ['**/*.ts'],
        ignores: ['packages/shared/src/time/**', '**/*.test.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        'CallExpression[callee.property.name=/^(get|set)(UTC)?(FullYear|Month|Date|Day|Hours|Minutes|Seconds)$/]',
                    message:
                        'Date getters and setters read the process timezone or UTC. Use @studysuite/shared/time.',
                },
                {
                    selector: "CallExpression[callee.property.name='getTimezoneOffset']",
                    message:
                        "The process timezone is not the planning's. Use @studysuite/shared/time.",
                },
                {
                    selector:
                        "CallExpression[callee.object.name='Date'][callee.property.name='UTC']",
                    message: 'Date.UTC makes a wall-clock label, not an instant. Use parisDate().',
                },
                {
                    selector: "NewExpression[callee.name='Date'][arguments.length>1]",
                    message:
                        'new Date(y, m, d, ...) reads its fields in the process timezone. Use parisDate().',
                },
            ],
        },
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
