import { postRpc, type RpcTarget } from './gwt.js'

/**
 * Signing in to a Prose Consult `/direct/?data=…` planning.
 *
 * The page is an Adesoft ADE 6.12 GWT client. The `data` blob in the URL is the
 * credential (it encodes a set of resources, the groups, server-side), but it is
 * *not* itself a session: every later call is keyed on the connection id sent
 * here, alongside the `JSESSIONID` cookie.
 *
 * Everything here is shaped by GWT-RPC's wire format rather than by us, so it
 * is deliberately literal. Ported from the reference implementation in
 * `proseconsult/ade-extract.mjs`.
 */

/** GWT's base64 alphabet. Note `$` and `_`, which are not RFC 4648. */
const GWT_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_'

/**
 * A Java `long` the way GWT serialises it: base64, **little-endian**, six bits
 * at a time. Used for the client connection id, which is simply `Date.now()`.
 */
function longToB64LE(value: bigint): string {
    if (value === 0n) return 'A'
    let out = ''
    let v = value
    while (v > 0n) {
        out += GWT_B64[Number(v & 63n)]
        v >>= 6n
    }
    return out
}

/**
 * The `login` request body: a string table, then the value stream that indexes
 * into it. The magic constants are the GWT type signatures of the request
 * classes; they come from the compiled client and must match it exactly.
 */
function buildLoginBody(moduleBase: string, dataParam: string, connectionId: string): string {
    const strings = [
        moduleBase,
        '067818807965393FC5DCF6AECC2CA8EC',
        'com.adesoft.gwt.directplan.client.rpc.DirectPlanningServiceProxy',
        'method1login',
        'J',
        'com.adesoft.gwt.core.client.rpc.data.LoginRequest/3705388826',
        'Z',
        'com.adesoft.gwt.directplan.client.rpc.data.DirectLoginRequest/635437471',
        dataParam,
        '',
    ]
    const values = [
        '1',
        '2',
        '3',
        '4',
        '3',
        '5',
        '6',
        '7',
        connectionId,
        '8',
        '0',
        '9',
        '0',
        '0',
        '0',
        '10',
        '10',
        '-1',
        '0',
        '0',
        '0',
    ]
    return `7|0|${strings.length}|${strings.join('|')}|${values.join('|')}|`
}

export interface AdeSession extends RpcTarget {
    /** The client connection id, the first argument of every later call. */
    connectionId: string
    /** The ADE session handle, `<hex32>w<n>`. */
    identifier: string
    /** Resource ids the `data` blob maps to: the planning's groups. */
    resources: number[]
    /** Which display configuration renders this planning, by name. */
    displayConfName: string
    /** Weekdays the planning shows, `0` being Monday. */
    days: number[]
}

/**
 * Exchanges the `data` blob for a usable session.
 *
 * The `data` blob cannot be reused as the `identifier`: that has to come from
 * this response.
 */
export async function login(origin: string, dataParam: string): Promise<AdeSession> {
    const moduleBase = `${origin}/direct/gwtdirectplanning/`
    const pageUrl = `${origin}/direct/?data=${dataParam}`

    const page = await fetch(pageUrl)
    const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

    const connectionId = longToB64LE(BigInt(Date.now()))
    const target: RpcTarget = { moduleBase, pageUrl, cookie }
    const text = await postRpc(
        target,
        'DirectPlanningServiceProxy',
        buildLoginBody(moduleBase, dataParam, connectionId),
    )
    if (!text.startsWith('//OK')) {
        throw new Error(`ADE login failed: ${text.slice(0, 200)}`)
    }

    // The response is a HashMap of settings. Its keys and values sit next to
    // each other in the string table, which is simpler to read than the map.
    const identifier = /"([0-9a-f]{32}w\d+)"/.exec(text)?.[1]
    const resources = /"resources","([0-9,]+)"/.exec(text)?.[1]
    const days = /"days","([0-9,]+)"/.exec(text)?.[1]
    // A String[] value: its two class names come between key and value.
    const displayConfName = /"displayConfName","[^"]+","[^"]+","([^"]+)"/.exec(text)?.[1]
    if (!identifier || !resources || !days || !displayConfName) {
        throw new Error('ADE login returned no identifier/resources/days/displayConfName')
    }

    return {
        ...target,
        connectionId,
        identifier,
        resources: resources.split(',').map(Number),
        displayConfName,
        days: days.split(',').map(Number),
    }
}
