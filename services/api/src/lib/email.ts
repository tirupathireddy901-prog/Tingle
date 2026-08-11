function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? "Tingle";

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL is not configured");
  }

  return { apiKey, senderEmail, senderName };
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
) {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [{ email: to }],
      subject,
      textContent: body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Brevo email failed (${response.status}): ${errorText}`
    );
  }

  const result = await response.json();

  console.log(
    `[email] sent to=${to} subject="${subject}" messageId=${result.messageId ?? "unknown"}`
  );

  return result;
}

export async function sendVerificationEmail(
  to: string,
  token: string
) {
  const appUrl =
    process.env.APP_URL ?? "http://localhost:5173";

  const link =
    `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;

  await sendEmail(
    to,
    "Verify your Tingle account",
    `Welcome to Tingle!

Please verify your email address by opening this link:

${link}

If you did not create a Tingle account, you can ignore this email.`
  );
}

export async function sendPasswordResetEmail(
  to: string,
  token: string
) {
  const appUrl =
    process.env.APP_URL ?? "http://localhost:5173";

  const link =
    `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  await sendEmail(
    to,
    "Reset your Tingle password",
    `You requested a password reset for your Tingle account.

Open this link to reset your password:

${link}

If you did not request this, you can ignore this email.`
  );
}
