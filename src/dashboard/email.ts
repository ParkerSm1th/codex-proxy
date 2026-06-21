import type { RuntimeEnv } from "../env";

export async function sendMagicLinkEmail(
  env: RuntimeEnv,
  input: { to: string; verifyUrl: string }
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.AUTH_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and AUTH_FROM_EMAIL must be configured to send login emails");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: "Sign in to UseMySub",
      html: `
        <p>Click the link below to sign in to UseMySub. This link expires in 15 minutes.</p>
        <p><a href="${input.verifyUrl}">Sign in</a></p>
        <p>If you did not request this email, you can ignore it.</p>
      `.trim()
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to send login email (${response.status}): ${body.slice(0, 200)}`);
  }
}
