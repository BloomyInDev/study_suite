import { z } from 'zod'

/**
 * z.coerce.boolean() treats any non-empty string (including "false") as true.
 * This helper correctly maps "true"/"false" strings to booleans.
 */
export const zBool = z.union([z.boolean(), z.string().transform((v) => v.toLowerCase() === 'true')])

/** Accepts a number or its string representation, coerces to integer. */
export const zInt = z.coerce.number().int()
