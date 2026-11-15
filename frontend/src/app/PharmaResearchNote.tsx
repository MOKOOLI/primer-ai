"use client";

/**
 * Shared scientific-responsibility line for Pharma panels.
 * Keep wording aligned across the Research Data Bank UI.
 */
export default function PharmaResearchNote({
  lang,
  tone = "light",
}: {
  lang?: string;
  /** light = slate on white panels; dark = slate-300 on dark docking-style panels */
  tone?: "light" | "dark";
}) {
  const fa = lang === "fa";
  const color = tone === "dark" ? "text-slate-300" : "text-slate-500";
  return (
    <p className={`text-xs leading-relaxed ${color}`} role="note">
      {fa
        ? "فقط برای پژوهش. جایگزین تشخیص یا درمان نیست. امتیاز ساختگی تولید نمی‌شود؛ منبع و زمان دریافت کنار داده می‌ماند."
        : "Research use only. Not a substitute for diagnosis or treatment. No scores are invented; provider and retrieval time stay with the data."}
    </p>
  );
}
