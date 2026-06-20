import { z } from "zod";

/**
 * Widget kinds the dashboard knows how to render. The DB (`dashboard_layouts`)
 * stores an ordered list of `{ id, type }`; the set of valid `type` values is
 * owned here (the web app), not the schema. Keep this in sync with the
 * renderers in `app/[workspace]/dashboard/widgets.tsx`.
 */
export const WidgetTypeSchema = z.enum([
  "tasks_done",
  "by_status",
  "by_priority",
  "due_overdue",
  "my_tasks",
  "completions_chart",
  "pomodoro",
]);

export type WidgetType = z.infer<typeof WidgetTypeSchema>;

/** A single placed widget. `id` is a stable instance id (lets duplicates coexist). */
export const WidgetSchema = z.object({
  id: z.string().min(1),
  type: WidgetTypeSchema,
});

/** The ordered widget list persisted per (workspace, user). Capped to keep payloads sane. */
export const LayoutSchema = z.array(WidgetSchema).max(50);

export type LayoutInput = z.infer<typeof LayoutSchema>;

/**
 * Payload sent when a Pomodoro interval completes client-side. `startedAt` is
 * coerced from the ISO string the timer sends; `minutes` is the interval length.
 */
export const LogPomodoroSchema = z.object({
  kind: z.enum(["focus", "short_break", "long_break"]),
  minutes: z.number().int().min(1).max(180),
  startedAt: z.coerce.date(),
  taskId: z.string().uuid().optional(),
});

export type LogPomodoroInput = z.infer<typeof LogPomodoroSchema>;
