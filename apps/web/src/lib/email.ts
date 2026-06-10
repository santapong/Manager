import {
  createConsoleEmailService,
  createResendEmailService,
  type EmailService,
} from "@manager/email";
import { env } from "../env";

/**
 * Resend when configured, console fallback otherwise — the one place that
 * picks an EmailService adapter for the app (auth + invites + future
 * notification emails).
 */
export function emailService(): EmailService {
  return env.RESEND_API_KEY
    ? createResendEmailService(env.RESEND_API_KEY, env.EMAIL_FROM)
    : createConsoleEmailService();
}
