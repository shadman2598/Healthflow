import twilio from "twilio";
import { env } from "../../config/env";

type SendSmsInput = {
  to: string;
  body: string;
};

export type ProviderSendResult = {
  providerMessageId: string;
  provider: "twilio" | "dev-sms";
};

let twilioClient: twilio.Twilio | null = null;

function getTwilioClient(): twilio.Twilio {
  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  return twilioClient;
}

export async function sendSms(input: SendSmsInput): Promise<ProviderSendResult> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_PHONE) {
    const messageId = `dev-sms-${Date.now()}`;
    // eslint-disable-next-line no-console
    console.log("[DEV SMS]", { to: input.to, body: input.body, messageId });
    return { provider: "dev-sms", providerMessageId: messageId };
  }

  const client = getTwilioClient();
  const response = await client.messages.create({
    from: env.TWILIO_FROM_PHONE,
    to: input.to,
    body: input.body
  });

  return {
    provider: "twilio",
    providerMessageId: response.sid
  };
}
