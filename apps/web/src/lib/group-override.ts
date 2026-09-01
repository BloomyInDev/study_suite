import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from '../stores/groups.js'
import { groupLabel } from './group-label.js'
import type { Group } from './types.js'

/** `?group=` accepts a comma-separated list, by display name or scraped name. */
function requestedNames(raw: unknown): string[] {
    const value = Array.isArray(raw) ? raw[raw.length - 1] : raw
    if (typeof value !== 'string') return []
    return value
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
}

const normalize = (s: string) => s.trim().toLowerCase()

/**
 * Lets a link point at someone else's planning (`/planning?group=S1`) without
 * touching the account's class or the visitor's stored picker: the override
 * lives in the url only, so leaving the page drops it.
 */
export function useGroupOverride() {
    const route = useRoute()
    const router = useRouter()
    const groups = useGroupsStore()

    const names = computed(() => requestedNames(route.query.group))

    const matched = computed<Group[]>(() =>
        names.value
            .map((name) =>
                groups.allGroups.find(
                    (g) =>
                        normalize(g.internalName) === normalize(name) ||
                        (g.displayName ? normalize(g.displayName) === normalize(name) : false),
                ),
            )
            .filter((g): g is Group => g !== undefined),
    )

    const unknownNames = computed(() => {
        // Before the group list lands nothing resolves, and reporting every name
        // as unknown would flash a wrong banner on load.
        if (groups.allGroups.length === 0) return []
        const found = new Set(matched.value.flatMap((g) => [g.internalName, g.displayName ?? '']))
        return names.value.filter(
            (name) => ![...found].some((f) => normalize(f) === normalize(name)),
        )
    })

    const isActive = computed(() => matched.value.length > 0)
    const labels = computed(() => matched.value.map(groupLabel))

    /** The ids the calendar should query — the override wins when it resolves. */
    const groupIds = computed(() =>
        isActive.value
            ? groups.withAncestors(matched.value.map((g) => g.id))
            : groups.effectiveGroupIds,
    )

    /**
     * What to put in the url for a group: its display name when that is
     * unambiguous, so shared links read `?group=S1` rather than `?group=BUT1-A`.
     */
    const urlName = (group: Group): string => {
        const display = group.displayName?.trim()
        if (!display) return group.internalName
        const clashes = groups.allGroups.filter(
            (g) => g.id !== group.id && normalize(groupLabel(g)) === normalize(display),
        )
        return clashes.length > 0 ? group.internalName : display
    }

    // push, not replace: the picker is a navigation, and the back button
    // taking you to the planning you came from is what one expects.
    const clear = () => {
        const query = { ...route.query }
        delete query.group
        void router.push({ path: route.path, query })
    }

    /** Selecting nothing — or one's own group — hands the page back untouched. */
    const set = (groupIds: string[]) => {
        const picked = groupIds
            .map((id) => groups.allGroups.find((g) => g.id === id))
            .filter((g): g is Group => g !== undefined)
        const own = groups.activeGroupIds
        const isOwn =
            picked.length === own.length &&
            picked.every((g) => own.includes(g.id)) &&
            own.length > 0
        if (picked.length === 0 || isOwn) return clear()
        void router.push({
            path: route.path,
            query: { ...route.query, group: picked.map(urlName).join(',') },
        })
    }

    /**
     * What the picker shows as selected. Empty means "mine": showing one's own
     * class as a chip invites removing it, and removing it can only put it back.
     */
    const pickedIds = computed(() => matched.value.map((g) => g.id))

    return { groupIds, isActive, labels, unknownNames, pickedIds, clear, set }
}
