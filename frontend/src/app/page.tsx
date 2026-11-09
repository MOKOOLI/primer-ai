"use client";

import { useState } from "react";

const translations = {
  en: {
    title: "AI Primer Designer",
    subtitle: "Design PCR primers using natural language and AI.",
    sequenceLabel: "DNA Sequence",
    promptLabel: "What do you want? (e.g., Set temperature to 65 degrees)",
    tailLabel: "Tail Sequence (for Cloning - Optional)",
    tailPlaceholder: "e.g., GAATTC",
    mutationLabel: "Site-Directed Mutation (Optional)",
    mutationPlaceholder: "e.g., A120G",
    button: "Design Primer",
    qpcrButton: "Design qPCR",
    loading: "Analyzing...",
    results: "Best Primer Pairs",
    temperature: "Detected Temperature",
    annealing: "Suggested Annealing Temp",
    success: "Primer designed successfully!",
    error: "An error occurred.",
    langToggle: "فارسی",
    dir: "ltr",
    feedbackBtn: "Was this result helpful?",
    feedbackSent: "Thank you for your feedback!",
    blastButton: "Check against NCBI Database",
    blastLoading: "Searching NCBI...",
    blastResult: "NCBI BLAST Results",
    noHits: "No off-targets found. Primer is specific!",
    offTargets: "Off-Targets:",
    title_col: "Description",
    evalue_col: "E-value",
    copy: "Copy",
    copied: "Copied!",
    pair: "Pair",
    leftPrimer: "Forward Primer",
    rightPrimer: "Reverse Primer",
    probe: "Probe",
    tm: "Tm (°C)",
    gc: "GC (%)",
    size: "Product Size (bp)",
    hairpin: "Hairpin",
    dimer: "Dimer",
    low: "Low",
    medium: "Med",
    high: "High",
    seqVerifyTab: "Sequence Verification",
    primerDesignTab: "Primer Design",
    uploadFasta: "Upload FASTA File",
    referenceSeq: "Reference Sequence",
    analyze: "Analyze Sequence",
    identity: "Identity Percentage",
    alignScore: "Alignment Score",
    downloadFasta: "Download FASTA",
  },
  fa: {
    title: "طراحی هوشمند پرایمر",
    subtitle: "طراحی پرایمر PCR با استفاده از زبان طبیعی و هوش مصنوعی.",
    sequenceLabel: "توالی DNA",
    promptLabel: "چه می‌خواهید؟ (مثلاً: دما را روی ۶۵ تنظیم کن)",
    tailLabel: "دنباله اضافه (برای کلونینگ - اختیاری)",
    tailPlaceholder: "مثلاً: GAATTC",
    mutationLabel: "موتاسیون هدفمند (اختیاری)",
    mutationPlaceholder: "مثلاً: A120G",
    button: "طراحی پرایمر",
    qpcrButton: "طراحی qPCR",
    loading: "در حال تحلیل...",
    results: "بهترین جفت‌های پرایمر",
    temperature: "دمای تشخیص داده شده",
    annealing: "دمای اتصال پیشنهادی",
    success: "پرایمر با موفقیت طراحی شد!",
    error: "خطایی رخ داد.",
    langToggle: "English",
    dir: "rtl",
    feedbackBtn: "آیا این نتیجه مفید بود؟",
    feedbackSent: "از بازخورد شما سپاسگزاریم!",
    blastButton: "بررسی در NCBI",
    blastLoading: "در حال جستجو در NCBI...",
    blastResult: "نتایج BLAST",
    noHits: "هیچ هدف غیراختصاصی یافت نشد. پرایمر اختصاصی است!",
    offTargets: "اهداف غیراختصاصی:",
    title_col: "توضیحات",
    evalue_col: "مقدار E",
    copy: "کپی",
    copied: "کپی شد!",
    pair: "جفت",
    leftPrimer: "پرایمر رفت",
    rightPrimer: "پرایمر برگشت",
    probe: "پروب",
    tm: "دمای ذوب",
    gc: "درصد GC",
    size: "اندازه محصول",
    hairpin: "ساختار سنجاقی",
    dimer: "دایمر",
    low: "کم",
    medium: "متوسط",
    high: "زیاد",
    seqVerifyTab: "تایید توالی",
    primerDesignTab: "طراحی پرایمر",
    uploadFasta: "آپلود فایل FASTA",
    referenceSeq: "توالی مرجع",
    analyze: "تحلیل توالی",
    identity: "درصد شباهت",
    alignScore: "امتیاز هم‌ترازی",
    downloadFasta: "دانلود FASTA",
  },
};

export default function Home() {
  const [lang, setLang] = useState<"en" | "fa">("en");
  const [activeTab, setActiveTab] = useState<"primer" | "verify">("primer");
  
  const [sequence, setSequence] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tailSequence, setTailSequence] = useState("");
  const [mutation, setMutation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [isQpcr, setIsQpcr] = useState(false);
  
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [blastLoading, setBlastLoading] = useState(false);
  const [blastResult, setBlastResult] = useState<any>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const t = translations[lang];

  const handleSubmit = async (qpcrMode: boolean) => {
    setLoading(true); setError(""); setResult(null); setBlastResult(null);
    setIsQpcr(qpcrMode);
    try {
      const endpoint = qpcrMode ? "design-qpcr" : "chat-design";
      const response = await fetch(`https://primer-ai.onrender.com/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence, user_prompt: prompt, tail_sequence: tailSequence, mutation: mutation }),
      });
      if (!response.ok) throw new Error("Failed");
      setResult(await response.json());
    } catch (err) { setError(t.error); } finally { setLoading(false); }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const downloadFasta = () => {
    if (!result?.primers) return;
    let content = "";
    for (let i = 0; i < 3; i++) {
      const left = result.primers[`PRIMER_LEFT_${i}_SEQUENCE_WITH_TAIL`] || result.primers[`PRIMER_LEFT_${i}_SEQUENCE`];
      const right = result.primers[`PRIMER_RIGHT_${i}_SEQUENCE_WITH_TAIL`] || result.primers[`PRIMER_RIGHT_${i}_SEQUENCE`];
      if (left && right) {
        content += `>Pair_${i+1}_Forward\n${left}\n>Pair_${i+1}_Reverse\n${right}\n`;
        if (result.primers[`PRIMER_INTERNAL_${i}_SEQUENCE`]) {
            content += `>Pair_${i+1}_Probe\n${result.primers[`PRIMER_INTERNAL_${i}_SEQUENCE`]}\n`;
        }
      }
    }
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "primers.fasta";
    a.click();
  };

  const handleVerify = async () => {
    if (!file || !reference) return;
    setVerifyLoading(true); setVerifyResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("reference", reference);
    try {
      const response = await fetch("https://primer-ai.onrender.com/analyze-sequence", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Failed");
      setVerifyResult(await response.json());
    } catch (err) { alert("Error analyzing sequence"); } finally { setVerifyLoading(false); }
  };

  const getRiskColor = (risk: string) => {
    if (risk === t.low) return "text-green-600";
    if (risk === t.medium) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <main dir={t.dir} className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans text-gray-800">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-700">{t.title}</h1>
            <p className="text-gray-500 mt-2">{t.subtitle}</p>
          </div>
          <button onClick={() => setLang(lang === "en" ? "fa" : "en")} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">{t.langToggle}</button>
        </div>

        <div className="flex border-b mb-6">
          <button onClick={() => setActiveTab("primer")} className={`px-4 py-2 font-semibold ${activeTab === "primer" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.primerDesignTab}</button>
          <button onClick={() => setActiveTab("verify")} className={`px-4 py-2 font-semibold ${activeTab === "verify" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.seqVerifyTab}</button>
        </div>

        {activeTab === "primer" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block font-semibold mb-2">{t.sequenceLabel}</label>
                    <textarea value={sequence} onChange={(e) => setSequence(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="ATGC..." />
                </div>
                <div>
                    <label className="block font-semibold mb-2">{t.promptLabel}</label>
                    <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full border rounded-lg p-3" />
                </div>
                <div>
                    <label className="block font-semibold mb-2">{t.tailLabel}</label>
                    <input type="text" value={tailSequence} onChange={(e) => setTailSequence(e.target.value)} className="w-full border rounded-lg p-3 font-mono" placeholder={t.tailPlaceholder} />
                </div>
                <div className="md:col-span-2">
                    <label className="block font-semibold mb-2">{t.mutationLabel}</label>
                    <input type="text" value={mutation} onChange={(e) => setMutation(e.target.value)} className="w-full border rounded-lg p-3 font-mono" placeholder={t.mutationPlaceholder} />
                </div>
            </div>
            
            <div className="flex gap-4">
              <button onClick={() => handleSubmit(false)} disabled={loading} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg">{loading && !isQpcr ? t.loading : t.button}</button>
              <button onClick={() => handleSubmit(true)} disabled={loading} className="flex-1 bg-teal-600 text-white font-bold py-3 rounded-lg">{loading && isQpcr ? t.loading : t.qpcrButton}</button>
            </div>

            {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

            {result && (
              <div className="mt-8 border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-green-600">{t.success}</h2>
                    <button onClick={downloadFasta} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                        {t.downloadFasta}
                    </button>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                    <span className="font-semibold">{t.temperature}: </span>{result.extracted_parameters?.target_temp} °C
                    {result.extracted_parameters?.mutation_applied && <span className="ml-4 text-red-600 font-bold">Mutation Applied!</span>}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {[0, 1, 2].map((i) => {
                    const left = result.primers[`PRIMER_LEFT_${i}_SEQUENCE`];
                    const right = result.primers[`PRIMER_RIGHT_${i}_SEQUENCE`];
                    const probe = result.primers[`PRIMER_INTERNAL_${i}_SEQUENCE`];
                    if (!left || !right) return null;
                    
                    const leftToShow = result.primers[`PRIMER_LEFT_${i}_SEQUENCE_WITH_TAIL`] || left;
                    const rightToShow = result.primers[`PRIMER_RIGHT_${i}_SEQUENCE_WITH_TAIL`] || right;
                    
                    const hairpinL = result.primers[`PRIMER_LEFT_${i}_HAIRPIN_RISK`];
                    const hairpinR = result.primers[`PRIMER_RIGHT_${i}_HAIRPIN_RISK`];
                    const dimer = result.primers[`PRIMER_PAIR_${i}_DIMER_RISK`];
                    const annealTemp = result.primers[`PRIMER_PAIR_${i}_ANNEAL_TEMP`];

                    return (
                      <div key={i} className="border rounded-xl p-5 bg-white shadow-sm flex flex-col gap-3">
                        <h4 className="font-bold text-blue-600 border-b pb-2">{t.pair} {i + 1}</h4>
                        
                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1">{t.leftPrimer}</p>
                          <div className="bg-gray-50 p-2 rounded font-mono text-sm flex justify-between items-center">
                            <span className="break-all">{leftToShow}</span>
                            <button onClick={() => handleCopy(leftToShow, `L${i}`)} className="text-blue-500 text-xs ml-2 shrink-0">{copiedIndex === `L${i}` ? t.copied : t.copy}</button>
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span>{t.tm}: {result.primers[`PRIMER_LEFT_${i}_TM`].toFixed(1)}</span>
                            <span className={`font-bold ${getRiskColor(hairpinL)}`}>{t.hairpin}: {hairpinL}</span>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 font-semibold mb-1">{t.rightPrimer}</p>
                          <div className="bg-gray-50 p-2 rounded font-mono text-sm flex justify-between items-center">
                            <span className="break-all">{rightToShow}</span>
                            <button onClick={() => handleCopy(rightToShow, `R${i}`)} className="text-blue-500 text-xs ml-2 shrink-0">{copiedIndex === `R${i}` ? t.copied : t.copy}</button>
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span>{t.tm}: {result.primers[`PRIMER_RIGHT_${i}_TM`].toFixed(1)}</span>
                            <span className={`font-bold ${getRiskColor(hairpinR)}`}>{t.hairpin}: {hairpinR}</span>
                          </div>
                        </div>

                        {probe && (
                            <div>
                                <p className="text-xs text-purple-600 font-semibold mb-1">{t.probe}</p>
                                <div className="bg-purple-50 p-2 rounded font-mono text-sm flex justify-between items-center">
                                    <span className="break-all">{probe}</span>
                                    <button onClick={() => handleCopy(probe, `P${i}`)} className="text-purple-500 text-xs ml-2 shrink-0">{copiedIndex === `P${i}` ? t.copied : t.copy}</button>
                                </div>
                            </div>
                        )}

                        <div className="bg-gray-100 p-2 rounded mt-auto space-y-1">
                            <div className="flex justify-between text-sm font-semibold">
                                <span>{t.size}: {result.primers[`PRIMER_PAIR_${i}_PRODUCT_SIZE`]}</span>
                                <span className={`${getRiskColor(dimer)}`}>{t.dimer}: {dimer}</span>
                            </div>
                            <div className="text-center font-bold text-blue-700 bg-blue-100 p-1 rounded">
                                {t.annealing}: {annealTemp} °C
                            </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="bg-gray-50 p-6 rounded-lg border text-center mb-6">
                  <p className="font-semibold mb-4">{t.feedbackBtn}</p>
                  {feedbackStatus === "success" ? <p className="text-green-600 font-bold">{t.feedbackSent}</p> : 
                   <div className="flex justify-center gap-4">
                       <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold">👍 Yes</button>
                       <button className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-bold">👎 No</button>
                   </div>}
                </div>

                <div className="bg-gray-50 p-6 rounded-lg border">
                  <button className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-lg w-full">
                    {t.blastButton}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "verify" && (
          <div className="space-y-6">
            <div>
              <label className="block font-semibold mb-2">{t.uploadFasta}</label>
              <input type="file" accept=".fasta,.fa,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border rounded-lg p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-2">{t.referenceSeq}</label>
              <textarea value={reference} onChange={(e) => setReference(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="ATGC..." />
            </div>
            <button onClick={handleVerify} disabled={verifyLoading || !file || !reference} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg">
                {verifyLoading ? t.loading : t.analyze}
            </button>
            
            {verifyResult && (
              <div className="mt-6 bg-green-50 p-6 rounded-lg border border-green-200">
                <h3 className="font-bold text-lg mb-4 text-green-700">Analysis Result</h3>
                <p><strong>{t.identity}:</strong> {verifyResult.identity_percentage}%</p>
                <p><strong>{t.alignScore}:</strong> {verifyResult.alignment_score}</p>
                <p><strong>Length:</strong> {verifyResult.sequence_length} bp</p>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}