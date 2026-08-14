"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { TrustBanner } from "../../components/healthflow/TrustBanner";
import { WhatsNextCard } from "../../components/healthflow/WhatsNextCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { IconChat, IconPlus, IconSend } from "../../components/ui/Icons";
import { ApiError, apiRequest } from "../../lib/api";
import { findClinicFee, looksLikeBillableAdminRequest } from "../../lib/clinic-fees";
import { resolvePatientNextStep } from "../../lib/patient-journey";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/toast-context";
import type { HealthFlowAppointment, HealthFlowUser, Message, MessageThread } from "../../types/healthflow";

function threadStatusVariant(status: string): "success" | "warning" | "error" | "info" | "neutral" {
  switch (status) {
    case "RESOLVED": return "success";
    case "PENDING":
    case "UNREAD": return "warning";
    case "ARCHIVED": return "neutral";
    default: return "info";
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        </ProtectedRolePage>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}

function MessagesContent() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<HealthFlowUser | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail] = useState<MessageThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [doctors, setDoctors] = useState<{ id: string; firstName: string | null; lastName: string | null; doctorProfileId: string | null }[]>([]);
  const [patching, setPatching] = useState(false);
  const [patientAppointments, setPatientAppointments] = useState<HealthFlowAppointment[]>([]);
  const [guestMode, setGuestMode] = useState(false);

  const isPatient = user?.role === "PATIENT";
  const isStaff = user && user.role !== "PATIENT";

  const patientJourney = useMemo(() => {
    if (!isPatient) return null;
    return resolvePatientNextStep({
      isGuest: guestMode,
      appointments: patientAppointments,
      threads
    });
  }, [isPatient, guestMode, patientAppointments, threads]);

  const loadThreads = async (): Promise<void> => {
    const res = await apiRequest<{ threads: MessageThread[] }>("/messages/threads");
    setThreads(res.threads);
    const deepLink = searchParams.get("threadId");
    if (deepLink) {
      setSelectedId(deepLink);
      return;
    }
    if (!selectedId && res.threads.length > 0) {
      setSelectedId(res.threads[0].id);
    }
  };

  useEffect(() => {
    const draft = searchParams.get("draft");
    if (!draft) return;
    setShowNewThread(true);
    setNewSubject("Visit prep / question for my clinician");
    setNewBody(draft);
  }, [searchParams]);

  useEffect(() => {
    const threadId = searchParams.get("threadId");
    if (threadId) setSelectedId(threadId);
  }, [searchParams]);

  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const { getGuestUser, isGuestSession } = await import("../../lib/guest-session");
        const guest = getGuestUser();
        if (guest) {
          setUser(guest);
          setGuestMode(true);
          setThreads([]);
          return;
        }
        setGuestMode(isGuestSession());
        const meRes = await apiRequest<{ user: HealthFlowUser }>("/auth/me");
        setUser(meRes.user);
        if (meRes.user.role !== "PATIENT") {
          const docRes = await apiRequest<{ doctors: { id: string; firstName: string; lastName: string }[] }>("/auth/doctors");
          setDoctors(docRes.doctors.map((d) => ({ id: d.id, firstName: d.firstName, lastName: d.lastName, doctorProfileId: d.id })));
        } else {
          const apptRes = await apiRequest<{ appointments: HealthFlowAppointment[] }>("/appointments").catch(() => ({
            appointments: [] as HealthFlowAppointment[]
          }));
          setPatientAppointments(apptRes.appointments);
        }
        await loadThreads();
      } catch {
        setThreads([]);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setThreadDetail(null);
      return;
    }
    apiRequest<{ thread: MessageThread }>(`/messages/threads/${selectedId}`)
      .then((res) => setThreadDetail(res.thread))
      .catch(() => setThreadDetail(null));
  }, [selectedId]);

  const onReply = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    const { isGuestSession } = await import("../../lib/guest-session");
    if (isGuestSession()) {
      showToast("Sign in to send messages to the clinic", "error");
      return;
    }
    setReplying(true);
    try {
      await apiRequest(`/messages/threads/${selectedId}/reply`, {
        method: "POST",
        body: { body: replyBody, isInternal: isStaff ? isInternal : false }
      });
      setReplyBody("");
      setIsInternal(false);
      const res = await apiRequest<{ thread: MessageThread }>(`/messages/threads/${selectedId}`);
      setThreadDetail(res.thread);
      await loadThreads();
      showToast("Reply sent");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to send reply", "error");
    } finally {
      setReplying(false);
    }
  };

  const patchThread = async (body: { status?: string; assignedDoctorId?: string | null; priority?: string }): Promise<void> => {
    if (!selectedId) return;
    setPatching(true);
    try {
      const res = await apiRequest<{ thread: MessageThread }>(`/messages/threads/${selectedId}`, {
        method: "PATCH",
        body
      });
      setThreadDetail(res.thread);
      await loadThreads();
      showToast("Thread updated");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to update thread", "error");
    } finally {
      setPatching(false);
    }
  };

  const onCreateThread = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!newSubject.trim() || !newBody.trim()) return;
    const { isGuestSession } = await import("../../lib/guest-session");
    if (isGuestSession()) {
      showToast("Sign in to send messages to the clinic", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await apiRequest<{ thread: MessageThread }>("/messages/threads", {
        method: "POST",
        body: { subject: newSubject, body: newBody, priority: "NORMAL" }
      });
      setShowNewThread(false);
      setNewSubject("");
      setNewBody("");
      await loadThreads();
      setSelectedId(res.thread.id);
      showToast("Message thread created");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to create thread", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Messages</h1>
          <p className="mt-1 text-sm text-slate-500">Secure threaded conversations</p>
        </div>
        {isPatient ? (
          <button onClick={() => setShowNewThread(true)} className="btn-primary">
            <IconPlus className="h-4 w-4" />
            New Thread
          </button>
        ) : null}
      </div>

      {isPatient ? <TrustBanner context="messages" className="mb-6" /> : null}
      {isPatient && patientJourney ? <WhatsNextCard step={patientJourney} className="mb-6" compact /> : null}

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <div className="card flex h-[calc(100vh-14rem)] overflow-hidden">
          {/* Thread list */}
          <div className="w-full max-w-xs shrink-0 border-r border-slate-100 overflow-y-auto">
            {threads.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={<IconChat className="h-10 w-10" />} title="No threads" description="Start a conversation to get help." />
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedId(thread.id)}
                  className={cn(
                    "w-full border-b border-slate-50 px-4 py-3.5 text-left transition-colors hover:bg-slate-50",
                    selectedId === thread.id && "bg-brand-50/60"
                  )}
                >
                  <p className="truncate text-sm font-medium text-slate-900">{thread.subject}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge variant={threadStatusVariant(thread.status)}>{thread.status.toLowerCase()}</StatusBadge>
                    {thread.priority === "HIGH" ? (
                      <span className="text-xs font-medium text-red-600">High</span>
                    ) : null}
                  </div>
                  {thread.patientProfile && isStaff ? (
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {thread.patientProfile.firstName} {thread.patientProfile.lastName}
                    </p>
                  ) : null}
                  {thread.messages?.[0] ? (
                    <p className="mt-1 truncate text-xs text-slate-400">{relativeTime(thread.messages[0].createdAt)}</p>
                  ) : null}
                </button>
              ))
            )}
          </div>

          {/* Thread detail */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {!threadDetail ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState icon={<IconChat className="h-12 w-12" />} title="Select a thread" description="Choose a conversation from the list." />
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 px-6 py-4">
                  <h2 className="font-semibold text-slate-900">{threadDetail.subject}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <StatusBadge variant={threadStatusVariant(threadDetail.status)}>{threadDetail.status.toLowerCase()}</StatusBadge>
                    {threadDetail.patientProfile && isStaff ? (
                      <span>{threadDetail.patientProfile.firstName} {threadDetail.patientProfile.lastName}</span>
                    ) : null}
                  </div>
                  {isStaff && threadDetail.status !== "ARCHIVED" ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <select
                        className="text-xs"
                        value={threadDetail.assignedDoctorId ?? ""}
                        disabled={patching}
                        onChange={(e) => patchThread({ assignedDoctorId: e.target.value || null })}
                      >
                        <option value="">Assign doctor...</option>
                        {doctors.map((d) => (
                          <option key={d.doctorProfileId!} value={d.doctorProfileId!}>
                            Dr. {d.firstName} {d.lastName}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn-secondary text-xs" disabled={patching} onClick={() => patchThread({ status: "RESOLVED" })}>
                        Mark resolved
                      </button>
                      <button type="button" className="btn-secondary text-xs" disabled={patching} onClick={() => patchThread({ status: "READ" })}>
                        Mark reviewed
                      </button>
                      <button type="button" className="btn-danger text-xs" disabled={patching} onClick={() => patchThread({ status: "ARCHIVED" })}>
                        Archive
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-6">
                  {(threadDetail.messages ?? []).map((msg: Message) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "max-w-[85%] rounded-xl px-4 py-3",
                        msg.sender?.role === "PATIENT"
                          ? "bg-slate-100 text-slate-800"
                          : "ml-auto bg-brand-50 text-brand-900",
                        msg.isInternal && "border border-dashed border-amber-300 bg-amber-50"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>{msg.sender?.email ?? "Unknown"}</span>
                        {msg.isInternal ? <span className="font-medium text-amber-700">Internal</span> : null}
                        <span>{relativeTime(msg.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{msg.body}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={onReply} className="border-t border-slate-100 p-4">
                  {isStaff ? (
                    <label className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                      <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded border-slate-300" />
                      Internal note (not visible to patient)
                    </label>
                  ) : null}
                  <div className="flex gap-2">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Write a reply..."
                      rows={2}
                      className="flex-1 resize-none"
                      required
                    />
                    <button type="submit" disabled={replying} className="btn-primary shrink-0 self-end">
                      <IconSend className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {showNewThread ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form className="card w-full max-w-md p-6" onSubmit={onCreateThread}>
            <h3 className="text-lg font-semibold text-slate-900">New Message Thread</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="label">Subject</label>
                <input required value={newSubject} onChange={(e) => setNewSubject(e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="label">Message</label>
                <textarea required rows={4} value={newBody} onChange={(e) => setNewBody(e.target.value)} className="w-full resize-none" />
              </div>
              {looksLikeBillableAdminRequest(`${newSubject} ${newBody}`) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <p className="font-medium">Possible uninsured request</p>
                  <p className="mt-1 text-amber-900/90">
                    Notes and forms often have a clinic fee (e.g. sick note {findClinicFee("sick-note")?.cost ?? "$50"},
                    school forms {findClinicFee("school-form")?.cost ?? "$40–$75"}). Confirm with reception before
                    expecting completion.
                  </p>
                  <Link href="/resources?tab=fees" className="mt-2 inline-block font-medium text-amber-900 underline">
                    View fee list
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Medically necessary visits are typically insured. Notes, forms, and some admin requests may have a{" "}
                  <Link href="/resources?tab=fees" className="text-brand-700 underline">
                    clinic fee
                  </Link>
                  .
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewThread(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={creating} className="btn-primary">{creating ? "Creating..." : "Send"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </ProtectedRolePage>
  );
}
