"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Script from "next/script";

const API = process.env.NEXT_PUBLIC_API_URL || "https://primer-ai.onrender.com";

type Lang = "en" | "fa";
type TabId = "design" | "qpcr" | "multiplex" | "gibson" | "crispr" | "toolbox" | "explorer" | "tutorial" | "troubleshoot" | "library";

/* ------------------------------------------------------------------ */
/* Translations                                                        */
/* ------------------------------------------------------------------ */
const T: Record<Lang, Record<string, string>> = {
  en: {
    title: "Primer AI", subtitle: "From gene to structure to literature — designed in your language.",
    tab_design: "Primer design", tab_qpcr: "RT-qPCR analysis", tab_multiplex: "Multiplex", tab_gibson: "Gibson assembly", tab_crispr: "CRISPR gRNA",
    tab_toolbox: "Toolbox", tab_explorer: "Gene & protein explorer", tab_tutorial: "Learn", tab_troubleshoot: "Troubleshooting", tab_library: "My library",
    login: "Log in / Sign up", logout: "Log out", deleteAccount: "Delete my account", settings: "Account",
    deleteConfirm: "Delete your account and all saved data? This cannot be undone.",
    loginRequired: "Please log in to use this feature.", networkErr: "Cannot reach the server. It may be waking up (free tier) — try again in ~1 minute.",
    rateLimited: "Too many requests. Please wait a minute.", working: "Working…", wake: "The first request can take up to a minute while the server wakes up.",
    geneSearch: "Gene symbol (e.g. BRCA1)", organism: "Organism", fetchSeq: "Fetch RefSeq mRNA", transcript: "Transcript",
    geneInfo: "CDS {cds} · {n} exons", noAnn: "No exon annotation found for this transcript.",
    sequence: "DNA sequence (FASTA or raw)", seqHint: "Allowed: A C G T N (U is converted to T). Max {max} nt.",
    region: "Design only inside region (optional)", from: "From", to: "To",
    prompt: "Describe what you want", promptPh: "e.g. Tm 62, product 100-200 bp  /  دما را روی ۶۲ تنظیم کن",
    mode: "Application", mode_standard: "Standard PCR (100–1000 bp)", mode_qpcr: "qPCR (70–150 bp)", mode_sanger: "PCR for Sanger (400–900 bp)",
    qpcr_chemistry: "qPCR chemistry", qpcr_taqman: "TaqMan probe", qpcr_sybr: "SYBR Green (primer pair only)",
    qpcr_chemistry_hint: "TaqMan designs an internal probe; SYBR Green returns primers without a probe.",
    polymerase: "Polymerase profile", pol_taq: "Taq-type", pol_hifi: "High-fidelity (Q5/Phusion)",
    tailLeft: "5′ tail, forward (optional)", tailRight: "5′ tail, reverse (optional)",
    mutation: "Site-directed mutation (optional)", mutationHint: "DNA substitution, 1-based: e.g. A120G → designs mutagenic primers",
    designBtn: "Design primers", detectedTm: "Target Tm", src_llm: "AI-parsed", src_regex: "from your text", src_default: "default",
    noPrimers: "No primers found", noPrimersHelp: "Try a wider product size, a different Tm, or a smaller region. Primer3 says:",
    pair: "Pair", forward: "Forward", reverse: "Reverse", probe: "Probe", tm: "Tm", gc: "GC", len: "nt", size: "Product", anneal: "Annealing",
    hairpin: "Hairpin", selfDimer: "Self-dimer", heteroDimer: "Primer-dimer", endDimer: "3′ end stability",
    risk_low: "low", risk_medium: "medium", risk_high: "high",
    copy: "Copy", copied: "Copied", save: "Save", saved: "Saved", genbank: "GenBank (.gb)", csvIdt: "Order CSV (IDT)", protocol: "PCR protocol",
    blast: "Check specificity (BLAST)", blasting: "Searching NCBI… (1–3 min)", blastNeedsLogin: "Log in to run the specificity check.",
    blastSummary: "{n} predicted product(s) in transcripts: {on} on-target, {other} other.",
    blastNone: "No predicted product found — primers may not match any transcript.", blastNote: "For publication-grade specificity also run NCBI Primer-BLAST.",
    onTarget: "on-target", other: "other", provenance: "Tm: SantaLucia nearest-neighbour, 50 mM Na⁺, 1.5 mM Mg²⁺, 0.6 mM dNTP, 50 nM primer · Primer3 {v}",
    ex_junction_primer: "Primer spans an exon–exon junction (gDNA-safe)", ex_intron_spanning: "Amplicon spans an intron (gDNA product would be larger)",
    ex_none: "No exon junction covered — may amplify genomic DNA", ex_unknown: "No exon annotation (fetch the gene by symbol to enable this check)",
    note_tm_diff: "Primer Tm difference is {v} °C.", note_gc_range: "{side} primer GC is {v}% (aim 40–60%).",
    note_clamp_weak: "{side} primer: no G/C in the last 5 bases (weak 3′ clamp).", note_clamp_strong: "{side} primer: ≥4 G/C in the last 5 bases (risk of mispriming).",
    note_run: "{side} primer has a run of 4+ identical bases.", note_structure_high: "A secondary structure is stable near the annealing temperature.",
    note_structure_low: "Hairpins and dimers are weak relative to the annealing temperature.", note_junction_ok: "Spans an exon–exon junction.",
    note_intron_ok: "Amplicon includes an intron, so gDNA would give a longer product.", note_junction_none: "No exon junction covered.",
    note_amplicon_gc: "Amplicon GC is {v}% — consider DMSO or a GC enhancer.",
    warn_tm_out_of_range: "The temperature in your text was outside 40–80 °C and was ignored.", warn_relaxed: "No primers met the strict limits, so the Tm/size/GC window was relaxed.",
    warn_junction_fallback: "Could not place a primer on an exon junction; showing best standard primers.", warn_no_annotation_qpcr: "No exon annotation: use a RefSeq mRNA fetched by gene symbol for junction-aware qPCR design.",
    sdm: "Site-directed mutagenesis primers", sdmHint: "Complementary QuikChange-style pair (mutation centred). Tm = 81.5 + 0.41·GC% − 675/N − %mismatch.",
    sdmOk: "meets Tm ≥ 78 °C, GC ≥ 40%, G/C 3′ end", sdmWeak: "does not meet all criteria — consider a longer primer or Q5-SDM design",
    eff_missense: "missense", eff_synonymous: "synonymous", eff_nonsense: "nonsense (stop gained)", eff_stop_loss: "stop lost",
    protocolTitle: "Suggested starting protocol", additive_high_gc: "High GC amplicon: consider 3–5% DMSO or a GC enhancer.",
    gel: "In-silico gel (illustrative, log scale)", ladder: "Ladder",
    feedbackTitle: "Did this primer pair work in your lab?", fb_success: "Worked", fb_failed: "Failed", fb_dimer: "Dimer / off-target", fb_partial: "Weak / partial",
    fbNotes: "Notes (optional)", fbThanks: "Thank you — logged with your conditions.", fbWhich: "Pair",
    gibsonInsert: "Insert sequence", gibsonVector: "Vector sequence", overlap: "Overlap (bp)", insPos: "Insertion position (0 = vector already linearised)",
    targetTm: "Target Tm of annealing part", gibsonBtn: "Design Gibson primers", overlapSeq: "Vector overlap", annealSeq: "Insert-annealing part",
    overlapTm: "Overlap Tm", junctionPreview: "Junction preview", gibsonHint: "The insert goes between the end and the start of the linearised vector (or at the position you give for a circular vector).",
    enzyme: "Nuclease", pamOverride: "PAM override (IUPAC)", crisprBtn: "Find guides", guideSeq: "Guide (5′→3′)", pam: "PAM", strand: "Strand", position: "Position", score: "Heuristic score",
    cutAt: "Cut at", exon: "exon", showInExplorer: "Show in protein", region_5utr: "5′ UTR", region_3utr: "3′ UTR", region_cds: "CDS", totalGuides: "{n} candidate guides (top 25 shown)",
    mpHint: "One target sequence per line (2–8). Primers are chosen together to avoid cross-dimers and overlapping band sizes.", mpGap: "Min. size gap (bp)", mpBtn: "Design multiplex",
    mpOk: "Compatible set found.", mpBad: "Best set still has conflicts:", mpSize: "size too close", mpDimer: "cross-dimer", target: "Target",
    tmCalc: "Tm calculator", tmBtn: "Calculate", orderFormat: "Order format", companyLabel: "Vendor", nameLabel: "Name", convert: "Convert", recPur: "Recommended purification",
    uniprot: "UniProt accession", loadStruct: "Load AlphaFold structure", orSeq: "…or predict from a protein sequence (ESMFold, ≤400 aa)", predict: "Predict",
    mapTitle: "Transcript map", mapHint: "Click a primer or guide to find its codons in the 3D structure.", hoverHint: "Hover a residue in the structure.",
    mapJunction: "Splice junction", mapTranscriptNote: "Coordinates are on the mature mRNA; intron lengths are not present in this transcript record.",
    residue: "Residue", plddt: "Confidence (pLDDT)", conf_vh: "very high", conf_h: "confident", conf_l: "low", conf_vl: "very low",
    features: "UniProt features here", noFeat: "No annotated feature at this residue.", dnaCodon: "Codon at transcript positions", covers: "Covered by",
    papers: "Literature (Europe PMC)", findPapers: "Find papers", explain: "Explain with sources (AI)", explainNote: "AI summary built only from the sources listed — verify before citing.",
    functionTxt: "Protein function (UniProt)", licenseTxt: "Structure: AlphaFold DB (CC-BY 4.0). Annotations: UniProt. Papers: Europe PMC.",
    noGeneYet: "Fetch a gene in the Primer design tab first, or type a UniProt accession.",
    libEmpty: "No saved primers yet.", libDelete: "Delete", libExport: "Export all (CSV)", legacy: "imported",
    footer: "Primer3 (Untergasser et al., 2012) · NCBI · UniProt · AlphaFold DB · Europe PMC", pricing: "Pricing", privacy: "Privacy",
    // Troubleshooting translations
    ts_title: "Troubleshooting", ts_desc: "Describe the problem you see in your PCR or cloning experiment.",
    ts_symptom: "Symptom", ts_select: "Select a symptom...", ts_analyze: "Analyze", ts_cause: "Likely Cause", ts_solutions: "Suggested Solutions",
    report: "Download report", reportCsv: "Results CSV", reportPrint: "Open the report and use Print → Save as PDF.",
    report_title_design: "Primer design report", report_title_qpcr: "RT-qPCR analysis report", report_generated: "Generated",
    report_inputs: "Inputs", report_results: "Results", report_method: "Method & provenance", report_cite: "How to cite the tools",
    qpcr_controls: "Controls (NTC / −RT)", qpcr_curves: "Standard curves", qpcr_type: "Type", qpcr_status: "Status", qpcr_note: "Note",
    qpcr_slope: "Slope", qpcr_eff: "Efficiency", qpcr_r2: "R²", st_pass: "pass", st_warn: "check", st_fail: "fail",
    qpcr_types_hint: "Optional columns: type (sample, ntc, nrt / -RT, standard) and quantity (for standard-curve dilutions).",
    chat_title: "Ask Primer AI", chat_open: "Ask AI", chat_ph: "Ask about primers, qPCR, exons…", chat_send: "Send",
    chat_clear: "New chat", chat_ctx: "Uses your current gene and results as context", chat_disabled: "The AI assistant is not enabled on this server.",
    chat_note: "AI can be wrong. Verify before using it in the lab or in a thesis.",
    chat_hello: "Hi! Ask me anything about your primers, qPCR data or exon/intron structure.",
    chat_s1: "Why is an exon–exon junction primer better for qPCR?", chat_s2: "Explain my ΔΔCt result like I'm a student", chat_s3: "What do NTC and −RT controls tell me?",
    qpcr_title: "RT-qPCR Ct analysis", qpcr_desc: "Upload or paste one well per row. The comparative ΔΔCt method assumes near-100% and similar amplification efficiencies; use cDNA Ct values and a validated reference target.",
    qpcr_csv_label: "Ct data (CSV)", qpcr_csv_hint: "Required columns: sample, target, ct. Optional: group, replicate. Use a blank Ct or Undetermined for no amplification.",
    qpcr_csv_example: "sample,target,ct,group,replicate,type,quantity\ncontrol_1,ACTB,20.1,control,1,sample,\ncontrol_1,GENE_X,25.0,control,1,sample,\ntreated_1,ACTB,20.3,treated,1,sample,\ntreated_1,GENE_X,22.4,treated,1,sample,\nNTC,GENE_X,,,,ntc,\nRT_minus,GENE_X,,,,nrt,",
    qpcr_upload: "Choose CSV file", qpcr_control_group: "Control group", qpcr_reference_target: "Reference target",
    qpcr_analyze: "Analyze Ct data", qpcr_results: "Expression results", qpcr_sample_results: "Per-sample results",
    qpcr_qc: "Replicate QC", qpcr_group: "Group", qpcr_sample: "Sample", qpcr_target: "Target", qpcr_samples: "Samples",
    qpcr_mean_delta: "Mean ΔCt", qpcr_ddct: "ΔΔCt", qpcr_fold: "Fold change vs control",
    qpcr_mean_ct: "Mean Ct", qpcr_sd_ct: "SD Ct", qpcr_n: "Replicates", qpcr_warnings: "QC notes",
    qpcr_bad_csv: "CSV needs sample, target, and ct columns. Check the header names and numeric Ct values.",
    qpcr_empty: "No complete target/reference sample pairs were available.",
  },
  fa: {
    title: "Primer AI", subtitle: "از ژن تا ساختار تا مقاله — به زبان خودتان.",
    tab_design: "طراحی پرایمر", tab_qpcr: "تحلیل RT-qPCR", tab_multiplex: "مولتی‌پلکس", tab_gibson: "مونتاژ Gibson", tab_crispr: "CRISPR gRNA",
    tab_toolbox: "ابزارها", tab_explorer: "کاوشگر ژن و پروتئین", tab_tutorial: "آموزش", tab_troubleshoot: "عیب‌یابی", tab_library: "کتابخانه من",
    login: "ورود / ثبت‌نام", logout: "خروج", deleteAccount: "حذف حساب من", settings: "حساب کاربری",
    deleteConfirm: "حساب و همه‌ی داده‌های ذخیره‌شده حذف شود؟ این کار برگشت‌پذیر نیست.",
    loginRequired: "برای استفاده از این قابلیت وارد شوید.", networkErr: "اتصال به سرور برقرار نشد. ممکن است سرور در حال بیدار شدن باشد (پلن رایگان) — حدود ۱ دقیقه بعد دوباره تلاش کنید.",
    rateLimited: "درخواست‌ها زیاد بود. یک دقیقه صبر کنید.", working: "در حال پردازش…", wake: "اولین درخواست ممکن است تا یک دقیقه طول بکشد (بیدار شدن سرور).",
    geneSearch: "نماد ژن (مثلاً BRCA1)", organism: "گونه", fetchSeq: "دریافت mRNA مرجع (RefSeq)", transcript: "ترنسکریپت",
    geneInfo: "CDS {cds} · {n} اگزون", noAnn: "برای این ترنسکریپت اطلاعات اگزون یافت نشد.",
    sequence: "توالی DNA (FASTA یا خام)", seqHint: "مجاز: A C G T N (U به T تبدیل می‌شود). حداکثر {max} نوکلئوتید.",
    region: "طراحی فقط داخل بازه (اختیاری)", from: "از", to: "تا",
    prompt: "چه می‌خواهید؟", promptPh: "مثلاً: دما را روی ۶۲ تنظیم کن، محصول ۱۰۰ تا ۲۰۰ bp  /  Tm 62",
    mode: "کاربرد", mode_standard: "PCR معمولی (۱۰۰ تا ۱۰۰۰ bp)", mode_qpcr: "qPCR (۷۰ تا ۱۵۰ bp)", mode_sanger: "PCR برای سنگر (۴۰۰ تا ۹۰۰ bp)",
    qpcr_chemistry: "روش qPCR", qpcr_taqman: "پروب TaqMan", qpcr_sybr: "SYBR Green (فقط جفت پرایمر)",
    qpcr_chemistry_hint: "در TaqMan پروب داخلی هم طراحی می‌شود؛ در SYBR Green فقط پرایمرها برگردانده می‌شوند.",
    polymerase: "نوع پلیمراز", pol_taq: "از نوع Taq", pol_hifi: "دقت بالا (Q5/Phusion)",
    tailLeft: "دنباله ′5 پرایمر رفت (اختیاری)", tailRight: "دنباله ′5 پرایمر برگشت (اختیاری)",
    mutation: "موتاسیون هدفمند (اختیاری)", mutationHint: "جایگزینی DNA با شماره‌ی ۱-مبنا، مثلاً A120G ← طراحی پرایمر موتاژنیک",
    designBtn: "طراحی پرایمر", detectedTm: "Tm هدف", src_llm: "تحلیل هوشمند", src_regex: "از متن شما", src_default: "پیش‌فرض",
    noPrimers: "پرایمری پیدا نشد", noPrimersHelp: "محدوده‌ی اندازه‌ی محصول را بازتر کنید، Tm دیگری بدهید یا بازه‌ی کوچک‌تری بگیرید. پاسخ Primer3:",
    pair: "جفت", forward: "رفت", reverse: "برگشت", probe: "پروب", tm: "Tm", gc: "GC", len: "nt", size: "محصول", anneal: "دمای اتصال",
    hairpin: "سنجاقی", selfDimer: "دایمر خودی", heteroDimer: "دایمر بین پرایمرها", endDimer: "پایداری انتهای ′3",
    risk_low: "کم", risk_medium: "متوسط", risk_high: "زیاد",
    copy: "کپی", copied: "کپی شد", save: "ذخیره", saved: "ذخیره شد", genbank: "GenBank (.gb)", csvIdt: "فایل سفارش (IDT)", protocol: "پروتکل PCR",
    blast: "بررسی اختصاصیت (BLAST)", blasting: "در حال جستجو در NCBI… (۱ تا ۳ دقیقه)", blastNeedsLogin: "برای بررسی اختصاصیت وارد شوید.",
    blastSummary: "{n} محصول پیش‌بینی‌شده در ترنسکریپت‌ها: {on} هدف اصلی، {other} سایر.",
    blastNone: "محصولی پیش‌بینی نشد — شاید پرایمرها با هیچ ترنسکریپتی جفت نمی‌شوند.", blastNote: "برای اختصاصیت در سطح مقاله، Primer-BLAST ی NCBI را هم اجرا کنید.",
    onTarget: "هدف اصلی", other: "سایر", provenance: "Tm: روش نزدیک‌ترین همسایه (SantaLucia)، ۵۰ mM Na⁺، ۱٫۵ mM Mg²⁺، ۰٫۶ mM dNTP، ۵۰ nM پرایمر · Primer3 {v}",
    ex_junction_primer: "پرایمر روی اتصال اگزون–اگزون قرار دارد (ایمن از DNA ژنومی)", ex_intron_spanning: "آمپلیکون از اینترون عبور می‌کند (محصول ژنومی بزرگ‌تر می‌شود)",
    ex_none: "هیچ اتصال اگزونی پوشش داده نشده — ممکن است DNA ژنومی را هم تکثیر کند", ex_unknown: "اطلاعات اگزون موجود نیست (ژن را با نماد دریافت کنید)",
    note_tm_diff: "اختلاف Tm پرایمرها {v} درجه است.", note_gc_range: "GC پرایمر {side} برابر {v}٪ است (هدف ۴۰ تا ۶۰٪).",
    note_clamp_weak: "پرایمر {side}: در ۵ باز آخر G/C ندارد (گیره‌ی ′3 ضعیف).", note_clamp_strong: "پرایمر {side}: بیش از ۴ باز G/C در ۵ باز آخر (خطر اتصال نادرست).",
    note_run: "پرایمر {side} توالی ۴ باز یکسان یا بیشتر پشت‌سرهم دارد.", note_structure_high: "یک ساختار ثانویه نزدیک دمای اتصال پایدار است.",
    note_structure_low: "سنجاقی و دایمرها نسبت به دمای اتصال ضعیف‌اند.", note_junction_ok: "روی اتصال اگزون–اگزون قرار دارد.",
    note_intron_ok: "آمپلیکون اینترون دارد؛ محصول ژنومی بزرگ‌تر خواهد بود.", note_junction_none: "اتصال اگزونی پوشش داده نشده.",
    note_amplicon_gc: "GC آمپلیکون {v}٪ است — DMSO یا GC enhancer را در نظر بگیرید.",
    warn_tm_out_of_range: "دمای نوشته‌شده در متن خارج از ۴۰ تا ۸۰ درجه بود و نادیده گرفته شد.", warn_relaxed: "هیچ پرایمری در محدوده‌ی سخت‌گیرانه نبود؛ بازه‌ی Tm/اندازه/GC بازتر شد.",
    warn_junction_fallback: "پرایمر روی اتصال اگزونی پیدا نشد؛ بهترین پرایمرهای معمولی نمایش داده می‌شود.", warn_no_annotation_qpcr: "اطلاعات اگزون نیست: برای qPCR مبتنی بر اتصال اگزونی، mRNA مرجع را با نماد ژن دریافت کنید.",
    sdm: "پرایمرهای موتاژنز هدفمند", sdmHint: "جفت مکمل به سبک QuikChange (موتاسیون در مرکز). Tm = 81.5 + 0.41·GC% − 675/N − %mismatch.",
    sdmOk: "شرایط Tm ≥ ۷۸، GC ≥ ۴۰٪ و انتهای G/C برقرار است", sdmWeak: "همه‌ی شرایط برقرار نیست — پرایمر بلندتر یا طراحی Q5-SDM را در نظر بگیرید",
    eff_missense: "تغییر اسیدآمینه (missense)", eff_synonymous: "هم‌معنا (synonymous)", eff_nonsense: "توقف زودرس (nonsense)", eff_stop_loss: "از دست رفتن کدون توقف",
    protocolTitle: "پروتکل پیشنهادی (نقطه‌ی شروع)", additive_high_gc: "آمپلیکون پر-GC: DMSO ۳ تا ۵٪ یا GC enhancer را در نظر بگیرید.",
    gel: "ژل شبیه‌سازی‌شده (نمایشی، مقیاس لگاریتمی)", ladder: "لدر",
    feedbackTitle: "آیا این جفت پرایمر در آزمایشگاه شما کار کرد؟", fb_success: "کار کرد", fb_failed: "کار نکرد", fb_dimer: "دایمر / غیراختصاصی", fb_partial: "ضعیف / ناقص",
    fbNotes: "توضیحات (اختیاری)", fbThanks: "سپاس — همراه با شرایط شما ثبت شد.", fbWhich: "جفت",
    gibsonInsert: "توالی قطعه (Insert)", gibsonVector: "توالی وکتور", overlap: "همپوشانی (bp)", insPos: "جای درج (۰ = وکتور از قبل خطی شده)",
    targetTm: "Tm هدف بخش اتصال", gibsonBtn: "طراحی پرایمر Gibson", overlapSeq: "همپوشانی وکتور", annealSeq: "بخش متصل به قطعه",
    overlapTm: "Tm همپوشانی", junctionPreview: "پیش‌نمایش محل اتصال", gibsonHint: "قطعه بین انتهای وکتور خطی‌شده و ابتدای آن قرار می‌گیرد (یا در جایی که برای وکتور حلقوی مشخص می‌کنید).",
    enzyme: "نوکلئاز", pamOverride: "جایگزینی PAM (IUPAC)", crisprBtn: "یافتن گایدها", guideSeq: "گاید (′5→′3)", pam: "PAM", strand: "رشته", position: "موقعیت", score: "امتیاز ابتکاری",
    cutAt: "محل برش", exon: "اگزون", showInExplorer: "نمایش در پروتئین", region_5utr: "′5 UTR", region_3utr: "′3 UTR", region_cds: "CDS", totalGuides: "{n} گاید کاندید (۲۵ مورد برتر)",
    mpHint: "هر خط یک توالی هدف (۲ تا ۸ مورد). پرایمرها با هم انتخاب می‌شوند تا دایمر متقابل و باندهای هم‌اندازه نداشته باشیم.", mpGap: "حداقل فاصله‌ی اندازه (bp)", mpBtn: "طراحی مولتی‌پلکس",
    mpOk: "مجموعه‌ی سازگار پیدا شد.", mpBad: "بهترین مجموعه هنوز تداخل دارد:", mpSize: "اندازه‌ها بسیار نزدیک", mpDimer: "دایمر متقابل", target: "هدف",
    tmCalc: "محاسبه‌گر Tm", tmBtn: "محاسبه", orderFormat: "فرمت سفارش", companyLabel: "شرکت", nameLabel: "نام", convert: "تبدیل", recPur: "خالص‌سازی پیشنهادی",
    uniprot: "شناسه‌ی UniProt", loadStruct: "بارگذاری ساختار AlphaFold", orSeq: "…یا پیش‌بینی از توالی پروتئین (ESMFold، حداکثر ۴۰۰ aa)", predict: "پیش‌بینی",
    mapTitle: "نقشه‌ی ترنسکریپت", mapHint: "روی پرایمر یا گاید کلیک کنید تا کدون‌های آن را در ساختار سه‌بعدی ببینید.", hoverHint: "موس را روی یک residue ببرید.",
    mapJunction: "اتصال اگزون‌ها", mapTranscriptNote: "مختصات بر اساس mRNA بالغ است؛ طول اینترون‌ها در رکورد این ترنسکریپت وجود ندارد.",
    residue: "residue", plddt: "اطمینان (pLDDT)", conf_vh: "بسیار بالا", conf_h: "بالا", conf_l: "کم", conf_vl: "بسیار کم",
    features: "ویژگی‌های UniProt در این نقطه", noFeat: "ویژگی ثبت‌شده‌ای در این residue نیست.", dnaCodon: "کدون در موقعیت‌های ترنسکریپت", covers: "پوشش داده‌شده توسط",
    papers: "مقالات (Europe PMC)", findPapers: "یافتن مقالات", explain: "توضیح با منبع (هوش مصنوعی)", explainNote: "خلاصه فقط از منابع فهرست‌شده ساخته شده — پیش از ارجاع بررسی کنید.",
    functionTxt: "عملکرد پروتئین (UniProt)", licenseTxt: "ساختار: AlphaFold DB (CC-BY 4.0). حاشیه‌نویسی: UniProt. مقالات: Europe PMC.",
    noGeneYet: "ابتدا در تب طراحی پرایمر یک ژن دریافت کنید یا شناسه‌ی UniProt را بنویسید.",
    libEmpty: "هنوز پرایمری ذخیره نشده.", libDelete: "حذف", libExport: "خروجی همه (CSV)", legacy: "قدیمی",
    footer: "Primer3 (Untergasser et al., 2012) · NCBI · UniProt · AlphaFold DB · Europe PMC", pricing: "تعرفه‌ها", privacy: "حریم خصوصی",
    // Troubleshooting translations
    ts_title: "عیب‌یابی", ts_desc: "مشکلی که در آزمایش PCR یا کلونینگ خود می‌بینید را توصیف کنید.",
    ts_symptom: "علامت", ts_select: "یک علامت انتخاب کنید...", ts_analyze: "تحلیل", ts_cause: "علت احتمالی", ts_solutions: "راه‌حل‌های پیشنهادی",
    report: "دانلود گزارش", reportCsv: "CSV نتایج", reportPrint: "گزارش را باز کنید و با Print → Save as PDF ذخیره کنید.",
    report_title_design: "گزارش طراحی پرایمر", report_title_qpcr: "گزارش تحلیل RT-qPCR", report_generated: "تاریخ تهیه",
    report_inputs: "ورودی‌ها", report_results: "نتایج", report_method: "روش و منشأ داده", report_cite: "ارجاع به ابزارها",
    qpcr_controls: "کنترل‌ها (NTC / −RT)", qpcr_curves: "منحنی‌های استاندارد", qpcr_type: "نوع", qpcr_status: "وضعیت", qpcr_note: "توضیح",
    qpcr_slope: "شیب", qpcr_eff: "بازده", qpcr_r2: "R²", st_pass: "قبول", st_warn: "بررسی شود", st_fail: "رد",
    qpcr_types_hint: "ستون‌های اختیاری: type (sample، ntc، nrt یا -RT، standard) و quantity (برای رقت‌های منحنی استاندارد).",
    chat_title: "از Primer AI بپرسید", chat_open: "پرسش از AI", chat_ph: "درباره‌ی پرایمر، qPCR، اگزون و… بپرسید", chat_send: "ارسال",
    chat_clear: "گفت‌وگوی جدید", chat_ctx: "ژن و نتایج فعلی شما به‌عنوان زمینه استفاده می‌شود", chat_disabled: "دستیار هوش مصنوعی روی این سرور فعال نیست.",
    chat_note: "هوش مصنوعی ممکن است اشتباه کند. پیش از استفاده در آزمایشگاه یا پایان‌نامه بررسی کنید.",
    chat_hello: "سلام! هر سؤالی درباره‌ی پرایمرها، داده‌ی qPCR یا ساختار اگزون/اینترون دارید بپرسید.",
    chat_s1: "چرا پرایمر روی اتصال اگزون–اگزون برای qPCR بهتر است؟", chat_s2: "نتیجه‌ی ΔΔCt من را ساده توضیح بده", chat_s3: "کنترل‌های NTC و −RT چه چیزی را نشان می‌دهند؟",
    qpcr_title: "تحلیل Ct در RT-qPCR", qpcr_desc: "برای هر چاهک یک ردیف بارگذاری یا جای‌گذاری کنید. روش مقایسه‌ای ΔΔCt فرض می‌کند بازده تکثیر نزدیک ۱۰۰٪ و بین assayها مشابه است؛ از Ct مربوط به cDNA و ژن مرجع اعتبارسنجی‌شده استفاده کنید.",
    qpcr_csv_label: "داده‌های Ct (CSV)", qpcr_csv_hint: "ستون‌های لازم: sample، target، ct. ستون‌های اختیاری: group، replicate. برای عدم تکثیر Ct را خالی یا Undetermined بگذارید.",
    qpcr_csv_example: "sample,target,ct,group,replicate,type,quantity\ncontrol_1,ACTB,20.1,control,1,sample,\ncontrol_1,GENE_X,25.0,control,1,sample,\ntreated_1,ACTB,20.3,treated,1,sample,\ntreated_1,GENE_X,22.4,treated,1,sample,\nNTC,GENE_X,,,,ntc,\nRT_minus,GENE_X,,,,nrt,",
    qpcr_upload: "انتخاب فایل CSV", qpcr_control_group: "گروه کنترل", qpcr_reference_target: "ژن مرجع",
    qpcr_analyze: "تحلیل داده Ct", qpcr_results: "نتایج بیان", qpcr_sample_results: "نتایج هر نمونه",
    qpcr_qc: "کنترل تکرارها", qpcr_group: "گروه", qpcr_sample: "نمونه", qpcr_target: "هدف", qpcr_samples: "نمونه‌ها",
    qpcr_mean_delta: "میانگین ΔCt", qpcr_ddct: "ΔΔCt", qpcr_fold: "تغییر بیان نسبت به کنترل",
    qpcr_mean_ct: "میانگین Ct", qpcr_sd_ct: "انحراف معیار Ct", qpcr_n: "تکرارها", qpcr_warnings: "نکات کنترل کیفیت",
    qpcr_bad_csv: "CSV باید ستون‌های sample، target و ct داشته باشد. نام سرستون‌ها و عددی بودن Ct را بررسی کنید.",
    qpcr_empty: "جفت کامل هدف و ژن مرجع برای محاسبه پیدا نشد.",
  },
};

const TUT: Record<Lang, { h: string; p: string }[]> = {
  en: [
    { h: "What a primer must do", p: "Forward and reverse primers bracket the DNA you amplify. Good pairs have similar Tm (within ~2 °C), 40–60% GC, a mild G/C 3′ end, and no stable hairpins or primer-dimers." },
    { h: "Tm and annealing", p: "Tm is the temperature where half of the primer is bound. For Taq-type enzymes anneal ≈ 5 °C below the lower Tm; high-fidelity enzymes often anneal at or near Tm — confirm with your vendor's calculator." },
    { h: "Secondary structures", p: "A hairpin or dimer is a problem when it stays stable at your annealing temperature. Primer AI compares each structure's melting temperature and ΔG with your annealing temperature." },
    { h: "qPCR and gDNA", p: "To avoid amplifying genomic DNA, put one primer across an exon–exon junction or choose an amplicon that spans an intron. Fetch the gene by symbol so Primer AI knows the exon boundaries." },
    { h: "Cloning and mutagenesis", p: "Gibson primers = vector overlap + insert-annealing part. Mutagenic primers carry the mismatch in the middle, flanked by 10–20 matching bases on each side." },
    { h: "Always validate", p: "Check specificity (BLAST / Primer-BLAST), run a gradient PCR, and report conditions. Tell us whether a pair worked — it improves future suggestions." },
  ],
  fa: [
    { h: "پرایمر باید چه کند؟", p: "پرایمر رفت و برگشت دو طرف ناحیه‌ی تکثیر را مشخص می‌کنند. جفت خوب: Tm مشابه (حدود ۲ درجه)، GC بین ۴۰ تا ۶۰٪، انتهای ′3 با G/C ملایم، و بدون سنجاقی یا دایمر پایدار." },
    { h: "Tm و دمای اتصال", p: "Tm دمایی است که نیمی از پرایمر متصل است. برای آنزیم‌های نوع Taq دمای اتصال حدود ۵ درجه کمتر از Tm کوچک‌تر است؛ آنزیم‌های دقت‌بالا اغلب نزدیک Tm کار می‌کنند — با ماشین‌حساب سازنده تأیید کنید." },
    { h: "ساختارهای ثانویه", p: "سنجاقی یا دایمر وقتی مشکل است که در دمای اتصال شما پایدار بماند. Primer AI دمای ذوب و ΔG هر ساختار را با دمای اتصال مقایسه می‌کند." },
    { h: "qPCR و DNA ژنومی", p: "برای جلوگیری از تکثیر DNA ژنومی، یک پرایمر را روی اتصال اگزون–اگزون بگذارید یا آمپلیکونی انتخاب کنید که اینترون را پوشش دهد. ژن را با نماد دریافت کنید تا مرز اگزون‌ها معلوم باشد." },
    { h: "کلونینگ و موتاژنز", p: "پرایمر Gibson = همپوشانی وکتور + بخش متصل به قطعه. پرایمر موتاژنیک عدم‌تطابق را در وسط دارد و ۱۰ تا ۲۰ باز مطابق در دو طرفش." },
    { h: "همیشه اعتبارسنجی کنید", p: "اختصاصیت را (BLAST / Primer-BLAST) بررسی کنید، PCR گرادیانی بزنید و شرایط را گزارش دهید. نتیجه‌ی آزمایشگاهی را با ما به اشتراک بگذارید تا پیشنهادها بهتر شوند." },
  ],
};

const ORGS = ["Homo sapiens", "Mus musculus", "Rattus norvegicus", "Danio rerio", "Arabidopsis thaliana", "Drosophila melanogaster",
  "Saccharomyces cerevisiae", "Caenorhabditis elegans", "Gallus gallus", "Bos taurus", "Sus scrofa", "Oryza sativa"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const fmt = (s: string = "", p: Record<string, any> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));
const norm = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith(">")).join("").replace(/[\s\d]/g, "").toUpperCase().replace(/U/g, "T");
function parseQpcrCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("empty");
  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]+/g, ""));
  const find = (...names: string[]) => headers.findIndex((h) => names.includes(h));
  const sampleI = find("sample", "samplename", "sampleid");
  const targetI = find("target", "targetname", "assay", "gene");
  const ctI = find("ct", "cq", "thresholdcycle");
  const groupI = find("group", "condition", "treatment");
  const repI = find("replicate", "rep", "technicalreplicate");
  const typeI = find("type", "welltype", "task", "role");
  const qtyI = find("quantity", "qty", "copies", "concentration", "input");
  if (sampleI < 0 || targetI < 0 || ctI < 0) throw new Error("headers");
  const data = rows.slice(1).filter((r) => r.some((v) => v.trim()));
  if (data.length > 2000) throw new Error("limit");
  return data.map((r) => {
    const sample = (r[sampleI] || "").trim(), target = (r[targetI] || "").trim();
    const group = groupI >= 0 ? (r[groupI] || "").trim() : "control";
    const rawCt = (r[ctI] || "").trim();
    const ct = !rawCt || /^(undetermined|undet|na|n\/a|no ct)$/i.test(rawCt) ? null : Number(rawCt);
    if (!sample || !target || (ct !== null && !Number.isFinite(ct))) throw new Error("row");
    const rawType = typeI >= 0 ? (r[typeI] || "").trim().toLowerCase().replace(/\s+/g, "") : "";
    const well_type = !rawType || rawType === "unknown" ? "sample" : rawType === "-rt" || rawType === "nort" || rawType === "no-rt" || rawType === "minusrt" ? "nrt" : rawType === "std" ? "standard" : rawType;
    const rawQty = qtyI >= 0 ? (r[qtyI] || "").trim() : "";
    const quantity = rawQty ? Number(rawQty) : null;
    if (quantity !== null && !Number.isFinite(quantity)) throw new Error("row");
    return { sample, target, ct, group: group || "control", replicate: repI >= 0 ? (r[repI] || "").trim() : "", well_type, quantity };
  });
}
const AA3: Record<string, string> = { ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E", GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F", PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V" };

async function apiFetch(path: string, token: string | null, init: RequestInit = {}) {
  const headers: Record<string, string> = { ...((init.headers as any) || {}) };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try { res = await fetch(API + path, { ...init, headers }); } catch { throw Object.assign(new Error("network"), { code: "network" }); }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: any) => d.msg).join("; ");
    } catch { /* ignore */ }
    throw Object.assign(new Error(msg), { code: res.status === 429 ? "rate" : res.status === 401 ? "auth" : "http" });
  }
  return res.json();
}

function download(name: string, text: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: any) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const htmlTable = (head: string[], rows: any[][]) =>
  `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const csvCell = (v: any) => { const x = String(v ?? ""); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
const toCsv = (head: string[], rows: any[][]) => [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** Self-contained, printable HTML report (Print → Save as PDF gives a citable PDF). */
function downloadReport(lang: Lang, t: Record<string, string>, fileBase: string, title: string, sections: { h: string; html: string }[]) {
  const rtl = lang === "fa";
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const doc = `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,Segoe UI,Tahoma,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#1e293b;line-height:1.5}
h1{color:#1e40af;margin-bottom:4px}h2{color:#1e40af;font-size:17px;border-bottom:2px solid #dbeafe;padding-bottom:4px;margin-top:28px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0;direction:ltr}th,td{border:1px solid #cbd5e1;padding:5px 8px;text-align:left}
th{background:#f1f5f9}code,.mono{font-family:ui-monospace,Consolas,monospace;word-break:break-all}.muted{color:#64748b;font-size:13px}
ul{padding-inline-start:20px}@media print{body{margin:0}h2{break-after:avoid}table{break-inside:avoid}}</style></head><body>
<h1>${esc(title)}</h1><p class="muted">Primer AI · ${esc(t.report_generated)}: ${esc(stamp)}</p>
${sections.map((s) => `<h2>${esc(s.h)}</h2>${s.html}`).join("\n")}
<h2>${esc(t.report_cite)}</h2><ul class="muted"><li>Untergasser A. et al. (2012) Primer3 — new capabilities and interfaces. Nucleic Acids Res 40:e115.</li>
<li>SantaLucia J. (1998) A unified view of polymer, dumbbell, and oligonucleotide DNA nearest-neighbor thermodynamics. PNAS 95:1460–1465.</li>
<li>Livak KJ, Schmittgen TD (2001) Analysis of relative gene expression data using real-time quantitative PCR and the 2^−ΔΔCT method. Methods 25:402–408.</li>
<li>Bustin SA et al. (2009) The MIQE guidelines. Clin Chem 55:611–622.</li><li>NCBI RefSeq (O'Leary et al., 2016, Nucleic Acids Res 44:D733).</li></ul>
</body></html>`;
  download(`${fileBase}.html`, doc, "text/html");
}

const inputCls = "w-full border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const seqCls = inputCls + " font-mono text-sm";
const btnBase = "px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors";
const riskCls: Record<string, string> = { low: "bg-green-100 text-green-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-red-100 text-red-800" };

type Ctx = { t: Record<string, string>; lang: Lang; call: (p: string, i?: RequestInit) => Promise<any>; token: string | null; notify: (m: string, k?: "error" | "ok") => void; fail: (e: any) => void };

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (<label className="block"><span className="block text-sm font-semibold mb-1 text-slate-700">{label}</span>{children}{hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}</label>);
}
function Btn({ children, onClick, disabled, kind = "primary", title }: { children: any; onClick?: () => void; disabled?: boolean; kind?: "primary" | "ghost" | "danger" | "dark"; title?: string }) {
  const k = { primary: "bg-blue-700 hover:bg-blue-800 text-white", ghost: "bg-slate-100 hover:bg-slate-200 text-slate-800", danger: "bg-red-50 hover:bg-red-100 text-red-700", dark: "bg-slate-800 hover:bg-slate-900 text-white" }[kind];
  return <button title={title} onClick={onClick} disabled={disabled} className={`${btnBase} ${k}`}>{children}</button>;
}
function Risk({ v, t }: { v: string; t: Record<string, string> }) { return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskCls[v] || "bg-slate-100"}`}>{t["risk_" + v] || v}</span>; }
function CopyBtn({ text, t }: { text: string; t: Record<string, string> }) {
  const [ok, setOk] = useState(false);
  return <button className="text-xs text-blue-700 shrink-0 ms-2" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? t.copied : t.copy}</button>;
}
function worstOf(...r: string[]) { return r.sort((a, b) => ["low", "medium", "high"].indexOf(b) - ["low", "medium", "high"].indexOf(a))[0]; }

/* ------------------------------------------------------------------ */
/* Gel simulation (log scale)                                          */
/* ------------------------------------------------------------------ */
function Gel({ sizes, t }: { sizes: number[]; t: Record<string, string> }) {
  const ladder = [3000, 2000, 1500, 1000, 750, 500, 300, 200, 100];
  const H = 200, pad = 14, lo = Math.log(100), hi = Math.log(3000);
  const y = (s: number) => pad + ((hi - Math.log(Math.min(3000, Math.max(100, s)))) / (hi - lo)) * (H - 2 * pad);
  const lanes = sizes.slice(0, 3);
  const W = 70 + lanes.length * 60;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full max-w-xs mx-auto" role="img" aria-label={t.gel} direction="ltr">
      <rect x="0" y="0" width={W} height={H} rx="6" fill="#0f172a" />
      <text x="30" y={H + 14} fontSize="9" textAnchor="middle" fill="#64748b">{t.ladder}</text>
      {ladder.map((s) => (<g key={s}><rect x="12" y={y(s) - 1.5} width="36" height="3" fill="#cbd5e1" /><text x="52" y={y(s) + 3} fontSize="8" fill="#94a3b8">{s}</text></g>))}
      {lanes.map((s, i) => (<g key={i}><rect x={92 + i * 60} y={y(s) - 2} width="36" height="4" fill="#60a5fa" /><text x={110 + i * 60} y={H + 14} fontSize="9" textAnchor="middle" fill="#64748b">{s} bp</text></g>))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Troubleshooting Tab                                                 */
/* ------------------------------------------------------------------ */
function TroubleshootTab({ t, call, fail }: Ctx) {
  const [symptom, setSymptom] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!symptom) return;
    setLoading(true);
    setResult(null);
    try {
      // شبیه‌سازی: در آینده می‌توانید یک مسیر /troubleshoot به بک‌اند اضافه کنید
      // فعلاً از داده‌های kb.ts استفاده می‌کنیم (به صورت هاردکد شده)
      const causes: Record<string, any> = {
        no_band: { cause: "Annealing temperature too high or primers do not match", solution: ["Lower the annealing temperature in 2 °C steps.", "Check primer sequences with BLAST.", "Increase template amount or cycles."] },
        faint_band: { cause: "Too little template or too few cycles", solution: ["Increase template or add 3–5 cycles.", "Check template concentration and integrity."] },
        smear: { cause: "Too much template, low annealing temperature, or Mg²⁺ too high", solution: ["Dilute template 10–100×.", "Raise annealing temperature.", "Reduce Mg²⁺ in 0.5 mM steps."] },
        multi_bands: { cause: "Non-specific amplification", solution: ["Raise annealing temperature.", "Use hot-start polymerase.", "Redesign primers."] },
        wrong_size: { cause: "Primers may amplify a paralog or isoform", solution: ["Check isoforms and paralogs with BLAST.", "Sequence the unexpected band.", "Redesign primers in a unique region."] },
        dimer_band: { cause: "Primer-dimer formation", solution: ["Redesign primers without 3′ complementarity.", "Lower primer concentration to 0.1–0.3 µM.", "Use hot-start and higher annealing temperature."] },
      };
      
      // شبیه‌سازی تاخیر شبکه
      await new Promise(r => setTimeout(r, 800));
      
      setResult(causes[symptom] || { cause: "Unknown", solution: ["Please consult a molecular biology expert."] });
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-blue-800">{t.ts_title}</h2>
      <p className="text-sm text-slate-600">{t.ts_desc}</p>
      
      <div className="grid md:grid-cols-2 gap-4">
        <Field label={t.ts_symptom}>
          <select className={inputCls} value={symptom} onChange={(e) => setSymptom(e.target.value)}>
            <option value="">{t.ts_select}</option>
            <option value="no_band">No product band</option>
            <option value="faint_band">Faint band</option>
            <option value="smear">Smear</option>
            <option value="multi_bands">Several unexpected bands</option>
            <option value="wrong_size">Band of the wrong size</option>
            <option value="dimer_band">Primer-dimer</option>
          </select>
        </Field>
      </div>

      <button onClick={handleAnalyze} disabled={loading || !symptom} className="w-full bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-bold py-3 rounded-lg">
        {loading ? t.working : t.ts_analyze}
      </button>

      {result && (
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <h3 className="font-bold text-orange-800 mb-2">{t.ts_cause}: {result.cause}</h3>
          <ul className="list-disc ps-5 text-sm text-slate-700">
            {result.solution.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusPill({ v, t }: { v: string; t: Record<string, string> }) {
  const c = v === "pass" ? "bg-green-100 text-green-800" : v === "fail" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800";
  return <span className={`px-2 py-0.5 rounded font-semibold ${c}`}>{t["st_" + v] || v}</span>;
}

function downloadQpcrReport(r: any, lang: Lang, t: Record<string, string>, ref: string, control: string) {
  downloadReport(lang, t, "qpcr_report", t.report_title_qpcr, [
    { h: t.report_inputs, html: htmlTable(["Reference target", "Control group", "Wells analysed", "Platform version"],
      [[ref, control, String((r.qc || []).reduce((n: number, q: any) => n + q.n, 0)), r.version || ""]]) },
    { h: t.report_results, html: htmlTable(["Group", "Target", "n", "Mean ΔCt", "ΔΔCt", "Fold change (2^−ΔΔCt)"],
      (r.groups || []).map((g: any) => [g.group, g.target, g.n, g.mean_delta_ct, g.ddct, g.fold_change])) +
      htmlTable(["Group", "Sample", "Target", "ΔCt", "ΔΔCt", "Fold change"], (r.samples || []).map((x: any) => [x.group, x.sample, x.target, x.delta_ct, x.ddct, x.fold_change])) },
    { h: t.qpcr_qc, html: htmlTable(["Group", "Sample", "Target", "Replicates", "Mean Ct", "SD Ct"], (r.qc || []).map((q: any) => [q.group, q.sample, q.target, q.n, q.mean_ct, q.sd_ct])) +
      ((r.controls || []).length ? htmlTable(["Control", "Sample", "Target", "Ct", "Status", "Note"], r.controls.map((c: any) => [c.type === "nrt" ? "-RT" : c.type.toUpperCase(), c.sample, c.target, c.ct ?? "not detected", c.status, c.note])) : "") +
      ((r.standard_curves || []).length ? htmlTable(["Target", "Points", "Slope", "Intercept", "Efficiency %", "R²", "Status"], r.standard_curves.map((c: any) => [c.target, c.points, c.slope, c.intercept, c.efficiency, c.r2, c.status])) : "") +
      ((r.warnings || []).length ? `<ul>${r.warnings.map((w: string) => `<li>${esc(w)}</li>`).join("")}</ul>` : "") },
    { h: t.report_method, html: `<p>${esc(r.method)}. Technical replicates are averaged per sample; ΔCt = Ct(target) − Ct(reference); ΔΔCt is calibrated to the mean ΔCt of the control group. Analysed ${esc(r.analyzed_at || "")}.</p>` },
  ]);
}

/* ------------------------------------------------------------------ */
/* RT-qPCR Ct analysis                                                  */
/* ------------------------------------------------------------------ */
function QPCRTab({ t, lang, call, fail, notify, onResult }: Ctx & { onResult?: (r: any) => void }) {
  const [csv, setCsv] = useState("");
  const [controlGroup, setControlGroup] = useState("control");
  const [referenceTarget, setReferenceTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    let wells: any[];
    try { wells = parseQpcrCsv(csv); }
    catch { notify(t.qpcr_bad_csv); return; }
    if (!referenceTarget.trim() || !controlGroup.trim()) { notify(t.qpcr_bad_csv); return; }
    setLoading(true); setResult(null);
    try {
      setResult(await call("/analyze-qpcr", { method: "POST", body: JSON.stringify({
        wells, reference_target: referenceTarget.trim(), control_group: controlGroup.trim(),
      }) }).then((r: any) => { onResult?.(r); return r; }));
    } catch (e) { fail(e); } finally { setLoading(false); }
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    try { setCsv(await file.text()); setResult(null); }
    catch { notify(t.qpcr_bad_csv); }
  };

  return (
    <div className="space-y-5">
      <section className="border rounded-xl p-4 bg-blue-50 space-y-3">
        <h2 className="text-xl font-bold text-blue-800">{t.qpcr_title}</h2>
        <p className="text-sm text-slate-700">{t.qpcr_desc}</p>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label={t.qpcr_control_group}><input className={inputCls} value={controlGroup} onChange={(e) => setControlGroup(e.target.value)} placeholder="control" /></Field>
          <Field label={t.qpcr_reference_target}><input className={inputCls} value={referenceTarget} onChange={(e) => setReferenceTarget(e.target.value)} placeholder="ACTB" /></Field>
        </div>
        <Field label={t.qpcr_csv_label} hint={`${t.qpcr_csv_hint} ${t.qpcr_types_hint}`}>
          <textarea dir="ltr" className={seqCls + " h-48"} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={t.qpcr_csv_example} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${btnBase} bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer`}>
            {t.qpcr_upload}<input className="hidden" type="file" accept=".csv,text/csv" onChange={(e) => { void loadFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          </label>
          <Btn onClick={analyze} disabled={loading || !csv.trim()}>{loading ? t.working : t.qpcr_analyze}</Btn>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-600">CSV example</summary>
          <pre dir="ltr" className="mt-2 bg-white border rounded p-2 overflow-x-auto">{t.qpcr_csv_example}</pre>
        </details>
      </section>

      {result && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-blue-800">{t.qpcr_results}</h3>
            <div className="flex flex-wrap gap-2">
              <Btn kind="dark" onClick={() => downloadQpcrReport(result, lang, t, referenceTarget, controlGroup)}>{t.report}</Btn>
              <Btn kind="ghost" onClick={() => download("qpcr_results.csv", toCsv(["group", "sample", "target", "delta_ct", "ddct", "fold_change"],
                (result.samples || []).map((r: any) => [r.group, r.sample, r.target, r.delta_ct, r.ddct, r.fold_change])), "text/csv")}>{t.reportCsv}</Btn>
            </div>
          </div>
          <p className="text-xs text-slate-500">{result.method} · {t.reportPrint}</p>
          {result.controls?.length > 0 && <div>
            <p className="font-semibold text-sm mb-1">{t.qpcr_controls}</p>
            <div className="overflow-x-auto border rounded-lg"><table className="w-full text-xs" dir="ltr">
              <thead className="bg-slate-100"><tr>{[t.qpcr_type, t.qpcr_sample, t.qpcr_target, "Ct", t.qpcr_status, t.qpcr_note].map((h, i) => <th key={i} className="text-start p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{result.controls.map((r: any, i: number) => <tr key={i} className="border-t">
                <td className="p-2 uppercase">{r.type === "nrt" ? "−RT" : r.type}</td><td className="p-2">{r.sample}</td><td className="p-2">{r.target}</td>
                <td className="p-2">{r.ct ?? "—"}</td><td className="p-2"><StatusPill v={r.status} t={t} /></td><td className="p-2">{r.note}</td>
              </tr>)}</tbody></table></div>
          </div>}
          {result.standard_curves?.length > 0 && <div>
            <p className="font-semibold text-sm mb-1">{t.qpcr_curves}</p>
            <div className="overflow-x-auto border rounded-lg"><table className="w-full text-xs" dir="ltr">
              <thead className="bg-slate-100"><tr>{[t.qpcr_target, t.qpcr_slope, t.qpcr_eff, t.qpcr_r2, t.qpcr_status].map((h, i) => <th key={i} className="text-start p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{result.standard_curves.map((c: any, i: number) => <tr key={i} className="border-t">
                <td className="p-2">{c.target}</td><td className="p-2">{c.slope}</td><td className="p-2">{c.efficiency ?? "—"}%</td><td className="p-2">{c.r2}</td><td className="p-2"><StatusPill v={c.status} t={t} /></td>
              </tr>)}</tbody></table></div>
          </div>}
          {result.warnings?.length > 0 && <div className="bg-yellow-50 border-s-4 border-yellow-500 p-3 text-sm">
            <b>{t.qpcr_warnings}</b><ul className="list-disc ps-5 mt-1">{result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
          </div>}
          {result.groups?.length ? <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm" dir="ltr"><thead className="bg-slate-100"><tr>
              {[t.qpcr_group, t.qpcr_target, t.qpcr_samples, t.qpcr_mean_delta, t.qpcr_ddct, t.qpcr_fold].map((h) => <th key={h} className="text-start p-2 whitespace-nowrap">{h}</th>)}
            </tr></thead><tbody>{result.groups.map((r: any, i: number) => <tr key={i} className="border-t">
              <td className="p-2">{r.group}</td><td className="p-2">{r.target}</td><td className="p-2">{r.n}</td>
              <td className="p-2">{r.mean_delta_ct}</td><td className="p-2">{r.ddct}</td><td className="p-2 font-semibold">{r.fold_change}</td>
            </tr>)}</tbody></table>
          </div> : <p className="text-sm text-slate-600">{t.qpcr_empty}</p>}
          {result.samples?.length > 0 && <details>
            <summary className="cursor-pointer font-semibold text-sm">{t.qpcr_sample_results}</summary>
            <div className="overflow-x-auto border rounded-lg mt-2"><table className="w-full text-xs" dir="ltr">
              <thead className="bg-slate-100"><tr>{[t.qpcr_group, t.qpcr_sample, t.qpcr_target, "ΔCt", "ΔΔCt", t.qpcr_fold].map((h, i) => <th key={i} className="text-start p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{result.samples.map((r: any, i: number) => <tr key={i} className="border-t">
                <td className="p-2">{r.group}</td><td className="p-2">{r.sample}</td><td className="p-2">{r.target}</td>
                <td className="p-2">{r.delta_ct}</td><td className="p-2">{r.ddct}</td><td className="p-2">{r.fold_change}</td>
              </tr>)}</tbody>
            </table></div>
          </details>}
          {result.qc?.length > 0 && <details>
            <summary className="cursor-pointer font-semibold text-sm">{t.qpcr_qc}</summary>
            <div className="overflow-x-auto border rounded-lg mt-2"><table className="w-full text-xs" dir="ltr">
              <thead className="bg-slate-100"><tr>{[t.qpcr_group, t.qpcr_sample, t.qpcr_target, t.qpcr_n, t.qpcr_mean_ct, t.qpcr_sd_ct].map((h, i) => <th key={i} className="text-start p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{result.qc.map((r: any, i: number) => <tr key={i} className="border-t">
                <td className="p-2">{r.group}</td><td className="p-2">{r.sample}</td><td className="p-2">{r.target}</td>
                <td className="p-2">{r.n}</td><td className="p-2">{r.mean_ct}</td><td className="p-2">{r.sd_ct}</td>
              </tr>)}</tbody>
            </table></div>
          </details>}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Design tab                                                          */
/* ------------------------------------------------------------------ */
function downloadDesignReport(r: any, gene: any, seq: string, lang: Lang, t: Record<string, string>) {
  const pr = r.parameters || {};
  const exonTxt: Record<string, string> = { junction_primer: "primer spans an exon-exon junction", intron_spanning: "amplicon spans an intron", none: "no exon junction covered", unknown: "no exon annotation" };
  downloadReport(lang, t, `${gene?.symbol || "primer"}_design_report`, t.report_title_design, [
    { h: t.report_inputs, html: htmlTable(["Gene", "Transcript", "Organism", "Template length", "Exons", "CDS"],
      [[gene?.symbol || "custom sequence", gene?.accession || "—", gene?.organism || "—", `${seq.length} nt`, gene?.annotation?.exons?.length ?? "—",
        gene?.annotation?.cds_start ? `${gene.annotation.cds_start}-${gene.annotation.cds_end}` : "—"]]) +
      htmlTable(["Application", "qPCR chemistry", "Polymerase", "Target Tm", "Product size", "Region", "Junction mode"],
      [[pr.mode, pr.qpcr_chemistry || "—", pr.polymerase, `${pr.tm} °C (${pr.source})`, `${pr.size_range?.[0]}-${pr.size_range?.[1]} bp`, pr.region ? pr.region.join("-") : "whole template", pr.junction_mode ? "yes" : "no"]]) },
    { h: t.report_results, html: htmlTable(["Pair", "Forward 5′→3′", "Reverse 5′→3′", "Tm F/R", "GC F/R", "Product", "Anneal", "Probe", "Exon check", "Structure risk"],
      r.pairs.map((x: any, i: number) => [i + 1, `${x.left.seq_tail} (${x.left.start1}-${x.left.end1})`, `${x.right.seq_tail} (${x.right.start1}-${x.right.end1})`,
        `${x.left.tm}/${x.right.tm} °C`, `${x.left.gc}/${x.right.gc}%`, `${x.product_size} bp`, `${x.anneal_temp} °C`, x.probe ? `${x.probe.seq} (Tm ${x.probe.tm})` : "—",
        exonTxt[x.exon?.status] || x.exon?.status, x.risk?.overall])) +
      ((r.warnings || []).length ? `<ul>${r.warnings.map((w: string) => `<li>${esc(t["warn_" + w] || w)}</li>`).join("")}</ul>` : "") },
    { h: t.report_method, html: `<p>Primer3 ${esc(pr.primer3 || "")}; Tm by SantaLucia nearest-neighbour (50 mM Na⁺, 1.5 mM Mg²⁺, 0.6 mM dNTP, 50 nM primer). Hairpin, self-/hetero-dimer and 3′ end stability rated against the annealing temperature. Exon boundaries from the NCBI RefSeq record. In-silico design: verify specificity (Primer-BLAST) and validate experimentally (gradient PCR, melt curve, efficiency).</p>` },
  ]);
}

type GeneState = { symbol: string; accession: string; title: string; sequence: string; annotation: any; uniprot: any; organism: string; alternatives: any[]; protein_id?: string };

function DesignTab(p: Ctx & { seq: string; setSeq: (s: string) => void; gene: GeneState | null; setGene: (g: GeneState | null) => void; annotation: any; maxLen: number; onDesign: (r: any) => void }) {
  const { t, call, token, notify, fail, seq, setSeq, gene, setGene, annotation } = p;
  const [geneName, setGeneName] = useState("");
  const [organism, setOrganism] = useState("Homo sapiens");
  const [geneLoading, setGeneLoading] = useState(false);
  const [rs, setRs] = useState(""); const [re, setRe] = useState("");
  const [prompt, setPrompt] = useState("");
   const [mode, setMode] = useState("standard"); const [qpcrChemistry, setQpcrChemistry] = useState("taqman"); const [polymerase, setPolymerase] = useState("taq");
  const [tailL, setTailL] = useState(""); const [tailR, setTailR] = useState(""); const [mutation, setMutation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [protocol, setProtocol] = useState<any>(null); const [protoFor, setProtoFor] = useState(0);
  const [blast, setBlast] = useState<Record<number, any>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [fbPair, setFbPair] = useState(0); const [fbNotes, setFbNotes] = useState(""); const [fbDone, setFbDone] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((x) => clearInterval(x)); }, []);

  const fetchGene = async (accession?: string) => {
    if (!geneName.trim() && !accession) return;
    setGeneLoading(true);
    try {
      const name = geneName.trim() || gene?.symbol || "";
      const d = await call(`/fetch-gene?gene_name=${encodeURIComponent(name)}&organism=${encodeURIComponent(organism)}${accession ? `&accession=${encodeURIComponent(accession)}` : ""}`);
      setGene({ symbol: d.symbol, accession: d.accession, title: d.title, sequence: d.sequence, annotation: d.annotation, uniprot: d.uniprot, organism: d.organism, alternatives: d.alternatives, protein_id: d.protein_id });
      setSeq(d.sequence); setResult(null);
    } catch (e) { fail(e); } finally { setGeneLoading(false); }
  };

  const submit = async () => {
    setLoading(true); setResult(null); setProtocol(null); setBlast({}); setSaved({}); setFbDone(false);
    try {
      const r = await call("/chat-design", { method: "POST", body: JSON.stringify({
         sequence: seq, user_prompt: prompt, tail_left: tailL, tail_right: tailR, mutation, mode, qpcr_chemistry: qpcrChemistry, polymerase,
        region_start: parseInt(rs) || 0, region_end: parseInt(re) || 0, annotation, gene: gene?.symbol || "" }) });
      setResult(r); p.onDesign(r);
    } catch (e) { fail(e); } finally { setLoading(false); }
  };

  const getProtocol = async (i: number) => {
    const pr = result.pairs[i];
    try {
      const d = await call(`/suggest-protocol?anneal_temp=${pr.anneal_temp}&gc_content=${pr.amplicon_gc}&product_size=${pr.product_size}&polymerase=${result.parameters.polymerase}`);
      setProtocol(d.protocol); setProtoFor(i);
    } catch (e) { fail(e); }
  };

  const savePair = async (i: number) => {
    if (!token) return notify(t.loginRequired);
    const pr = result.pairs[i];
    try {
      await call("/save-primer", { method: "POST", body: JSON.stringify({
        name: `${gene?.symbol || "primer"}_${pr.left.start1}-${pr.right.end1}`, left_seq: pr.left.seq_tail, right_seq: pr.right.seq_tail,
        left_tm: pr.left.tm, right_tm: pr.right.tm, product_size: pr.product_size, anneal_temp: pr.anneal_temp, gene: gene?.symbol || "",
        params: { ...result.parameters, accession: gene?.accession } }) });
      setSaved((s) => ({ ...s, [i]: true }));
    } catch (e) { fail(e); }
  };

  const runBlast = async (i: number) => {
    if (!token) return notify(t.blastNeedsLogin);
    const pr = result.pairs[i];
    setBlast((b) => ({ ...b, [i]: { status: "running" } }));
    try {
      const { job_id } = await call("/verify-primer", { method: "POST", body: JSON.stringify({ forward: pr.left.seq, reverse: pr.right.seq, organism: gene?.organism || organism, gene: gene?.symbol || "" }) });
      const started = Date.now();
      const iv = window.setInterval(async () => {
        try {
          const s = await call(`/verify-primer/${job_id}`);
          if (s.status === "done" || s.status === "error" || Date.now() - started > 6 * 60 * 1000) {
            clearInterval(iv);
            setBlast((b) => ({ ...b, [i]: s.status === "done" ? { status: "done", result: s.result } : { status: "error", error: s.error || "timeout" } }));
          }
        } catch (e) { clearInterval(iv); setBlast((b) => ({ ...b, [i]: { status: "error", error: String((e as any).message) } })); }
      }, 5000);
      timers.current.push(iv);
    } catch (e) { setBlast((b) => ({ ...b, [i]: undefined })); fail(e); }
  };

  const exportGb = async (i: number) => {
    const pr = result.pairs[i];
    try {
      const d = await call("/export-genbank", { method: "POST", body: JSON.stringify({ sequence: seq, name: gene?.symbol || "PrimerAI", features: [
        { name: `${gene?.symbol || "P"}_F${i + 1}`, start: pr.left.start1, end: pr.left.end1, strand: 1 },
        { name: `${gene?.symbol || "P"}_R${i + 1}`, start: pr.right.start1, end: pr.right.end1, strand: -1 }] }) });
      download(d.filename, d.content);
    } catch (e) { fail(e); }
  };

  const exportCsv = () => {
    const rows = ["Name,Sequence,Scale,Purification"];
    result.pairs.forEach((pr: any, i: number) => {
      const n = `${gene?.symbol || "primer"}_${i + 1}`;
      [[`${n}_F`, pr.left.seq_tail], [`${n}_R`, pr.right.seq_tail]].forEach(([nm, sq]) => rows.push(`${nm},${sq},25nm,${sq.length > 60 ? "PAGE" : "STD"}`));
    });
    download("primers_idt.csv", rows.join("\n") + "\n", "text/csv");
  };

  const sendFeedback = async (res: string) => {
    const pr = result.pairs[fbPair];
    try {
      await call("/experimental-feedback", { method: "POST", body: JSON.stringify({
        primer_pair: `${pr.left.seq} / ${pr.right.seq}`, result: res, polymerase: result.parameters.polymerase,
        template: gene?.accession || "", anneal_temp: pr.anneal_temp, notes: fbNotes }) });
      setFbDone(true);
    } catch (e) { fail(e); }
  };

  const side = (s: string) => (s === "left" ? t.forward : t.reverse);

  return (
    <div className="space-y-6">
      <section className="bg-blue-50 rounded-xl p-4 space-y-3">
        <div className="grid md:grid-cols-[1fr_220px_auto] gap-3 items-end">
          <Field label={t.geneSearch}><input className={inputCls} dir="ltr" value={geneName} onChange={(e) => setGeneName(e.target.value)} placeholder="BRCA1" onKeyDown={(e) => e.key === "Enter" && fetchGene()} /></Field>
          <Field label={t.organism}><select className={inputCls} value={organism} onChange={(e) => setOrganism(e.target.value)}>{ORGS.map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Btn onClick={() => fetchGene()} disabled={geneLoading}>{geneLoading ? t.working : t.fetchSeq}</Btn>
        </div>
        {geneLoading && <p className="text-xs text-slate-600">{t.wake}</p>}
        {gene && (
          <div className="text-sm text-slate-700 space-y-1" dir="ltr">
            <div><b>{gene.symbol}</b> · {gene.accession} · {gene.sequence.length} nt</div>
            <div className="text-xs text-slate-500">{gene.title}</div>
            <div className="text-xs">{gene.annotation?.cds_start ? fmt(t.geneInfo, { cds: `${gene.annotation.cds_start}-${gene.annotation.cds_end}`, n: gene.annotation.exons.length }) : t.noAnn}</div>
            {gene.alternatives?.length > 1 && (
              <label className="text-xs">{t.transcript}: <select className="border rounded p-1 ms-1" value={gene.accession} onChange={(e) => fetchGene(e.target.value)}>
                {gene.alternatives.map((a: any) => <option key={a.accession} value={a.accession}>{a.accession} ({a.length} nt)</option>)}</select></label>
            )}
          </div>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2"><Field label={t.sequence} hint={fmt(t.seqHint, { max: p.maxLen })}>
          <textarea dir="ltr" className={seqCls + " h-28"} value={seq} onChange={(e) => setSeq(e.target.value)} placeholder="ATGC…" /></Field></div>
        <Field label={t.prompt}><input className={inputCls} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.promptPh} /></Field>
        <Field label={t.region}>
          <div className="flex items-center gap-2" dir="ltr"><span className="text-xs">{t.from}</span><input className={inputCls} inputMode="numeric" value={rs} onChange={(e) => setRs(e.target.value)} />
            <span className="text-xs">{t.to}</span><input className={inputCls} inputMode="numeric" value={re} onChange={(e) => setRe(e.target.value)} /></div></Field>
        <Field label={t.mode}><select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
          {["standard", "qpcr", "sanger"].map((m) => <option key={m} value={m}>{t["mode_" + m]}</option>)}</select></Field>
        {mode === "qpcr" && <Field label={t.qpcr_chemistry} hint={t.qpcr_chemistry_hint}><select className={inputCls} value={qpcrChemistry} onChange={(e) => setQpcrChemistry(e.target.value)}>
          <option value="taqman">{t.qpcr_taqman}</option><option value="sybr">{t.qpcr_sybr}</option></select></Field>}
        <Field label={t.polymerase}><select className={inputCls} value={polymerase} onChange={(e) => setPolymerase(e.target.value)}>
          <option value="taq">{t.pol_taq}</option><option value="hifi">{t.pol_hifi}</option></select></Field>
        <Field label={t.tailLeft}><input dir="ltr" className={seqCls} value={tailL} onChange={(e) => setTailL(e.target.value)} placeholder="GAATTC" /></Field>
        <Field label={t.tailRight}><input dir="ltr" className={seqCls} value={tailR} onChange={(e) => setTailR(e.target.value)} placeholder="AAGCTT" /></Field>
        <div className="md:col-span-2"><Field label={t.mutation} hint={t.mutationHint}><input dir="ltr" className={seqCls} value={mutation} onChange={(e) => setMutation(e.target.value)} placeholder="A120G" /></Field></div>
      </div>
      <button onClick={submit} disabled={loading || !seq.trim()} className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold py-3 rounded-lg">{loading ? t.working : t.designBtn}</button>

      {result && (
        <section className="space-y-5 border-t pt-6">
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="bg-blue-100 text-blue-900 px-3 py-1 rounded-full">{t.detectedTm}: {result.parameters.tm} °C ({t["src_" + result.parameters.source]})</span>
            <span className="bg-slate-100 px-3 py-1 rounded-full">{t.size}: {result.parameters.size_range[0]}–{result.parameters.size_range[1]} bp</span>
            {result.pairs.length > 0 && <Btn kind="dark" onClick={exportCsv}>{t.csvIdt}</Btn>}
            {result.pairs.length > 0 && <Btn kind="dark" onClick={() => downloadDesignReport(result, gene, seq, p.lang, t)}>{t.report}</Btn>}
          </div>
          {result.warnings.map((w: string) => <div key={w} className="bg-yellow-50 border-s-4 border-yellow-500 p-3 text-sm text-yellow-900">{t["warn_" + w] || w}</div>)}

          {result.pairs.length === 0 ? (
            <div className="bg-yellow-50 border-s-4 border-yellow-500 p-4 rounded">
              <h3 className="font-bold">{t.noPrimers}</h3><p className="text-sm mt-1">{t.noPrimersHelp}</p>
              <pre className="text-xs mt-2 whitespace-pre-wrap" dir="ltr">{[result.explain.PRIMER_LEFT_EXPLAIN, result.explain.PRIMER_RIGHT_EXPLAIN, result.explain.PRIMER_PAIR_EXPLAIN].filter(Boolean).join("\n")}</pre>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-5">
              {result.pairs.map((pr: any, i: number) => (
                <article key={i} className="border rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                  <header className="flex justify-between items-center border-b pb-2"><h4 className="font-bold text-blue-800">{t.pair} {i + 1}</h4><Risk v={pr.risk.overall} t={t} /></header>
                  {(["left", "right"] as const).map((sd) => (
                    <div key={sd}>
                      <p className="text-xs font-semibold text-slate-500 mb-1">{side(sd)} · {pr[sd].start1}–{pr[sd].end1}</p>
                      <div className="bg-slate-50 rounded p-2 font-mono text-sm flex justify-between items-center" dir="ltr"><span className="break-all">{pr[sd].seq_tail}</span><CopyBtn text={pr[sd].seq_tail} t={t} /></div>
                      <p className="text-xs text-slate-600 mt-1" dir="ltr">{t.tm} {pr[sd].tm} °C · {t.gc} {pr[sd].gc}% · {pr[sd].len} {t.len}</p>
                    </div>
                  ))}
                  {pr.probe && (<div><p className="text-xs font-semibold text-purple-700 mb-1">{t.probe}</p>
                    <div className="bg-purple-50 rounded p-2 font-mono text-sm flex justify-between" dir="ltr"><span className="break-all">{pr.probe.seq}</span><CopyBtn text={pr.probe.seq} t={t} /></div>
                    <p className="text-xs text-slate-600 mt-1" dir="ltr">{t.tm} {pr.probe.tm} °C</p></div>)}
                  <dl className="text-xs space-y-1">
                    {([[t.hairpin, worstOf(pr.hairpin.left.risk, pr.hairpin.right.risk), `${pr.hairpin.left.tm}/${pr.hairpin.right.tm} °C`],
                      [t.selfDimer, worstOf(pr.self_dimer.left.risk, pr.self_dimer.right.risk), `${pr.self_dimer.left.dg}/${pr.self_dimer.right.dg} kcal`],
                      [t.heteroDimer, pr.hetero_dimer.risk, `${pr.hetero_dimer.tm} °C · ${pr.hetero_dimer.dg} kcal`],
                      [t.endDimer, pr.end_dimer.risk, `${pr.end_dimer.dg} kcal`]] as any[]).map(([l, r, d]) => (
                      <div key={l} className="flex justify-between items-center gap-2"><dt>{l}</dt><dd className="flex gap-2 items-center"><span className="text-slate-500" dir="ltr">{d}</span><Risk v={r} t={t} /></dd></div>))}
                  </dl>
                  <div className="bg-slate-100 rounded p-2 text-sm" dir="ltr"><div className="flex justify-between font-semibold"><span>{t.size}: {pr.product_size} bp</span><span>{t.anneal}: {pr.anneal_temp} °C</span></div></div>
                  <p className={`text-xs p-2 rounded ${pr.exon.status === "none" ? "bg-yellow-50 text-yellow-900" : pr.exon.status === "unknown" ? "bg-slate-50 text-slate-600" : "bg-green-50 text-green-900"}`}>{t["ex_" + pr.exon.status]}</p>
                  <ul className="text-xs space-y-1">{pr.notes.map((n: any, k: number) => (
                    <li key={k} className={n.kind === "good" ? "text-green-800" : "text-yellow-800"}>{n.kind === "good" ? "✓ " : "! "}{fmt(t["note_" + n.code], { ...n.p, side: n.p.side ? side(n.p.side) : "" })}</li>))}</ul>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <Btn kind="ghost" onClick={() => savePair(i)}>{saved[i] ? t.saved : t.save}</Btn>
                    <Btn kind="ghost" onClick={() => getProtocol(i)}>{t.protocol}</Btn>
                    <Btn kind="ghost" onClick={() => exportGb(i)}>{t.genbank}</Btn>
                    <Btn onClick={() => runBlast(i)} disabled={blast[i]?.status === "running"}>{blast[i]?.status === "running" ? t.blasting : t.blast}</Btn>
                  </div>
                  {blast[i]?.status === "error" && <p className="text-xs text-red-700">{blast[i].error}</p>}
                  {blast[i]?.status === "done" && (() => { const b = blast[i].result; return (
                    <div className="text-xs bg-purple-50 border border-purple-200 rounded p-2 space-y-1">
                      <p className="font-semibold">{b.n_products === 0 ? t.blastNone : fmt(t.blastSummary, { n: b.n_products, on: b.n_on_target, other: b.n_other })}</p>
                      <ul className="list-disc ps-4" dir="ltr">{b.products.slice(0, 5).map((x: any) => <li key={x.accession} className="truncate" title={x.title}>{x.on_target ? "✓ " : "⚠ "}{x.accession} · {x.size} bp · {x.mismatches} mm</li>)}</ul>
                      <p className="text-slate-500">{t.blastNote}</p></div>); })()}
                </article>
              ))}
            </div>
          )}
          {result.pairs.length > 0 && <p className="text-xs text-slate-500" dir="ltr">{fmt(t.provenance, { v: result.parameters.primer3 })}</p>}

          {result.mutation && (
            <div className="border rounded-xl p-4 bg-white">
              <h4 className="font-bold mb-1">{t.sdm}: {result.mutation.notation}{result.mutation.aa_change ? ` (p.${result.mutation.aa_change}, ${t["eff_" + result.mutation.effect]})` : ""}</h4>
              <p className="text-xs text-slate-500 mb-3">{t.sdmHint}</p>
              {result.sdm && (<div className="space-y-2 font-mono text-sm" dir="ltr">
                <div className="bg-slate-50 p-2 rounded flex justify-between"><span className="break-all">F: {result.sdm.forward}</span><CopyBtn text={result.sdm.forward} t={t} /></div>
                <div className="bg-slate-50 p-2 rounded flex justify-between"><span className="break-all">R: {result.sdm.reverse}</span><CopyBtn text={result.sdm.reverse} t={t} /></div>
                <p className="text-xs font-sans">{result.sdm.length} nt · GC {result.sdm.gc}% · Tm {result.sdm.tm} °C — {result.sdm.meets_criteria ? t.sdmOk : t.sdmWeak}</p></div>)}
            </div>
          )}

          {protocol && (
            <div className="border rounded-xl p-4 bg-white text-sm space-y-1" dir="ltr">
              <h4 className="font-bold mb-2">{t.protocolTitle} — {t.pair} {protoFor + 1} ({protocol.polymerase_profile})</h4>
              {["initial_denaturation", "denaturation", "annealing", "extension", "final_extension", "cycles"].map((k) => <p key={k}><b>{k.replace(/_/g, " ")}:</b> {protocol[k]}</p>)}
              {protocol.additives.map((a: string) => <p key={a} className="bg-yellow-50 p-2 rounded text-yellow-900">{t["additive_" + a]}</p>)}
              <p className="text-xs text-slate-500 pt-2">{protocol.disclaimer}</p>
            </div>
          )}

          {result.pairs.length > 0 && (<div className="border rounded-xl p-4 bg-white"><h4 className="font-bold mb-3">{t.gel}</h4><Gel sizes={result.pairs.map((x: any) => x.product_size)} t={t} /></div>)}

          {result.pairs.length > 0 && (
            <div className="border rounded-xl p-4 bg-purple-50 text-center space-y-3">
              <p className="font-semibold text-purple-900">{t.feedbackTitle}</p>
              {fbDone ? <p className="text-green-700 font-semibold">{t.fbThanks}</p> : (<>
                <div className="flex justify-center gap-2 items-center text-sm"><span>{t.fbWhich}</span>
                  <select className="border rounded p-1" value={fbPair} onChange={(e) => setFbPair(Number(e.target.value))}>{result.pairs.map((_: any, i: number) => <option key={i} value={i}>{i + 1}</option>)}</select></div>
                <input className={inputCls + " max-w-md mx-auto"} placeholder={t.fbNotes} value={fbNotes} maxLength={500} onChange={(e) => setFbNotes(e.target.value)} />
                <div className="flex flex-wrap justify-center gap-2">
                  {[["success", "bg-green-600"], ["partial", "bg-blue-600"], ["failed", "bg-red-600"], ["dimer", "bg-yellow-600"]].map(([k, c]) => (
                    <button key={k} onClick={() => sendFeedback(k)} className={`${c} text-white px-4 py-2 rounded-lg text-sm font-semibold`}>{t["fb_" + k]}</button>))}
                </div></>)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Multiplex                                                           */
/* ------------------------------------------------------------------ */
function MultiplexTab({ t, call, fail }: Ctx) {
  const [text, setText] = useState(""); const [prompt, setPrompt] = useState(""); const [gap, setGap] = useState(20);
  const [res, setRes] = useState<any>(null); const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setRes(null);
    try { setRes(await call("/multiplex-design", { method: "POST", body: JSON.stringify({ sequences: text.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith(">")), user_prompt: prompt, min_size_gap: gap }) })); }
    catch (e) { fail(e); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t.mpHint}</p>
      <textarea dir="ltr" className={seqCls + " h-40"} value={text} onChange={(e) => setText(e.target.value)} placeholder={"ATGC…\nATGC…"} />
      <div className="grid md:grid-cols-2 gap-4">
        <Field label={t.prompt}><input className={inputCls} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.promptPh} /></Field>
        <Field label={t.mpGap}><input type="number" dir="ltr" className={inputCls} value={gap} onChange={(e) => setGap(parseInt(e.target.value) || 20)} /></Field>
      </div>
      <button onClick={run} disabled={loading} className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold py-3 rounded-lg">{loading ? t.working : t.mpBtn}</button>
      {res && (<div className="space-y-3">
        <p className={`font-semibold ${res.ok ? "text-green-700" : "text-yellow-800"}`}>{res.ok ? t.mpOk : t.mpBad}</p>
        {!res.ok && <ul className="text-sm list-disc ps-5">{res.conflicts.map((c: any, i: number) => <li key={i}>{t.target} {c.a + 1} ↔ {c.b + 1}: {c.type === "size" ? t.mpSize : t.mpDimer}</li>)}</ul>}
        {res.pairs.map((x: any, i: number) => (<div key={i} className="border rounded-lg p-3 bg-slate-50 font-mono text-sm" dir="ltr">
          <b className="font-sans text-blue-800">{t.target} {i + 1}</b> · {x.size} bp<br />F: {x.left} ({x.ltm} °C)<br />R: {x.right} ({x.rtm} °C)</div>))}
      </div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gibson                                                              */
/* ------------------------------------------------------------------ */
function GibsonTab({ t, call, fail }: Ctx) {
  const [ins, setIns] = useState(""); const [vec, setVec] = useState(""); const [ov, setOv] = useState(20); const [pos, setPos] = useState(0); const [tm, setTm] = useState(60);
  const [res, setRes] = useState<any>(null); const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setRes(null);
    try { setRes((await call("/gibson-design", { method: "POST", body: JSON.stringify({ insert_sequence: ins, vector_sequence: vec, overlap_length: ov, insertion_pos: pos, target_tm: tm }) })).insert_primers); }
    catch (e) { fail(e); } finally { setLoading(false); }
  };
  const P = ({ label, ovs, ann, tmv, risk }: any) => (
    <div className="bg-white border rounded-lg p-4"><p className="font-semibold text-blue-800">{label}</p>
      <p className="font-mono text-sm break-all mt-1" dir="ltr"><span className="text-purple-700">{ovs}</span><span>{ann}</span></p>
      <p className="text-xs text-slate-500 mt-1" dir="ltr">{t.annealSeq} Tm {tmv} °C · {t.hairpin}: <Risk v={risk} t={t} /></p></div>);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t.gibsonHint}</p>
      <Field label={t.gibsonInsert}><textarea dir="ltr" className={seqCls + " h-24"} value={ins} onChange={(e) => setIns(e.target.value)} /></Field>
      <Field label={t.gibsonVector}><textarea dir="ltr" className={seqCls + " h-24"} value={vec} onChange={(e) => setVec(e.target.value)} /></Field>
      <div className="grid md:grid-cols-3 gap-4" dir="ltr">
        <Field label={t.overlap}><input type="number" className={inputCls} value={ov} onChange={(e) => setOv(parseInt(e.target.value) || 20)} /></Field>
        <Field label={t.insPos}><input type="number" className={inputCls} value={pos} onChange={(e) => setPos(parseInt(e.target.value) || 0)} /></Field>
        <Field label={t.targetTm}><input type="number" className={inputCls} value={tm} onChange={(e) => setTm(parseFloat(e.target.value) || 60)} /></Field>
      </div>
      <button onClick={run} disabled={loading} className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold py-3 rounded-lg">{loading ? t.working : t.gibsonBtn}</button>
      {res && (<div className="space-y-3 bg-purple-50 p-4 rounded-xl">
        <P label={t.forward} ovs={res.forward_overlap} ann={res.forward_anneal} tmv={res.forward_tm} risk={res.forward_risk} />
        <P label={t.reverse} ovs={res.reverse_overlap} ann={res.reverse_anneal} tmv={res.reverse_tm} risk={res.reverse_risk} />
        <p className="text-xs" dir="ltr"><b>{t.overlapTm}:</b> {res.overlap_tm.join(" / ")} °C · <span className="text-purple-700">■</span> {t.overlapSeq}</p>
        <p className="text-xs font-mono" dir="ltr"><b className="font-sans">{t.junctionPreview}:</b> {res.junction_left} … {res.junction_right}</p>
      </div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CRISPR                                                              */
/* ------------------------------------------------------------------ */
function CrisprTab(p: Ctx & { seq: string; setSeq: (s: string) => void; annotation: any; onGuides: (g: any[]) => void; openExplorer: (aa: number) => void }) {
  const { t, call, fail, seq, setSeq, annotation } = p;
  const [enzyme, setEnzyme] = useState("SpCas9"); const [pam, setPam] = useState("");
  const [res, setRes] = useState<any>(null); const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true); setRes(null);
    try { const r = await call("/crispr-design", { method: "POST", body: JSON.stringify({ sequence: seq, enzyme, pam, annotation }) }); setRes(r); p.onGuides(r.top_guides); }
    catch (e) { fail(e); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <Field label={t.sequence}><textarea dir="ltr" className={seqCls + " h-28"} value={seq} onChange={(e) => setSeq(e.target.value)} /></Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label={t.enzyme}><select className={inputCls} value={enzyme} onChange={(e) => setEnzyme(e.target.value)}><option>SpCas9</option><option>SaCas9</option><option>Cas12a</option></select></Field>
        <Field label={t.pamOverride}><input dir="ltr" className={seqCls} value={pam} onChange={(e) => setPam(e.target.value.toUpperCase())} placeholder="NGG" /></Field>
      </div>
      <button onClick={run} disabled={loading || !seq.trim()} className="w-full bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold py-3 rounded-lg">{loading ? t.working : t.crisprBtn}</button>
      {res && (<div className="space-y-3">
        <p className="text-sm font-semibold">{fmt(t.totalGuides, { n: res.total_guides })}</p>
        <p className="text-xs bg-yellow-50 p-2 rounded text-yellow-900">{res.score_note}</p>
        <div className="grid md:grid-cols-2 gap-3">{res.top_guides.map((g: any, i: number) => (
          <div key={i} className="border rounded-lg p-3 bg-red-50">
            <p className="font-mono text-sm break-all" dir="ltr">{g.guide} <span className="text-red-700">[{g.pam}]</span></p>
            <p className="text-xs text-slate-600 mt-1" dir="ltr">{t.score} {g.score} · GC {g.gc_content}% · {t.strand} {g.strand} · {t.position} {g.start1}–{g.end1}</p>
            {g.cut && (<p className="text-xs mt-1">{t.cutAt} {g.cut.pos}: {t["region_" + g.cut.region]}{g.cut.exon ? ` · ${t.exon} ${g.cut.exon}` : ""}{g.cut.aa_pos ? ` · ${g.cut.aa}${g.cut.aa_pos}` : ""}
              {g.cut.aa_pos && <button className="ms-2 text-blue-700 underline" onClick={() => p.openExplorer(g.cut.aa_pos)}>{t.showInExplorer}</button>}</p>)}
          </div>))}</div>
      </div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbox                                                             */
/* ------------------------------------------------------------------ */
function ToolboxTab({ t, call, fail }: Ctx) {
  const [s, setS] = useState(""); const [name, setName] = useState("primer"); const [company, setCompany] = useState("IDT");
  const [tm, setTm] = useState<any>(null); const [fmtRes, setFmtRes] = useState<any>(null);
  return (
    <div className="space-y-5">
      <Field label={t.sequence}><textarea dir="ltr" className={seqCls + " h-20"} value={s} onChange={(e) => setS(e.target.value)} placeholder="ATGC…" /></Field>
      <div className="flex flex-wrap gap-3 items-end">
        <Btn onClick={async () => { try { setTm(await call("/calculate-tm", { method: "POST", body: JSON.stringify({ sequence: s }) })); } catch (e) { fail(e); } }}>{t.tmBtn}</Btn>
        <Field label={t.nameLabel}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t.companyLabel}><select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}><option>IDT</option><option>Eurofins</option><option>Generic</option></select></Field>
        <Btn kind="ghost" onClick={async () => { try { setFmtRes(await call("/order-format", { method: "POST", body: JSON.stringify({ sequence: s, name, company }) })); } catch (e) { fail(e); } }}>{t.convert}</Btn>
      </div>
      {tm && (<div className="bg-blue-50 p-4 rounded-lg text-sm space-y-1" dir="ltr">
        <p className="text-lg"><b>Tm {tm.tm} °C</b> · GC {tm.gc}% · {tm.length} nt</p>
        <p>{t.hairpin}: {tm.hairpin.tm} °C / {tm.hairpin.dg} kcal · {t.selfDimer}: {tm.homodimer.tm} °C / {tm.homodimer.dg} kcal</p>
        <p className="text-xs text-slate-500">{tm.method} · {tm.conditions}</p></div>)}
      {fmtRes && (<div className="bg-green-50 p-4 rounded-lg" dir="ltr"><pre className="text-sm whitespace-pre-wrap">{fmtRes.formatted}</pre>
        <p className="text-xs text-slate-600 mt-1">{t.recPur}: {fmtRes.recommended_purification}</p>
        <div className="mt-2 flex gap-2"><CopyBtn text={fmtRes.formatted} t={t} /><button className="text-xs text-blue-700" onClick={() => download("order.csv", fmtRes.formatted, "text/csv")}>CSV</button></div></div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Explorer: transcript map + AlphaFold 3D with hover/click evidence    */
/* ------------------------------------------------------------------ */
const plddtColor = (b: number) => (b > 90 ? 0x0053d6 : b > 70 ? 0x65cbf3 : b > 50 ? 0xffdb13 : 0xff7d45);
const plddtBand = (b: number) => (b > 90 ? "conf_vh" : b > 70 ? "conf_h" : b > 50 ? "conf_l" : "conf_vl");

function ExplorerTab(p: Ctx & { gene: GeneState | null; markers: any[]; focusAa: number | null; llm: boolean }) {
  const { t, call, fail, gene, markers, token } = p;
  const [acc, setAcc] = useState(gene?.uniprot?.accession || "");
  const [af, setAf] = useState<any>(null); const [ann, setAnn] = useState<any>(null);
  const [custom, setCustom] = useState(""); const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false); const [libReady, setLibReady] = useState(false);
  const [hover, setHover] = useState<any>(null); const [sel, setSel] = useState<number | null>(p.focusAa);
  const [selMarker, setSelMarker] = useState<any>(null);
  const [papers, setPapers] = useState<any[] | null>(null); const [explain, setExplain] = useState<any>(null); const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null); const viewerRef = useRef<any>(null);
  const cds = gene?.annotation?.cds_start ? gene.annotation : null;

  useEffect(() => { if (p.focusAa) setSel(p.focusAa); }, [p.focusAa]);
  useEffect(() => { if ((window as any).$3Dmol) setLibReady(true); }, []);

  const load = async () => {
    if (!acc.trim()) return p.notify(t.noGeneYet);
    setLoading(true); setSource("AlphaFold DB");
    try {
      const [s, a] = await Promise.all([call(`/protein-structure?uniprot=${encodeURIComponent(acc.trim())}`), call(`/protein-annotations?uniprot=${encodeURIComponent(acc.trim())}`).catch(() => null)]);
      setAf(s.pdb); setAnn(a); setPapers(null); setExplain(null);
    } catch (e) { fail(e); } finally { setLoading(false); }
  };
  const predict = async () => {
    setLoading(true); setSource("ESMFold");
    try { const r = await call("/predict-structure", { method: "POST", body: JSON.stringify({ sequence: custom }) }); setAf(r.pdb_data); setAnn(null); } catch (e) { fail(e); } finally { setLoading(false); }
  };

  // build viewer
  useEffect(() => {
    const $3 = (window as any).$3Dmol;
    if (!af || !libReady || !boxRef.current || !$3) return;
    boxRef.current.innerHTML = "";
    const v = $3.createViewer(boxRef.current, { backgroundColor: "white" });
    v.addModel(af, "pdb");
    v.setStyle({}, { cartoon: { colorfunc: (a: any) => plddtColor(a.b) } });
    v.setHoverable({}, true, (a: any) => { if (a) setHover({ resi: a.resi, resn: a.resn, b: a.b }); }, () => {});
    v.setClickable({}, true, (a: any) => { if (a) { setSel(a.resi); setSelMarker(null); } });
    v.zoomTo(); v.render();
    viewerRef.current = v;
    return () => { try { v.clear(); } catch { /* ignore */ } };
  }, [af, libReady]);

  // highlights
  useEffect(() => {
    const v = viewerRef.current; if (!v) return;
    v.setStyle({}, { cartoon: { colorfunc: (a: any) => plddtColor(a.b) } });
    if (selMarker?.aaFrom) v.addStyle({ resi: `${selMarker.aaFrom}-${selMarker.aaTo}` }, { stick: { color: "orange", radius: 0.22 } });
    if (sel) { v.addStyle({ resi: sel }, { stick: { color: "magenta", radius: 0.3 }, sphere: { color: "magenta", radius: 0.6 } }); }
    v.render();
  }, [sel, selMarker, af]);

  const aaAt = (pos: number) => (cds && pos >= cds.cds_start && pos <= cds.cds_end ? Math.floor((pos - cds.cds_start) / 3) + 1 : null);
  const active = sel ?? hover?.resi ?? null;
  const resn = hover && hover.resi === active ? hover.resn : null;
  const feats = useMemo(() => (ann && active ? ann.features.filter((f: any) => f.start <= active && active <= f.end).sort((a: any, b: any) => (a.end - a.start) - (b.end - b.start)) : []), [ann, active]);
  const dnaStart = cds && active ? cds.cds_start + 3 * (active - 1) : null;
  const covering = dnaStart ? markers.filter((m) => m.start1 <= dnaStart + 2 && m.end1 >= dnaStart) : [];

  const findPapers = async () => {
    if (!ann?.gene) return; setBusy(true);
    try { const term = feats[0]?.description?.split(";")[0].slice(0, 40) || ""; setPapers((await call(`/literature?gene=${encodeURIComponent(ann.gene)}&term=${encodeURIComponent(term)}`)).results); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const doExplain = async () => {
    if (!token) return p.notify(t.loginRequired); setBusy(true);
    try { setExplain(await call("/explain-residue", { method: "POST", body: JSON.stringify({ uniprot: acc.trim(), residue: active, lang: p.lang }) })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const L = cds ? gene!.sequence.length : 0;
  const mk = markers.map((m) => ({ ...m, aaFrom: aaAt(m.start1), aaTo: aaAt(m.end1) }));

  return (
    <div className="space-y-5">
      <Script src="https://3dmol.org/build/3Dmol-min.js" strategy="afterInteractive" onReady={() => setLibReady(true)} />
      <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
        <Field label={t.uniprot}><input dir="ltr" className={seqCls} value={acc} onChange={(e) => setAcc(e.target.value.toUpperCase())} placeholder="P38398" /></Field>
        <Btn onClick={load} disabled={loading}>{loading ? t.working : t.loadStruct}</Btn>
      </div>
      {!gene && !acc && <p className="text-sm text-slate-500">{t.noGeneYet}</p>}

      {cds && (
        <section className="border rounded-xl p-4 bg-white" aria-label={t.mapTitle}>
          <h4 className="font-bold text-sm mb-1">{t.mapTitle} — {gene!.symbol} {gene!.accession}</h4>
          <p className="text-xs text-slate-500 mb-2">{t.mapHint}</p>
          <svg viewBox="0 0 1000 110" className="w-full" direction="ltr">
            {gene!.annotation.exons.map((e: number[], i: number) => (<rect key={i} x={(e[0] / L) * 1000} y="40" width={Math.max(1, ((e[1] - e[0] + 1) / L) * 1000)} height="26" fill={i % 2 ? "#93c5fd" : "#3b82f6"}><title>{t.exon} {i + 1}: {e[0]}–{e[1]}</title></rect>))}
            {gene!.annotation.exons.slice(0, -1).map((e: number[], i: number) => {
              const x = (e[1] / L) * 1000;
              return <line key={`j${i}`} x1={x} x2={x} y1="34" y2="70" stroke="#475569" strokeWidth="2" strokeDasharray="3 3"><title>{t.mapJunction} {i + 1}–{i + 2}</title></line>;
            })}
            <rect x={(cds.cds_start / L) * 1000} y="70" width={((cds.cds_end - cds.cds_start + 1) / L) * 1000} height="6" fill="#0f172a"><title>CDS {cds.cds_start}–{cds.cds_end}</title></rect>
            {mk.map((m, i) => { const x = (m.start1 / L) * 1000; const w = Math.max(3, ((m.end1 - m.start1 + 1) / L) * 1000); const y = m.kind === "primer" ? 18 : 84;
              return (<g key={i} className="cursor-pointer" onClick={() => { setSelMarker(m); if (m.aaFrom) setSel(m.aaFrom); }}>
                <rect x={x} y={y} width={w} height="14" rx="2" fill={m.kind === "primer" ? "#ea580c" : "#16a34a"} stroke={selMarker === m ? "#000" : "none"} /><title>{m.label} {m.start1}–{m.end1}{m.aaFrom ? ` · aa ${m.aaFrom}-${m.aaTo}` : ""}</title></g>); })}
          </svg>
          <div className="flex flex-wrap gap-4 text-xs text-slate-600 mt-1" dir="ltr">
            <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-blue-600" />{t.exon}</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-3 border-s-2 border-dashed border-slate-600" />{t.mapJunction}</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-1 bg-slate-900" />CDS</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">{t.mapTranscriptNote}</p>
        </section>
      )}

      {af && (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <div>
            <div ref={boxRef} className="w-full border rounded-xl overflow-hidden relative bg-white" style={{ height: 480 }} />
            <div className="flex flex-wrap gap-3 text-xs mt-2" dir="ltr">
              {[["#0053d6", ">90"], ["#65cbf3", "70–90"], ["#ffdb13", "50–70"], ["#ff7d45", "<50"]].map(([c, l]) => (<span key={l} className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />{l}</span>))}
              <span className="text-slate-500">pLDDT · {source}</span></div>
          </div>
          <aside className="border rounded-xl p-4 bg-white text-sm space-y-3 min-h-[200px]" aria-live="polite">
            {!active ? <p className="text-slate-500">{t.hoverHint}</p> : (<>
              <h4 className="font-bold text-blue-800" dir="ltr">{resn ? `${resn} ${active}${AA3[resn] ? ` (${AA3[resn]})` : ""}` : `${t.residue} ${active}`}</h4>
              {hover && hover.resi === active && <p className="text-xs">{t.plddt}: {Math.round(hover.b)} — {t[plddtBand(hover.b)]}</p>}
              <div><p className="font-semibold text-xs mb-1">{t.features}</p>
                {feats.length === 0 ? <p className="text-xs text-slate-500">{t.noFeat}</p> : (<ul className="space-y-1 text-xs">{feats.slice(0, 6).map((f: any, i: number) => (
                  <li key={i}><b>{f.type}</b> {f.start}–{f.end}{f.description ? `: ${f.description}` : ""}{f.variant ? ` (${f.variant})` : ""}
                    {f.pubmed.map((id: string) => <a key={id} className="text-blue-700 ms-1 underline" href={`https://pubmed.ncbi.nlm.nih.gov/${id}/`} target="_blank" rel="noreferrer">PMID {id}</a>)}</li>))}</ul>)}</div>
              {dnaStart && <p className="text-xs" dir="ltr"><b>{t.dnaCodon}:</b> {dnaStart}–{dnaStart + 2}{covering.length > 0 && <> · {t.covers}: {covering.map((m) => m.label).join(", ")}</>}</p>}
              {ann && (<div className="flex flex-wrap gap-2">
                <Btn kind="ghost" onClick={findPapers} disabled={busy}>{t.findPapers}</Btn>
                {p.llm && <Btn kind="dark" onClick={doExplain} disabled={busy}>{t.explain}</Btn>}</div>)}
              {explain && (<div className="bg-slate-50 p-3 rounded text-xs space-y-2"><p className="whitespace-pre-wrap">{explain.text}</p>
                <ul className="space-y-1">{explain.sources.map((s: any) => <li key={s.n}>[{s.n}] <a className="text-blue-700 underline" href={s.link} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
                <p className="text-slate-500">{t.explainNote}</p></div>)}
              {papers && (<div><p className="font-semibold text-xs mb-1">{t.papers}</p><ul className="space-y-2 text-xs">{papers.map((x: any, i: number) => (
                <li key={i}><a className="text-blue-700 underline" href={x.link} target="_blank" rel="noreferrer" dir="ltr">{x.title}</a><br /><span className="text-slate-500" dir="ltr">{x.authors} · {x.journal} {x.year}{x.open_access ? " · OA" : ""}</span></li>))}</ul></div>)}
            </>)}
            {ann?.function && <details className="text-xs"><summary className="cursor-pointer font-semibold">{t.functionTxt}</summary><p className="mt-1" dir="ltr">{ann.function}</p></details>}
          </aside>
        </div>
      )}
      <details className="text-sm"><summary className="cursor-pointer font-semibold">{t.orSeq}</summary>
        <textarea dir="ltr" className={seqCls + " h-20 mt-2"} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="MKTIIALSYIFCLVFADYKDDDDK…" />
        <div className="mt-2"><Btn kind="ghost" onClick={predict} disabled={loading || !custom.trim()}>{t.predict}</Btn></div></details>
      <p className="text-xs text-slate-500">{t.licenseTxt}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */
function LibraryTab({ t, call, token, notify, fail }: Ctx) {
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(async () => { if (!token) return; try { setRows((await call("/my-primers")).primers); } catch (e) { fail(e); } }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!token) return <p className="text-sm">{t.loginRequired}</p>;
  const exportAll = () => {
    const lines = ["Name,Sequence,Scale,Purification"];
    rows.forEach((r) => { lines.push(`${r.name}_F,${r.left_seq},25nm,STD`); lines.push(`${r.name}_R,${r.right_seq},25nm,STD`); });
    download("my_primers.csv", lines.join("\n") + "\n", "text/csv");
  };
  return (
    <div className="space-y-3">
      {rows.length === 0 ? <p>{t.libEmpty}</p> : <Btn kind="dark" onClick={exportAll}>{t.libExport}</Btn>}
      {rows.map((r, i) => (
        <div key={r.id ?? `l${i}`} className="border rounded-lg p-3 bg-slate-50 flex justify-between gap-3">
          <div className="min-w-0"><p className="font-semibold">{r.name} {r.legacy && <span className="text-xs text-slate-500">({t.legacy})</span>}</p>
            <p className="font-mono text-xs break-all" dir="ltr">{r.left_seq} / {r.right_seq}</p>
            <p className="text-xs text-slate-500" dir="ltr">Tm {Number(r.left_tm || 0).toFixed(1)}/{Number(r.right_tm || 0).toFixed(1)} °C{r.product_size ? ` · ${r.product_size} bp` : ""}{r.gene ? ` · ${r.gene}` : ""}</p></div>
          {r.id && <Btn kind="danger" onClick={async () => { try { await call(`/my-primers/${r.id}`, { method: "DELETE" }); load(); } catch (e) { notify(String((e as any).message)); } }}>{t.libDelete}</Btn>}
        </div>))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI chat assistant (floating)                                        */
/* ------------------------------------------------------------------ */
type ChatMsg = { role: "user" | "assistant"; content: string };

function ChatBox({ t, lang, call, token, notify, fail, llm, context }: Ctx & { llm: boolean; context: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, open]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    if (!llm) return notify(t.chat_disabled);
    if (!token) return notify(t.loginRequired);
    const next: ChatMsg[] = [...msgs, { role: "user", content: q.slice(0, 2000) }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await call("/ask-ai", { method: "POST", body: JSON.stringify({ messages: next.slice(-12), lang, context: context.slice(0, 6000) }) });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e) { setMsgs((m) => m.slice(0, -1)); setInput(q); fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <section role="dialog" aria-label={t.chat_title} className="w-[min(92vw,380px)] h-[min(75vh,560px)] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <header className="bg-blue-800 text-white px-4 py-3 flex items-center justify-between gap-2">
            <div><p className="font-bold">{t.chat_title}</p><p className="text-xs text-blue-100">{context ? t.chat_ctx : t.chat_note}</p></div>
            <div className="flex gap-1">
              {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} className="text-xs bg-blue-700 hover:bg-blue-600 rounded px-2 py-1">{t.chat_clear}</button>}
              <button type="button" aria-label="close" onClick={() => setOpen(false)} className="text-lg leading-none px-2 hover:text-blue-200">×</button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50" aria-live="polite">
            {msgs.length === 0 && (<div className="space-y-2">
              <p className="text-sm bg-white border rounded-xl p-3">{t.chat_hello}</p>
              {[t.chat_s1, t.chat_s2, t.chat_s3].map((sug) => (
                <button key={sug} type="button" onClick={() => send(sug)} className="block w-full text-start text-sm bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-lg px-3 py-2">{sug}</button>))}
            </div>)}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <p dir="auto" className={`max-w-[85%] whitespace-pre-wrap text-sm rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-blue-700 text-white" : "bg-white border text-slate-800"}`}>{m.content}</p>
              </div>))}
            {busy && <p className="text-sm text-slate-500">{t.working}</p>}
            <div ref={endRef} />
          </div>
          <footer className="border-t p-2 space-y-1">
            <div className="flex gap-2">
              <textarea dir="auto" rows={2} className={inputCls + " resize-none text-sm"} value={input} maxLength={2000} placeholder={t.chat_ph}
                onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
              <Btn onClick={() => send()} disabled={busy || !input.trim()}>{t.chat_send}</Btn>
            </div>
            <p className="text-[11px] text-slate-500 px-1">{t.chat_note}</p>
          </footer>
        </section>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="bg-blue-800 hover:bg-blue-900 text-white font-semibold rounded-full shadow-xl px-5 py-3">{open ? "×" : `✦ ${t.chat_open}`}</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */
export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<TabId>("design");
  const [token, setToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ msg: string; kind: "error" | "ok" } | null>(null);
  const [config, setConfig] = useState<any>({ llm: false, max_seq_len: 30000 });
  const [seq, setSeq] = useState("");
  const [gene, setGene] = useState<GeneState | null>(null);
  const [design, setDesign] = useState<any>(null);
  const [guides, setGuides] = useState<any[]>([]);
  const [focusAa, setFocusAa] = useState<number | null>(null);
  const [qpcrRes, setQpcrRes] = useState<any>(null);
  const t = T[lang];

  useEffect(() => {
    setToken(localStorage.getItem("token"));
    const l = localStorage.getItem("lang"); if (l === "fa" || l === "en") setLang(l);
    apiFetch("/config", null).then(setConfig).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === "fa" ? "rtl" : "ltr"; localStorage.setItem("lang", lang); }, [lang]);
  useEffect(() => { if (!notice) return; const x = setTimeout(() => setNotice(null), 7000); return () => clearTimeout(x); }, [notice]);

  const call = useCallback((path: string, init?: RequestInit) => apiFetch(path, token, init), [token]);
  const notify = useCallback((msg: string, kind: "error" | "ok" = "error") => setNotice({ msg, kind }), []);
  const fail = useCallback((e: any) => {
    if (e?.code === "network") notify(t.networkErr);
    else if (e?.code === "rate") notify(t.rateLimited);
    else if (e?.code === "auth") { notify(t.loginRequired); }
    else notify(String(e?.message || e));
  }, [notify, t]);

  const annotation = gene && gene.annotation && norm(seq) === gene.sequence ? gene.annotation : null;

  const markers = useMemo(() => {
    const m: any[] = [];
    design?.pairs?.slice(0, 3).forEach((pr: any, i: number) => {
      m.push({ kind: "primer", label: `P${i + 1}-F`, start1: pr.left.start1, end1: pr.left.end1 });
      m.push({ kind: "primer", label: `P${i + 1}-R`, start1: pr.right.start1, end1: pr.right.end1 });
    });
    guides.slice(0, 8).forEach((g, i) => m.push({ kind: "guide", label: `gRNA${i + 1}`, start1: g.start1, end1: g.end1 }));
    return m;
  }, [design, guides]);

  const ctx: Ctx = { t, lang, call, token, notify, fail };

  const aiContext = useMemo(() => {
    const lines: string[] = [`Current tab: ${tab}`];
    if (gene) lines.push(`Gene: ${gene.symbol} (${gene.organism}), transcript ${gene.accession}, ${gene.sequence.length} nt` +
      (gene.annotation?.exons ? `, ${gene.annotation.exons.length} exons [${gene.annotation.exons.slice(0, 30).map((e: number[]) => e.join("-")).join(", ")}]` : "") +
      (gene.annotation?.cds_start ? `, CDS ${gene.annotation.cds_start}-${gene.annotation.cds_end}` : ""));
    if (design?.pairs?.length) {
      const pr = design.parameters || {};
      lines.push(`Primer design: mode ${pr.mode}${pr.qpcr_chemistry ? ` (${pr.qpcr_chemistry})` : ""}, Tm ${pr.tm}, size ${pr.size_range?.join("-")} bp, warnings: ${(design.warnings || []).join(", ") || "none"}`);
      design.pairs.slice(0, 3).forEach((x: any, i: number) => lines.push(
        `Pair ${i + 1}: F ${x.left.seq} (Tm ${x.left.tm}, ${x.left.start1}-${x.left.end1}), R ${x.right.seq} (Tm ${x.right.tm}), product ${x.product_size} bp, anneal ${x.anneal_temp}, exon ${x.exon?.status}, risk ${x.risk?.overall}${x.probe ? `, probe ${x.probe.seq}` : ""}`));
    }
    if (qpcrRes) {
      lines.push(`qPCR: reference ${qpcrRes.reference_target}, control ${qpcrRes.control_group}`);
      (qpcrRes.groups || []).slice(0, 12).forEach((g: any) => lines.push(`  ${g.group}/${g.target}: n=${g.n}, ΔΔCt ${g.ddct}, fold ${g.fold_change}`));
      (qpcrRes.standard_curves || []).forEach((c: any) => lines.push(`  curve ${c.target}: eff ${c.efficiency}%, R² ${c.r2}`));
      (qpcrRes.warnings || []).slice(0, 8).forEach((w: string) => lines.push(`  QC: ${w}`));
    }
    return lines.length > 1 ? lines.join("\n") : "";
  }, [tab, gene, design, qpcrRes]);
  const tabs: TabId[] = ["design", "qpcr", "multiplex", "gibson", "crispr", "toolbox", "explorer", "tutorial", "troubleshoot", "library"];

  const logout = () => { localStorage.removeItem("token"); setToken(null); };
  const del = async () => {
    if (!confirm(t.deleteConfirm)) return;
    try { await call("/delete-account", { method: "DELETE" }); logout(); } catch (e) { fail(e); }
  };

  return (
    <main dir={lang === "fa" ? "rtl" : "ltr"} className="min-h-screen bg-slate-50 p-4 md:p-10 text-slate-800">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-5 md:p-8">
        <header className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div><h1 className="text-3xl font-bold text-blue-800">{t.title}</h1><p className="text-slate-500 mt-1 max-w-xl">{t.subtitle}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/pricing" className="text-blue-700 text-sm font-semibold hover:underline">{t.pricing}</a>
            <a href="/privacy" className="text-slate-500 text-sm hover:underline">{t.privacy}</a>
            <button onClick={() => setLang(lang === "en" ? "fa" : "en")} className={`${btnBase} bg-slate-200`}>{lang === "en" ? "فارسی" : "English"}</button>
            {token ? (<>
              <Btn kind="ghost" onClick={logout}>{t.logout}</Btn>
              <details className="relative"><summary className={`${btnBase} bg-slate-100 cursor-pointer list-none`}>{t.settings}</summary>
                <div className="absolute end-0 mt-1 bg-white border rounded-lg shadow p-2 z-10"><Btn kind="danger" onClick={del}>{t.deleteAccount}</Btn></div></details>
            </>) : <a href="/login" className={`${btnBase} bg-blue-700 text-white`}>{t.login}</a>}
          </div>
        </header>

        {notice && <div role="alert" className={`mb-4 p-3 rounded-lg text-sm ${notice.kind === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{notice.msg}</div>}

        <nav className="flex border-b mb-6 overflow-x-auto" aria-label="tabs">
          {tabs.map((id) => (<button key={id} onClick={() => setTab(id)} aria-current={tab === id} className={`px-4 py-2 font-semibold whitespace-nowrap ${tab === id ? "border-b-2 border-blue-700 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>{t["tab_" + id]}</button>))}
        </nav>

        {tab === "design" && <DesignTab {...ctx} seq={seq} setSeq={setSeq} gene={gene} setGene={setGene} annotation={annotation} maxLen={config.max_seq_len} onDesign={setDesign} />}
        {tab === "qpcr" && <QPCRTab {...ctx} onResult={setQpcrRes} />}
        {tab === "multiplex" && <MultiplexTab {...ctx} />}
        {tab === "gibson" && <GibsonTab {...ctx} />}
        {tab === "crispr" && <CrisprTab {...ctx} seq={seq} setSeq={setSeq} annotation={annotation} onGuides={setGuides} openExplorer={(aa) => { setFocusAa(aa); setTab("explorer"); }} />}
        {tab === "toolbox" && <ToolboxTab {...ctx} />}
        {tab === "explorer" && <ExplorerTab {...ctx} gene={annotation ? gene : gene} markers={annotation ? markers : []} focusAa={focusAa} llm={!!config.llm} />}
        {tab === "troubleshoot" && <TroubleshootTab {...ctx} />}
        {tab === "tutorial" && (<div className="space-y-5 max-w-3xl">{TUT[lang].map((s) => (<section key={s.h}><h3 className="text-lg font-bold text-blue-800">{s.h}</h3><p className="mt-1 text-slate-700 leading-relaxed">{s.p}</p></section>))}</div>)}
        {tab === "library" && <LibraryTab {...ctx} />}

        <footer className="mt-10 pt-4 border-t text-xs text-slate-500">{t.footer}</footer>
        <ChatBox {...ctx} llm={!!config.llm} context={aiContext} />
      </div>
    </main>
  );
}