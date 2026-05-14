export interface PublishArgs {
  channel: string;
  event: string;
  payload: unknown;
}

export interface AuthorizeArgs {
  userId: string;
  workspaceId: string;
  channels: string[];
}

export interface PresenceArgs {
  channel: string;
  userId: string;
  data?: Record<string, unknown>;
}

export interface RealtimeService {
  publish(args: PublishArgs): Promise<void>;
  /** Mint a short-lived client token authorising the given channels. */
  authorize(args: AuthorizeArgs): Promise<{ token: string; expiresAt: Date }>;
  presenceEnter(args: PresenceArgs): Promise<void>;
  presenceLeave(args: PresenceArgs): Promise<void>;
}
