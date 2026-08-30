<script setup lang="ts">
import { groupLabel } from '../lib/group-label.js'
import { computed } from 'vue'
import type { Event } from '../lib/types.js'
import { formatTime } from '../lib/date.js'
import EventDetailsDialog from './EventDetailsDialog.vue'

const props = defineProps<{ event: { color?: string; name?: string; full?: Event } }>()

const eventFull = computed<Event>(() => props.event.full!)
</script>

<template>
    <EventDetailsDialog :event="eventFull">
        <template #activator="{ props: aProps }">
            <v-card
                v-bind="aProps"
                :color="props.event.color"
                variant="flat"
                class="fill-height event-card"
                link
            >
                <v-card-text class="pa-1">
                    <div class="text-caption font-weight-bold event-line">
                        {{ formatTime(eventFull.start) }} - {{ formatTime(eventFull.end) }}
                    </div>
                    <div class="text-body-2 event-line">{{ props.event.name }}</div>
                    <div class="text-caption event-line event-detail event-detail-1">
                        {{
                            eventFull.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(', ')
                        }}
                    </div>
                    <div class="text-caption event-line event-detail event-detail-2">
                        {{ eventFull.rooms.map((r) => r.name).join(', ') }}
                    </div>
                    <div class="text-caption event-line event-detail event-detail-3">
                        {{
                            eventFull.groups.map(groupLabel).join(', ') || 'Aucun groupe'
                        }}
                    </div>
                </v-card-text>
            </v-card>
        </template>
    </EventDetailsDialog>
</template>

<style scoped>
.event-card {
    overflow: hidden;
}

.event-line {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

/* A short event has room for the time and title but not the rest, and half a
 * clipped line reads as a rendering glitch. Drop each detail line until the
 * card is tall enough to show it whole; the details dialog has the full text.
 * Without container query support every line stays, as it did before. */
@supports (container-type: size) {
    .event-card {
        container-type: size;
    }

    .event-detail {
        display: none;
    }

    @container (min-height: 72px) {
        .event-detail-1 {
            display: block;
        }
    }

    @container (min-height: 92px) {
        .event-detail-2 {
            display: block;
        }
    }

    @container (min-height: 112px) {
        .event-detail-3 {
            display: block;
        }
    }
}
</style>
