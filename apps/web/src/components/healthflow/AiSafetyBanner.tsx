type AiSafetyBannerProps = {
  tier?: string;
  disclaimer?: string;
  status?: string;
  confidence?: number;
  className?: string;
};

const DEFAULT_DISCLAIMER =
  "AI-generated draft — not verified clinical fact. A qualified clinician must review before acting.";

/**
 * Always show when rendering AI output. Never implies verified clinical fact.
 */
export function AiSafetyBanner({
  tier,
  disclaimer = DEFAULT_DISCLAIMER,
  status,
  confidence,
  className
}: AiSafetyBannerProps) {
  return (
    <aside
      role="note"
      className={
        className ??
        "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
      }
    >
      <p className="font-medium">{disclaimer}</p>
      <p className="mt-1 text-xs text-amber-900/80">
        {tier ? `Risk tier: ${tier.split("_").join(" ").toLowerCase()}. ` : null}
        {status ? `Status: ${status}. ` : null}
        {confidence != null ? `Model confidence: ${Math.round(confidence * 100)}% (uncertain).` : null}
      </p>
    </aside>
  );
}
