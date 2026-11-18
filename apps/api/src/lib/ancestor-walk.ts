/**
 * Every ancestor of `ids`, at any depth, `ids` themselves left out.
 *
 * `parentsOf` returns the direct parents of a batch of groups. It is a
 * parameter, and this file imports nothing, so the walk can be tested without
 * a database or a config.
 */
export async function walkAncestors(
    ids: readonly string[],
    parentsOf: (childIds: string[]) => Promise<string[]>,
): Promise<Set<string>> {
    const result = new Set<string>()
    let current = [...new Set(ids)]
    while (current.length > 0) {
        // Only follow parents not seen yet. Filtering after adding them to the
        // result would end the walk at the first level, and a cycle in the
        // hierarchy would never end it at all.
        const next = [...new Set(await parentsOf(current))].filter((p) => !result.has(p))
        next.forEach((p) => result.add(p))
        current = next
    }
    return result
}
