---
plan-format: 1
project:
  key: PROJ
  name: Project Name
  target_date: 2026-09-30
  tags: [scrum, q3]
---

# Project Name

## Milestone: Beta launch
target_date: 2026-07-15

### PROJ-1 Set up auth
status: todo
priority: high
tags: [backend]

Implement OAuth + session management.

- [ ] Wire Google OAuth
- [x] Add session middleware

### PROJ-2 Build dashboard
status: in_progress
priority: medium
tags: [frontend]
depends_on: [PROJ-1]

Top-level dashboard with project cards.

## Milestone: GA
target_date: 2026-09-30

### PROJ-3 Polish onboarding
status: backlog
priority: low
