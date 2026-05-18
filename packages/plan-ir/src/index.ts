export * from "./ir.js";
export { parseMarkdown } from "./parsers/markdown.js";
export { serializeMarkdown } from "./serializers/markdown.js";
export { diffAgainstWorkspace } from "./diff.js";
export type { WorkspaceState, PlanDiff } from "./diff.js";
