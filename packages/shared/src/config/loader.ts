import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'

export interface LoadConfigOptions<T extends z.ZodTypeAny> {
    schema: T
    yamlPath: string
    /** Explicit mapping: env var name → dot-path in config object */
    envMap?: Record<string, string>
    /** Defaults to process.env — override for testing */
    env?: NodeJS.ProcessEnv
}

export function loadConfig<T extends z.ZodTypeAny>(opts: LoadConfigOptions<T>): z.infer<T> {
    const raw = readFileSync(opts.yamlPath, 'utf8')
    const data = (parseYaml(raw) ?? {}) as Record<string, unknown>

    const env = opts.env ?? process.env
    for (const [envKey, dotPath] of Object.entries(opts.envMap ?? {})) {
        const value = env[envKey]
        if (value !== undefined) setAtPath(data, dotPath, value)
    }

    return opts.schema.parse(data)
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.')
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i]!
        if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
        cur = cur[k] as Record<string, unknown>
    }
    cur[parts.at(-1)!] = value
}
