# Open Data Licensing and the FAIR Principles for Public Transit Data

Publishing an official transit dataset for public consumption is not
just a technical act (making a file downloadable) — it is also a
legal and governance act. Two frameworks are widely used to reason
about what "open" and "well-managed" mean in this context: open-data
licensing and the FAIR principles.

## Open-data licensing

For a dataset to be usable by third-party developers with legal
confidence, it needs an explicit, permissive license attached, not just
public availability. Common choices for public-sector open data include:

- **CC0 / Public Domain** — no rights reserved; maximal reuse freedom,
  common for government-produced factual data.
- **CC-BY 4.0** — reuse permitted with attribution to the source agency.
- **Open Data Commons Open Database License (ODbL)** — used when a
  dataset is a compiled "database" and the publisher wants derivative
  databases to remain open (a share-alike style condition).

Absent an explicit license, third parties technically cannot assume
reuse rights, even if the data is visible on a public URL — an
often-overlooked gap in "open data" initiatives. The **International
Open Data Charter** (a set of principles adopted by many national and
subnational governments) recommends that public-sector data be "open by
default," with a clear license and machine-readable format, as a
condition of genuine openness rather than mere visibility.

## FAIR principles

Originally formulated for scientific data (Wilkinson et al., 2016,
*Scientific Data*), the FAIR principles generalize well to public
open-data programs:

- **Findable** — the dataset has a persistent, documented location (a
  stable URL, ideally listed in a public registry) and descriptive
  metadata (what it is, when it was last updated).
- **Accessible** — it can be retrieved via a standard, open protocol
  (plain HTTP) without unnecessary authentication barriers for public
  data.
- **Interoperable** — it uses a broadly adopted, documented format —
  for transit schedules, that is GTFS Schedule — rather than a bespoke
  structure, so tools built for the standard work without adaptation.
- **Reusable** — it carries clear licensing terms, provenance
  (publishing agency, version, update cadence), and enough documentation
  that a new consumer can understand it without out-of-band support.

Applying FAIR alongside an explicit open license turns a published ZIP
file into a genuinely reusable public asset rather than a one-off
download.

**Source**: FAIR Guiding Principles (Wilkinson et al., 2016);
International Open Data Charter, principles summary (public, CC-BY 4.0).
