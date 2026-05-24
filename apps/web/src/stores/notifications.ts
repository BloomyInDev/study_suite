import { defineStore } from 'pinia'

export interface Notification {
    id: number | string
    text: string
    color?: string
    timeout?: number
}

export const useNotificationsStore = defineStore('notifications', {
    state: () => ({ notifications: [] as Notification[] }),
    actions: {
        show(text: string, color = 'info', timeout = 3000) {
            this.notifications.push({
                id: Date.now() + Math.random().toString(),
                text,
                color,
                timeout,
            })
        },
        success(text: string, timeout = 3000) {
            this.show(text, 'success', timeout)
        },
        error(text: string, timeout = 3000) {
            this.show(text, 'error', timeout)
        },
        info(text: string, timeout = 3000) {
            this.show(text, 'info', timeout)
        },
        warning(text: string, timeout = 3000) {
            this.show(text, 'warning', timeout)
        },
    },
})
