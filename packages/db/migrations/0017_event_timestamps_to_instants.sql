-- Event timestamps were Paris wall-clock labelled UTC: a course at 08:00 in
-- Paris sat in these timestamptz columns as 08:00:00Z. They become the instants
-- they always claimed to be (06:00:00Z in summer, 07:00:00Z in winter).
--
-- `x AT TIME ZONE 'UTC'` strips the false zone and leaves the bare wall-clock
-- reading; `AT TIME ZONE 'Europe/Paris'` then resolves it with the offset in
-- force on that very day, so rows either side of a clock change each move by
-- the right amount.
--
-- NOT IDEMPOTENT, and not reversible by redeploying older code: every image
-- built before this migration reads and writes labels. Stop the api and both
-- scrapers before it runs. A scraper of the old build reconciling against
-- migrated rows sees every course as moved by an hour or two.
UPDATE "events" SET
    "start_date" = ("start_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris',
    "end_date" = ("end_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris';--> statement-breakpoint
UPDATE "event_changes" SET
    "start_date" = ("start_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris',
    "end_date" = ("end_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris';--> statement-breakpoint
-- A `moved` change keeps the slot the course went to as two ISO strings inside
-- `diff`, written with `toISOString()`. Same shift, same spelling.
UPDATE "event_changes" SET "diff" = "diff" || jsonb_build_object(
    'newStart', to_char(
        ((("diff"->>'newStart')::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'newEnd', to_char(
        ((("diff"->>'newEnd')::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
WHERE "change_type" = 'moved'
    AND "diff" ? 'newStart'
    AND "diff" ? 'newEnd';
