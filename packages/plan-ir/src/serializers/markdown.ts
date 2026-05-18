import type { Milestone, PlanIR, Subtask, Task } from "../ir.js";

/**
 * Serialize a PlanIR back to the canonical Markdown convention.
 * Round-trips with `parseMarkdown` for any IR that the parser produced.
 */
export function serializeMarkdown(ir: PlanIR): string {
  const lines: string[] = [];

  // Frontmatter — minimal YAML emitter sufficient for the IR shape.
  // Note: we hand-roll instead of pulling in `js-yaml` because the IR
  // never contains arbitrarily nested user data.
  lines.push("---");
  lines.push(`plan-format: ${ir.planFormat}`);
  lines.push("project:");
  lines.push(`  key: ${yamlScalar(ir.project.key)}`);
  lines.push(`  name: ${yamlScalar(ir.project.name)}`);
  if (ir.project.description !== undefined) {
    lines.push(`  description: ${yamlScalar(ir.project.description)}`);
  }
  if (ir.project.targetDate) {
    lines.push(`  target_date: ${ir.project.targetDate}`);
  }
  if (ir.project.startDate) {
    lines.push(`  start_date: ${ir.project.startDate}`);
  }
  if (ir.project.tags && ir.project.tags.length > 0) {
    lines.push(`  tags: ${yamlInlineArray(ir.project.tags)}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${ir.project.name}`);
  lines.push("");

  const milestones = ir.milestones ?? [];
  // Bucket tasks by milestone name so we can emit them under the right
  // heading; tasks with no milestone are emitted at the project level
  // (which the parser treats as legal — flat plans are supported).
  const tasksByMilestone = new Map<string, Task[]>();
  const flatTasks: Task[] = [];
  for (const task of ir.tasks) {
    if (task.milestone) {
      const list = tasksByMilestone.get(task.milestone) ?? [];
      list.push(task);
      tasksByMilestone.set(task.milestone, list);
    } else {
      flatTasks.push(task);
    }
  }

  for (const task of flatTasks) {
    emitTask(lines, task);
  }

  for (const m of milestones) {
    emitMilestone(lines, m);
    const list = tasksByMilestone.get(m.name) ?? [];
    for (const task of list) {
      emitTask(lines, task);
    }
  }

  // Trailing newline keeps diffs clean.
  return lines.join("\n").replace(/\n+$/u, "") + "\n";
}

function emitMilestone(lines: string[], m: Milestone): void {
  lines.push(`## Milestone: ${m.name}`);
  const meta: string[] = [];
  if (m.targetDate) meta.push(`target_date: ${m.targetDate}`);
  if (m.status) meta.push(`status: ${m.status}`);
  if (m.description) meta.push(`description: ${m.description}`);
  for (const l of meta) lines.push(l);
  lines.push("");
}

function emitTask(lines: string[], t: Task): void {
  const heading = t.key ? `### ${t.key} ${t.title}` : `### ${t.title}`;
  lines.push(heading);
  const meta: string[] = [];
  if (t.status) meta.push(`status: ${t.status}`);
  if (t.priority) meta.push(`priority: ${t.priority}`);
  if (t.type) meta.push(`type: ${t.type}`);
  if (t.tags && t.tags.length > 0) meta.push(`tags: ${yamlInlineArray(t.tags)}`);
  if (t.dependsOn && t.dependsOn.length > 0)
    meta.push(`depends_on: ${yamlInlineArray(t.dependsOn)}`);
  if (t.assignee) meta.push(`assignee: ${t.assignee}`);
  for (const l of meta) lines.push(l);
  if (meta.length > 0) lines.push("");
  if (t.description) {
    lines.push(t.description);
    lines.push("");
  }
  if (t.subtasks && t.subtasks.length > 0) {
    for (const sub of t.subtasks) {
      lines.push(formatSubtask(sub));
    }
    lines.push("");
  }
  if (lines[lines.length - 1] !== "") lines.push("");
}

function formatSubtask(s: Subtask): string {
  return `- [${s.done ? "x" : " "}] ${s.title}`;
}

function yamlScalar(s: string): string {
  // Quote when the string would be ambiguous to a YAML parser; otherwise
  // emit plain so the source stays readable.
  if (/^[\w\-./ ]+$/u.test(s) && !/^\s|\s$/u.test(s)) return s;
  const escaped = s.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
  return `"${escaped}"`;
}

function yamlInlineArray(items: string[]): string {
  return `[${items.map((i) => yamlScalar(i)).join(", ")}]`;
}
