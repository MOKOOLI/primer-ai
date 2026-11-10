"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

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
      formatLabel: "Order Format",
      formatButton: "Convert Format",
      companyLabel: "Company",
      standardMode: "Standard PCR",
      qpcrMode: "qPCR (Real-Time)",
      sangerMode: "Sanger Sequencing",
      gibsonTab: "Gibson Assembly",
      insertLabel: "Insert Sequence",
      vectorLabel: "Vector Sequence",
      overlapLabel: "Overlap Length (bp)",
      gibsonButton: "Design Gibson Primers",
      forwardPrimer: "Forward Primer",
      reversePrimer: "Reverse Primer",
      overlapSeq: "Overlap Sequence",
      tutorialTab: "Tutorial",
      crisprTab: "CRISPR gRNA",
      targetSeqLabel: "Target DNA Sequence",
      pamLabel: "PAM Sequence",
      crisprButton: "Find gRNAs",
      guideSeq: "Guide Sequence",
      pamSeq: "PAM",
      position: "Position",
      gcPercent: "GC %",
      structureTab: "Structure Prediction",
      proteinSeqLabel: "Protein Sequence (1-letter code)",
      predictButton: "Predict 3D Structure",
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
      formatLabel: "فرمت سفارش",
      formatButton: "تبدیل فرمت",
      companyLabel: "شرکت",
      standardMode: "PCR استاندارد",
      qpcrMode: "qPCR (Real-Time)",
      sangerMode: "توالی‌یابی سنگر",
      gibsonTab: "مونتاژ Gibson",
      insertLabel: "توالی قطعه (Insert)",
      vectorLabel: "توالی وکتور",
      overlapLabel: "طول همپوشانی (bp)",
      gibsonButton: "طراحی پرایمر Gibson",
      forwardPrimer: "پرایمر رفت",
      reversePrimer: "پرایمر برگشت",
      overlapSeq: "توالی همپوشان",
      tutorialTab: "آموزش",
      crisprTab: "CRISPR gRNA",
      targetSeqLabel: "توالی هدف DNA",
      pamLabel: "توالی PAM",
      crisprButton: "یافتن gRNA",
      guideSeq: "توالی راهنما",
      pamSeq: "PAM",
      position: "موقعیت",
      gcPercent: "درصد GC",
      structureTab: "پیش‌بینی ساختار",
      proteinSeqLabel: "توالی پروتئین (کد یک حرفی)",
      predictButton: "پیش‌بینی ساختار سه‌بعدی",
    },
};

export default function Home() {
    const router = useRouter();
    const [lang, setLang] = useState<"en" | "fa">("en");
    const [activeTab, setActiveTab] = useState<"primer" | "library" | "multiplex" | "toolbox" | "gibson" | "tutorial" | "crispr" | "structure">("primer");
    
    // Auth states
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Primer states
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
    const [expFeedbackStatus, setExpFeedbackStatus] = useState<string | null>(null);
    const [protocol, setProtocol] = useState<any>(null);

    // Library states
    const [myPrimers, setMyPrimers] = useState<any[]>([]);

    // Multiplex states
    const [multiplexSequences, setMultiplexSequences] = useState("");
    const [multiplexResult, setMultiplexResult] = useState<any>(null);

    // Toolbox states
    const [toolboxSeq, setToolboxSeq] = useState("");
    const [toolboxTm, setToolboxTm] = useState<number | null>(null);
    const [company, setCompany] = useState("IDT");
    const [formattedSeq, setFormattedSeq] = useState("");

    // Gibson states
    const [insertSeq, setInsertSeq] = useState("");
    const [vectorSeq, setVectorSeq] = useState("");
    const [overlapLength, setOverlapLength] = useState(20);
    const [gibsonResult, setGibsonResult] = useState<any>(null);

    // CRISPR states
    const [crisprTarget, setCrisprTarget] = useState("");
    const [pamSeq, setPamSeq] = useState("NGG");
    const [crisprResult, setCrisprResult] = useState<any>(null);

    // Structure Prediction states
    const [structureSeq, setStructureSeq] = useState("");
    const [structurePdb, setStructurePdb] = useState("");
    const [structureLoading, setStructureLoading] = useState(false);
    const viewerRef = useRef<HTMLDivElement>(null);

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

    const handleFormatOrder = async () => {
        if (!toolboxSeq) return;
        try {
            const res = await fetch("https://primer-ai.onrender.com/order-format", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sequence: toolboxSeq, company: company }),
            });
            if (res.ok) {
                const data = await res.json();
                setFormattedSeq(data.formatted);
            }
        } catch (e) { alert("Error converting format"); }
    };

    const handleGibson = async () => {
        if (!insertSeq || !vectorSeq) return;
        setLoading(true);
        try {
            const res = await fetch("https://primer-ai.onrender.com/gibson-design", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ insert_sequence: insertSeq, vector_sequence: vectorSeq, overlap_length: overlapLength }),
            });
            if (!res.ok) throw new Error("Failed");
            setGibsonResult(await res.json());
        } catch (err) { alert("Error designing Gibson primers"); } finally { setLoading(false); }
    };

    const handleCRISPR = async () => {
        if (!crisprTarget) return;
        setLoading(true);
        try {
            const res = await fetch("https://primer-ai.onrender.com/crispr-design", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sequence: crisprTarget, pam: pamSeq }),
            });
            if (!res.ok) throw new Error("Failed");
            setCrisprResult(await res.json());
        } catch (err) { alert("Error finding gRNAs"); } finally { setLoading(false); }
    };

    const handlePredictStructure = async () => {
        if (!structureSeq) return;
        setStructureLoading(true);
        try {
            const res = await fetch("https://primer-ai.onrender.com/predict-structure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sequence: structureSeq }),
            });
            if (!res.ok) throw new Error("Failed");
            const data = await res.json();
            setStructurePdb(data.pdb_data);
            
            setTimeout(() => {
                if ((window as any).$3Dmol && viewerRef.current) {
                    viewerRef.current.innerHTML = "";
                    const viewer = (window as any).$3Dmol.createViewer(viewerRef.current, { backgroundColor: "white" });
                    viewer.addModel(data.pdb_data, "pdb");
                    viewer.setStyle({}, { cartoon: { color: "spectrum" } });
                    viewer.zoomTo();
                    viewer.render();
                }
            }, 500);
        } catch (err) { alert("Error predicting structure"); } finally { setStructureLoading(false); }
    };

    const getRiskColor = (risk: string) => {
        if (risk === t.low) return "text-green-600";
        if (risk === t.medium) return "text-yellow-600";
        return "text-red-600";
    };

    return (
        <main dir={t.dir} className="min-h-screen bg-gray-50 p-6 md:p-12 font-sans text-gray-800">
            <Script src="https://3Dmol.csb.pitt.edu/build/3Dmol-min.js" strategy="lazyOnload" />
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

                <div className="flex border-b mb-6 overflow-x-auto">
                    <button onClick={() => setActiveTab("primer")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "primer" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.results}</button>
                    <button onClick={() => setActiveTab("multiplex")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "multiplex" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.multiplexTab}</button>
                    <button onClick={() => setActiveTab("toolbox")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "toolbox" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.toolboxTab}</button>
                    <button onClick={() => setActiveTab("gibson")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "gibson" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.gibsonTab}</button>
                    <button onClick={() => setActiveTab("crispr")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "crispr" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.crisprTab}</button>
                    <button onClick={() => setActiveTab("structure")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "structure" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.structureTab}</button>
                    <button onClick={() => setActiveTab("tutorial")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "tutorial" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.tutorialTab}</button>
                    <button onClick={() => setActiveTab("library")} className={`px-4 py-2 font-semibold whitespace-nowrap ${activeTab === "library" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>My Primer Library</button>
                </div>

                {activeTab === "primer" && (
                    <div className="space-y-6">
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
                                    <option value="standard">{t.standardMode}</option>
                                    <option value="qpcr">{t.qpcrMode}</option>
                                    <option value="sanger">{t.sangerMode}</option>
                                </select>
                            </div>
                        </div>
                        
                        <button onClick={handleSubmit} disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg">{loading ? t.loading : t.button}</button>

                        {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

                        {result && (
                            <div className="mt-8 border-t pt-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold text-green-600">{t.success}</h2>
                                    <button onClick={downloadSnapGene} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">{t.downloadSnapGene}</button>
                                </div>
                                
                                <div className="bg-blue-50 p-4 rounded-lg mb-6"><span className="font-semibold">{t.temperature}: </span>{result.extracted_parameters?.target_temp} °C</div>
                                
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
                                                    <div className="text-center font-bold text-blue-700 bg-blue-100 p-1 rounded">{t.annealing}: {annealTemp} °C</div>
                                                    <button onClick={() => savePrimerToLibrary(left, right, result.primers[`PRIMER_LEFT_${i}_TM`])} className="w-full mt-2 bg-green-600 text-white py-1 rounded text-sm hover:bg-green-700">
                                                        {savedStatus === "saved" ? t.saved : t.savePrimer}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="bg-gray-50 p-6 rounded-lg border mt-6">
                                    <button onClick={fetchProtocol} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold mb-4">
                                        {t.suggestProtocol}
                                    </button>
                                    {protocol && (
                                        <div className="bg-white p-4 rounded border text-sm">
                                            <h4 className="font-bold mb-2">{t.protocolTitle}</h4>
                                            <p><strong>Annealing Temp:</strong> {protocol.annealing_temp}°C</p>
                                            <p><strong>Initial Denaturation:</strong> {protocol.initial_denaturation}</p>
                                            <p><strong>Denaturation:</strong> {protocol.denaturation}</p>
                                            <p><strong>Annealing:</strong> {protocol.annealing}</p>
                                            <p><strong>Extension:</strong> {protocol.extension}</p>
                                            <p><strong>Final Extension:</strong> {protocol.final_extension}</p>
                                            {protocol.additives.length > 0 && (
                                                <div className="mt-2 text-yellow-700 bg-yellow-50 p-2 rounded">
                                                    <strong>Additives:</strong> {protocol.additives.join(" ")}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="bg-gray-50 p-6 rounded-lg border mt-6">
                                    <h4 className="font-bold mb-4">{t.gelSimulation}</h4>
                                    <div className="flex justify-center gap-4">
                                        <div className="w-12 h-48 bg-gray-200 relative">
                                            <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-400"></div>
                                            <div className="absolute top-12 left-0 right-0 h-0.5 bg-gray-400"></div>
                                            <div className="absolute top-20 left-0 right-0 h-0.5 bg-gray-400"></div>
                                            <div className="absolute top-28 left-0 right-0 h-0.5 bg-gray-400"></div>
                                            <div className="absolute top-36 left-0 right-0 h-0.5 bg-gray-400"></div>
                                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs">Ladder</span>
                                        </div>
                                        <div className="w-12 h-48 bg-gray-200 relative">
                                            <div 
                                                className="absolute left-0 right-0 h-1 bg-blue-600"
                                                style={{ top: `${Math.min(100, (result.primers["PRIMER_PAIR_0_PRODUCT_SIZE"] / 1000) * 100)}%` }}
                                            ></div>
                                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs">{result.primers["PRIMER_PAIR_0_PRODUCT_SIZE"]} bp</span>
                                        </div>
                                    </div>
                                </div>

                                {result.primers["PRIMER_PAIR_0_QPCR_WARNING"] && (
                                    <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mt-6">
                                        <p className="text-yellow-700 font-semibold">{t.qpcrWarning}: {result.primers["PRIMER_PAIR_0_QPCR_WARNING"]}</p>
                                    </div>
                                )}

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

                {activeTab === "toolbox" && (
                    <div className="space-y-6">
                        <div>
                            <label className="block font-semibold mb-2">{t.seqLabel}</label>
                            <textarea value={toolboxSeq} onChange={(e) => setToolboxSeq(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="ATGC..." />
                        </div>
                        <div className="flex gap-4 flex-wrap">
                            <button onClick={handleCalculateTm} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">{t.tmButton}</button>
                            <div className="flex items-center gap-2">
                                <label className="font-semibold text-sm">{t.companyLabel}:</label>
                                <select value={company} onChange={(e) => setCompany(e.target.value)} className="border rounded-lg p-2">
                                    <option value="IDT">IDT</option>
                                    <option value="Twist">Twist</option>
                                </select>
                                <button onClick={handleFormatOrder} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold">{t.formatButton}</button>
                            </div>
                        </div>
                        {toolboxTm !== null && (
                            <div className="bg-blue-50 p-4 rounded-lg">
                                <p className="text-lg"><strong>Tm (Nearest-Neighbor):</strong> {toolboxTm} °C</p>
                            </div>
                        )}
                        {formattedSeq && (
                            <div className="bg-green-50 p-4 rounded-lg">
                                <p className="text-lg"><strong>Formatted for {company}:</strong> {formattedSeq}</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "gibson" && (
                    <div className="space-y-6">
                        <div>
                            <label className="block font-semibold mb-2">{t.insertLabel}</label>
                            <textarea value={insertSeq} onChange={(e) => setInsertSeq(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="ATGC..." />
                        </div>
                        <div>
                            <label className="block font-semibold mb-2">{t.vectorLabel}</label>
                            <textarea value={vectorSeq} onChange={(e) => setVectorSeq(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="ATGC..." />
                        </div>
                        <div>
                            <label className="block font-semibold mb-2">{t.overlapLabel}</label>
                            <input type="number" value={overlapLength} onChange={(e) => setOverlapLength(parseInt(e.target.value))} className="w-32 border rounded-lg p-3" />
                        </div>
                        <button onClick={handleGibson} disabled={loading} className="w-full bg-purple-600 text-white font-bold py-3 rounded-lg">{loading ? t.loading : t.gibsonButton}</button>
                        
                        {gibsonResult && (
                            <div className="mt-6 bg-purple-50 p-6 rounded-lg">
                                <h3 className="font-bold text-lg mb-4 text-purple-800">Gibson Assembly Primers</h3>
                                <div className="space-y-4">
                                    <div className="bg-white p-4 rounded border">
                                        <p className="font-semibold text-blue-700">{t.forwardPrimer}</p>
                                        <p className="font-mono text-sm break-all">{gibsonResult.insert_primers.forward}</p>
                                        <p className="text-xs text-gray-500 mt-2">Overlap: {gibsonResult.insert_primers.forward_overlap}</p>
                                        <p className="text-xs text-gray-500">Tm: {gibsonResult.insert_primers.forward_tm} °C</p>
                                    </div>
                                    <div className="bg-white p-4 rounded border">
                                        <p className="font-semibold text-blue-700">{t.reversePrimer}</p>
                                        <p className="font-mono text-sm break-all">{gibsonResult.insert_primers.reverse}</p>
                                        <p className="text-xs text-gray-500 mt-2">Overlap: {gibsonResult.insert_primers.reverse_overlap}</p>
                                        <p className="text-xs text-gray-500">Tm: {gibsonResult.insert_primers.reverse_tm} °C</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "crispr" && (
                    <div className="space-y-6">
                        <div>
                            <label className="block font-semibold mb-2">{t.targetSeqLabel}</label>
                            <textarea value={crisprTarget} onChange={(e) => setCrisprTarget(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="ATGC..." />
                        </div>
                        <div>
                            <label className="block font-semibold mb-2">{t.pamLabel}</label>
                            <input type="text" value={pamSeq} onChange={(e) => setPamSeq(e.target.value)} className="w-32 border rounded-lg p-3 font-mono" placeholder="NGG" />
                        </div>
                        <button onClick={handleCRISPR} disabled={loading} className="w-full bg-red-600 text-white font-bold py-3 rounded-lg">{loading ? t.loading : t.crisprButton}</button>
                        
                        {crisprResult && (
                            <div className="mt-6">
                                <h3 className="font-bold text-lg mb-4">Top gRNAs Found: {crisprResult.total_guides}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {crisprResult.top_guides.map((guide: any, idx: number) => (
                                        <div key={idx} className="border p-4 rounded-lg bg-red-50">
                                            <p className="text-xs text-gray-500">{t.position}: {guide.start + 1}</p>
                                            <p className="font-mono text-sm break-all mt-1"><strong>{t.guideSeq}:</strong> {guide.guide} <span className="text-red-600">[{guide.pam}]</span></p>
                                            <p className="text-xs text-gray-500 mt-1">{t.gcPercent}: {guide.gc_content}%</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "structure" && (
                    <div className="space-y-6">
                        <div>
                            <label className="block font-semibold mb-2">{t.proteinSeqLabel}</label>
                            <textarea value={structureSeq} onChange={(e) => setStructureSeq(e.target.value)} className="w-full border rounded-lg p-3 h-24 font-mono text-sm" placeholder="MKTIIALSYIFCLVFADYKDDDDK..." />
                        </div>
                        <button onClick={handlePredictStructure} disabled={structureLoading} className="w-full bg-pink-600 text-white font-bold py-3 rounded-lg">
                            {structureLoading ? t.loading : t.predictButton}
                        </button>
                        
                        {structurePdb && (
                            <div className="mt-6 border rounded-lg overflow-hidden">
                                <h3 className="font-bold p-4 bg-pink-50">Predicted Structure</h3>
                                <div ref={viewerRef} className="w-full h-96 relative" />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "tutorial" && (
                    <div className="space-y-6 bg-white p-6 rounded-lg border">
                        <h2 className="text-2xl font-bold text-blue-700">📚 Primer Design Tutorial</h2>
                        <div className="prose max-w-none text-gray-700">
                            <h3 className="text-xl font-semibold mt-6 text-blue-600">1. What is a Primer?</h3>
                            <p className="mt-2">A primer is a short, single-stranded nucleic acid sequence that serves as a starting point for DNA synthesis. In a Polymerase Chain Reaction (PCR), the Forward and Reverse primers define the exact boundaries of the DNA region that will be exponentially amplified.</p>
                            
                            <h3 className="text-xl font-semibold mt-6 text-blue-600">2. Key Parameters for a Successful PCR</h3>
                            <ul className="list-disc pl-6 mt-2 space-y-2">
                                <li><strong>Tm (Melting Temperature):</strong> The temperature at which 50% of the primer binds to its complementary sequence. For a successful PCR, the Tm of the Forward and Reverse primers should be within 2-3°C of each other, ideally between 55°C and 65°C. Your annealing temperature is usually set 3-5°C below the primer Tm.</li>
                                <li><strong>GC Content:</strong> The percentage of Guanine and Cytosine bases. GC pairs have three hydrogen bonds (vs. two for AT), making them stronger. Aim for 40-60% for optimal binding and stability.</li>
                                <li><strong>Hairpin:</strong> Occurs when a primer folds onto itself due to internal complementary bases. A strong hairpin (high risk) will compete with the target DNA and prevent proper amplification.</li>
                                <li><strong>Dimer:</strong> Occurs when primers bind to each other (Primer-Dimer) or to themselves (Self-Dimer). This consumes your primers and creates unwanted by-products. Always check for strong dimers before ordering.</li>
                            </ul>

                            <h3 className="text-xl font-semibold mt-6 text-blue-600">3. Pro Tips for qPCR & Cloning</h3>
                            <ul className="list-disc pl-6 mt-2 space-y-2">
                                <li><strong>For qPCR:</strong> To prevent amplifying genomic DNA, design one of your primers to sit on an exon-exon junction (if you are using cDNA).</li>
                                <li><strong>For Cloning:</strong> If you need to add restriction sites or overlaps (e.g., for Gibson Assembly), use the <strong>Tail Sequence</strong> feature to append extra nucleotides to the 5' end of your primers.</li>
                            </ul>

                            <h3 className="text-xl font-semibold mt-6 text-blue-600">4. Ordering Your Primers</h3>
                            <p className="mt-2">Once designed, you can order your oligos from companies like IDT or Twist Bioscience. Always make sure to select the correct purification method (like Standard Desalting for PCR, or PAGE for cloning). Our <strong>Primer Toolbox</strong> automatically formats your sequences for IDT, so you can copy and paste them directly!</p>
                        </div>
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