/**
 * How many course titles one browser may hide. The api rejects more with a
 * 400, so the web app refuses the 101st rather than send it.
 */
export const MAX_HIDDEN_COURSES = 100
