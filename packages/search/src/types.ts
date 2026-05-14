export interface IndexableTask {
  id: string;
  workspaceId: string;
  projectId: string;
  key: string;
  title: string;
  description?: string | null;
  status: "open" | "in_progress" | "done";
}

export interface SearchHit {
  id: string;
  key: string;
  title: string;
  rank: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

export interface SearchService {
  indexTask(task: IndexableTask): Promise<void>;
  removeTask(id: string): Promise<void>;
  search(workspaceId: string, query: string, options?: SearchOptions): Promise<SearchHit[]>;
}
