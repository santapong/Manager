-- Multi-tenant Row-Level Security.
--
-- All tables with a workspace_id column are isolated by the
-- `app.workspace_id` GUC. Callers must set it inside a transaction
-- via the `withWorkspace()` helper before reading or writing.

create or replace function current_workspace_id() returns uuid as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid;
$$ language sql stable;

alter table workspaces      enable row level security;
alter table memberships     enable row level security;
alter table projects        enable row level security;
alter table lists           enable row level security;
alter table tasks           enable row level security;

-- workspaces: only the workspace whose id matches the GUC
create policy workspaces_isolation on workspaces
  using (id = current_workspace_id());

-- memberships: same workspace
create policy memberships_isolation on memberships
  using (workspace_id = current_workspace_id());

-- projects / lists / tasks: same workspace
create policy projects_isolation on projects
  using (workspace_id = current_workspace_id());

create policy lists_isolation on lists
  using (workspace_id = current_workspace_id());

create policy tasks_isolation on tasks
  using (workspace_id = current_workspace_id());

-- WITH CHECK clauses for writes use the same predicate so inserts/updates
-- cannot smuggle rows into another workspace.
create policy workspaces_write   on workspaces  for all to public with check (id = current_workspace_id());
create policy memberships_write  on memberships for all to public with check (workspace_id = current_workspace_id());
create policy projects_write     on projects    for all to public with check (workspace_id = current_workspace_id());
create policy lists_write        on lists       for all to public with check (workspace_id = current_workspace_id());
create policy tasks_write        on tasks       for all to public with check (workspace_id = current_workspace_id());
