"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "../../lib/zod-resolver";
import { z } from "zod";
import { ApiError, apiRequest } from "../../lib/api";
import { useToast } from "../../contexts/toast-context";
import {
  buildInviteMessage,
  copyText,
  formatInviteExpiry,
  inviteStatus,
  roleLabel,
  staffSignupPath,
  type StaffInvite,
  type StaffInviteRole
} from "../../lib/invite-utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { IconClipboard } from "../ui/Icons";

const inviteFormSchema = z.object({
  role: z.enum(["RECEPTIONIST", "DOCTOR"]),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]),
  expiresInDays: z.coerce.number().int().min(1).max(90)
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

type StaffInvitePanelProps = {
  invites: StaffInvite[];
  onInviteCreated: () => Promise<void>;
};

function statusBadgeVariant(status: ReturnType<typeof inviteStatus>): "success" | "secondary" | "warning" {
  if (status === "active") return "success";
  if (status === "used") return "secondary";
  return "warning";
}

function statusLabel(status: ReturnType<typeof inviteStatus>): string {
  if (status === "active") return "Active";
  if (status === "used") return "Used";
  return "Expired";
}

export function StaffInvitePanel({ invites, onInviteCreated }: StaffInvitePanelProps) {
  const { showToast } = useToast();
  const [latestInvite, setLatestInvite] = useState<StaffInvite | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      role: "RECEPTIONIST",
      email: "",
      expiresInDays: 30
    }
  });

  const sortedInvites = useMemo(
    () =>
      [...invites].sort((a, b) => {
        const aTime = new Date(a.createdAt ?? a.expiresAt).getTime();
        const bTime = new Date(b.createdAt ?? b.expiresAt).getTime();
        return bTime - aTime;
      }),
    [invites]
  );

  const copyWithFeedback = async (id: string, text: string, successMessage: string): Promise<void> => {
    const ok = await copyText(text);
    if (!ok) {
      showToast("Could not copy to clipboard", "error");
      return;
    }
    setCopiedId(id);
    showToast(successMessage);
    window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  };

  const onSubmit = async (data: InviteFormValues): Promise<void> => {
    try {
      const res = await apiRequest<{ invite: StaffInvite }>("/auth/invites", {
        method: "POST",
        body: {
          role: data.role,
          expiresInDays: data.expiresInDays,
          ...(data.email?.trim() ? { email: data.email.trim() } : {})
        }
      });

      setLatestInvite(res.invite);
      await onInviteCreated();
      reset({ role: data.role, email: "", expiresInDays: data.expiresInDays });

      const message = buildInviteMessage(res.invite, window.location.origin);
      const copied = await copyText(message);
      showToast(
        copied
          ? `Invite created for ${roleLabel(res.invite.role).toLowerCase()} — message copied`
          : `Invite created: ${res.invite.code}`
      );
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to create invite", "error");
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Staff onboarding invites</CardTitle>
        <p className="text-sm text-slate-500">
          Generate a one-time invite for one doctor or receptionist. Optionally lock it to their work email.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="label">Role</label>
            <select className="w-full" {...register("role")}>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="DOCTOR">Doctor</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Work email (optional)</label>
            <Input type="email" placeholder="dr.smith@clinic.com" {...register("email")} />
            <p className="mt-1 text-xs text-slate-500">If set, only this email can use the invite code.</p>
            {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email.message}</p> : null}
          </div>
          <div>
            <label className="label">Expires in</label>
            <select className="w-full" {...register("expiresInDays")}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <div className="md:col-span-4 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Generating..." : "Generate invite"}
            </Button>
            <p className="text-xs text-slate-500">One click creates the code and copies a ready-to-send message.</p>
          </div>
        </form>

        {latestInvite ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-900">Latest invite ready to share</p>
                <p className="mt-1 font-mono text-lg tracking-wide text-brand-950">{latestInvite.code}</p>
                <p className="mt-2 text-sm text-brand-800">
                  {roleLabel(latestInvite.role)}
                  {latestInvite.email ? ` · locked to ${latestInvite.email}` : " · any work email"}
                  {" · expires "}
                  {formatInviteExpiry(latestInvite.expiresAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    copyWithFeedback(`code-${latestInvite.id}`, latestInvite.code, "Invite code copied")
                  }
                >
                  <IconClipboard className="h-4 w-4" />
                  {copiedId === `code-${latestInvite.id}` ? "Copied" : "Copy code"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    copyWithFeedback(
                      `message-${latestInvite.id}`,
                      buildInviteMessage(latestInvite, window.location.origin),
                      "Invite message copied"
                    )
                  }
                >
                  <IconClipboard className="h-4 w-4" />
                  {copiedId === `message-${latestInvite.id}` ? "Copied" : "Copy message"}
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-brand-700">
              Sign-up page: {window.location.origin}
              {staffSignupPath(latestInvite.role as StaffInviteRole)}
            </p>
          </div>
        ) : null}

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Recent invites</h3>
            <p className="text-xs text-slate-500">{sortedInvites.length} total</p>
          </div>

          {sortedInvites.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No invites yet. Generate one above to onboard your first staff member.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedInvites.map((invite) => {
                const status = inviteStatus(invite);
                return (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-slate-900">{invite.code}</span>
                        <Badge variant="secondary">{roleLabel(invite.role)}</Badge>
                        <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {invite.email ? `Email: ${invite.email}` : "No email lock"}
                        {" · Expires "}
                        {formatInviteExpiry(invite.expiresAt)}
                        {invite.usedAt ? ` · Used ${formatInviteExpiry(invite.usedAt)}` : ""}
                      </p>
                    </div>
                    {status === "active" ? (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => copyWithFeedback(`code-${invite.id}`, invite.code, "Invite code copied")}
                        >
                          <IconClipboard className="h-4 w-4" />
                          {copiedId === `code-${invite.id}` ? "Copied" : "Copy code"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            copyWithFeedback(
                              `message-${invite.id}`,
                              buildInviteMessage(invite, window.location.origin),
                              "Invite message copied"
                            )
                          }
                        >
                          <IconClipboard className="h-4 w-4" />
                          {copiedId === `message-${invite.id}` ? "Copied" : "Copy message"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
