// eslint-disable-next-line no-restricted-imports
import { Resend } from "resend";
import type { EmailService, SendArgs } from "./types";

export function createResendEmailService(apiKey: string, from: string): EmailService {
  const client = new Resend(apiKey);
  return {
    async send({ to, subject, html, text, tags }: SendArgs) {
      const payload = {
        from,
        to,
        subject,
        ...(html ? { html } : { text: text ?? "" }),
        ...(tags
          ? { tags: Object.entries(tags).map(([name, value]) => ({ name, value })) }
          : {}),
      } as Parameters<typeof client.emails.send>[0];
      const result = await client.emails.send(payload);
      if (result.error) throw new Error(`Resend error: ${result.error.message}`);
      return { id: result.data?.id ?? "unknown" };
    },
  };
}
