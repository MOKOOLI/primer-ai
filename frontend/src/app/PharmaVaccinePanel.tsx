"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = { call: (path: string, init?: RequestInit) => Promise<any>; lang?: string };
type Kind = "ctl" | "htl" | "bc";

const QUICK_I = ["HLA-A*01:01", "HLA-A*02:01", "HLA-A*03:01", "HLA-A*24:02", "HLA-B*07:02"];
const REF_I = ["HLA-A*01:01", "HLA-A*02:01", "HLA-A*02:03", "HLA-A*02:06", "HLA-A*03:01", "HLA-A*11:01", "HLA-A*23:01", "HLA-A*24:02",
  "HLA-A*26:01", "HLA-A*30:01", "HLA-A*30:02", "HLA-A*31:01", "HLA-A*32:01", "HLA-A*33:01", "HLA-A*68:01", "HLA-A*68:02",
  "HLA-B*07:02", "HLA-B*08:01", "HLA-B*15:01", "HLA-B*35:01", "HLA-B*40:01", "HLA-B*44:02", "HLA-B*44:03", "HLA-B*51:01",
  "HLA-B*53:01", "HLA-B*57:01", "HLA-B*58:01"];
const QUICK_II = ["HLA-DRB1*03:01", "HLA-DRB1*07:01", "HLA-DRB1*15:01"];
const REF_II = ["HLA-DRB1*03:01", "HLA-DRB1*07:01", "HLA-DRB1*15:01", "HLA-DRB3*01:01", "HLA-DRB3*02:02", "HLA-DRB4*01:01", "HLA-DRB5*01:01"];
const RS09 = "APPHALS";

const T = {
  en: {
    kicker: "Immunoinformatics · research use only", title: "Epitope-based vaccine design workspace",
    intro: "A guided, source-linked workflow. Predictions come from named tools and keep their provenance. They are hypotheses to test in the lab, not evidence of protection or safety.",
    steps: ["Fundamentals", "Target & sequence", "B-cell epitopes", "T-cell epitopes", "Population coverage", "Multi-epitope design", "Construct evaluation", "Structure", "Docking", "Report"],
    run: "Run", running: "Running…", add: "Add", remove: "Remove", copy: "Copy", copied: "Copied", load: "Load", use: "Use",
    acc: "UniProt accession (e.g. P0DTC2)", or: "or paste a sequence / FASTA", from: "From", to: "To", residues: "residues",
    noSignal: "Remove signal peptide", features: "UniProt annotation", retrieved: "Retrieved", source: "Source",
    method: "Method", cutoff: "Percentile-rank cutoff (lower = stronger)", panel: "Allele panel", quick: "Quick (common alleles)", ref: "IEDB reference panel",
    lens: "Peptide lengths", peptide: "Peptide", alleles: "Alleles", best: "Best rank", pos: "Position", score: "Mean score",
    none: "No results under the current settings.", needSeq: "Load or paste a target sequence in step 2 first.",
    selected: "Selected epitopes", ctl: "CTL (MHC-I)", htl: "HTL (MHC-II)", bc: "B-cell",
    adjuvant: "Adjuvant sequence (optional)", adjHint: "Paste the mature adjuvant sequence from its source record. RS09 is a published TLR4-agonist peptide; confirm it in the original paper.",
    his: "Add C-terminal His-tag", assemble: "Assemble construct", construct: "Construct", layout: "Layout",
    evalTitle: "Physicochemical profile (computed here)", prop: "Property", value: "Value",
    ext: "Not computed here: use the original tools and record the results", extNote: "These tools have no stable public API for automatic calls, so Primer AI does not invent scores. Enter what you obtained; it is labeled as user-entered in the report.",
    antigen: "Antigenicity (e.g. VaxiJen)", allergen: "Allergenicity (e.g. AllerTOP)", toxin: "Toxicity (e.g. ToxinPred)", solub: "Solubility (e.g. Protein-Sol)",
    report: "Download report (Markdown)", reportHint: "Includes inputs, parameters, sources, retrieval times and limitations.",
    planned: "Planned", notWired: "Not wired up yet",
    s5: "Population coverage needs allele-frequency data per population. It is not enabled until it can be computed from a verified source.",
    s8: "Use the experimental 3D structure viewer above for PDB entries. Automated structure prediction and validation (pLDDT, Ramachandran) for constructs is the next module.",
    s9: "The docking panel above runs AutoDock Vina for small molecules. Vaccine-to-receptor (for example TLR) docking is protein-protein docking: use a dedicated server such as HADDOCK or ClusPro, then analyze the result here in a later module.",
    covTitle: "Selected epitopes and their restricting alleles", covNeed: "Run step 4 and add CTL/HTL epitopes to the selection first.",
    covIedb: "Input for the IEDB Population Coverage tool (epitope, tab, alleles)", covOpen: "Open IEDB Population Coverage",
    covLocal: "Local projection from your own allele frequencies",
    covFreqHelp: "One allele per line: allele, frequency as a fraction (0 to 1), e.g. HLA-A*02:01, 0.25. Use a cited dataset such as Allele Frequency Net, and write alleles exactly as in the epitope table.",
    covRun: "Compute coverage", covC1: "Class I", covC2: "Class II", covAll: "Combined", covMissing: "Alleles without a frequency", popName: "Population (for the report)",
    pred: "Predict structure with ESMFold", consent: "I agree to send this sequence to the ESM Metagenomic Atlas (external service).",
    tooLong: "ESMFold in this workspace accepts 20 to 400 residues. Predict with an external tool (for example AlphaFold Server or ColabFold) and load the PDB below.",
    pdbLoad: "Load a PDB file or paste PDB text", isPlddt: "B-factor column holds pLDDT (AlphaFold / ESMFold)", runQc: "Analyze structure", dlPdb: "Download PDB",
    qcTitle: "Model quality", mean: "Mean pLDDT", rama: "Ramachandran (approximate)", fav: "Favored", allow: "Allowed", outl: "Outliers", outList: "Outlier residues", needCons: "Build a construct in step 6 first.",
    dockInfo: "Vaccine-to-receptor docking is protein-protein docking. Run it on a dedicated server, then load the docked complex here to analyze the interface.",
    recs: "Receptor entries often used (verify each one in the 3D viewer above)", servers: "Docking servers (check the links)",
    srvNote: "Read each server's terms and data policy before uploading unpublished constructs.",
    cplx: "Docked complex (PDB)", chA: "Vaccine chain(s)", chB: "Receptor chain(s)", cut: "Contact cutoff (Å)", runIf: "Analyze interface",
    ifTitle: "Interface summary", pairs: "Residue pairs in contact", ifA: "Interface residues (vaccine)", ifB: "Interface residues (receptor)", polar: "Polar-contact candidates", salt: "Salt-bridge candidates",
    err: "Request failed", disclaimer: "Research and teaching use only. Not for clinical, dosing or safety decisions.",
    learn: [
      ["Why epitope-based vaccines", "Instead of a whole pathogen or protein, the vaccine presents short regions (epitopes) that immune cells recognize. This can focus the response and avoid unwanted regions, but each epitope must still be shown to be immunogenic."],
      ["Three kinds of epitopes", "CTL epitopes (8–11 aa) bind MHC class I and activate CD8+ T cells. HTL epitopes (about 15 aa) bind MHC class II and help CD4+ T cells. B-cell epitopes are recognized by antibodies; linear ones are predicted from sequence, conformational ones need structure."],
      ["Why many HLA alleles", "HLA genes are highly polymorphic, so an epitope that binds one allele may not bind another. Using several alleles, and later population coverage, tests how broadly a design could work."],
      ["Adjuvants and linkers", "Adjuvants such as TLR agonists boost the response. Linkers (EAAAK, AAY, GPGPG, KK) keep epitopes separate and help processing. Their choice should be justified in the methods."],
      ["What predictions cannot do", "Binding scores are not immunogenicity, and computed properties are not safety. Antigenicity, allergenicity and toxicity checks, then experiments, are needed before any claim."],
    ],
  },
  fa: {
    kicker: "ایمونوانفورماتیک · فقط پژوهشی", title: "میز کار طراحی واکسن مبتنی بر اپی‌توپ",
    intro: "یک مسیر گام‌به‌گام با منبع مشخص. پیش‌بینی‌ها از ابزارهای نام‌برده می‌آیند و منبعشان کنارشان می‌ماند. این‌ها فرضیه برای آزمایش‌اند، نه شاهدی بر محافظت یا ایمنی.",
    steps: ["مبانی", "هدف و توالی", "اپی‌توپ B-cell", "اپی‌توپ T-cell", "پوشش جمعیتی", "طراحی چنداپی‌توپی", "ارزیابی سازه", "ساختار", "داکینگ", "گزارش"],
    run: "اجرا", running: "در حال اجرا…", add: "افزودن", remove: "حذف", copy: "کپی", copied: "کپی شد", load: "بارگذاری", use: "استفاده",
    acc: "شناسه UniProt (مثلاً P0DTC2)", or: "یا توالی / FASTA را بچسبانید", from: "از", to: "تا", residues: "اسیدآمینه",
    noSignal: "حذف پپتید سیگنال", features: "حاشیه‌نویسی UniProt", retrieved: "زمان دریافت", source: "منبع",
    method: "روش", cutoff: "آستانه percentile rank (کمتر = قوی‌تر)", panel: "پنل آلل", quick: "سریع (آلل‌های رایج)", ref: "پنل مرجع IEDB",
    lens: "طول پپتید", peptide: "پپتید", alleles: "آلل‌ها", best: "بهترین رتبه", pos: "موقعیت", score: "میانگین امتیاز",
    none: "با تنظیمات فعلی نتیجه‌ای نیست.", needSeq: "ابتدا در مرحله ۲ توالی هدف را بارگذاری یا وارد کنید.",
    selected: "اپی‌توپ‌های انتخاب‌شده", ctl: "CTL (MHC-I)", htl: "HTL (MHC-II)", bc: "B-cell",
    adjuvant: "توالی ادجوانت (اختیاری)", adjHint: "توالی بالغ ادجوانت را از رکورد منبعش بچسبانید. RS09 یک پپتید منتشرشدهٔ آگونیست TLR4 است؛ در مقاله اصلی راستی‌آزمایی کنید.",
    his: "افزودن His-tag در انتهای C", assemble: "ساخت سازه", construct: "سازه", layout: "چیدمان",
    evalTitle: "مشخصات فیزیکوشیمیایی (محاسبه همین‌جا)", prop: "ویژگی", value: "مقدار",
    ext: "اینجا محاسبه نمی‌شود: از ابزار اصلی استفاده و نتیجه را ثبت کنید", extNote: "این ابزارها API عمومی پایدار برای فراخوانی خودکار ندارند، پس Primer AI امتیاز نمی‌سازد. نتیجه‌ای که گرفتید را وارد کنید؛ در گزارش با برچسب «واردشده توسط کاربر» می‌آید.",
    antigen: "آنتی‌ژنیسیته (مثل VaxiJen)", allergen: "آلرژنیسیته (مثل AllerTOP)", toxin: "سمیت (مثل ToxinPred)", solub: "حلالیت (مثل Protein-Sol)",
    report: "دانلود گزارش (Markdown)", reportHint: "شامل ورودی‌ها، پارامترها، منابع، زمان دریافت و محدودیت‌هاست.",
    planned: "در برنامه", notWired: "هنوز متصل نشده",
    s5: "پوشش جمعیتی به داده فراوانی آلل در هر جمعیت نیاز دارد. تا وقتی از منبع تأییدشده قابل محاسبه نشود فعال نمی‌شود.",
    s8: "برای ورودی‌های PDB از نمایشگر ساختار تجربی بالا استفاده کنید. پیش‌بینی و اعتبارسنجی خودکار ساختار سازه (pLDDT، Ramachandran) ماژول بعدی است.",
    s9: "پنل داکینگ بالا AutoDock Vina را برای مولکول‌های کوچک اجرا می‌کند. داکینگ واکسن به گیرنده (مثلاً TLR) از نوع پروتئین-پروتئین است: از سرور اختصاصی مثل HADDOCK یا ClusPro استفاده کنید و تحلیل نتیجه را در ماژول بعدی اینجا انجام دهید.",
    covTitle: "اپی‌توپ‌های انتخاب‌شده و آلل‌های مربوط", covNeed: "ابتدا مرحله ۴ را اجرا و اپی‌توپ‌های CTL/HTL را به انتخاب اضافه کنید.",
    covIedb: "ورودی ابزار IEDB Population Coverage (اپی‌توپ، تب، آلل‌ها)", covOpen: "باز کردن IEDB Population Coverage",
    covLocal: "برآورد محلی از فراوانی آلل‌هایی که خودتان می‌دهید",
    covFreqHelp: "در هر خط یک آلل: آلل، فراوانی به‌صورت کسر (۰ تا ۱)، مثل HLA-A*02:01, 0.25. از مجموعه‌داده ارجاع‌پذیر مثل Allele Frequency Net استفاده کنید و نام آلل‌ها را دقیقاً مثل جدول اپی‌توپ بنویسید.",
    covRun: "محاسبه پوشش", covC1: "کلاس I", covC2: "کلاس II", covAll: "ترکیبی", covMissing: "آلل‌های بدون فراوانی", popName: "جمعیت (برای گزارش)",
    pred: "پیش‌بینی ساختار با ESMFold", consent: "موافقم این توالی به ESM Metagenomic Atlas (سرویس بیرونی) ارسال شود.",
    tooLong: "ESMFold در این میز کار ۲۰ تا ۴۰۰ اسیدآمینه می‌پذیرد. با ابزار بیرونی (مثل AlphaFold Server یا ColabFold) پیش‌بینی کنید و PDB را پایین بارگذاری کنید.",
    pdbLoad: "فایل PDB را بارگذاری یا متن آن را بچسبانید", isPlddt: "ستون B-factor همان pLDDT است (AlphaFold / ESMFold)", runQc: "تحلیل ساختار", dlPdb: "دانلود PDB",
    qcTitle: "کیفیت مدل", mean: "میانگین pLDDT", rama: "راماچاندران (تقریبی)", fav: "مطلوب", allow: "مجاز", outl: "خارج از ناحیه", outList: "باقیمانده‌های خارج از ناحیه", needCons: "ابتدا در مرحله ۶ سازه را بسازید.",
    dockInfo: "داکینگ واکسن به گیرنده از نوع پروتئین-پروتئین است. آن را روی سرور اختصاصی اجرا کنید، سپس مجموعهٔ داک‌شده را اینجا بارگذاری کنید تا سطح تماس تحلیل شود.",
    recs: "ورودی‌های گیرنده که زیاد استفاده می‌شوند (هرکدام را در نمایشگر سه‌بعدی بالا راستی‌آزمایی کنید)", servers: "سرورهای داکینگ (لینک‌ها را بررسی کنید)",
    srvNote: "پیش از بارگذاری سازه‌های منتشرنشده، شرایط و سیاست داده هر سرور را بخوانید.",
    cplx: "مجموعه داک‌شده (PDB)", chA: "زنجیره(های) واکسن", chB: "زنجیره(های) گیرنده", cut: "آستانه تماس (Å)", runIf: "تحلیل سطح تماس",
    ifTitle: "خلاصه سطح تماس", pairs: "جفت باقیمانده‌های در تماس", ifA: "باقیمانده‌های سطح تماس (واکسن)", ifB: "باقیمانده‌های سطح تماس (گیرنده)", polar: "کاندیدای تماس قطبی", salt: "کاندیدای پل نمکی",
    err: "درخواست ناموفق بود", disclaimer: "فقط برای پژوهش و آموزش؛ نه برای تصمیم بالینی، دوز یا ایمنی.",
    learn: [
      ["چرا واکسن مبتنی بر اپی‌توپ", "به‌جای کل پاتوژن یا پروتئین، نواحی کوتاهی (اپی‌توپ) عرضه می‌شود که سلول‌های ایمنی می‌شناسند. این کار پاسخ را متمرکز می‌کند و از نواحی نامطلوب پرهیز می‌دهد، ولی ایمنی‌زایی هر اپی‌توپ باید جداگانه نشان داده شود."],
      ["سه نوع اپی‌توپ", "اپی‌توپ‌های CTL (۸ تا ۱۱ اسیدآمینه) به MHC کلاس I متصل می‌شوند و سلول‌های CD8+ را فعال می‌کنند. اپی‌توپ‌های HTL (حدود ۱۵ اسیدآمینه) به MHC کلاس II متصل می‌شوند و به CD4+ کمک می‌کنند. اپی‌توپ‌های B-cell را آنتی‌بادی می‌شناسد؛ نوع خطی از توالی و نوع ساختاری از ساختار سه‌بعدی پیش‌بینی می‌شود."],
      ["چرا چند آلل HLA", "ژن‌های HLA چندشکلی بالایی دارند و اپی‌توپی که به یک آلل متصل می‌شود ممکن است به آلل دیگر متصل نشود. استفاده از چند آلل و بعداً پوشش جمعیتی نشان می‌دهد طراحی چقدر گسترده کار می‌کند."],
      ["ادجوانت و لینکر", "ادجوانت‌هایی مثل آگونیست‌های TLR پاسخ را تقویت می‌کنند. لینکرها (EAAAK، AAY، GPGPG، KK) اپی‌توپ‌ها را جدا نگه می‌دارند و به پردازش کمک می‌کنند. انتخابشان باید در روش‌ها توجیه شود."],
      ["محدودیت پیش‌بینی‌ها", "امتیاز اتصال برابر ایمنی‌زایی نیست و ویژگی‌های محاسبه‌شده برابر ایمنی نیست. پیش از هر ادعا باید آنتی‌ژنیسیته، آلرژنیسیته و سمیت و سپس آزمایش تجربی بررسی شود."],
    ],
  },
} as const;

const card = "rounded-xl border border-slate-600 bg-[#172743] p-4";
const btn = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed";
const btnP = `${btn} bg-emerald-300 text-slate-950 hover:bg-emerald-200`;
const btnG = `${btn} border border-slate-500 text-slate-100 hover:bg-slate-700`;
const field = "w-full rounded-lg border border-slate-500 bg-[#0c182a] px-3 py-2 text-white placeholder:text-slate-400";
const EXT = [
  ["antigen", "http://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html", "VaxiJen"],
  ["allergen", "https://www.ddg-pharmfac.net/AllerTOP/", "AllerTOP"],
  ["toxin", "https://webs.iiitd.edu.in/raghava/toxinpred/", "ToxinPred"],
  ["solub", "https://protein-sol.manchester.ac.uk/", "Protein-Sol"],
] as const;
const KIND_COLOR: Record<string, string> = { adjuvant: "text-amber-300", CTL: "text-emerald-300", HTL: "text-sky-300", "B-cell": "text-fuchsia-300", linker: "text-slate-400", tag: "text-slate-200" };

const plddtColor = (v: number) => (v > 90 ? "#0053d6" : v > 70 ? "#65cbf3" : v > 50 ? "#ffdb13" : "#ff7d45");

function Mol({ pdb, scale }: { pdb: string; scale: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [fail, setFail] = useState(false);
  useEffect(() => { if ((window as any).$3Dmol) setReady(true); }, []);
  useEffect(() => {
    const lib = (window as any).$3Dmol;
    if (!ready || !pdb || !box.current || !lib) return;
    let v: any;
    try {
      box.current.innerHTML = "";
      v = lib.createViewer(box.current, { backgroundColor: "#101c30" });
      v.addModel(pdb, "pdb");
      v.setStyle({}, { cartoon: scale ? { colorfunc: (a: any) => plddtColor(a.b * scale) } : { color: "spectrum" } });
      v.zoomTo(); v.render();
    } catch { setFail(true); }
    return () => { try { v?.clear(); } catch { /* ignore */ } };
  }, [pdb, ready, scale]);
  return <div className="space-y-1">
    <Script src="https://3dmol.org/build/3Dmol-min.js" strategy="afterInteractive" onReady={() => setReady(true)} />
    <div ref={box} className="relative h-[340px] w-full overflow-hidden rounded-xl border border-slate-600 bg-[#101c30]" />
    {fail && <p role="alert" className="text-sm text-amber-200">3D viewer unavailable in this browser.</p>}
    {scale && <p className="text-xs text-slate-300" dir="ltr">pLDDT: <span style={{ color: "#0053d6" }}>&gt;90</span> · <span style={{ color: "#65cbf3" }}>70–90</span> · <span style={{ color: "#ffdb13" }}>50–70</span> · <span style={{ color: "#ff7d45" }}>≤50</span></p>}
  </div>;
}

const RECEPTORS = [["TLR4 / MD-2", "3FXI"], ["TLR2 / TLR1", "2Z7X"], ["TLR3", "2A0Z"]];
const SERVERS = [["HDOCK", "http://hdock.phys.hust.edu.cn/"], ["ClusPro", "https://cluspro.org/"], ["HADDOCK", "https://wenmr.science.uu.nl/haddock2.4/"]];
const parseFreq = (txt: string) => {
  const o: Record<string, number> = {};
  for (const ln of txt.split(/\r?\n/)) {
    const m = ln.trim().match(/^(\S+?)[\s,;]+([0-9]*\.?[0-9]+(?:e-?\d+)?)$/i);
    if (m) o[m[1]] = parseFloat(m[2]);
  }
  return o;
};
const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

export default function PharmaVaccinePanel({ call, lang }: Props) {
  const fa = lang === "fa";
  const t = T[fa ? "fa" : "en"];
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [acc, setAcc] = useState("");
  const [protein, setProtein] = useState<any>(null);
  const [rawSeq, setRawSeq] = useState("");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(0);
  const [bMethod, setBMethod] = useState("Bepipred");
  const [bRes, setBRes] = useState<any>(null);
  const [mhc, setMhc] = useState<"I" | "II">("I");
  const [panel, setPanel] = useState<"quick" | "ref">("quick");
  const [cutoff, setCutoff] = useState(1);
  const [lens, setLens] = useState("9");
  const [tRes, setTRes] = useState<Record<string, any>>({});
  const [sel, setSel] = useState<Record<Kind, string[]>>({ ctl: [], htl: [], bc: [] });
  const [adj, setAdj] = useState("");
  const [adjLabel, setAdjLabel] = useState("Adjuvant");
  const [his, setHis] = useState(true);
  const [cons, setCons] = useState<any>(null);
  const [ext, setExt] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [freqText, setFreqText] = useState("");
  const [popName, setPopName] = useState("");
  const [cov, setCov] = useState<any>(null);
  const [consent, setConsent] = useState(false);
  const [pdb, setPdb] = useState("");
  const [isPl, setIsPl] = useState(true);
  const [qc, setQc] = useState<any>(null);
  const [cplx, setCplx] = useState("");
  const [chA, setChA] = useState("A");
  const [chB, setChB] = useState("B");
  const [cut, setCut] = useState(5);
  const [iface, setIface] = useState<any>(null);

  const fullSeq = protein?.sequence || rawSeq.replace(/^>.*$/gm, "").replace(/[\s\d*-]/g, "").toUpperCase();
  const seqLen = fullSeq.length;
  const hi = to > 0 && to <= seqLen ? to : seqLen;
  const work = fullSeq.slice(Math.max(from, 1) - 1, hi);

  const post = async (key: string, path: string, body: any, ok: (r: any) => void) => {
    setBusy(key); setErr("");
    try { ok(await call(path, { method: "POST", body: JSON.stringify(body) })); }
    catch (e: any) { setErr(`${t.err}: ${String(e?.message || e)}`); }
    finally { setBusy(""); }
  };

  const loadProtein = async () => {
    setBusy("prot"); setErr("");
    try {
      const r = await call(`/pharma/vaccine/protein?accession=${encodeURIComponent(acc.trim())}`);
      setProtein(r); setFrom(1); setTo(r.length); setBRes(null); setTRes({});
    } catch (e: any) { setErr(`${t.err}: ${String(e?.message || e)}`); }
    finally { setBusy(""); }
  };
  const dropSignal = () => {
    const s = protein?.features?.find((f: any) => f.type === "Signal");
    if (s) setFrom(s.end + 1);
  };
  const addSel = (k: Kind, p: string) => setSel((s) => (s[k].includes(p) ? s : { ...s, [k]: [...s[k], p] }));
  const delSel = (k: Kind, p: string) => setSel((s) => ({ ...s, [k]: s[k].filter((x) => x !== p) }));

  const runT = () => {
    const alleles = mhc === "I" ? (panel === "quick" ? QUICK_I : REF_I) : (panel === "quick" ? QUICK_II : REF_II);
    const lengths = lens.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
    void post("t" + mhc, "/pharma/vaccine/tcell", { sequence: work, mhc_class: mhc, alleles, lengths: mhc === "I" ? lengths : [15], method: "recommended", percentile_cutoff: cutoff },
      (r) => setTRes((o) => ({ ...o, [mhc]: r })));
  };
  const assemble = () => void post("asm", "/pharma/vaccine/assemble",
    { adjuvant: adj, adjuvant_label: adjLabel, ctl: sel.ctl, htl: sel.htl, bcell: sel.bc, his_tag: his }, setCons);

  const covRows = useMemo(() => {
    const rows: any[] = [];
    for (const [k, c] of [["ctl", "I"], ["htl", "II"]] as const)
      for (const p of sel[k]) { const hit = tRes[c]?.peptides?.find((x: any) => x.peptide === p); if (hit) rows.push({ peptide: p, mhc_class: c, alleles: hit.alleles }); }
    return rows;
  }, [sel, tRes]);
  const iedbText = covRows.map((r) => `${r.peptide}\t${r.alleles.join(",")}`).join("\n");
  const runCov = () => void post("cov", "/pharma/vaccine/coverage", { epitopes: covRows, frequencies: parseFreq(freqText) }, setCov);
  const runQc = (text = pdb, pl = isPl) => post("qc", "/pharma/vaccine/structure-qc", { pdb: text, bfactor_is_plddt: pl }, setQc);
  const predict = async () => {
    setBusy("pred"); setErr(""); setQc(null);
    try {
      const r = await call("/predict-structure", { method: "POST", body: JSON.stringify({ sequence: cons.sequence, consent_external: true }) });
      setPdb(r.pdb_data); setIsPl(true); await runQc(r.pdb_data, true);
    } catch (e: any) { setErr(`${t.err}: ${String(e?.message || e)}`); }
    finally { setBusy(""); }
  };
  const readFile = (f: File | undefined, set: (x: string) => void) => {
    if (!f) return;
    if (f.size > 3_000_000) { setErr(`${t.err}: file > 3 MB`); return; }
    void f.text().then(set);
  };
  const runIf = () => void post("if", "/pharma/vaccine/interface", { pdb: cplx, chains_a: chA.split(/[\s,]+/).filter(Boolean), chains_b: chB.split(/[\s,]+/).filter(Boolean), cutoff: cut }, setIface);
  const saveTxt = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };

  const report = useMemo(() => {
    const L: string[] = [`# Vaccine design report (Primer AI)`, "", `Generated: ${new Date().toISOString()}`, `> ${T.en.disclaimer} All predictions are hypotheses.`, ""];
    if (fullSeq) {
      L.push("## Target", protein ? `- ${protein.name} (${protein.accession}), ${protein.organism}; source ${protein.source_url}; retrieved ${protein.retrieved_at}` : "- Sequence supplied by user",
        `- Region used for prediction: residues ${Math.max(from, 1)}-${hi} (${work.length} aa)`, "");
    }
    if (bRes) L.push("## B-cell (linear)", `- IEDB Analysis Resource, method ${bRes.method}, retrieved ${bRes.provenance.retrieved_at}`, ...bRes.segments.map((s: any) => `  - ${s.start}-${s.end} ${s.peptide}`), "");
    for (const c of ["I", "II"]) {
      const r = tRes[c];
      if (r) L.push(`## T-cell MHC-${c}`, `- IEDB Analysis Resource, method ${r.method}, percentile-rank cutoff ${r.cutoff}, ${r.alleles.length} alleles, retrieved ${r.provenance.retrieved_at}`,
        ...r.peptides.slice(0, 30).map((p: any) => `  - ${p.peptide} (${p.n_alleles} alleles, best rank ${p.best_rank})`), "");
    }
    if (cons) {
      const p = cons.profile;
      L.push("## Construct", `- Layout: ${cons.layout}`, `- Length ${cons.length} aa`, "```", cons.sequence, "```",
        "### Computed properties", `- MW ${p.molecular_weight_kda} kDa; pI ${p.theoretical_pi}; instability index ${p.instability_index} (${p.instability_class}); aliphatic index ${p.aliphatic_index}; GRAVY ${p.gravy}`,
        `- Method: ${p.methods}`, `- Limits: ${p.limits}`, "");
    }
    if (cov) L.push("## Population coverage (local projection)", `- Population: ${popName || "not named"}`, `- Class I ${pct(cov.coverage_class_i)}; Class II ${pct(cov.coverage_class_ii)}; combined ${pct(cov.coverage_combined)}`,
      `- Method: ${cov.method}`, `- Limits: ${cov.limits}`, ...(cov.alleles_without_frequency.length ? [`- Alleles without frequency: ${cov.alleles_without_frequency.join(", ")}`] : []), "");
    if (qc) L.push("## Structure model quality",
      ...(qc.plddt ? [`- Mean pLDDT ${qc.plddt.mean} (>90: ${qc.plddt.very_high_gt90}%, 70-90: ${qc.plddt.confident_70_90}%, 50-70: ${qc.plddt.low_50_70}%, <=50: ${qc.plddt.very_low_le50}%)`] : []),
      `- Ramachandran (approximate): favored ${qc.ramachandran.favored_pct ?? "n/a"}%, allowed ${qc.ramachandran.allowed_pct ?? "n/a"}%, outliers ${qc.ramachandran.outlier_pct ?? "n/a"}% of ${qc.ramachandran.evaluated} residues`,
      `- ${qc.limits}`, "");
    if (iface) L.push("## Docked-complex interface (geometry only)", `- Residue pairs in contact: ${iface.residue_pairs_in_contact}; interface residues ${iface.n_interface_a} (vaccine) / ${iface.n_interface_b} (receptor)`,
      `- Polar-contact candidates: ${iface.n_polar_contacts}; salt-bridge candidates: ${iface.salt_bridge_candidates.length}`, `- Method: ${iface.method}`, `- Limits: ${iface.limits}`, "");
    const e = Object.entries(ext).filter(([, v]) => v.trim());
    if (e.length) L.push("## Results entered by the user (not computed by Primer AI)", ...e.map(([k, v]) => `- ${k}: ${v}`), "");
    L.push("## Limitations", "- Binding and epitope predictions are not proof of immunogenicity.", "- Antigenicity, allergenicity, toxicity and docking scores were not computed by this tool; population coverage and interface values are projections or geometry only.", "- Experimental validation is required.");
    return L.join("\n");
  }, [fullSeq, protein, from, hi, work, bRes, tRes, cons, ext, cov, popName, qc, iface]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "vaccine-design-report.md"; a.click(); URL.revokeObjectURL(url);
  };
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };

  const PepTable = ({ rows, kinds }: { rows: any[]; kinds: Kind[] }) => rows.length === 0 ? <p className="text-sm text-slate-300">{t.none}</p> :
    <div className="overflow-x-auto rounded-lg border border-slate-600"><table className="w-full text-start text-sm">
      <thead className="bg-[#0c182a] text-slate-300"><tr>
        <th className="px-3 py-2 text-start">{t.peptide}</th><th className="px-3 py-2 text-start">{t.pos}</th>
        <th className="px-3 py-2 text-start">{rows[0].alleles ? t.alleles : t.score}</th>{rows[0].alleles && <th className="px-3 py-2 text-start">{t.best}</th>}<th className="px-3 py-2" /></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.peptide + r.start} className="border-t border-slate-700">
        <td className="px-3 py-2 font-mono" dir="ltr">{r.peptide}</td><td className="px-3 py-2" dir="ltr">{r.start}–{r.end}</td>
        <td className="px-3 py-2" dir="ltr">{r.alleles ? `${r.n_alleles}` : r.mean_score ?? "—"}</td>{r.alleles && <td className="px-3 py-2" dir="ltr">{r.best_rank ?? "—"}</td>}
        <td className="px-3 py-2"><div className="flex gap-1.5">{kinds.map((k) => <button key={k} type="button" className={btnG} onClick={() => addSel(k, r.peptide)}>{t.add} {t[k]}</button>)}</div></td></tr>)}</tbody></table></div>;

  const needSeq = !work || work.length < 9;

  return <section id="pharma-vaccine" aria-labelledby="pharma-vaccine-title" className="space-y-4 rounded-2xl border border-slate-600 bg-[#111c34] p-4 text-slate-100">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{t.kicker}</p>
      <h3 id="pharma-vaccine-title" className="mt-1 text-xl font-bold">{t.title}</h3>
      <p className="mt-1 text-sm text-slate-300">{t.intro}</p>
    </div>
    <nav aria-label={t.title} className="flex flex-wrap gap-1.5">
      {t.steps.map((s, i) => <button key={s} type="button" onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}
        className={`rounded-full border px-3 py-1 text-xs font-semibold ${step === i ? "border-emerald-300 bg-emerald-300 text-slate-950" : "border-slate-500 text-slate-200 hover:bg-slate-700"}`}>{String(i + 1).padStart(2, "0")} · {s}</button>)}
    </nav>
    {err && <p role="alert" className="text-sm text-amber-200">{err}</p>}

    {step === 0 && <div className="grid gap-3 md:grid-cols-2">{t.learn.map(([h, b]) => <div key={h} className={card}><h4 className="font-bold text-emerald-200">{h}</h4><p className="mt-1 text-sm leading-relaxed text-slate-200">{b}</p></div>)}</div>}

    {step === 1 && <div className="space-y-3">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void loadProtein(); }}>
        <label htmlFor="vx-acc" className="sr-only">{t.acc}</label>
        <input id="vx-acc" dir="ltr" className={`${field} min-w-48 flex-1`} placeholder={t.acc} value={acc} onChange={(e) => setAcc(e.target.value.toUpperCase())} maxLength={10} />
        <button type="submit" className={btnP} disabled={busy === "prot" || acc.trim().length < 6}>{busy === "prot" ? t.running : t.load}</button>
      </form>
      <label htmlFor="vx-raw" className="block text-sm text-slate-300">{t.or}</label>
      <textarea id="vx-raw" dir="ltr" rows={4} className={`${field} font-mono text-xs`} value={protein ? "" : rawSeq} disabled={!!protein}
        onChange={(e) => { setRawSeq(e.target.value); setFrom(1); setTo(0); }} placeholder=">protein&#10;MKTAYIAK…" />
      {protein && <div className={`${card} space-y-1 text-sm`}>
        <p className="font-bold">{protein.name || protein.accession} <span className="font-normal text-slate-300">· {protein.gene} · {protein.organism}</span></p>
        <p><a href={protein.source_url} target="_blank" rel="noreferrer" className="text-emerald-200 underline">UniProt {protein.accession} ↗</a> · {protein.reviewed ? "Swiss-Prot" : "TrEMBL"} · {t.retrieved} {protein.retrieved_at?.slice(0, 19)}</p>
        {protein.features?.length > 0 && <p className="text-slate-300">{t.features}: {protein.features.filter((f: any) => f.type !== "Chain").slice(0, 12).map((f: any) => `${f.type} ${f.start}–${f.end}`).join(" · ")}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {protein.features?.some((f: any) => f.type === "Signal") && <button type="button" className={btnG} onClick={dropSignal}>{t.noSignal}</button>}
          <button type="button" className={btnG} onClick={() => { setProtein(null); setRawSeq(""); setFrom(1); setTo(0); }}>{t.remove}</button>
        </div>
      </div>}
      {seqLen > 0 && <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>{t.from} <input type="number" dir="ltr" min={1} max={seqLen} value={from} onChange={(e) => setFrom(Math.max(1, parseInt(e.target.value || "1", 10)))} className={`${field} ms-1 inline-block w-24`} /></label>
        <label>{t.to} <input type="number" dir="ltr" min={1} max={seqLen} value={hi} onChange={(e) => setTo(parseInt(e.target.value || "0", 10))} className={`${field} ms-1 inline-block w-24`} /></label>
        <span className="text-slate-300">{work.length} / {seqLen} {t.residues}</span>
      </div>}
    </div>}

    {step === 2 && (needSeq ? <p className="text-sm text-slate-300">{t.needSeq}</p> : <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">{t.method}<select className={`${field} mt-1`} value={bMethod} onChange={(e) => setBMethod(e.target.value)}>
          {["Bepipred", "Emini", "Kolaskar-Tongaonkar", "Parker", "Chou-Fasman", "Karplus-Schulz"].map((m) => <option key={m}>{m}</option>)}</select></label>
        <button type="button" className={btnP} disabled={!!busy} onClick={() => void post("b", "/pharma/vaccine/bcell", { sequence: work, method: bMethod }, setBRes)}>{busy === "b" ? t.running : t.run}</button>
      </div>
      {bRes && <>
        <p className="text-xs text-slate-300">{bRes.provenance.provider} · {bRes.method} · {t.retrieved} {bRes.provenance.retrieved_at.slice(0, 19)}</p>
        {bRes.segments.length ? <PepTable rows={bRes.segments} kinds={["bc"]} /> : <p className="text-sm text-slate-300">{bRes.total_rows} rows · {t.none}</p>}
      </>}
    </div>)}

    {step === 3 && (needSeq ? <p className="text-sm text-slate-300">{t.needSeq}</p> : <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" className="flex gap-1.5">{(["I", "II"] as const).map((c) => <button key={c} type="button" aria-pressed={mhc === c} className={mhc === c ? btnP : btnG} onClick={() => setMhc(c)}>MHC-{c}</button>)}</div>
        <label className="text-sm">{t.panel}<select className={`${field} mt-1`} value={panel} onChange={(e) => setPanel(e.target.value as any)}>
          <option value="quick">{t.quick}</option><option value="ref">{t.ref}</option></select></label>
        <label className="text-sm">{t.cutoff}<input type="number" step="0.1" min="0.1" max="10" dir="ltr" className={`${field} mt-1 w-28`} value={cutoff} onChange={(e) => setCutoff(parseFloat(e.target.value) || 1)} /></label>
        {mhc === "I" && <label className="text-sm">{t.lens}<input dir="ltr" className={`${field} mt-1 w-28`} value={lens} onChange={(e) => setLens(e.target.value)} /></label>}
        <button type="button" className={btnP} disabled={!!busy} onClick={runT}>{busy === "t" + mhc ? t.running : t.run}</button>
      </div>
      {tRes[mhc] && <>
        <p className="text-xs text-slate-300">{tRes[mhc].provenance.provider} · {tRes[mhc].method} · {tRes[mhc].alleles.length} {t.alleles} · {tRes[mhc].kept_rows}/{tRes[mhc].total_rows} · {t.retrieved} {tRes[mhc].provenance.retrieved_at.slice(0, 19)}</p>
        {tRes[mhc].warning && <p className="text-sm text-amber-200">{tRes[mhc].warning}</p>}
        <PepTable rows={tRes[mhc].peptides} kinds={mhc === "I" ? ["ctl"] : ["htl"]} />
      </>}
    </div>)}

    {step === 4 && <div className="space-y-4">
      {covRows.length === 0 ? <p className="text-sm text-slate-300">{t.covNeed}</p> : <>
        <div className={card}>
          <h4 className="font-bold text-emerald-200">{t.covTitle}</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-start text-xs" dir="ltr"><tbody>{covRows.map((r) => <tr key={r.peptide} className="border-t border-slate-700">
            <td className="py-1.5 pe-3 font-mono">{r.peptide}</td><td className="pe-3">MHC-{r.mhc_class}</td><td className="text-slate-300">{r.alleles.join(", ")}</td></tr>)}</tbody></table></div>
          <label htmlFor="vx-iedb" className="mt-3 block text-sm">{t.covIedb}</label>
          <textarea id="vx-iedb" readOnly rows={Math.min(8, covRows.length + 1)} dir="ltr" className={`${field} font-mono text-xs`} value={iedbText} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btnG} onClick={() => void copy(iedbText)}>{copied ? t.copied : t.copy}</button>
            <a href="https://tools.iedb.org/population/" target="_blank" rel="noreferrer" className={`${btnP} inline-block`}>{t.covOpen} ↗</a>
          </div>
        </div>
        <div className={card}>
          <h4 className="font-bold text-emerald-200">{t.covLocal}</h4>
          <p className="mt-1 text-xs text-slate-300">{t.covFreqHelp}</p>
          <label htmlFor="vx-pop" className="mt-2 block text-sm">{t.popName}</label>
          <input id="vx-pop" className={`${field} mt-1`} value={popName} onChange={(e) => setPopName(e.target.value)} />
          <textarea aria-label={t.covLocal} rows={6} dir="ltr" className={`${field} mt-2 font-mono text-xs`} value={freqText} onChange={(e) => setFreqText(e.target.value)} placeholder={"HLA-A*02:01, 0.25\nHLA-B*07:02, 0.12"} />
          <button type="button" className={`${btnP} mt-2`} disabled={!!busy || !freqText.trim()} onClick={runCov}>{busy === "cov" ? t.running : t.covRun}</button>
          {cov && <div className="mt-3 space-y-2 text-sm">
            <div className="grid gap-2 sm:grid-cols-3">{([[t.covC1, cov.coverage_class_i], [t.covC2, cov.coverage_class_ii], [t.covAll, cov.coverage_combined]] as any[]).map(([k, v]) =>
              <div key={k} className="rounded-lg border border-slate-600 bg-[#0c182a] p-3"><p className="text-xl font-bold tabular-nums text-emerald-300" dir="ltr">{pct(v)}</p><p className="text-xs text-slate-300">{k}</p></div>)}</div>
            {cov.alleles_without_frequency.length > 0 && <p className="text-amber-200">{t.covMissing}: <span dir="ltr">{cov.alleles_without_frequency.join(", ")}</span></p>}
            {cov.warnings.map((w: string) => <p key={w} className="text-amber-200">{w}</p>)}
            <p className="text-xs text-slate-300">{cov.method}. {cov.limits}</p>
          </div>}
        </div>
      </>}
    </div>}

    {step === 5 && <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">{(["ctl", "htl", "bc"] as Kind[]).map((k) => <div key={k} className={card}>
        <h4 className="text-sm font-bold text-emerald-200">{t[k]} ({sel[k].length})</h4>
        <ul className="mt-1 space-y-1">{sel[k].map((p) => <li key={p} className="flex items-center justify-between gap-2 font-mono text-xs" dir="ltr">{p}
          <button type="button" aria-label={`${t.remove} ${p}`} className="text-amber-200" onClick={() => delSel(k, p)}>×</button></li>)}</ul></div>)}</div>
      <label htmlFor="vx-adj" className="block text-sm">{t.adjuvant}</label>
      <div className="flex flex-wrap gap-2">
        <input id="vx-adj" dir="ltr" className={`${field} min-w-56 flex-1 font-mono text-xs`} value={adj} onChange={(e) => setAdj(e.target.value)} />
        <input aria-label="label" dir="ltr" className={`${field} w-32`} value={adjLabel} onChange={(e) => setAdjLabel(e.target.value)} />
        <button type="button" className={btnG} onClick={() => { setAdj(RS09); setAdjLabel("RS09"); }}>RS09</button>
      </div>
      <p className="text-xs text-slate-300">{t.adjHint}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={his} onChange={(e) => setHis(e.target.checked)} /> {t.his}</label>
      <button type="button" className={btnP} disabled={!!busy || sel.ctl.length + sel.htl.length + sel.bc.length === 0} onClick={assemble}>{busy === "asm" ? t.running : t.assemble}</button>
      {cons && <div className={`${card} space-y-2`}>
        <p className="text-xs text-slate-300">{t.layout}: {cons.layout} · {cons.length} aa</p>
        <p className="break-all font-mono text-xs leading-relaxed" dir="ltr">{cons.segments.map((s: any, i: number) => <span key={i} className={KIND_COLOR[s.kind] || ""} title={s.label}>{s.sequence}</span>)}</p>
        <button type="button" className={btnG} onClick={() => void copy(cons.sequence)}>{copied ? t.copied : t.copy}</button>
      </div>}
    </div>}

    {step === 6 && (!cons ? <p className="text-sm text-slate-300">{fa ? "ابتدا در مرحله ۶ سازه را بسازید." : "Build a construct in step 6 first."}</p> : <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-600"><table className="w-full text-start text-sm"><caption className="px-3 py-2 text-start font-semibold text-emerald-200">{t.evalTitle}</caption>
        <thead className="bg-[#0c182a] text-slate-300"><tr><th className="px-3 py-2 text-start">{t.prop}</th><th className="px-3 py-2 text-start">{t.value}</th></tr></thead>
        <tbody>{([["Length", `${cons.profile.length} aa`], ["Molecular weight", `${cons.profile.molecular_weight_kda} kDa`], ["Theoretical pI", cons.profile.theoretical_pi],
          ["Instability index", `${cons.profile.instability_index} (${cons.profile.instability_class}, cutoff 40)`], ["Aliphatic index", cons.profile.aliphatic_index], ["GRAVY", cons.profile.gravy],
          ["Half-life (N-end rule, mammalian in vitro)", cons.profile.half_life_hours_mammalian_in_vitro != null ? `${cons.profile.half_life_hours_mammalian_in_vitro} h` : "—"]] as any[]).map(([k, v]) =>
          <tr key={k} className="border-t border-slate-700"><td className="px-3 py-2">{k}</td><td className="px-3 py-2" dir="ltr">{String(v)}</td></tr>)}</tbody></table></div>
      <p className="text-xs text-slate-300">{cons.profile.limits}</p>
      <div className={card}><h4 className="font-bold text-emerald-200">{t.ext}</h4><p className="mt-1 text-xs text-slate-300">{t.extNote}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">{EXT.map(([k, url, name]) => <div key={k}>
          <label htmlFor={`vx-${k}`} className="flex items-center justify-between text-sm">{t[k]}<a href={url} target="_blank" rel="noreferrer" className="text-emerald-200 underline">{name} ↗</a></label>
          <input id={`vx-${k}`} className={`${field} mt-1`} value={ext[k] || ""} onChange={(e) => setExt((o) => ({ ...o, [k]: e.target.value }))} /></div>)}</div></div>
    </div>)}

    {step === 7 && <div className="space-y-3">
      {cons ? (cons.length <= 400 ? <div className={`${card} space-y-2`}>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t.consent}</label>
        <button type="button" className={btnP} disabled={!consent || !!busy} onClick={() => void predict()}>{busy === "pred" ? t.running : `${t.pred} (${cons.length} aa)`}</button>
      </div> : <p className="text-sm text-amber-200">{t.tooLong} ({cons.length} aa)</p>) : <p className="text-sm text-slate-300">{t.needCons}</p>}
      <div className={`${card} space-y-2`}>
        <label htmlFor="vx-pdbf" className="block text-sm">{t.pdbLoad}</label>
        <input id="vx-pdbf" type="file" accept=".pdb,.ent,.txt" className="block text-sm" onChange={(e) => { readFile(e.target.files?.[0], (x) => { setPdb(x); setQc(null); }); }} />
        <textarea aria-label={t.pdbLoad} rows={4} dir="ltr" className={`${field} font-mono text-xs`} value={pdb} onChange={(e) => { setPdb(e.target.value); setQc(null); }} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPl} onChange={(e) => setIsPl(e.target.checked)} />{t.isPlddt}</label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnP} disabled={!!busy || pdb.length < 50} onClick={() => void runQc()}>{busy === "qc" ? t.running : t.runQc}</button>
          {pdb && <button type="button" className={btnG} onClick={() => saveTxt("construct.pdb", pdb)}>{t.dlPdb}</button>}
        </div>
      </div>
      {pdb && qc && <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)]">
        <Mol pdb={pdb} scale={qc.plddt ? qc.plddt.scale_factor : null} />
        <div className={`${card} space-y-2 text-sm`}>
          <h4 className="font-bold text-emerald-200">{t.qcTitle}</h4>
          {qc.plddt && <>
            <p>{t.mean}: <b dir="ltr">{qc.plddt.mean}</b></p>
            <p className="text-xs text-slate-300" dir="ltr">&gt;90: {qc.plddt.very_high_gt90}% · 70–90: {qc.plddt.confident_70_90}% · 50–70: {qc.plddt.low_50_70}% · ≤50: {qc.plddt.very_low_le50}%</p>
            <svg viewBox="0 0 300 60" className="h-14 w-full" role="img" aria-label="pLDDT per residue" dir="ltr">
              <polyline fill="none" stroke="#5ef0a8" strokeWidth="1.5" points={qc.plddt.per_residue.map((v: number, i: number) => `${(i / Math.max(1, qc.plddt.per_residue.length - 1)) * 300},${58 - (v / 100) * 56}`).join(" ")} /></svg>
          </>}
          <p className="font-semibold">{t.rama}</p>
          {qc.ramachandran.evaluated > 0
            ? <p dir="ltr">{t.fav} {qc.ramachandran.favored_pct}% · {t.allow} {qc.ramachandran.allowed_pct}% · {t.outl} {qc.ramachandran.outlier_pct}% <span className="text-slate-300">(n={qc.ramachandran.evaluated})</span></p>
            : <p className="text-slate-300">—</p>}
          {qc.ramachandran.outliers.length > 0 && <p className="text-xs text-slate-300" dir="ltr">{t.outList}: {qc.ramachandran.outliers.slice(0, 12).map((o: any) => `${o.residue} (${o.phi}, ${o.psi})`).join(" · ")}</p>}
          <p className="text-xs text-slate-300">{qc.ramachandran.note} {qc.limits}</p>
        </div>
      </div>}
    </div>}
    {step === 8 && <div className="space-y-3">
      <p className="text-sm text-slate-200">{t.dockInfo}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={card}><h4 className="text-sm font-bold text-emerald-200">{t.recs}</h4>
          <ul className="mt-1 space-y-1 text-sm" dir="ltr">{RECEPTORS.map(([n, id]) => <li key={id}>{n}: <a className="text-emerald-200 underline" target="_blank" rel="noreferrer" href={`https://www.rcsb.org/structure/${id}`}>{id} ↗</a></li>)}</ul></div>
        <div className={card}><h4 className="text-sm font-bold text-emerald-200">{t.servers}</h4>
          <ul className="mt-1 space-y-1 text-sm" dir="ltr">{SERVERS.map(([n, u]) => <li key={n}><a className="text-emerald-200 underline" target="_blank" rel="noreferrer" href={u}>{n} ↗</a></li>)}</ul>
          <p className="mt-2 text-xs text-slate-300">{t.srvNote}</p></div>
      </div>
      <div className={`${card} space-y-2`}>
        <label htmlFor="vx-cplx" className="block text-sm">{t.cplx}</label>
        <input id="vx-cplx" type="file" accept=".pdb,.ent,.txt" className="block text-sm" onChange={(e) => { readFile(e.target.files?.[0], (x) => { setCplx(x); setIface(null); }); }} />
        <textarea aria-label={t.cplx} rows={4} dir="ltr" className={`${field} font-mono text-xs`} value={cplx} onChange={(e) => { setCplx(e.target.value); setIface(null); }} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">{t.chA}<input dir="ltr" className={`${field} mt-1 w-28`} value={chA} onChange={(e) => setChA(e.target.value)} /></label>
          <label className="text-sm">{t.chB}<input dir="ltr" className={`${field} mt-1 w-28`} value={chB} onChange={(e) => setChB(e.target.value)} /></label>
          <label className="text-sm">{t.cut}<input type="number" step="0.5" min="3.5" max="8" dir="ltr" className={`${field} mt-1 w-24`} value={cut} onChange={(e) => setCut(parseFloat(e.target.value) || 5)} /></label>
          <button type="button" className={btnP} disabled={!!busy || cplx.length < 50} onClick={runIf}>{busy === "if" ? t.running : t.runIf}</button>
        </div>
      </div>
      {iface && <div className={`${card} space-y-2 text-sm`}>
        <h4 className="font-bold text-emerald-200">{t.ifTitle}</h4>
        <p dir="ltr">{t.pairs}: <b>{iface.residue_pairs_in_contact}</b> · {iface.n_interface_a} / {iface.n_interface_b} · {t.polar}: <b>{iface.n_polar_contacts}</b> · {t.salt}: <b>{iface.salt_bridge_candidates.length}</b></p>
        <p className="text-xs text-slate-300" dir="ltr">{t.ifA}: {iface.interface_residues_a.slice(0, 60).join(" ")}</p>
        <p className="text-xs text-slate-300" dir="ltr">{t.ifB}: {iface.interface_residues_b.slice(0, 60).join(" ")}</p>
        {iface.salt_bridge_candidates.length > 0 && <p className="text-xs text-slate-300" dir="ltr">{t.salt}: {iface.salt_bridge_candidates.slice(0, 12).map((x: any) => `${x.a}–${x.b} (${x.distance} Å)`).join(" · ")}</p>}
        <p className="text-xs text-slate-300">{iface.method} {iface.limits}</p>
      </div>}
    </div>}
    {step === 9 && <div className="space-y-2">
      <p className="text-sm text-slate-300">{t.reportHint}</p>
      <button type="button" className={btnP} onClick={download}>{t.report}</button>
      <pre className="max-h-72 overflow-auto rounded-lg border border-slate-600 bg-[#0c182a] p-3 text-xs text-slate-200" dir="ltr">{report}</pre>
    </div>}

    <p className="text-xs text-slate-400">{t.disclaimer}</p>
  </section>;
}
