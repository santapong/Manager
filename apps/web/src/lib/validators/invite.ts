import { z } from "zod";

export const InviteRoleEnum = z.enum(["admin", "member", "guest"]);
export type InviteRole = z.infer<typeof InviteRoleEnum>;

export const CreateInviteSchema = z.object({
  email: z.string().email("Enter a valid email").max(255),
  role: InviteRoleEnum.default("member"),
});

export const RevokeInviteSchema = z.object({
  id: z.string().uuid(),
});
