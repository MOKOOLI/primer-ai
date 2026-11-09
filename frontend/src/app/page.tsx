"use client";

import { useState, useEffect } from "react";

const translations = {
  en: {
    title: "AI Primer Designer",
    subtitle: "Design PCR primers using natural language and AI.",
    sequenceLabel: "DNA Sequence",
    promptLabel: "What do you want? (e.g., Set temperature to 65 degrees)",
    tailLabel: "Tail Sequence (Optional)",
    mutationLabel: "Site-Directed Mutation (Optional)",
    sangerLabel: "Optimize for Sanger Sequencing (Larger Product)",
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
    downloadSnapGene: "Download SnapGene (.dna)",
    savePrimer: "Save to Library",
    saved: "Saved!",
  },
  fa: {
    title: "طراحی هوشمند پرایمر",
    subtitle: "طراحی پرایمر PCR با استفاده از زبان طبیعی.",
    sequenceLabel: "توالی DNA",
    promptLabel: "چه می‌خواهید؟ (مثلاً: دما را روی ۶۵ تنظیم کن)",
    tailLabel: "دنباله اضافه (اختیاری)",
    mutationLabel: "موتاسیون هدفمند (اختیاری)",
    sangerLabel: "بهینه‌سازی برای سنگر (محصول بزرگتر)",
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
  },
};

export default function Home() {
  const [lang, setLang] = useState<"en" | "fa">("en");
  const [activeTab, setActiveTab] = useState<"primer" | "library">("primer");
  
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
          <button onClick={() => setActiveTab("primer")} className={`px-4 py-2 font-semibold ${activeTab === "primer" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>{t.results}</button>
          <button onClick={() => setActiveTab("library")} className={`px-4 py-2 font-semibold ${activeTab === "library" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>My Primer Library</button>
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
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-green-600">{t.success}</h2>
                    <div className="flex gap-2">
                        <button onClick={downloadSnapGene} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">{t.downloadSnapGene}</button>
                    </div>
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