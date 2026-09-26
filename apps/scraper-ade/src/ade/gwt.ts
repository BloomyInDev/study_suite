/**
 * Just enough GWT-RPC to talk to ADE's planning services.
 *
 * GWT-RPC has no schema on the wire: a request is a string table followed by
 * a value stream that indexes into it, and a response is the same thing
 * reversed. Everything here is shaped by that format rather than by us, and
 * the service signatures below come from ADE's compiled client. An ADE
 * upgrade that recompiles it changes them, and every call then answers
 * `//EX`, which is thrown rather than read as an empty planning.
 */

export const PERMUTATION = 'B6FB4BD1F96498A84974F1F52B318B82'

/** The strong name of each service interface, from the compiled client. */
export const SERVICES = {
    DirectPlanningServiceProxy: {
        iface: 'com.adesoft.gwt.directplan.client.rpc.DirectPlanningServiceProxy',
        policy: '067818807965393FC5DCF6AECC2CA8EC',
    },
    DirectPlanningPlanningServiceProxy: {
        iface: 'com.adesoft.gwt.directplan.client.rpc.DirectPlanningPlanningServiceProxy',
        policy: '8830FFA0A2CBAF25FFF8C1E3EDA74E53',
    },
    ConfigurationServiceProxy: {
        iface: 'com.adesoft.gwt.core.client.rpc.ConfigurationServiceProxy',
        policy: '0513C80A56E7DA3488A651BBD7D3690F',
    },
} as const

export type ServiceName = keyof typeof SERVICES

// ─── Requests ──────────────────────────────────────────────────────────────

/**
 * Builds a request body. Values are pushed in order; `str()` interns a string
 * into the table and returns the index to push, which is how GWT refers to a
 * class name and a string value alike.
 */
export class RpcWriter {
    private readonly table: string[] = []
    private readonly values: (string | number)[] = []

    constructor(moduleBase: string, service: ServiceName, method: string, paramTypes: string[]) {
        const { iface, policy } = SERVICES[service]
        this.push(this.str(moduleBase), this.str(policy), this.str(iface), this.str(method))
        this.push(paramTypes.length, ...paramTypes.map((t) => this.str(t)))
    }

    str(s: string): number {
        const i = this.table.indexOf(s)
        if (i !== -1) return i + 1
        this.table.push(s)
        return this.table.length
    }

    push(...v: (string | number)[]): this {
        this.values.push(...v)
        return this
    }

    /** A `java.util.ArrayList` of fresh `java.lang.Integer`s. */
    intList(xs: readonly number[]): this {
        // The list's class is interned before its elements', as GWT does.
        this.push(this.str('java.util.ArrayList/4159755760'), xs.length)
        const integer = this.str('java.lang.Integer/3438268394')
        for (const x of xs) this.push(integer, x)
        return this
    }

    toString(): string {
        return `7|0|${this.table.length}|${this.table.join('|')}|${this.values.join('|')}|`
    }
}

// ─── Responses ─────────────────────────────────────────────────────────────

/**
 * Splits `//OK[…]` into the value stream (in read order) and the string table.
 *
 * Three things that are not JSON, all from GWT emitting JavaScript: string
 * values use `\xHH` escapes, a string over 64 KB is split as `"…"+"…"` (the
 * calendar's is), and a large payload is chunked as `[…].concat([…],[…],…)`
 * (the whole-year timetable is).
 */
export function parseResponse(resp: string): { stream: number[]; strings: string[] } {
    if (!resp.startsWith('//OK')) {
        throw new Error(`ADE RPC failed: ${resp.slice(0, 200)}`)
    }
    // An odd run of backslashes before the `x` is an escape; an even one is a
    // literal backslash followed by an x. Likewise for the quote of `"+"`.
    const body = resp
        .slice(4)
        .replace(/(?<!\\)((?:\\\\)*)\\x([0-9a-fA-F]{2})/g, '$1\\u00$2')
        .replace(/(?<!\\)((?:\\\\)*)"\+"/g, '$1')
    const cut = body.indexOf('].concat(')
    const arr: unknown[] =
        cut === -1
            ? JSON.parse(body)
            : (JSON.parse(body.slice(0, cut + 1)) as unknown[]).concat(
                  ...(JSON.parse(
                      '[' + body.slice(cut + 9).replace(/\)\s*$/, '') + ']',
                  ) as unknown[][]),
              )
    arr.pop() // protocol version
    arr.pop() // flags
    const strings = arr.pop() as string[]
    // GWT writes the stream back to front.
    return { stream: (arr as number[]).reverse(), strings }
}

type Handler = (r: GwtReader) => unknown

/** Holds a boxed Integer/Boolean/String so a back-reference can resolve to its value. */
class Boxed {
    constructor(public v: unknown) {}
}

/**
 * Reads a response stream. Objects are decoded by class name through
 * `handlers`; a negative token is a back-reference to an object already read,
 * which is why every handler registers its result with `track` *before*
 * reading its fields.
 */
export class GwtReader {
    private i = 0
    private readonly seen: unknown[] = []

    constructor(
        private readonly stream: number[],
        private readonly strings: string[],
        private readonly handlers: Record<string, Handler>,
    ) {}

    get done(): boolean {
        return this.i === this.stream.length
    }

    int(): number {
        if (this.i >= this.stream.length) throw new Error('GWT stream ended early')
        return this.stream[this.i++]!
    }

    string(): string | null {
        const k = this.int()
        return k === 0 ? null : this.strings[k - 1]!
    }

    track<T>(value: T): T {
        this.seen.push(value)
        return value
    }

    object(): unknown {
        const k = this.int()
        if (k === 0) return null
        if (k < 0) {
            const hit = this.seen[-k - 1]
            return hit instanceof Boxed ? hit.v : hit
        }
        const type = this.strings[k - 1]!.split('/')[0]!
        const handler = this.handlers[type] ?? BASE_HANDLERS[type]
        if (!handler) throw new Error(`Unknown GWT type ${type}`)
        return handler(this)
    }
}

const list: Handler = (r) => {
    const out = r.track([] as unknown[])
    const n = r.int()
    for (let k = 0; k < n; k++) out.push(r.object())
    return out
}

const boxed =
    (read: (r: GwtReader) => unknown): Handler =>
    (r) => {
        const box = r.track(new Boxed(null))
        box.v = read(r)
        return box.v
    }

const BASE_HANDLERS: Record<string, Handler> = {
    'java.util.ArrayList': list,
    'java.util.HashSet': list,
    'java.lang.Integer': boxed((r) => r.int()),
    'java.lang.Boolean': boxed((r) => r.int() !== 0),
    'java.lang.String': boxed((r) => r.string()),
}

// ─── Transport ─────────────────────────────────────────────────────────────

export interface RpcTarget {
    moduleBase: string
    pageUrl: string
    cookie: string
}

export async function postRpc(
    target: RpcTarget,
    service: ServiceName,
    body: string,
): Promise<string> {
    // Each service has its own endpoint; the module base itself answers 500.
    const res = await fetch(`${target.moduleBase}${service}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/x-gwt-rpc; charset=UTF-8',
            'X-GWT-Permutation': PERMUTATION,
            'X-GWT-Module-Base': target.moduleBase,
            Referer: target.pageUrl,
            ...(target.cookie ? { Cookie: target.cookie } : {}),
        },
        body,
    })
    return res.text()
}
