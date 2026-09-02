# Data Governance Frameworks for Public-Sector Transport Data

Data governance is the set of policies, roles, and processes that
determine how an organization decides what data means, who may change
it, and how quality and accountability are maintained over time. For a
multi-institution public transport system — where several bodies each
hold a piece of the authoritative data — governance is what keeps a
consolidated dataset coherent instead of fragmenting into inconsistent
copies.

## Core roles (DAMA-DMBOK)

The **DAMA-DMBOK** (Data Management Body of Knowledge), the most widely
referenced data-management framework, defines role distinctions that
transfer directly to a transit-data context:

- **Data Owner** — the institution or unit with the authority and
  accountability for a given data domain (e.g., the entity that decides
  what counts as an official route or stop).
- **Data Steward** — the person or team responsible for the day-to-day
  quality, definitions, and change process for a dataset, acting on
  behalf of the owner.
- **Data Custodian** — the technical function that stores, secures, and
  makes the data available (often a systems/IT team), distinct from
  who decides its content.

Separating these roles prevents a common failure mode: a technical team
silently making content decisions (e.g., how to name a route) that
should belong to the operational authority.

## Governance processes

A working governance model typically specifies:

- **Update and validation workflow** — who may submit a change, who
  reviews it, and what automated checks (schema validation, referential
  integrity) gate a change before it reaches production.
- **Versioning and change communication** — how changes are dated,
  logged, and communicated to downstream consumers.
- **Escalation and dispute resolution** — what happens when two
  contributing institutions disagree about a data element (e.g.,
  conflicting route definitions from different operators).
- **Periodic review** — a recurring cadence (e.g., quarterly) to review
  data quality metrics and governance effectiveness itself, not just the
  data.

## Multi-institution coordination

Where several public institutions each own part of the source data (as
is typical in transport regulation, where a regulator, an operator
registry, and infrastructure managers each hold different pieces), an
effective governance model usually introduces a coordinating body or
committee with representation from each institution, plus a single
technical secretariat responsible for consolidation — so no single
institution's system silently becomes the de facto but undocumented
authority.

**Source**: DAMA International, *DAMA-DMBOK: Data Management Body of
Knowledge*, 2nd edition — summary of governance and stewardship
concepts (widely cited public reference framework).
