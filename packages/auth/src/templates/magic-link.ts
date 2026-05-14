export function magicLinkEmail(url: string, expiresInMinutes: number) {
  const text = `Click the link to sign in to Manager:

${url}

This link expires in ${expiresInMinutes} minutes and can only be used once. If you didn't request it, you can safely ignore this email.`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">Sign in to Manager</h1>
<p style="color:#444;line-height:1.5">Click the button below to finish signing in. This link expires in ${expiresInMinutes} minutes and can only be used once.</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#4a5af0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500">Sign in</a></p>
<p style="color:#888;font-size:13px;line-height:1.5">Or paste this URL into your browser:<br><span style="word-break:break-all">${url}</span></p>
</body></html>`;

  return { text, html };
}
