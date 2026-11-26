import { readFileSync } from 'node:fs'
import { z } from 'zod'

/**
 * The bridge from ADE resource ids to the prose-etudiant group tree, built by
 * `build-resource-map.mjs` (the proseconsult toolkit): `[{ id, path, name }]`,
 * with `path` like `Iutm > Iutm > GEII > BUT GEII FA > S5 FA > …`.
 *
 * ADE itself names no resource: login hands out ids, and the timetable prints
 * the groups as text. The map is what says which department an id belongs to.
 */
const MapSchema = z.array(
    z.object({
        id: z.union([z.string(), z.number()]).transform(Number),
        path: z.string().min(1),
        name: z.string(),
    }),
)

export interface MappedResource {
    id: number
    department: string
}

/**
 * A department name as it can go into group names for good: accents folded,
 * and the `?` the prose-etudiant app prints for `è` and `é` read as an `e`.
 * The same department must come out the same whether a map spells it
 * `Génie bio` or `G?nie bio`, or every one of its groups gets renamed.
 */
export const departmentKey = (name: string): string =>
    name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\?/g, 'e')
        .trim()

/**
 * The department is the first segment of the path under the root. The tree
 * repeats its root (`Iutm > Iutm > …`), so every leading copy is skipped.
 */
export function departmentOf(path: string): string {
    const parts = path.split(' > ').map((p) => p.trim())
    let k = 0
    while (k + 1 < parts.length && parts[k + 1] === parts[0]) k++
    return departmentKey(parts[k + 1] ?? parts[k]!)
}

export function parseResourceMap(json: unknown): MappedResource[] {
    return MapSchema.parse(json).map((r) => ({ id: r.id, department: departmentOf(r.path) }))
}

export function loadResourceMap(path: string): MappedResource[] {
    return parseResourceMap(JSON.parse(readFileSync(path, 'utf8')))
}

/** One `getTimetable` selection: at most `max` resources, all of one department. */
export interface Batch {
    department: string | null
    resources: number[]
}

/**
 * Splits the resources to fetch into per-department batches of at most `max`
 * (ADE answers `#MsgSelectionSize` past 60). Batching by department is what
 * tells an event's groups apart: the planning prints `S1` for an Informatique
 * TD group and for a GEII one alike, and only the batch says which it was.
 *
 * The session's own resources (the `data=` blob's) are always fetched, under
 * the department the map gives them, or `null` when the map does not know them.
 */
export function planBatches(
    own: readonly number[],
    map: readonly MappedResource[],
    max: number,
): Batch[] {
    const departmentById = new Map(map.map((r) => [r.id, r.department]))
    const byDepartment = new Map<string | null, number[]>()
    const add = (id: number, department: string | null) => {
        const list = byDepartment.get(department) ?? []
        if (!list.includes(id)) list.push(id)
        byDepartment.set(department, list)
    }
    for (const id of own) add(id, departmentById.get(id) ?? null)
    for (const r of map) add(r.id, r.department)

    const batches: Batch[] = []
    for (const [department, ids] of byDepartment) {
        for (let k = 0; k < ids.length; k += max) {
            batches.push({ department, resources: ids.slice(k, k + max) })
        }
    }
    return batches
}

/**
 * The department the deployment was set up for: the one most of the session's
 * own resources belong to. Its groups keep the bare names they always had.
 */
export function homeDepartment(
    own: readonly number[],
    map: readonly MappedResource[],
): string | null {
    const departmentById = new Map(map.map((r) => [r.id, r.department]))
    const counts = new Map<string | null, number>()
    for (const id of own) {
        const d = departmentById.get(id) ?? null
        counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    let best: string | null = null
    let bestCount = 0
    for (const [d, n] of counts) {
        if (n > bestCount) [best, bestCount] = [d, n]
    }
    return best
}
