# Material search API

`POST /api/material-search` finds shelf materials and the research records behind them. It is part of the existing Node server (`server/index.mjs`, logic in `server/material-search.mjs`) and uses the server's existing cached readers for the research and original-data collections. No new service, database or table.

**Status: keyword mode.** No AI provider is configured, so every response has `"mode": "keyword"`. The summariser hook, its checks and its fallback are in place and tested with stand-ins; choosing a provider is an open decision (see the end).

## Endpoint

- Local: `http://localhost:4335/api/material-search` (`npm run dev` in `dashboard/`).
- Production: same-origin `/api/material-search` once `dashboard/vercel.json` has this rewrite (Codex owns that file):

```json
{"source": "/api/material-search", "destination": "https://soraine-dashboard-334840303039.us-central1.run.app/api/material-search"}
```

Cloud Run must be redeployed from this branch before the rewrite works. Not deployed yet.

## Request

```json
{"query": "查找月球重力下的 Nomex 研究", "filters": {"gravity": "moon", "materialId": null}, "limit": 5}
```

| Field | Rule |
|---|---|
| `query` | Required string, 1 to 500 characters after trimming. |
| `filters.gravity` | `earth`, `moon`, `mars`, `iss` or `null`. Optional. |
| `filters.materialId` | One of the nine IDs below or `null`. Optional. |
| `limit` | Whole number 1 to 10, default 5. Maximum material groups. |

`Content-Type` must be `application/json`; the body may be at most 4096 bytes. A non-null filter replaces whatever the query says about that condition, and the response summary says so.

## Response

The shape is the one in the shared plan, unchanged: `query`, `mode`, `dataSource`, `summary`, `appliedFilters {gravity, materialId}`, `results[]`; each result has `materialId`, `title`, `summary`, `evidenceIds`, `totalEvidenceCount`, `evidence[]`, `originalRecords[]`, `sources[]`. Real examples from the saved snapshot are in `docs/material-search-samples/`:

- `single-material.json`: `梳子` (one material, matched through its shelf object)
- `broad.json`: Nomex at lunar gravity (two materials)
- `no-results.json`: Polycarbonate on Mars (HTTP 200, empty `results`)

Details worth knowing when connecting the interface:

- `evidence` holds at most 10 records per material; `totalEvidenceCount` is the full count. To get the rest, call again with `filters.materialId` and narrower conditions, or read `/api/research`. There is no paging yet.
- `value`, pressures and other numbers are the source bundle's decimal strings, passed through untouched. Missing values are `null`.
- `conditions.specimen` is the experiment's `conditions` text (the tested specimen, for example "5 mil PET"). `limitation` is the measurement's, or the experiment's when the measurement has none.
- `appliedFilters.gravity` is the explicit filter, or the single gravity read from the query. `appliedFilters.materialId` is only ever the explicit filter. The top-level `summary` lists every condition applied.
- Each result's `summary` gives shown/total counts and, where it applies, that the match came through a shelf object or a broad word, or that Earth-to-Moon model values are estimates.
- `originalRecords` reference rows of the original CSV files: `datasetId` and `recordId` are the IDs used by `/api/original-data`; `rowIndex` is that endpoint's `csvRecordNumber` (the header line is record 1, so data starts at 2); `locator` quotes the file's own material cell. At most 10 per material. Fetch full rows from `/api/original-data`.
- `dataSource` is `bigquery` only when both collections were read live; otherwise both come from the saved snapshots and it is `snapshot`.

## Matching rules

| ID | Research material | Also found by |
|---|---|---|
| `mylar-g` | Mylar G | Mylar, PET, polyester film, 聚酯薄膜; document sleeve, 文件套, 文件袋 |
| `ultem-1000` | Ultem 1000 | Ultem, PEI, polyetherimide, 聚醚酰亚胺; comb, 梳子 |
| `nomex-ht90` | Nomex HT90-40 | HT90, Nomex fabric, aramid fabric, Nomex 布, 芳纶织物; glove, 手套 |
| `sibal` | SIBAL | cotton/glass blend, 棉玻纤混纺; fabric sample, 实验布, 织物片 |
| `pmma` | PMMA | acrylic, 亚克力, 聚甲基丙烯酸甲酯; ruler, 直尺 |
| `polycarbonate` | Polycarbonate | PC, 聚碳酸酯; goggles, lens, 护目镜, 镜片 |
| `nomex-velcro` | Nomex Velcro | Velcro, hook and loop, 魔术贴; strap, 理线带, 扣带 |
| `p213` | P 213 | P213, P-213, 玻璃布胶带; tape, 胶带 |
| `beefy-t` | Beefy-T (flaming), Beefy-T (smolder) | cotton fabric, 棉布; T-shirt, 棉 T 恤 |

- Order: exact material or grade, then other names and shelf objects, then broad words; within a tier, materials with measured results come first. Inside a material, reported results come before fits, derived values and model values.
- Broad words return several candidates: Nomex/aramid (both Nomex materials), fabric/织物, plastic/塑料, transparent plastic/透明塑料, film/薄膜, cotton/棉.
- English terms match whole words (plural allowed), so `pc` matches and `spcs` does not. Chinese terms match anywhere; spaces beside Chinese characters are ignored.
- Gravity words: Earth/地球, Moon/lunar/月球, Mars/火星, microgravity/微重力. `iss` as a filter means the microgravity category. Naming the station in the query (ISS, space station, 空间站) also requires the record's platform to say so; no research record currently does, so that returns no results.
- `moon` also returns records labelled `Earth-to-Moon model`. They keep that label, sort last and are flagged in the result summary.
- Flaming/明火 and smolder/阴燃 are conditions on the record's own label. They never select cotton by themselves.
- "Oxygen limits" (ULOI, MOC, 氧极限) and "flame spread" (火焰传播) narrow the metrics.
- Conditions are never relaxed to produce results. With no material and no condition, plain English words are matched against record text.
- Original rows are attached only for `pmma` and `sibal`, where the CSV's material column names the material, and only when the search sets no gravity, platform, mode or metric condition (the rows have no such fields).

## Errors

All errors are `{"error": {"code", "message"}}`.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_QUERY`, `INVALID_FILTER`, `INVALID_LIMIT`, `INVALID_BODY` | Bad field or unreadable JSON |
| 405 | `METHOD_NOT_ALLOWED` | Not POST or OPTIONS |
| 413 | `BODY_TOO_LARGE` | Body over 4096 bytes |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Not `application/json` |
| 429 | `RATE_LIMITED` | Over the per-minute limit; `Retry-After: 60` |
| 503 | `SERVICE_UNAVAILABLE` | No usable live collection or snapshot |

No matches is HTTP 200 with `results: []` and a suggestion in `summary`.

## Try it

```bash
cd dashboard && npm run dev    # http://localhost:4335

curl -s -X POST http://localhost:4335/api/material-search -H 'Content-Type: application/json' \
  -d '{"query":"Find Nomex research"}'
curl -s -X POST http://localhost:4335/api/material-search -H 'Content-Type: application/json' \
  -d '{"query":"棉 T 恤有哪些明火和阴燃记录？"}'
curl -s -X POST http://localhost:4335/api/material-search -H 'Content-Type: application/json' \
  -d '{"query":"glove on Mars","filters":{"gravity":"moon","materialId":null},"limit":3}'
curl -s -X POST http://localhost:4335/api/material-search -H 'Content-Type: application/json' -d '{"query":""}'
```

## Configuration

Server-side environment variables only; none are secrets and none are required.

| Variable | Default | Purpose |
|---|---|---|
| `SEARCH_RATE_PER_MINUTE` | `30` | Searches per client address per minute |
| `SEARCH_ALLOWED_ORIGINS` | empty | Comma-separated origins allowed to call from another host. Empty means same-origin only. |
| `BQ_PROJECT`, `BQ_DATASET` | existing values | Unchanged; used by the existing readers |

Data: the research tables `sources`, `experiments`, `measurements` and the original-data table `public_experiment_rows`, read by the existing readers with the Cloud Run runtime identity and cached for five minutes. Locally, or when BigQuery cannot be read, the saved snapshots in `dist/data/` are used. Identical searches are answered from an in-memory cache (200 entries). Queries are not logged.

## Tests

`npm test` in `dashboard/`: 48 tests pass (31 existing, 17 new in `test/material-search.test.mjs` and `test/material-search-http.test.mjs`). Not tested: the live BigQuery path on Cloud Run, and any real AI provider.

## Decisions for the team

1. **AI provider.** `createMaterialSearch({summarise})` accepts an async function returning `{summary, materials?}`. Its text is rejected (falling back to keyword mode) if it times out (6 s), exceeds 600 characters, contains a link, names a material not in the results, or uses a number that is not in the returned records. Which provider and model to call, and who pays, is undecided. Vertex AI would reuse the Cloud Run identity with no key to store.
2. **Earth-to-Moon model records under `moon`.** Included and labelled. Polycarbonate, Nomex Velcro, P 213 and Beefy-T have only these records, so excluding them would hide those materials from every gravity filter.
3. **Original rows for other materials.** BASS rows say "Nomex blend", "Nomex III Natural" and "ultem sheet"; Saffire-II says "Cotton". None states the shelf material's grade, so they are not attached. Say if the team wants them shown as "related, grade not stated".
4. **Station searches.** BASS ran on the station, but its rows carry no platform field, so "ISS PMMA" returns nothing rather than attaching rows by assumption.
5. **More than 10 records.** A paging field would be an addition to the contract.
6. **Rust server.** `rust/soraine-server` does not have this route; per the plan it was left alone.
