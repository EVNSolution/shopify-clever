/* eslint-disable react/prop-types */
const INFO_PILL_TONES = new Set(["neutral", "success", "warning", "critical", "pickup"]);

function normalizeInfoPillTone(tone) {
  return INFO_PILL_TONES.has(tone) ? tone : "neutral";
}

export function InfoPill({ children, title, tone = "neutral" }) {
  const fallbackTitle =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : undefined;

  return (
    <span
      className={`info-pill info-pill--${normalizeInfoPillTone(tone)}`}
      title={title ?? fallbackTitle}
    >
      {children}
    </span>
  );
}
