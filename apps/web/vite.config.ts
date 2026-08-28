import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { execSync } from 'node:child_process'

// The docker build has no .git, so CI passes the commit as a build arg; fall
// back to asking git directly when building from a checkout.
const commitHash =
    process.env.VITE_GIT_COMMIT_HASH ||
    (() => {
        try {
            return execSync('git rev-parse --short HEAD').toString().trim()
        } catch {
            return 'unknown'
        }
    })()

export default defineConfig({
    plugins: [vue(), vuetify({ autoImport: true })],
    define: {
        'import.meta.env.VITE_GIT_COMMIT_HASH': JSON.stringify(commitHash),
    },
})
