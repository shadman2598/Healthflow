import sgMail from "@sendgrid/mail";
import { env } from "../../config/env";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type ProviderSendResult = {
  providerMessageId: string;
  provider: "sendgrid" | "dev-email";
};

let sendGridConfigured = false;

function setupSendGrid(): void {
  if (!sendGridConfigured && env.SENDGRID_API_KEY) {
    sgMail.setApiKey(env.SENDGRID_API_KEY);
    sendGridConfigured = true;
  }
}

export async function sendEmail(input: SendEmailInput): Promise<ProviderSendResult> {
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
    const messageId = `dev-email-${Date.now()}`;
    // eslint-disable-next-line no-console
    console.log("[DEV EMAIL]", { to: input.to, subject: input.subject, text: input.text, messageId });
    return { provider: "dev-email", providerMessageId: messageId };
  }

  setupSendGrid();

  const [response] = await sgMail.send({
    to: input.to,
    from: env.SENDGRID_FROM_EMAIL,
    subject: input.subject,
    text: input.text
  });

  return {
    provider: "sendgrid",
    providerMessageId: String(response.headers["x-message-id"] ?? `sendgrid-${Date.now()}`)
  };
}
