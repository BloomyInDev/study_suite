<script setup lang="ts">
import { groupLabel } from '../lib/group-label.js'
import { computed, ref, watch } from 'vue'
import type { Group } from '../lib/types.js'
import { useGroupsStore } from '../stores/groups.js'

interface TreeNode {
    group: Group
    depth: number
    isLeaf: boolean
}

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const groups = useGroupsStore()
const search = ref('')
const selected = ref<string[]>([])
const collapsed = ref<Set<string>>(new Set())

const show = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

// Sync selection when dialog opens
watch(show, (open) => {
    if (open) selected.value = [...groups.selectedGroupIds]
})

/**
 * Hidden groups are not offered for selection, but they still hold the tree
 * together, so walk through them and hang their children off the nearest
 * visible ancestor instead of dropping the branch.
 */
function buildTree(list: Group[]): TreeNode[] {
    const nodes: TreeNode[] = []
    const visited = new Set<string>()
    const byId = new Map(list.map((g) => [g.id, g]))
    const visibleChildren = (group: Group): Group[] =>
        (group.children ?? []).flatMap((ref) => {
            const child = byId.get(ref.id)
            if (!child) return []
            return child.hidden ? visibleChildren(child) : [child]
        })

    function traverse(group: Group, depth: number) {
        if (visited.has(group.id)) return
        visited.add(group.id)
        const children = visibleChildren(group)
        nodes.push({ group, depth, isLeaf: children.length === 0 })
        if (!collapsed.value.has(group.id)) {
            for (const child of children) traverse(child, depth + 1)
        }
    }

    // A group is a root only when nothing visible sits above it, hidden
    // intermediates included — otherwise whether it renders nested or at the
    // top level would depend on the order groups arrive in.
    const hasVisibleAncestor = (g: Group, seen = new Set<string>()): boolean => {
        if (seen.has(g.id)) return false
        seen.add(g.id)
        return (g.parents ?? []).some((p) => {
            const parent = byId.get(p.id)
            if (!parent) return false
            return parent.hidden ? hasVisibleAncestor(parent, seen) : true
        })
    }

    for (const root of list.filter((g) => !g.hidden && !hasVisibleAncestor(g))) traverse(root, 0)
    for (const g of list) {
        if (!g.hidden && !visited.has(g.id)) {
            nodes.push({ group: g, depth: 0, isLeaf: !g.children?.length })
        }
    }
    return nodes
}

const treeNodes = computed(() => buildTree(groups.allGroups))

const displayNodes = computed(() => {
    const q = search.value.trim().toLowerCase()
    if (!q) return treeNodes.value
    return groups.visibleGroups
        .filter((g) => groupLabel(g).toLowerCase().includes(q) || g.internalName.toLowerCase().includes(q))
        .map((g) => ({ group: g, depth: 0, isLeaf: !g.children?.length }))
})

function toggle(id: string) {
    const idx = selected.value.indexOf(id)
    if (idx >= 0) selected.value.splice(idx, 1)
    else selected.value.push(id)
}

function toggleCollapse(id: string) {
    if (collapsed.value.has(id)) collapsed.value.delete(id)
    else collapsed.value.add(id)
    collapsed.value = new Set(collapsed.value)
}

const confirm = () => {
    groups.select(selected.value)
    show.value = false
}
</script>

<template>
    <v-dialog v-model="show" max-width="480" persistent>
        <v-card>
            <v-card-title class="text-h5 pt-4 px-4">Choisir mes groupes</v-card-title>
            <v-card-text class="pa-4">
                <v-text-field
                    v-model="search"
                    label="Rechercher"
                    prepend-inner-icon="mdi-magnify"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="mb-3"
                    clearable
                />
                <v-list lines="one" density="compact" max-height="360" style="overflow-y: auto">
                    <v-list-item
                        v-for="node in displayNodes"
                        :key="node.group.id"
                        :style="{ paddingLeft: `${node.depth * 20 + 8}px` }"
                        link
                        @click="toggle(node.group.id)"
                    >
                        <template #prepend>
                            <v-checkbox-btn
                                :model-value="selected.includes(node.group.id)"
                                @click.stop="toggle(node.group.id)"
                            />
                        </template>

                        <v-list-item-title :class="node.isLeaf ? '' : 'font-weight-medium'">
                            {{ groupLabel(node.group) }}
                        </v-list-item-title>

                        <template v-if="!node.isLeaf && !search" #append>
                            <v-btn
                                :icon="
                                    collapsed.has(node.group.id)
                                        ? 'mdi-chevron-right'
                                        : 'mdi-chevron-down'
                                "
                                variant="text"
                                size="x-small"
                                density="compact"
                                @click.stop="toggleCollapse(node.group.id)"
                            />
                        </template>
                    </v-list-item>
                </v-list>
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn
                    v-if="groups.selectedGroupIds.length > 0"
                    variant="text"
                    @click="show = false"
                >
                    Annuler
                </v-btn>
                <v-btn
                    color="primary"
                    variant="flat"
                    :disabled="selected.length === 0"
                    @click="confirm"
                >
                    Valider ({{ selected.length }})
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
