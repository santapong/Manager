export interface SendArgs {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  tags?: Record<string, string>;
}

export interface EmailService {
  send(args: SendArgs): Promise<{ id: string }>;
}
