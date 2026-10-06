# FlexRadar

[![CI](https://github.com/MatthieuGillieron/hackvs/actions/workflows/ci.yml/badge.svg)](https://github.com/MatthieuGillieron/hackvs/actions/workflows/ci.yml)

**Anticipate staffing needs before the client calls.**
Built at **HackVS 2026** (Foire du Valais, Switzerland) for the **Flexsis** challenge:
*“Can we anticipate staffing needs before they become critical?”*

> When the client calls, the race has already started. FlexRadar calls first — with the right candidates.

https://github.com/user-attachments/assets/fa0bae63-4cce-4c55-89f8-70bd3e99669d

## What it does

Flexsis places temporary workers in construction, industry and logistics. Today, a consultant learns about a need
when the client calls — at the same time as every competing agency.

FlexRadar watches **31 public data sources** in the canton of Valais (building permits, public tenders, job ads,
commercial register, press releases…) and tells the consultant, every morning:

- **who to call** — a company, or a district × trade when the contractor is not yet known;
- **for what need, and when** — trades, team size as a range, start window;
- **which candidates to propose** — matched from the talent pool by trade, availability and distance;
- **how to open the call** — a prepared call sheet and a draft email.

Every alert cites its sources, and its level is explainable: signals are grouped into four families
(project, recruitment, company, history) and an alert becomes **AGIR** (act now) only when three families converge on a need
within eight weeks — otherwise **PRÉPARER** (two families) or **SURVEILLER** (one). No opaque score.

## How it works

```
             ┌──────────────── backend/ (Python) ────────────────┐   ┌──── frontend/ (React) ────┐
public  ───► sources/ ───► data/snapshots/ ───► engine/ ───────────────► public/data/ ───► src/
sources      collect       versioned JSON       signals, levels,        versioned JSON      UI
                                                LLM (cached)
```

| layer | stack | role |
|---|---|---|
| [`backend/sources`](backend/sources) | Python stdlib | 31 connectors (official gazette, SIMAP, job-room, Zefix, Federal Statistical Office, weather, press) normalised to one record format |
| [`backend/engine`](backend/engine) | Python stdlib + OpenAI | signals → alerts (level, families, need, talent pool, action); LLM extraction of permits and press, emails and call guides — all cached |
| [`frontend`](frontend) | React 19, TypeScript, Vite, Tailwind, shadcn/ui | home, alert feed and detail, call preparation, analytics, clients, candidates, sources |

The demo runs **fully offline**: snapshots, LLM outputs and generated data are versioned, so no network, API key
or Python is needed to run the interface.

> **Simulated data.** Flexsis internal data (clients, talent pool, missions, CRM) is not public: it is generated
> with a fixed seed and always labelled as simulated in the UI. Everything else comes from real public sources.

## Getting started

Requirements: Node.js 20+. Python ≥ 3.9 only to rebuild the data (no dependencies).

```bash
make dev           # or: cd frontend && npm ci && npm run dev  ->  http://localhost:5173
```

| command | |
|---|---|
| `make build` | regenerate the front-end data from the snapshots |
| `make data` | refresh the snapshots from the public sources (network) |
| `make test` | engine rules and snapshot format tests |
| `make check` | lint (ruff, tsc, oxlint) + tests |

LLM steps read their cache; to extract new records, copy `backend/.env.example` to `backend/.env` and add an OpenAI key.

## Documentation (in French)

- [Architecture](docs/architecture.md) — pipeline, layout, commands, conventions
- [Engine](docs/moteur.md) — scoring rules, LLM layer, findings on real data
- [Data sources](docs/sources.md) — catalogue, record format, known pitfalls
- [Interface](docs/interface.md) — pages, components, design decisions
- [Simulated data](docs/donnees-simulees.md) — what is simulated and how to plug in real data
