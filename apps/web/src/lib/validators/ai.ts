import { z } from "zod";
import {
  TaskPriorityEnum,
  TaskStatusEnum,
  TaskTypeEnum,
} from "./task";

/**
 * A pasted Anthropic key. All current keys carry the `sk-ant-` prefix; the
 * length floor rejects obvious typos before we spend a validation round-trip.
 * The real check is a live `validateKey` ping in the action.
 */
export const SetKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "That doesn't look like an Anthropic API key.")
    .startsWith("sk-ant-", "Anthropic keys start with sk-ant-."),
});
export type SetKeyInput = z.infer<typeof SetKeySchema>;

/** Free-form text for a single-turn assist (summarize / draft). */
export const AssistSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Enter some text first.")
    .max(20_000, "That's too long — keep it under 20,000 characters."),
});
export type AssistInput = z.infer<typeof AssistSchema>;

/**
 * A multi-turn chat transcript posted to the streaming assistant endpoint.
 * Only user/assistant roles cross the wire — the system prompt is fixed
 * server-side. Bounds keep a single request well under the token budget and
 * cap the conversation length the client may replay.
 */
export const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(50),
});
export type ChatInput = z.infer<typeof ChatSchema>;

// ---------------------------------------------------------------------------
// Gated write proposals (Wave 2c).
//
// The assistant NEVER mutates data. When the model "calls" a write tool, the
// server validates the input and records a *proposal* — a plain object the
// client renders as a Confirm/Cancel card. Only an explicit user click runs
// `applyProposalAction`, which re-parses the proposal with `ProposalSchema`,
// RE-RESOLVES the task/project by key+workspace (never trusting the embedded
// ids), and performs the real RLS-scoped mutation. The embedded `projectId`/
// `taskId`/`listId` are carried for the human summary and as a sanity hint;
// they are NOT the authority on apply.
//
// Field constraints mirror the task validators so a proposal can never be
// applied with values the normal forms would reject.
// ---------------------------------------------------------------------------

/** Project/task human keys (e.g. "ENG", "ENG-12"); never raw uuids. */
const ProjectKey = z.string().trim().min(1).max(64);
const TaskKey = z.string().trim().min(1).max(64);

/** Title/description bounds shared with `CreateTaskSchema`/`UpdateTaskSchema`. */
const TaskTitle = z.string().trim().min(1).max(200);
const TaskDescription = z.string().trim().max(10_000);
const TaskPoints = z.number().int().min(0).max(100);

export const ProposalKindEnum = z.enum(["create_task", "update_task", "move_task"]);
export type ProposalKind = z.infer<typeof ProposalKindEnum>;

/**
 * `create_task` proposal. `projectId`/`listId` are resolved server-side at
 * propose time; apply re-resolves the project (and its default list) by
 * `projectKey` again before inserting.
 */
export const CreateTaskProposalSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("create_task"),
  summary: z.string().min(1).max(500),
  projectKey: ProjectKey,
  projectId: z.string().uuid(),
  listId: z.string().uuid(),
  title: TaskTitle,
  description: TaskDescription.nullable().optional(),
  priority: TaskPriorityEnum.optional(),
  type: TaskTypeEnum.optional(),
});

/**
 * `update_task` proposal — a partial patch. At least one mutable field must be
 * present (an empty update is meaningless and rejected). `taskId`/`projectId`
 * are resolved at propose time; apply re-resolves by `taskKey`.
 */
export const UpdateTaskProposalSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.literal("update_task"),
    summary: z.string().min(1).max(500),
    taskKey: TaskKey,
    taskId: z.string().uuid(),
    projectId: z.string().uuid(),
    title: TaskTitle.optional(),
    description: TaskDescription.nullable().optional(),
    status: TaskStatusEnum.optional(),
    priority: TaskPriorityEnum.optional(),
    points: TaskPoints.nullable().optional(),
  })
  .refine(
    (p) =>
      p.title !== undefined ||
      p.description !== undefined ||
      p.status !== undefined ||
      p.priority !== undefined ||
      p.points !== undefined,
    { message: "An update must change at least one field." },
  );

/** `move_task` proposal — a status change only (board position is server-chosen). */
export const MoveTaskProposalSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("move_task"),
  summary: z.string().min(1).max(500),
  taskKey: TaskKey,
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: TaskStatusEnum,
});

/** Discriminated union over every write a proposal can represent. */
export const ProposalSchema = z.discriminatedUnion("kind", [
  CreateTaskProposalSchema,
  UpdateTaskProposalSchema,
  MoveTaskProposalSchema,
]);

export type CreateTaskProposal = z.infer<typeof CreateTaskProposalSchema>;
export type UpdateTaskProposal = z.infer<typeof UpdateTaskProposalSchema>;
export type MoveTaskProposal = z.infer<typeof MoveTaskProposalSchema>;
export type AssistantProposal = z.infer<typeof ProposalSchema>;
