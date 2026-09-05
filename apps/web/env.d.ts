/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent
    export default component
}

interface ImportMetaEnv {
    readonly VITE_API_URL?: string
    readonly VITE_SITE_URL: string
    readonly VITE_GIT_COMMIT_HASH: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
