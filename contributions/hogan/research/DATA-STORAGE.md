# Data storage recommendation

Keep the current shared JSON for the hackathon. The runtime pack is 346,838 bytes, about 339 KiB, with 89 evidence records, 22 selectable cases, 52 sources, 15 objects and 5 material groups. It is small enough to load locally, and the existing adapter already answers the scene's object and comparison queries.

The app uses a curated set of research facts. This count does not describe the size of NASA's complete raw data archive, images or videos. The handoff has one runtime JSON plus a separate provenance archive that is not loaded by the app.

## Why this fits our data

Each result needs its material and geometry, gravity, oxygen, absolute pressure, airflow where reported, measurement, unit, source location and scientific qualification. These are linked records with different optional fields. The JSON preserves that structure and uses stable source, evidence and case IDs. Both scene teams can use it without running a database server.

CSV remains useful for importing or exporting a specific table. It does not decide whether the application needs SQL or NoSQL. Database selection should follow the queries, relationships, edit patterns and deployment needs, as well as data volume.

## When to reconsider

- If the team needs SQL joins or local analysis across many more experimental tables, use SQLite behind the same adapter contract. SQLite supports CSV import and analysis in a single database file. [SQLite's appropriate-use guidance](https://www.sqlite.org/whentouse.html)
- If the product later needs simultaneous online editing, user accounts and central permissions, evaluate a server database against those requirements. The current static demonstration does not need that backend.
- Hadoop handles distributed processing across clusters. The present 339 KiB curated dataset does not justify it. [Apache Hadoop overview](https://hadoop.apache.org/)

No storage migration is included in this contribution. The next useful data work is selecting additional exact experiments and preserving their conditions and citations, rather than importing every raw archive file.
