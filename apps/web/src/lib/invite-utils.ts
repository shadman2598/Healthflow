export type StaffInviteRole = "RECEPTIONIST" | "DOCTOR";

export type StaffInvite = {
  id: string;
  code: string;
  role: string;
  email: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt?: string;
};

export function staffSignupPath(role: StaffInviteRole): string {
  return role === "DOCTOR" ? "/signup/doctor" : "/signup/receptionist";
}

export function roleLabel(role: string): string {
  return role === "DOCTOR" ? "Doctor" : "Receptionist";
}

export function inviteStatus(invite: StaffInvite): "used" | "expired" | "active" {
  if (invite.usedAt) return "used";
  if (new Date(invite.expiresAt) < new Date()) return "expired";
  return "active";
}

export function formatInviteExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function buildInviteMessage(invite: StaffInvite, origin: string): string {
  const signupUrl = `${origin}${staffSignupPath(invite.role as StaffInviteRole)}`;
  const lines = [
    `You have been invited to join HealthFlow as a ${roleLabel(invite.role).toLowerCase()}.`,
    "",
    `Invite code: ${invite.code}`,
    `Sign up: ${signupUrl}`
  ];

  if (invite.email) {
    lines.push(`Register with this email: ${invite.email}`);
  }

  lines.push(`Expires: ${formatInviteExpiry(invite.expiresAt)}`);
  lines.push("", "This code works once. Do not share it publicly.");

  return lines.join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
