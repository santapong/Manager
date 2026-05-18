---
plan-format: 1
project:
  key: DEP
  name: Dependency Demo
---

# Dependency Demo

### DEP-1 Foundation
status: done

### DEP-2 Middle layer
status: in_progress
depends_on: [DEP-1]

### DEP-3 Top layer
status: todo
depends_on: [DEP-1, DEP-2]
