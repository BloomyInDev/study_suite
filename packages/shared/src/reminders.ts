/**
 * How long before a course a reminder can be sent, in minutes. Shared so the
 * browser's push settings and the Discord bot's panel offer the same choices.
 */
export const REMINDER_LEAD_CHOICES = [5, 10, 15, 30, 60] as const
export type ReminderLead = (typeof REMINDER_LEAD_CHOICES)[number]

export const DEFAULT_REMINDER_LEAD: ReminderLead = 15

export const isReminderLead = (n: number): n is ReminderLead =>
    (REMINDER_LEAD_CHOICES as readonly number[]).includes(n)
