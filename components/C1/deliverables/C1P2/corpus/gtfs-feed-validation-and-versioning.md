# GTFS Feed Validation and Versioning Before Publication

Publishing a GTFS Schedule feed as an authoritative public data source
carries a responsibility beyond format compliance: downstream trip
planners, mobile apps, and analytics tools consume it directly, so
errors propagate immediately to riders. Two practices reduce that risk:
automated validation and disciplined versioning.

## Validation

The de facto standard tool is the **MobilityData `gtfs-validator`**, an
open-source, community-maintained validator that checks a feed against
the full GTFS Schedule reference: required files and fields, referential
integrity (e.g., every `stop_id` referenced in `stop_times.txt` exists in
`stops.txt`), geometry sanity (coordinates within expected bounds, shapes
that don't self-intersect implausibly), and time consistency (arrival
times non-decreasing along a trip). It reports issues at three
severities — errors, warnings, and notices — and produces a machine-
readable report suitable for CI pipelines. Running this validator before
every publish, and blocking publication on errors, is widely considered
baseline practice among transit agencies publishing open GTFS data.

## Versioning

GTFS itself does not mandate a versioning scheme, but common conventions
have emerged:

- **`feed_info.txt`** carries a `feed_version` string. Agencies commonly
  populate it with a date (`YYYY-MM-DD`) or a date plus sequence number,
  so consumers and support staff can identify exactly which snapshot is
  in use.
- **Stable publication URL** — the authoritative feed is served from one
  fixed URL that is overwritten atomically on each publish (rather than
  versioned into the path), so existing consumer integrations keep
  working; the `feed_version` field is what changes, not the URL.
- **Change logs** — many agencies maintain a public changelog describing
  what changed between feed versions (new routes, schedule changes,
  discontinued stops), which helps third-party developers debug
  unexpected behavior in their own applications after an update.
- **Archival** — retaining prior feed versions (even if not publicly
  served) supports historical analysis and rollback if a bad publish
  slips past validation.

## Registries

Publishing the feed URL to a public registry such as the **Mobility
Database** (the community-run successor to the original TransitFeeds/
OpenMobilityData catalogs) increases discoverability for app developers
and gives the publishing agency an independent uptime/freshness check.

**Source**: MobilityData `gtfs-validator` project documentation and
GTFS Schedule best-practices guidance, gtfs.org / mobilitydata.org
(public specifications and open-source tooling).
