export function mentionEmail(args: {
  actorName: string;
  taskKey: string;
  taskTitle: string;
  excerpt: string;
  url: string;
}) {
  const { actorName, taskKey, taskTitle, excerpt, url } = args;

  const text = `${actorName} mentioned you on ${taskKey} — ${taskTitle}:

"${excerpt}"

View the task:

${url}`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:32px">
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(actorName)} mentioned you</h1>
<p style="color:#444;line-height:1.5"><span style="font-family:ui-monospace,monospace;font-size:13px;color:#666">${escapeHtml(taskKey)}</span> ${escapeHtml(taskTitle)}</p>
<blockquote style="margin:16px 0;padding:10px 14px;background:#f6f7f9;border-left:3px solid #4a5af0;border-radius:4px;color:#333">${escapeHtml(excerpt)}</blockquote>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#4a5af0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500">View task</a></p>
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
