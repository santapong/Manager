import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { aiEncryptionConfigured } from "@/src/lib/ai/crypto";
import { getKeyMeta } from "@/src/server/ai-keys";
import { AiSettings } from "./ai-settings";

export const dynamic = "force-dynamic";

/**
 * AI assistant settings. Shows whether a per-workspace Anthropic key is set
 * (display-only `last4`, never the key itself) and a "Try it" box. Writes are
 * owner/admin-gated in the action; the UI reflects the role. Encryption being
 * unconfigured (no AI_ENCRYPTION_KEY) disables key management with a notice.
 */
export default async function AiSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const encryptionConfigured = aiEncryptionConfigured();

  const { meta, role } = await withActiveWorkspace(async (tx, ws) => ({
    meta: await getKeyMeta(tx, ws.id),
    role: ws.role,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">AI</h1>
        <p className="mt-1 text-sm text-gray-600">
          Connect your own Anthropic API key to enable the in-app assistant. The key is encrypted
          at rest and only ever used to make requests on this workspace&apos;s behalf.
        </p>
      </header>
      <AiSettings
        slug={slug}
        hasKey={meta !== null}
        last4={meta?.last4 ?? null}
        encryptionConfigured={encryptionConfigured}
        role={role}
      />
    </div>
  );
}
