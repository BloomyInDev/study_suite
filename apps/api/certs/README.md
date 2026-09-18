# certs/

`harica-geant-tls-r1.pem` is the intermediate `GEANT TLS RSA 1`, issued by
`HARICA TLS RSA Root CA 2021`, which every system store already carries.

The department's LDAP/OIDC bridge serves the wrong intermediate for its leaf
(`GEANT OV RSA CA 4`), so its chain does not validate. `curl`, Node and Bun all
fail with `unable to get local issuer certificate`. This file is the
intermediate the leaf's own AIA extension points at,
`http://crt.harica.gr/HARICA-GEANT-TLS-R1.cer`, so trusting it completes the
chain and weakens verification nowhere. `NODE_TLS_REJECT_UNAUTHORIZED=0` would
disable verification for Discord and Postgres too.

    sha256 5B:67:8D:C4:40:95:A5:28:95:B6:3B:31:F2:72:27:F4:B3:6C:3E:34:74:91:BF:2B:FA:69:18:37:A5:FB:8C:79

The Dockerfile points `NODE_EXTRA_CA_CERTS` at it. Once the department fixes the
chain it serves, delete the file, the `ENV` line and this note. No code depends
on any of them.

For local development, run the api with:

    NODE_EXTRA_CA_CERTS=apps/api/certs/harica-geant-tls-r1.pem pnpm -F @studysuite/api dev
