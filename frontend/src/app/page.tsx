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
      sangerLabel: "Optimize for Sanger Sequencing",
      degenerateLabel: "Allow Degenerate Primers",
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
      multiplexTab: "Multiplex PCR",
      sequencesLabel: "Enter sequences (one per line)",
      designMultiplex: "Design Multiplex",
      pricingLink: "Pricing",
      privacyLink: "Privacy",
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
      sangerLabel: "بهینه‌سازی برای سنگر",
      degenerateLabel: "اجازه پرایمرهای دژنره",
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
      multiplexTab: "PCR چندگانه",
      sequencesLabel: "توالی‌ها را وارد کنید (هر خط یک توالی)",
      designMultiplex: "طراحی چندگانه",
      pricingLink: "تعرفه‌ها",
      privacyLink: "حریم خصوصی",
    },
};

export default function Home() {
    const [lang, setLang] = useState<"en" | "fa">("en");
    const [activeTab, setActiveTab] = useState<"primer" | "library" | "multiplex">("primer");
    
    // State for Gene Search
    const [geneName, setGeneName] = useState("");
    const [geneLoading, setGeneLoading] = useState(false);

    const [sequence, setSequence] = useState("");
    const [prompt, setPrompt] = useState("");
    const [tailSequence, setTailSequence] = useState("");
    const [mutation, setMutation] = useState("");
    const [mode, setMode] = useState<"standard" | "qpcr" | "sanger">("standard");
    const [degenerate, setDegenerate] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState("");
    
    const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
    const [savedStatus, setSavedStatus] = useState<string | null>(null);
    
    const [myPrimers, setMyPrimers] = useState<any[]>([]);
    const [expFeedbackStatus, setExpFeedbackStatus] = useState<string | null>(null);

    // Multiplex states
    const [multiplexSequences, setMultiplexSequences] = useState("");
    const [multiplexResult, setMultiplexResult] = useState<any>(null);

    const t = translations[lang];

    // ... (توابع fetchMyPrimers, handleGeneSearch, handleSubmit, handleExpFeedback, handleCopy, downloadSnapGene, savePrimerToLibrary, handleMultiplex)

    return (
        <main dir={t.dir} className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans text-gray-800">
            <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-8">
                
                {/* Header with Links */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-blue-700">{t.title}</h1>
                        <p className="text-gray-500 mt-2">{t.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="/pricing" className="text-blue-600 font-semibold hover:underline">{t.pricingLink}</a>
                        <a href="/privacy" className="text-gray-500 hover:underline">{t.privacyLink}</a>
                        <button onClick={() => setLang(lang === "en" ? "fa" : "en")} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">{t.langToggle}</button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b mb-6">
                    <button onClick={() => setActiveTab("primer")} className={`px-4 py-2 font-semibold ${activeTab === "primer" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.results}</button>
                    <button onClick={() => setActiveTab("multiplex")} className={`px-4 py-2 font-semibold ${activeTab === "multiplex" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.multiplexTab}</button>
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
                            <div className="md:col-span-2 flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="degenerate" checked={degenerate} onChange={(e) => setDegenerate(e.target.checked)} className="w-4 h-4" />
                                    <label htmlFor="degenerate" className="font-semibold text-sm">{t.degenerateLabel}</label>
                                </div>
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

                        {/* ... (نمایش نتایج پرایمرها و بخش بازخورد تجربی) ... */}
                    </div>
                )}

                {activeTab === "multiplex" && (
                    <div className="space-y-6">
                        <div>
                            <label className="block font-semibold mb-2">{t.sequencesLabel}</label>
                            <textarea value={multiplexSequences} onChange={(e) => setMultiplexSequences(e.target.value)} className="w-full border rounded-lg p-3 h-48 font-mono text-sm" placeholder="ATGC...\nATGC...\nATGC..." />
                        </div>
                        <button onClick={handleMultiplex} disabled={loading} className="w-full bg-teal-600 text-white font-bold py-3 rounded-lg">{loading ? t.loading : t.designMultiplex}</button>
                        
                        {multiplexResult && (
                            <div className="mt-6">
                                <h3 className="font-bold text-lg mb-4">Multiplex Results</h3>
                                {multiplexResult.results.map((res: any, idx: number) => (
                                    <div key={idx} className="border p-4 rounded-lg mb-4 bg-gray-50">
                                        <h4 className="font-bold text-blue-700">Sequence {idx + 1}</h4>
                                        {res.PRIMER_LEFT_0_SEQUENCE ? (
                                            <p className="font-mono text-sm">F: {res.PRIMER_LEFT_0_SEQUENCE} | R: {res.PRIMER_RIGHT_0_SEQUENCE}</p>
                                        ) : (
                                            <p className="text-red-500">No primers designed for this sequence.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ... (تب Library) ... */}
            </div>
        </main>
    );
}