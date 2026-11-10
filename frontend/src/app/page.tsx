"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
      logout: "Logout",
      deleteAccount: "Delete Account",
      suggestProtocol: "Suggest PCR Protocol",
      protocolTitle: "Recommended Protocol",
      gelSimulation: "In Silico Gel Electrophoresis",
      qpcrWarning: "qPCR Warning",
      toolboxTab: "Primer Toolbox",
      tmLabel: "Calculate Tm",
      tmButton: "Calculate Tm",
      seqLabel: "Primer Sequence",
      formatLabel: "Format",
      formatButton: "Convert Format",
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
      logout: "خروج",
      deleteAccount: "حذف حساب",
      suggestProtocol: "پیشنهاد پروتکل PCR",
      protocolTitle: "پروتکل پیشنهادی",
      gelSimulation: "شبیه‌سازی ژل آگارز",
      qpcrWarning: "هشدار qPCR",
      toolboxTab: "کیت ابزار پرایمر",
      tmLabel: "محاسبه Tm",
      tmButton: "محاسبه Tm",
      seqLabel: "توالی پرایمر",
      formatLabel: "فرمت",
      formatButton: "تبدیل فرمت",
    },
};

export default function Home() {
    const router = useRouter();
    const [lang, setLang] = useState<"en" | "fa">("en");
    const [activeTab, setActiveTab] = useState<"primer" | "library" | "multiplex" | "toolbox">("primer");
    
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

    const [multiplexSequences, setMultiplexSequences] = useState("");
    const [multiplexResult, setMultiplexResult] = useState<any>(null);

    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const [protocol, setProtocol] = useState<any>(null);
    const [showGeneMap, setShowGeneMap] = useState(false);

    // Toolbox states
    const [toolboxSeq, setToolboxSeq] = useState("");
    const [toolboxTm, setToolboxTm] = useState<number | null>(null);

    const t = translations[lang];

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
        } else {
            setIsAuthenticated(true);
        }
    }, [router]);

    const fetchMyPrimers = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch("https://primer-ai.onrender.com/my-primers", { headers: { "Authorization": `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setMyPrimers(data.primers); }
        } catch (e) { console.error(e); }
    };

    useEffect(() => { 
        if (activeTab === "library") fetchMyPrimers(); 
    }, [activeTab]);

    if (!isAuthenticated) return null;

    const handleLogout = () => {
        localStorage.removeItem("token");
        router.push("/login");
    };

    const handleDeleteAccount = async () => {
        if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
            const token = localStorage.getItem("token");
            try {
                const res = await fetch("https://primer-ai.onrender.com/delete-account", {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${token}` },
                });
                if (res.ok) {
                    localStorage.removeItem("token");
                    router.push("/login");
                } else {
                    alert("Failed to delete account.");
                }
            } catch (e) {
                alert("Error deleting account.");
            }
        }
    };

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
                body: JSON.stringify({ sequence, user_prompt: prompt, tail_sequence: tailSequence, mutation: mutation, mode: mode, degenerate: degenerate }),
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

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(id);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const downloadSnapGene = () => {
        if (!result?.primers) return;
        let content = "LOCUS       Primer_Design\n";
        for (let i = 0; i < 3; i++) {
            const left = result.primers[`PRIMER_LEFT_${i}_SEQUENCE_WITH_TAIL`] || result.primers[`PRIMER_LEFT_${i}_SEQUENCE`];
            const right = result.primers[`PRIMER_RIGHT_${i}_SEQUENCE_WITH_TAIL`] || result.primers[`PRIMER_RIGHT_${i}_SEQUENCE`];
            if (left && right) {
                content += `ORIGIN\n        1 ${left} ${right}\n//\n`;
            }
        }
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "primers.dna";
        a.click();
    };

    const savePrimerToLibrary = async (left: string, right: string, tm: number) => {
        const token = localStorage.getItem("token");
        if (!token) { alert("Please login first."); return; }
        try {
            const res = await fetch("https://primer-ai.onrender.com/save-primer", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ name: `Primer_${Date.now()}`, left_seq: left, right_seq: right, tm: tm }),
            });
            if (res.ok) { setSavedStatus("saved"); setTimeout(() => setSavedStatus(null), 2000); }
        } catch (e) { console.error(e); }
    };

    const handleMultiplex = async () => {
        const sequences = multiplexSequences.split("\n").filter(s => s.trim() !== "");
        if (sequences.length === 0) return;
        setLoading(true);
        try {
            const res = await fetch("https://primer-ai.onrender.com/multiplex-design", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sequences, user_prompt: prompt, mode: mode }),
            });
            if (!res.ok) throw new Error("Failed");
            setMultiplexResult(await res.json());
        } catch (err) { alert("Error designing multiplex"); } finally { setLoading(false); }
    };

    const fetchProtocol = async () => {
        if (!result) return;
        const annealTemp = result.primers["PRIMER_PAIR_0_ANNEAL_TEMP"];
        const gcContent = result.primers["PRIMER_LEFT_0_GC_PERCENT"];
        try {
            const res = await fetch(`https://primer-ai.onrender.com/suggest-protocol?anneal_temp=${annealTemp}&gc_content=${gcContent}`, { method: "POST" });
            if (res.ok) setProtocol((await res.json()).protocol);
        } catch (e) { alert("Error fetching protocol"); }
    };

    const handleCalculateTm = async () => {
        if (!toolboxSeq) return;
        try {
            const res = await fetch("https://primer-ai.onrender.com/calculate-tm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sequence: toolboxSeq, method: "nearest_neighbor" }),
            });
            if (res.ok) {
                const data = await res.json();
                setToolboxTm(data.tm);
            }
        } catch (e) { alert("Error calculating Tm"); }
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
                    <div className="flex items-center gap-4">
                        <a href="/pricing" className="text-blue-600 font-semibold hover:underline">{t.pricingLink}</a>
                        <a href="/privacy" className="text-gray-500 hover:underline">{t.privacyLink}</a>
                        <button onClick={() => setLang(lang === "en" ? "fa" : "en")} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">{t.langToggle}</button>
                        <button onClick={handleLogout} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold">{t.logout}</button>
                        <button onClick={handleDeleteAccount} className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg font-semibold">{t.deleteAccount}</button>
                    </div>
                </div>

                <div className="flex border-b mb-6">
                    <button onClick={() => setActiveTab("primer")} className={`px-4 py-2 font-semibold ${activeTab === "primer" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.results}</button>
                    <button onClick={() => setActiveTab("multiplex")} className={`px-4 py-2 font-semibold ${activeTab === "multiplex" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.multiplexTab}</button>
                    <button onClick={() => setActiveTab("toolbox")} className={`px-4 py-2 font-semibold ${activeTab === "toolbox" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.toolboxTab}</button>
                    <button onClick={() => setActiveTab("library")} className={`px-4 py-2 font-semibold ${activeTab === "library" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>My Primer Library</button>
                </div>

                {activeTab === "primer" && (
                    <div className="space-y-6">
                        {/* ... (فرم طراحی و نتایج، دقیقاً مثل قبل) ... */}
                    </div>
                )}

                {activeTab === "toolbox" && (
                    <div className="space-y-6">
                        <div>
                            <label className="block font-semibold mb-2">{t.seqLabel}</label>
                            <textarea value={toolboxSeq} onChange={(e) => setToolboxSeq(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="ATGC..." />
                        </div>
                        <div className="flex gap-4">
                            <button onClick={handleCalculateTm} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">{t.tmButton}</button>
                        </div>
                        {toolboxTm !== null && (
                            <div className="bg-blue-50 p-4 rounded-lg">
                                <p className="text-lg"><strong>Tm (Nearest-Neighbor):</strong> {toolboxTm} °C</p>
                            </div>
                        )}
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

                {activeTab === "library" && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold mb-4">My Saved Primers</h2>
                        {myPrimers.length === 0 ? <p>No primers saved yet.</p> : myPrimers.map((p, idx) => (
                            <div key={idx} className="border p-4 rounded-lg flex justify-between items-center bg-gray-50">
                                <div>
                                    <p className="font-bold">{p.name}</p>
                                    <p className="font-mono text-sm">{p.left_seq} / {p.right_seq}</p>
                                </div>
                                <span className="text-sm text-gray-500">Tm: {p.tm.toFixed(1)}</span>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </main>
    );
}