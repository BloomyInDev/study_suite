import { createServer } from 'node:http'

/**
 * `POST /scrape` asks for a run now instead of at the end of the interval.
 *
 * No authentication, so the port must never be published: it is meant for a
 * private network (the staging stack's seed sidecar, or `docker compose exec`).
 * A request only brings the next run forward; it cannot make runs overlap.
 */
export function startTriggerServer(port: number, onTrigger: () => void): void {
    createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/scrape') {
            onTrigger()
            res.writeHead(202, { 'Content-Type': 'text/plain' }).end('scrape queued\n')
            return
        }
        res.writeHead(404).end()
    }).listen(port, () => console.log(`[scraper] Trigger listening on :${port}, POST /scrape`))
}
