export function inviteEmail(args: {
  workspaceName: string;
  invitedByEmail: string;
  url: string;
  expiresInDays: number;
}) {
  const { workspaceName, invitedByEmail, url, expiresInDays } = args;

  const text = `${invitedByEmail} invited you to join "${workspaceName}" on Manager.

Accept the invitation:

${url}

This invite expires in ${expiresInDays} days. If you weren't expecting it, you can safely ignore this email.`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">Join ${escapeHtml(workspaceName)} on Manager</h1>
<p style="color:#444;line-height:1.5"><span style="font-weight:500">${escapeHtml(invitedByEmail)}</span> invited you to collaborate in the <span style="font-weight:500">${escapeHtml(workspaceName)}</span> workspace.</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#4a5af0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500">Accept invitation</a></p>
<p style="color:#888;font-size:13px;line-height:1.5">This invite expires in ${expiresInDays} days. Or paste this URL into your browser:<br><span style="word-break:break-all">${url}</span></p>
</body></html>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
