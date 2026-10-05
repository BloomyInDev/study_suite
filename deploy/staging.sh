#!/bin/sh
# Brings the preview stack up to the `:staging` images CI just pushed.
#
# Lives on the host, next to the stack's compose.yaml, and is the *forced
# command* of the deploy key in root's authorized_keys:
#
#   command="/root/stacks/study_staging/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA... study_suite staging deploy
#
# So the key CI holds can run this and nothing else: whatever the client asks
# for is ignored, and the script takes no input. Keep it that way. Anything it
# read from the connection (a compose file, an image tag) would hand root on
# the host, which production shares, to whoever holds the key. That is also why
# compose.yaml is not synced from the repo here: copy compose.staging.yml over
# by hand when it changes.
set -eu

cd "$(dirname "$0")"

# Two pushes in a row must not run two `up` at once.
exec 9>/tmp/study_staging-deploy.lock
flock -w 300 9

docker compose -p study_staging pull --quiet
docker compose -p study_staging up -d --remove-orphans --wait --wait-timeout 180

# Dangling layers only: each deploy orphans the previous `:staging` images, and
# the host's disk is small. Tagged images, production's included, are kept.
docker image prune -f >/dev/null

echo "Running:"
for c in $(docker compose -p study_staging ps -q); do
    docker inspect --format \
        '  {{index .Config.Labels "com.docker.compose.service"}}  {{with index .Config.Labels "org.opencontainers.image.revision"}}{{.}}{{else}}-{{end}}' \
        "$c"
done

# Through nginx, so it covers the web container and its proxy to the api too.
curl -fsS -m 10 -o /dev/null http://localhost:3000/api/health
echo "Healthy."
