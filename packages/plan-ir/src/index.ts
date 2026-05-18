export * from "./ir";
export { parseMarkdown } from "./parsers/markdown";
export { serializeMarkdown } from "./serializers/markdown";
export { diffAgainstWorkspace } from "./diff";
export type { WorkspaceState, PlanDiff } from "./diff";
