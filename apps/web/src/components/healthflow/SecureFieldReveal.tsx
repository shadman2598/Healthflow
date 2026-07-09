"use client";

import { useState } from "react";
import { ApiError, apiRequest } from "../../lib/api";
import { useToast } from "../../contexts/toast-context";

type SecureFieldRevealProps = {
  profileId: string;
  maskedValue: string;
  label?: string;
};

export function SecureFieldReveal({
  profileId,
  maskedValue,
  label = "Healthcare number"
}: SecureFieldRevealProps) {
  const { showToast } = useToast();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onReveal = async (): Promise<void> => {
    if (revealed) return;
    const confirmed = window.confirm(
      `Reveal ${label}? This action is logged for audit and compliance.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await apiRequest<{ healthcareNumber: string }>(
        `/patient-profiles/${profileId}/reveal-hcn`,
        { method: "POST" }
      );
      setRevealed(res.healthcareNumber);
      showToast("Healthcare number revealed (audit logged)");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Unable to reveal", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm text-slate-800">{revealed ?? maskedValue}</span>
      {!revealed ? (
        <button type="button" onClick={onReveal} disabled={loading} className="btn-secondary text-xs">
          {loading ? "..." : "Reveal"}
        </button>
      ) : null}
    </div>
  );
}
