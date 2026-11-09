"use client";

import { useState, useEffect } from "react";

const translations = {
    en: {
      title: "AI Primer Designer",
      subtitle: "Design PCR primers using natural language and AI.",
      geneSearchLabel: "Search by Gene Name (e.g., BRCA1)",
      searchBtn: "Fetch Sequence",
      sequenceLabel: "DNA Sequence",
      promptLabel: "What do you want? (e.g., Set temperature to 65 degrees)",
      tailLabel: "Tail Sequence (Optional)",
      mutationLabel: "Site-Directed Mutation (Optional)",
      button: "Design Primer",
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
      copy: "Copy",
      copied: "Copied!",
      pair: "Pair",
      leftPrimer: "Forward Primer",
      rightPrimer: "Reverse Primer",
      probe: "Probe",
      tm: "Tm (°C)",
      size: "Product Size (bp)",
      hairpin: "Hairpin",
      dimer: "Dimer",
      low: "Low",
      medium: "Med",
      high: "High",
      downloadSnapGene: "Download SnapGene",
      savePrimer: "Save to Library",
      saved: "Saved!",
      expFeedbackLabel: "Did this primer work in your experiment?",
      expSuccess: "✅ Success",
      expFailed: "❌ Failed",
      expDimer: "⚠️ Dimer/Off-target",
    },
    fa: {
      title: "طراحی هوشمند پرایمر",
      subtitle: "طراحی پرایمر PCR با استفاده از زبان طبیعی.",
      geneSearchLabel: "جستجو با نام ژن (مثلاً BRCA1)",
      searchBtn: "دریافت توالی",
      sequenceLabel: "توالی DNA",
      promptLabel: "چه می‌خواهید؟ (مثلاً: دما را روی ۶۵ تنظیم کن)",
      tailLabel: "دنباله اضافه (اختیاری)",
      mutationLabel: "موتاسیون هدفمند (اختیاری)",
      button: "طراحی پرایمر",
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
      copy: "کپی",
      copied: "کپی شد!",
      pair: "جفت",
      leftPrimer: "پرایمر رفت",
      rightPrimer: "پرایمر برگشت",
      probe: "پروب",
      tm: "دمای ذوب",
      size: "اندازه محصول",
      hairpin: "ساختار سنجاقی",
      dimer: "دایمر",
      low: "کم",
      medium: "متوسط",
      high: "زیاد",
      downloadSnapGene: "دانلود SnapGene",
      savePrimer: "ذخیره در کتابخانه",
      saved: "ذخیره شد!",
      expFeedbackLabel: "آیا این پرایمر در آزمایشگاه شما کار کرد؟",
      expSuccess: "✅ موفق",
      expFailed: "❌ ناموفق",
      expDimer: "⚠️ دایمر/غیراختصاصی",
    },
};

export default function Home() {
    const [lang, setLang] = useState<"en" | "fa">("en");
    const [activeTab, setActiveTab] = useState<"primer" | "library">("primer");
    
    // State for Gene Search
    const [geneName, setGeneName] = useState("");
    const [geneLoading, setGeneLoading] = useState(false);

    const [sequence, setSequence] = useState("");
    const [prompt, setPrompt] = useState("");
    const [tailSequence, setTailSequence] = useState("");
    const [mutation, setMutation] = useState("");
    const [mode, setMode] = useState<"standard" | "qpcr" | "sanger">("standard");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState("");
    
    const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
    const [savedStatus, setSavedStatus] = useState<string | null>(null);
    
    const [myPrimers, setMyPrimers] = useState<any[]>([]);
    const [expFeedbackStatus, setExpFeedbackStatus] = useState<string | null>(null);

    const t = translations[lang];

    const fetchMyPrimers = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch("https://primer-ai.onrender.com/my-primers", { headers: { "Authorization": `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setMyPrimers(data.primers); }
        } catch (e) { console.error(e); }
    };

    useEffect(() => { if (activeTab === "library") fetchMyPrimers(); }, [activeTab]);

    const handleGeneSearch = async () => {
        if (!geneName) return;
        setGeneLoading(true); setSequence("");
        try {
            const res = await fetch(`https://primer-ai.onrender.com/fetch-gene?gene_name=${geneName}`, { method: "POST" });
            if (!res.ok) throw new Error("Gene not found");
            const data = await res.json();
            setSequence(data.sequence);
        } catch (err) { alert("Gene not found. Please try another name (e.g., BRCA1)."); } finally { setGeneLoading(false); }
    };

    const handleSubmit = async () => {
        setLoading(true); setError(""); setResult(null); setSavedStatus(null);
        try {
            const response = await fetch(`https://primer-ai.onrender.com/chat-design`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sequence, user_prompt: prompt, tail_sequence: tailSequence, mutation: mutation, mode: mode }),
            });
            if (!response.ok) throw new Error("Failed");
            setResult(await response.json());
        } catch (err) { setError(t.error); } finally { setLoading(false); }
    };

    const handleExpFeedback = async (resultType: string) => {
        if (!result) return;
        const pairSeq = `${result.primers["PRIMER_LEFT_0_SEQUENCE"]} / ${result.primers["PRIMER_RIGHT_0_SEQUENCE"]}`;
        try {
            await fetch("https://primer-ai.onrender.com/experimental-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ primer_pair: pairSeq, result: resultType }),
            });
            setExpFeedbackStatus("success");
        } catch (e) { setExpFeedbackStatus("error"); }
    };

    // ... (بقیه توابع copy, downloadSnapGene, savePrimerToLibrary, getRiskColor) ...

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
                    <button onClick={() => setActiveTab("primer")} className={`px-4 py-2 font-semibold ${activeTab === "primer" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.results}</button>
                    <button onClick={() => setActiveTab("library")} className={`px-4 py-2 font-semibold ${activeTab === "library" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>My Primer Library</button>
                </div>

                {activeTab === "primer" && (
                    <div className="space-y-6">
                        {/* Gene Search Section */}
                        <div className="bg-blue-50 p-4 rounded-lg flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block font-semibold mb-2">{t.geneSearchLabel}</label>
                                <input type="text" value={geneName} onChange={(e) => setGeneName(e.target.value)} className="w-full border rounded-lg p-2" placeholder="BRCA1" />
                            </div>
                            <button onClick={handleGeneSearch} disabled={geneLoading} className="bg-blue-600 text-white px-4 py-2 rounded-lg h-10">
                                {geneLoading ? "..." : t.searchBtn}
                            </button>
                        </div>

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
                                <input type="text" value={tailSequence} onChange={(e) => setTailSequence(e.target.value)} className="w-full border rounded-lg p-3 font-mono" placeholder="GAATTC" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block font-semibold mb-2">{t.mutationLabel}</label>
                                <input type="text" value={mutation} onChange={(e) => setMutation(e.target.value)} className="w-full border rounded-lg p-3 font-mono" placeholder="A120G" />
                            </div>
                            <div className="md:col-span-2">
                                <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-full border rounded-lg p-3 font-semibold bg-white">
                                    <option value="standard">Standard PCR</option>
                                    <option value="qpcr">qPCR (Real-Time)</option>
                                    <option value="sanger">Sanger Sequencing</option>
                                </select>
                            </div>
                        </div>
                        
                        <button onClick={handleSubmit} disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg">{loading ? t.loading : t.button}</button>

                        {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

                        {result && (
                            <div className="mt-8 border-t pt-6">
                                {/* ... (نمایش نتایج پرایمرها، دقیقاً مثل فاز 1) ... */}
                                
                                {/* Experimental Feedback Section */}
                                <div className="bg-purple-50 p-6 rounded-lg border border-purple-200 mt-6 text-center">
                                    <p className="font-semibold mb-4 text-purple-800">{t.expFeedbackLabel}</p>
                                    {expFeedbackStatus === "success" ? <p className="text-green-600 font-bold">Thank you! Your feedback helps improve AI.</p> : 
                                    <div className="flex justify-center gap-4">
                                        <button onClick={() => handleExpFeedback("success")} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold">{t.expSuccess}</button>
                                        <button onClick={() => handleExpFeedback("failed")} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-bold">{t.expFailed}</button>
                                        <button onClick={() => handleExpFeedback("dimer")} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-bold">{t.expDimer}</button>
                                    </div>}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ... (تب Library، دقیقاً مثل فاز 1) ... */}

            </div>
        </main>
    );
}