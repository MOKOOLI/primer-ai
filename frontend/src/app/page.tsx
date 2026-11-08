"use client";

import { useState } from "react";

const translations = {
  en: {
    title: "AI Primer Designer",
    subtitle: "Design PCR primers using natural language and AI.",
    sequenceLabel: "DNA Sequence",
    promptLabel: "What do you want? (e.g., Set temperature to 65 degrees)",
    button: "Design Primer",
    loading: "Analyzing and designing...",
    results: "Best Primer Pairs",
    temperature: "Detected Temperature",
    success: "Primer designed successfully!",
    error: "An error occurred. Please check your backend server.",
    langToggle: "فارسی",
    dir: "ltr",
    feedbackBtn: "Was this result helpful?",
    feedbackSent: "Thank you for your feedback!",
    feedbackError: "Failed to send feedback.",
    blastButton: "Check against NCBI Database",
    blastLoading: "Searching NCBI (this may take up to 30s)...",
    blastResult: "NCBI BLAST Results",
    noHits: "No significant off-targets found. This primer is highly specific!",
    offTargets: "Potential Off-Targets Found:",
    title_col: "Description",
    evalue_col: "E-value",
    copy: "Copy",
    copied: "Copied!",
    pair: "Pair",
    leftPrimer: "Forward Primer",
    rightPrimer: "Reverse Primer",
    tm: "Tm (°C)",
    gc: "GC (%)",
    size: "Product Size (bp)",
  },
  fa: {
    title: "طراحی هوشمند پرایمر",
    subtitle: "طراحی پرایمر PCR با استفاده از زبان طبیعی و هوش مصنوعی.",
    sequenceLabel: "توالی DNA",
    promptLabel: "چه می‌خواهید؟ (مثلاً: دما را روی ۶۵ درجه تنظیم کن)",
    button: "طراحی پرایمر",
    loading: "در حال تحلیل و طراحی...",
    results: "بهترین جفت‌های پرایمر",
    temperature: "دمای تشخیص داده شده",
    success: "پرایمر با موفقیت طراحی شد!",
    error: "خطایی رخ داد. لطفاً اتصال سرور بک‌اند را بررسی کنید.",
    langToggle: "English",
    dir: "rtl",
    feedbackBtn: "آیا این نتیجه مفید بود؟",
    feedbackSent: "از بازخورد شما سپاسگزاریم!",
    feedbackError: "خطا در ارسال بازخورد.",
    blastButton: "بررسی در پایگاه داده NCBI",
    blastLoading: "در حال جستجو در NCBI (ممکن است تا ۳۰ ثانیه طول بکشد)...",
    blastResult: "نتایج BLAST",
    noHits: "هیچ هدف غیراختصاصی یافت نشد. این پرایمر کاملاً اختصاصی است!",
    offTargets: "اهداف غیراختصاصی احتمالی:",
    title_col: "توضیحات",
    evalue_col: "مقدار E-value",
    copy: "کپی",
    copied: "کپی شد!",
    pair: "جفت",
    leftPrimer: "پرایمر رفت (Forward)",
    rightPrimer: "پرایمر برگشت (Reverse)",
    tm: "دمای ذوب (Tm)",
    gc: "درصد GC",
    size: "اندازه محصول (جفت‌باز)",
  },
};

export default function Home() {
  const [lang, setLang] = useState<"en" | "fa">("en");
  const [sequence, setSequence] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [blastLoading, setBlastLoading] = useState(false);
  const [blastResult, setBlastResult] = useState<any>(null);
  const [blastError, setBlastError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const t = translations[lang];

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setFeedbackStatus(null);
    setBlastResult(null);
    setBlastError("");

    try {
      const response = await fetch("https://primer-ai.onrender.com/chat-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence, user_prompt: prompt }),
      });

      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleFeedback = async (rating: number) => {
    if (!result) return;
    setFeedbackStatus("loading");
    
    try {
      await fetch("http://localhost:5678/webhook/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primer_sequence: result.primers["PRIMER_LEFT_0_SEQUENCE"] || "N/A",
          rating: rating,
          comment: rating === 5 ? "User liked it" : "User disliked it",
        }),
      });
      setFeedbackStatus("success");
    } catch (err) {
      setFeedbackStatus("error");
    }
  };

  const handleBlast = async () => {
    if (!result?.primers?.["PRIMER_LEFT_0_SEQUENCE"]) return;
    
    setBlastLoading(true);
    setBlastError("");
    setBlastResult(null);

    try {
      const primerSeq = result.primers["PRIMER_LEFT_0_SEQUENCE"];
      const response = await fetch("https://primer-ai.onrender.com/verify-primer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primer_sequence: primerSeq }),
      });

      if (!response.ok) throw new Error("BLAST failed");
      const data = await response.json();
      setBlastResult(data);
    } catch (err) {
      setBlastError(t.error);
    } finally {
      setBlastLoading(false);
    }
  };

  return (
    <main dir={t.dir} className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans text-gray-800">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-700">{t.title}</h1>
            <p className="text-gray-500 mt-2">{t.subtitle}</p>
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "fa" : "en")}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-semibold transition"
          >
            {t.langToggle}
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block font-semibold mb-2">{t.sequenceLabel}</label>
            <textarea
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 h-24 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm dir-ltr"
              placeholder="ATGCATGCATGC..."
            />
          </div>

          <div>
            <label className="block font-semibold mb-2">{t.promptLabel}</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !sequence || !prompt}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50"
          >
            {loading ? t.loading : t.button}
          </button>
        </div>

        {error && <div className="mt-6 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

        {result && (
          <div className="mt-8 border-t pt-6">
            <h2 className="text-xl font-bold mb-4 text-green-600">{t.success}</h2>
            
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <span className="font-semibold">{t.temperature}: </span>
              <span className="font-mono text-blue-800 text-lg">
                {result.extracted_parameters?.target_temp} °C
              </span>
            </div>

            <h3 className="font-bold text-xl text-gray-700 mb-4">{t.results}</h3>
            
            {/* کارت‌های نمایش پرایمرها */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[0, 1, 2].map((i) => {
                const pair = result.primers[`PRIMER_PAIR_${i}_PENALTY`];
                const leftSeq = result.primers[`PRIMER_LEFT_${i}_SEQUENCE`];
                const rightSeq = result.primers[`PRIMER_RIGHT_${i}_SEQUENCE`];
                
                if (!leftSeq || !rightSeq) return null;

                return (
                  <div key={i} className="border rounded-xl p-5 shadow-sm bg-white hover:shadow-md transition">
                    <h4 className="font-bold text-blue-600 mb-3 border-b pb-2">{t.pair} {i + 1}</h4>
                    
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 font-semibold">{t.leftPrimer}</p>
                      <div className="flex justify-between items-center bg-gray-50 p-2 rounded mt-1 font-mono text-sm dir-ltr">
                        <span className="truncate">{leftSeq}</span>
                        <button onClick={() => handleCopy(leftSeq, `L${i}`)} className="text-blue-500 hover:text-blue-700 ml-2 text-xs">
                          {copiedIndex === `L${i}` ? t.copied : t.copy}
                        </button>
                      </div>
                      <div className="flex gap-2 text-xs text-gray-500 mt-1">
                        <span>{t.tm}: {result.primers[`PRIMER_LEFT_${i}_TM`].toFixed(1)}</span>
                        <span>{t.gc}: {result.primers[`PRIMER_LEFT_${i}_GC_PERCENT`]}</span>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-xs text-gray-500 font-semibold">{t.rightPrimer}</p>
                      <div className="flex justify-between items-center bg-gray-50 p-2 rounded mt-1 font-mono text-sm dir-ltr">
                        <span className="truncate">{rightSeq}</span>
                        <button onClick={() => handleCopy(rightSeq, `R${i}`)} className="text-blue-500 hover:text-blue-700 ml-2 text-xs">
                          {copiedIndex === `R${i}` ? t.copied : t.copy}
                        </button>
                      </div>
                      <div className="flex gap-2 text-xs text-gray-500 mt-1">
                        <span>{t.tm}: {result.primers[`PRIMER_RIGHT_${i}_TM`].toFixed(1)}</span>
                        <span>{t.gc}: {result.primers[`PRIMER_RIGHT_${i}_GC_PERCENT`]}</span>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-2 rounded text-center text-sm font-semibold text-blue-800">
                      {t.size}: {result.primers[`PRIMER_PAIR_${i}_PRODUCT_SIZE`]}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* دکمه‌های بازخورد */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center mb-6">
              <p className="font-semibold mb-4">{t.feedbackBtn}</p>
              {feedbackStatus === "success" ? (
                <p className="text-green-600 font-bold">{t.feedbackSent}</p>
              ) : feedbackStatus === "error" ? (
                <p className="text-red-600 font-bold">{t.feedbackError}</p>
              ) : (
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => handleFeedback(5)}
                    className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold transition"
                  >
                    👍 Yes
                  </button>
                  <button
                    onClick={() => handleFeedback(1)}
                    className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-bold transition"
                  >
                    👎 No
                  </button>
                </div>
              )}
            </div>

            {/* بخش BLAST */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
              <button
                onClick={handleBlast}
                disabled={blastLoading}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-lg transition disabled:opacity-50 w-full"
              >
                {blastLoading ? t.blastLoading : t.blastButton}
              </button>

              {blastError && <p className="text-red-600 mt-4">{blastError}</p>}

              {blastResult && (
                <div className="mt-6">
                  <h4 className="font-bold text-lg mb-3">{t.blastResult}</h4>
                  {blastResult.total_hits === 0 ? (
                    <div className="bg-green-100 text-green-800 p-4 rounded-lg font-semibold">
                      ✅ {t.noHits}
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold mb-2">{t.offTargets}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-200">
                              <th className="p-2 border">{t.title_col}</th>
                              <th className="p-2 border">{t.evalue_col}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {blastResult.top_hits.map((hit: any, i: number) => (
                              <tr key={i} className="bg-white">
                                <td className="p-2 border text-xs">{hit.title}</td>
                                <td className="p-2 border font-mono">{hit.e_value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}