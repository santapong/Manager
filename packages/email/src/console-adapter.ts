import type { EmailService, SendArgs } from "./types";

/**
 * Development-only fallback that prints the email body to stderr.
 * Used when `RESEND_API_KEY` is unset so magic-link flows still work
 * end-to-end locally without external credentials.
 */
export function createConsoleEmailService(): EmailService {
  return {
    async send({ to, subject, text, html }: SendArgs) {
      const id = `dev_${Math.random().toString(36).slice(2, 10)}`;
      console.warn(
        `\n=== [console-email] ===\nto: ${to}\nsubject: ${subject}\n\n${text ?? html ?? ""}\n========================\n`,
      );
      return { id };
    },
  };
}
