# Phase 3 — Planning (Gantt, reports, custom fields, time tracking)

Adds the project-planning surface: Gantt chart with dependency-cycle detection, roadmap view, custom fields, reports (cycle time, throughput, velocity, SLA), time tracking.

## Folders pre-seeded

- `apps/web/app/[workspace]/roadmap/`
- `apps/web/app/[workspace]/reports/{cycle-time,throughput,velocity}/`
- `packages/charts/` — minimal Recharts wrappers (so chart vendor stays swappable)

## Notes

- Dependency cycle detection runs server-side; never trust the client to enforce a DAG.
- Reports use materialized views or scheduled aggregation (Inngest cron) — too expensive to compute on every page load.
