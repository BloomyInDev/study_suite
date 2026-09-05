#!/bin/sh
# The og: tags and the canonical link need an absolute origin, and vite bakes it
# into the rendered HTML, the JS chunks, robots.txt and sitemap.xml at build
# time. Substituting it here instead keeps one image good for any origin.
#
# The build writes the sentinel __SITE_URL__; dist/ is kept pristine under
# /usr/share/nginx/template and copied to the served root on every start, so the
# substitution always runs against the placeholder and never against a previous
# boot's value — restarting with a new SITE_URL is enough to change it.
set -eu

SITE_URL="${SITE_URL:-http://localhost}"
# A trailing slash would double up: paths are appended as /planning.
SITE_URL="${SITE_URL%/}"

template=/usr/share/nginx/template
root=/usr/share/nginx/html

rm -rf "$root"
mkdir -p "$root"
cp -a "$template"/. "$root"/

# Only the text formats vite emits: the icons and the og image are binary and
# would be corrupted by a blind sed. busybox grep has no -Z, hence find.
# | delimits so the URL's own slashes need no escaping, and & is escaped as it
# means "the whole match" in a sed replacement.
escaped=$(printf '%s' "$SITE_URL" | sed 's/[&|]/\\&/g')
find "$root" -type f \( \
    -name '*.html' -o -name '*.js' -o -name '*.css' -o \
    -name '*.txt' -o -name '*.xml' -o -name '*.json' -o -name '*.webmanifest' \
\) -exec sed -i "s|__SITE_URL__|$escaped|g" {} +

echo "site origin set to $SITE_URL"
