import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { config } from '../config.js'
import type { IutClaims } from './oidc-claims.js'

export * from './oidc-claims.js'

/**
 * The department's LDAP↔OIDC bridge.
 *
 * Its TLS chain does not validate on its own: the server serves the wrong
 * intermediate for its leaf, so `fetch` fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE
 * under both Node and Bun. The intermediate the leaf's AIA extension points at
 * (`http://crt.harica.gr/HARICA-GEANT-TLS-R1.cer`) does chain to a root the
 * system already trusts, so the deployment mounts it and sets
 * `NODE_EXTRA_CA_CERTS` — see the api Dockerfile. Drop that once the department
 * fixes the chain; nothing here has to change.
 */

export type Discovery = {
    issuer: string
    authorization_endpoint: string
    token_endpoint: string
    userinfo_endpoint?: string
    jwks_uri: string
    scopes_supported?: string[]
    code_challenge_methods_supported?: string[]
}

export class OidcError extends Error {}

let cached: { at: number; discovery: Discovery } | null = null
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

const DISCOVERY_TTL_MS = 60 * 60 * 1000

export function iutConfig() {
    return config.iut
}

export async function getDiscovery(): Promise<Discovery> {
    const iut = config.iut
    if (!iut) throw new OidcError('IUT OIDC is not configured')
    if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.discovery

    const url = `${iut.issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`
    const res = await fetch(url)
    if (!res.ok) throw new OidcError(`Discovery failed: ${res.status}`)
    const discovery = (await res.json()) as Discovery
    for (const field of [
        'issuer',
        'authorization_endpoint',
        'token_endpoint',
        'jwks_uri',
    ] as const) {
        if (!discovery[field]) throw new OidcError(`Discovery document has no ${field}`)
    }

    // A rotated jwks_uri has to take the key set with it.
    if (!cached || cached.discovery.jwks_uri !== discovery.jwks_uri) {
        jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
    }
    cached = { at: Date.now(), discovery }
    return discovery
}

/** PKCE S256, plus the `state`/`nonce` pair the callback checks. */
export function createPkce() {
    const codeVerifier = randomBytes(32).toString('base64url')
    return {
        codeVerifier,
        codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url'),
        state: randomBytes(16).toString('base64url'),
        nonce: randomBytes(16).toString('base64url'),
    }
}

export async function buildAuthorizationUrl(params: {
    codeChallenge: string
    state: string
    nonce: string
}): Promise<string> {
    const iut = config.iut
    if (!iut) throw new OidcError('IUT OIDC is not configured')
    const discovery = await getDiscovery()

    const query = new URLSearchParams({
        response_type: 'code',
        client_id: iut.clientId,
        redirect_uri: iut.redirectUri,
        scope: 'openid profile email groups',
        state: params.state,
        nonce: params.nonce,
        code_challenge: params.codeChallenge,
        code_challenge_method: 'S256',
    })
    return `${discovery.authorization_endpoint}?${query}`
}

/**
 * Exchange the code and verify the ID token. The access token is deliberately
 * dropped: it lives 900 s with no refresh token, and userinfo carries nothing
 * the ID token does not.
 */
export async function exchangeCode(code: string, codeVerifier: string, nonce: string) {
    const iut = config.iut
    if (!iut) throw new OidcError('IUT OIDC is not configured')
    const discovery = await getDiscovery()

    const res = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: iut.redirectUri,
            client_id: iut.clientId,
            client_secret: iut.clientSecret,
            code_verifier: codeVerifier,
        }),
    })
    if (!res.ok) throw new OidcError(`Token exchange failed: ${res.status}`)

    const body = (await res.json()) as { id_token?: string }
    if (!body.id_token) throw new OidcError('Token response carries no id_token')
    if (!jwks) throw new OidcError('JWKS not initialised')

    const { payload } = await jwtVerify(body.id_token, jwks, {
        issuer: discovery.issuer,
        audience: iut.clientId,
        algorithms: ['RS256'],
        clockTolerance: 120,
    })
    if (payload.nonce !== nonce) throw new OidcError('Nonce mismatch')
    return payload as IutClaims
}
