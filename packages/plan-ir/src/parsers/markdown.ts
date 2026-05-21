import matter from "gray-matter";
import {
  PLAN_FORMAT_VERSION,
  PlanIRSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  TaskTypeSchema,
  MilestoneStatusSchema,
  type Diagnostic,
  type Milestone,
  type ParseResult,
  type PlanIR,
  type Project,
  type Subtask,
  type Task,
} from "../ir";

/**
 * Parse a Markdown plan into the canonical IR.
 *
 * Convention (see docs/plans/decisions.md §1 and docs/formats/markdown.md):
 *
 *     ---
 *     plan-format: 1
 *     project:
 *       key: PROJ
 *       name: Project Name
 *       target_date: 2026-09-30
 *       tags: [scrum, q3]
 *     ---
 *
 *     # Project Name
 *
 *     ## Milestone: Beta launch
 *     target_date: 2026-07-15
 *
 *     ### PROJ-1 Task title
 *     status: todo
 *     priority: high
 *     tags: [backend]
 *     depends_on: [PROJ-0]
 *
 *     Task description goes here. Markdown allowed.
 *
 *     - [ ] subtask one
 *     - [x] subtask two
 *
 * Tolerant: we collect diagnostics and produce a best-effort partial IR
 * rather than throwing on user input.
 */
export function parseMarkdown(input: string): ParseResult {
  const diagnostics: Diagnostic[] = [];

  const parsed = matter(input);
  const frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
  const body = parsed.content ?? "";

  // Count the lines gray-matter consumed so line numbers in diagnostics
  // reference the original input rather than the post-frontmatter slice.
  const frontmatterOffset = countFrontmatterLines(input);

  const project = readProjectFromFrontmatter(frontmatter, diagnostics);
  const planFormat = readPlanFormat(frontmatter, diagnostics);

  const { milestones, tasks } = walkBody(body, frontmatterOffset, diagnostics);

  // If the # Project heading provided a name and frontmatter did not, fill it in.
  if (!project.name && tasks.headingProjectName) {
    project.name = tasks.headingProjectName;
  }

  const ir: PlanIR = {
    planFormat,
    project: project as Project,
    ...(milestones.length > 0 ? { milestones } : {}),
    tasks: tasks.tasks,
  };

  // Validate the assembled IR. Schema errors become diagnostics rather
  // than thrown exceptions — the caller decides whether to proceed.
  const result = PlanIRSchema.safeParse(ir);
  if (!result.success) {
    for (const issue of result.error.issues) {
      diagnostics.push({
        level: "error",
        code: "ir/invalid",
        message: `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      });
    }
  }

  return { ir, diagnostics };
}

function readPlanFormat(
  frontmatter: Record<string, unknown>,
  diagnostics: Diagnostic[],
): typeof PLAN_FORMAT_VERSION {
  const raw = frontmatter["plan-format"] ?? frontmatter.planFormat;
  if (raw === undefined) {
    diagnostics.push({
      level: "warn",
      code: "frontmatter/missing-plan-format",
      message: `Missing 'plan-format' in frontmatter; assuming ${PLAN_FORMAT_VERSION}.`,
    });
    return PLAN_FORMAT_VERSION;
  }
  if (raw !== PLAN_FORMAT_VERSION) {
    diagnostics.push({
      level: "error",
      code: "frontmatter/unsupported-plan-format",
      message: `Unsupported plan-format '${String(raw)}'; this parser supports ${PLAN_FORMAT_VERSION}.`,
    });
  }
  return PLAN_FORMAT_VERSION;
}

function readProjectFromFrontmatter(
  frontmatter: Record<string, unknown>,
  diagnostics: Diagnostic[],
): Partial<Project> {
  const raw = frontmatter.project;
  if (raw === undefined || raw === null) {
    diagnostics.push({
      level: "error",
      code: "frontmatter/missing-project",
      message:
        "Frontmatter is missing the 'project' block. Add `project: { key, name }` at minimum.",
    });
    return {};
  }
  if (typeof raw !== "object") {
    diagnostics.push({
      level: "error",
      code: "frontmatter/invalid-project",
      message: "Frontmatter 'project' must be an object.",
    });
    return {};
  }
  const rec = raw as Record<string, unknown>;
  const project: Partial<Project> = {};

  if (typeof rec.key === "string") project.key = rec.key.trim();
  if (typeof rec.name === "string") project.name = rec.name.trim();
  if (typeof rec.description === "string") project.description = rec.description;
  const td = stringField(rec, "target_date", "targetDate");
  if (td) project.targetDate = td;
  const sd = stringField(rec, "start_date", "startDate");
  if (sd) project.startDate = sd;
  if (Array.isArray(rec.tags)) {
    project.tags = rec.tags.filter((t): t is string => typeof t === "string");
  }

  if (!project.key) {
    diagnostics.push({
      level: "error",
      code: "frontmatter/missing-project-key",
      message: "project.key is required.",
    });
  }
  if (!project.name) {
    diagnostics.push({
      level: "warn",
      code: "frontmatter/missing-project-name",
      message:
        "project.name missing in frontmatter; will fall back to the '# Heading' if present.",
    });
  }

  return project;
}

function stringField(
  rec: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    // YAML auto-parses `YYYY-MM-DD` as a Date; normalise it back to ISO.
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

interface BodyWalkResult {
  milestones: Milestone[];
  tasks: {
    tasks: Task[];
    headingProjectName?: string;
  };
}

function walkBody(
  body: string,
  lineOffset: number,
  diagnostics: Diagnostic[],
): BodyWalkResult {
  const lines = body.split(/\r?\n/u);
  const milestones: Milestone[] = [];
  const tasks: Task[] = [];
  let headingProjectName: string | undefined;

  // Cursor state for the active milestone and task. Inline metadata,
  // subtask checkboxes, and free-form description paragraphs are flushed
  // into whichever section is currently open.
  let currentMilestone: Milestone | undefined;
  let currentTask: Task | undefined;
  let currentTaskDescBuf: string[] = [];
  let currentMilestoneDescBuf: string[] = [];
  let inlineMetaAllowed = false;

  const flushTaskDesc = () => {
    if (currentTask && currentTaskDescBuf.length > 0) {
      const text = currentTaskDescBuf.join("\n").trim();
      if (text) currentTask.description = text;
    }
    currentTaskDescBuf = [];
  };
  const flushMilestoneDesc = () => {
    if (currentMilestone && currentMilestoneDescBuf.length > 0) {
      const text = currentMilestoneDescBuf.join("\n").trim();
      if (text) currentMilestone.description = text;
    }
    currentMilestoneDescBuf = [];
  };
  const closeTask = () => {
    flushTaskDesc();
    currentTask = undefined;
  };
  const closeMilestone = () => {
    closeTask();
    flushMilestoneDesc();
    currentMilestone = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trimEnd();
    const lineNo = lineOffset + i + 1;

    // # Project heading — only the first one is significant; later
    // h1s become description content for the active task.
    const h1 = /^#\s+(.+)$/u.exec(line);
    if (h1 && !headingProjectName && !currentMilestone && !currentTask) {
      headingProjectName = h1[1]!.trim();
      inlineMetaAllowed = false;
      continue;
    }

    const h2 = /^##\s+(.+)$/u.exec(line);
    if (h2) {
      closeMilestone();
      const heading = h2[1]!.trim();
      const name = heading.replace(/^Milestone\s*:\s*/iu, "").trim();
      currentMilestone = { name };
      milestones.push(currentMilestone);
      inlineMetaAllowed = true;
      continue;
    }

    const h3 = /^###\s+(.+)$/u.exec(line);
    if (h3) {
      closeTask();
      const heading = h3[1]!.trim();
      const { key, title } = splitTaskHeading(heading);
      currentTask = { title };
      if (key) currentTask.key = key;
      if (currentMilestone) currentTask.milestone = currentMilestone.name;
      tasks.push(currentTask);
      inlineMetaAllowed = true;
      continue;
    }

    // Subtask checkbox lines belong to the current task only.
    const checkbox = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/u.exec(line);
    if (checkbox && currentTask) {
      const done = checkbox[1] !== " ";
      const title = checkbox[2]!.trim();
      const subtask: Subtask = { title, done };
      currentTask.subtasks = currentTask.subtasks ?? [];
      currentTask.subtasks.push(subtask);
      inlineMetaAllowed = false;
      continue;
    }

    // Inline metadata lines (`key: value`) only directly under a heading,
    // before any prose. A blank line ends the metadata block.
    if (inlineMetaAllowed && line.trim() === "") {
      inlineMetaAllowed = false;
      continue;
    }
    if (inlineMetaAllowed) {
      const meta = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/u.exec(line);
      if (meta && (currentTask || currentMilestone)) {
        applyInlineMetadata(
          meta[1]!,
          meta[2]!,
          currentTask,
          currentMilestone,
          diagnostics,
          lineNo,
        );
        continue;
      }
      // Not a metadata line — switch to prose mode.
      inlineMetaAllowed = false;
    }

    // Prose lines attach to whichever section is open. We preserve blank
    // lines so multi-paragraph descriptions round-trip.
    if (currentTask) {
      currentTaskDescBuf.push(raw);
    } else if (currentMilestone) {
      currentMilestoneDescBuf.push(raw);
    } else {
      // Floating content before any heading — ignore but note if non-empty.
      if (line.trim() !== "") {
        diagnostics.push({
          level: "info",
          code: "body/orphan-content",
          message: `Content outside any heading is ignored.`,
          line: lineNo,
        });
      }
    }
  }

  closeMilestone();

  return {
    milestones,
    tasks: { tasks, ...(headingProjectName ? { headingProjectName } : {}) },
  };
}

function splitTaskHeading(heading: string): { key?: string; title: string } {
  // Accept "PROJ-12 Task title", "PROJ-12: Task title", or just "Task title".
  const m = /^([A-Z][A-Z0-9]*-\d+)\s*[:\-\s]\s*(.+)$/u.exec(heading);
  if (m) {
    return { key: m[1]!, title: m[2]!.trim() };
  }
  return { title: heading };
}

function applyInlineMetadata(
  rawKey: string,
  rawValue: string,
  task: Task | undefined,
  milestone: Milestone | undefined,
  diagnostics: Diagnostic[],
  lineNo: number,
): void {
  const key = rawKey.toLowerCase().replace(/_/gu, "-");
  const value = rawValue.trim();

  // Milestone-only fields apply when there's no active task.
  if (!task && milestone) {
    switch (key) {
      case "target-date":
        milestone.targetDate = value;
        return;
      case "status": {
        const parsed = MilestoneStatusSchema.safeParse(value);
        if (parsed.success) milestone.status = parsed.data;
        else
          diagnostics.push({
            level: "warn",
            code: "metadata/invalid-milestone-status",
            message: `Milestone status '${value}' is not recognised.`,
            line: lineNo,
          });
        return;
      }
      case "description":
        milestone.description = value;
        return;
    }
  }

  if (!task) {
    diagnostics.push({
      level: "warn",
      code: "metadata/orphan",
      message: `Metadata '${rawKey}' has no target heading.`,
      line: lineNo,
    });
    return;
  }

  switch (key) {
    case "status": {
      const parsed = TaskStatusSchema.safeParse(value);
      if (parsed.success) task.status = parsed.data;
      else
        diagnostics.push({
          level: "warn",
          code: "metadata/invalid-status",
          message: `Task status '${value}' is not recognised.`,
          line: lineNo,
        });
      return;
    }
    case "priority": {
      const parsed = TaskPrioritySchema.safeParse(value);
      if (parsed.success) task.priority = parsed.data;
      else
        diagnostics.push({
          level: "warn",
          code: "metadata/invalid-priority",
          message: `Task priority '${value}' is not recognised.`,
          line: lineNo,
        });
      return;
    }
    case "type": {
      const parsed = TaskTypeSchema.safeParse(value);
      if (parsed.success) task.type = parsed.data;
      else
        diagnostics.push({
          level: "warn",
          code: "metadata/invalid-type",
          message: `Task type '${value}' is not recognised.`,
          line: lineNo,
        });
      return;
    }
    case "tags":
      task.tags = parseList(value);
      return;
    case "depends-on":
      task.dependsOn = parseList(value);
      return;
    case "milestone":
      task.milestone = value;
      return;
    case "assignee":
      task.assignee = value;
      return;
    case "key":
      task.key = value;
      return;
    default:
      diagnostics.push({
        level: "info",
        code: "metadata/unknown",
        message: `Unknown metadata key '${rawKey}'; ignored.`,
        line: lineNo,
      });
  }
}

function parseList(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function countFrontmatterLines(input: string): number {
  // gray-matter recognises frontmatter only when the file starts with `---\n`.
  if (!input.startsWith("---")) return 0;
  const lines = input.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") return i + 1;
  }
  return 0;
}
