"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { addToQueue } from "./dossierBridge";

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

const BASE = {
  en: {
    kicker: "Immunoinformatics · research use only", title: "Epitope-based vaccine design workspace",
    intro: "A guided, source-linked workflow. Predictions come from named tools and keep their provenance. They are hypotheses to test in the lab, not evidence of protection or safety.",
    steps: ["Fundamentals", "Target & sequence", "B-cell epitopes", "T-cell epitopes", "Population coverage", "Multi-epitope design", "Construct evaluation", "Structure", "Docking", "Expression & cloning", "Report"],
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
    cdTitle: "Codon optimization", strategy: "Strategy", stW: "Frequency-weighted (avoids repeats)", stB: "Most frequent codon", seed: "Seed", stopC: "Stop codon",
    avoidEnz: "Avoid restriction sites for", startM: "Add a start codon (Met) if missing", customT: "Custom host codon table (optional)",
    customHelp: "One codon and its frequency per line (all 61 sense codons, DNA or RNA letters). Leave empty to use Escherichia coli.",
    optRun: "Optimize codons", optRes: "Optimized coding sequence", caiL: "CAI", gcL: "GC content", gcWinL: "GC, 50-nt windows (min–max)", rareL: "Rare codons", unresL: "Unresolved sites or runs", hostL: "Host table",
    clTitle: "In-silico cloning design", enz5: "5′ enzyme", enz3: "3′ enzyme", clampL: "Clamp 5′ / 3′", buildIns: "Build insert", insL: "Insert (5′ to 3′)", ftrL: "Features", dlFasta: "Download FASTA",
    toQueue: "Add everything to the dossier queue", queuedN: "queued",
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
    steps: ["مبانی", "هدف و توالی", "اپی‌توپ B-cell", "اپی‌توپ T-cell", "پوشش جمعیتی", "طراحی چنداپی‌توپی", "ارزیابی سازه", "ساختار", "داکینگ", "بیان و کلونینگ", "گزارش"],
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
    cdTitle: "بهینه‌سازی کدون", strategy: "راهبرد", stW: "وزن‌دار بر اساس فراوانی (جلوگیری از تکرار)", stB: "پرتکرارترین کدون", seed: "Seed", stopC: "کدون پایان",
    avoidEnz: "پرهیز از جایگاه‌های برشی", startM: "در صورت نبود، کدون آغاز (Met) اضافه شود", customT: "جدول کدون میزبان سفارشی (اختیاری)",
    customHelp: "در هر خط یک کدون و فراوانی‌اش (هر ۶۱ کدون معنادار، با حروف DNA یا RNA). برای استفاده از Escherichia coli خالی بگذارید.",
    optRun: "بهینه‌سازی کدون", optRes: "توالی کدکننده بهینه‌شده", caiL: "CAI", gcL: "محتوای GC", gcWinL: "GC در پنجره‌های ۵۰ نوکلئوتیدی (کمینه–بیشینه)", rareL: "کدون‌های نادر", unresL: "جایگاه یا تکرار حل‌نشده", hostL: "جدول میزبان",
    clTitle: "طراحی کلونینگ درون‌رایانه‌ای", enz5: "آنزیم ′5", enz3: "آنزیم ′3", clampL: "Clamp ′5 / ′3", buildIns: "ساخت قطعهٔ درج", insL: "قطعهٔ درج (′5 تا ′3)", ftrL: "ویژگی‌ها", dlFasta: "دانلود FASTA",
    toQueue: "افزودن همه به صف پرونده", queuedN: "در صف",
    err: "درخواست ناموفق بود", disclaimer: "فقط برای پژوهش و آموزش؛ نه برای تصمیم بالینی، دوز یا ایمنی.",
    learn: [
      ["چرا واکسن مبتنی بر اپی‌توپ", "به‌جای کل پاتوژن یا پروتئین، نواحی کوتاهی (اپی‌توپ) عرضه می‌شود که سلول‌های ایمنی می‌شناسند. این کار پاسخ را متمرکز می‌کند و از نواحی نامطلوب پرهیز می‌دهد، ولی ایمنی‌زایی هر اپی‌توپ باید جداگانه نشان داده شود."],
      ["سه نوع اپی‌توپ", "اپی‌توپ‌های CTL (۸ تا ۱۱ اسیدآمینه) به MHC کلاس I متصل می‌شوند و سلول‌های CD8+ را فعال می‌کنند. اپی‌توپ‌های HTL (حدود ۱۵ اسیدآمینه) به MHC کلاس II متصل می‌شوند و به CD4+ کمک می‌کنند. اپی‌توپ‌های B-cell را آنتی‌بادی می‌شناسد؛ نوع خطی از توالی و نوع ساختاری از ساختار سه‌بعدی پیش‌بینی می‌شود."],
      ["چرا چند آلل HLA", "ژن‌های HLA چندشکلی بالایی دارند و اپی‌توپی که به یک آلل متصل می‌شود ممکن است به آلل دیگر متصل نشود. استفاده از چند آلل و بعداً پوشش جمعیتی نشان می‌دهد طراحی چقدر گسترده کار می‌کند."],
      ["ادجوانت و لینکر", "ادجوانت‌هایی مثل آگونیست‌های TLR پاسخ را تقویت می‌کنند. لینکرها (EAAAK، AAY، GPGPG، KK) اپی‌توپ‌ها را جدا نگه می‌دارند و به پردازش کمک می‌کنند. انتخابشان باید در روش‌ها توجیه شود."],
      ["محدودیت پیش‌بینی‌ها", "امتیاز اتصال برابر ایمنی‌زایی نیست و ویژگی‌های محاسبه‌شده برابر ایمنی نیست. پیش از هر ادعا باید آنتی‌ژنیسیته، آلرژنیسیته و سمیت و سپس آزمایش تجربی بررسی شود."],
    ],
  },
};
type Dict = typeof BASE.en;
const EXTRA: Record<string, Partial<Dict>> = {
  de: {"kicker": "Immuninformatik · nur für Forschung", "title": "Arbeitsbereich für Epitop-basiertes Impfstoffdesign", "intro": "Ein geführter Ablauf mit nachvollziehbaren Quellen. Vorhersagen stammen aus benannten Werkzeugen und behalten ihre Herkunft. Sie sind Hypothesen für Laborversuche, kein Beleg für Schutz oder Sicherheit.", "steps": ["Grundlagen", "Ziel & Sequenz", "B-Zell-Epitope", "T-Zell-Epitope", "Populationsabdeckung", "Multi-Epitop-Design", "Konstrukt-Bewertung", "Struktur", "Docking", "Expression & Klonierung", "Bericht"], "run": "Ausführen", "running": "Läuft…", "add": "Hinzufügen", "remove": "Entfernen", "copy": "Kopieren", "copied": "Kopiert", "load": "Laden", "use": "Verwenden", "acc": "UniProt-Accession (z. B. P0DTC2)", "or": "oder Sequenz / FASTA einfügen", "from": "Von", "to": "Bis", "residues": "Reste", "noSignal": "Signalpeptid entfernen", "features": "UniProt-Annotation", "retrieved": "Abgerufen", "source": "Quelle", "method": "Methode", "cutoff": "Perzentil-Rang-Grenzwert (niedriger = stärker)", "panel": "Allel-Panel", "quick": "Schnell (häufige Allele)", "ref": "IEDB-Referenzpanel", "lens": "Peptidlängen", "peptide": "Peptid", "alleles": "Allele", "best": "Bester Rang", "pos": "Position", "score": "Mittlerer Score", "none": "Keine Ergebnisse mit den aktuellen Einstellungen.", "needSeq": "Laden oder fügen Sie zuerst in Schritt 2 eine Zielsequenz ein.", "selected": "Ausgewählte Epitope", "ctl": "CTL (MHC-I)", "htl": "HTL (MHC-II)", "bc": "B-Zell", "adjuvant": "Adjuvans-Sequenz (optional)", "his": "C-terminalen His-Tag anhängen", "assemble": "Konstrukt zusammensetzen", "construct": "Konstrukt", "layout": "Aufbau", "evalTitle": "Physikochemisches Profil (hier berechnet)", "prop": "Eigenschaft", "value": "Wert", "ext": "Hier nicht berechnet: Originalwerkzeuge nutzen und Ergebnis eintragen", "antigen": "Antigenität (z. B. VaxiJen)", "allergen": "Allergenität (z. B. AllerTOP)", "toxin": "Toxizität (z. B. ToxinPred)", "solub": "Löslichkeit (z. B. Protein-Sol)", "report": "Bericht herunterladen (Markdown)", "reportHint": "Enthält Eingaben, Parameter, Quellen, Abrufzeiten und Grenzen.", "planned": "Geplant", "covTitle": "Gewählte Epitope und restringierende Allele", "covNeed": "Führen Sie zuerst Schritt 4 aus und fügen Sie CTL/HTL-Epitope zur Auswahl hinzu.", "covIedb": "Eingabe für das IEDB-Population-Coverage-Tool (Epitop, Tab, Allele)", "covOpen": "IEDB Population Coverage öffnen", "covLocal": "Lokale Schätzung aus eigenen Allelfrequenzen", "covRun": "Abdeckung berechnen", "covC1": "Klasse I", "covC2": "Klasse II", "covAll": "Kombiniert", "covMissing": "Allele ohne Frequenz", "popName": "Population (für den Bericht)", "pred": "Struktur mit ESMFold vorhersagen", "consent": "Ich stimme zu, diese Sequenz an den ESM Metagenomic Atlas (externer Dienst) zu senden.", "pdbLoad": "PDB-Datei laden oder PDB-Text einfügen", "isPlddt": "B-Faktor-Spalte enthält pLDDT (AlphaFold / ESMFold)", "runQc": "Struktur analysieren", "dlPdb": "PDB herunterladen", "qcTitle": "Modellqualität", "mean": "Mittleres pLDDT", "rama": "Ramachandran (näherungsweise)", "fav": "Bevorzugt", "allow": "Erlaubt", "outl": "Ausreißer", "outList": "Ausreißer-Reste", "needCons": "Erstellen Sie zuerst in Schritt 6 ein Konstrukt.", "recs": "Häufig genutzte Rezeptor-Einträge (jeden im 3D-Viewer oben prüfen)", "servers": "Docking-Server (Links prüfen)", "cplx": "Gedocktes Modell (PDB)", "chA": "Impfstoff-Kette(n)", "chB": "Rezeptor-Kette(n)", "cut": "Kontaktgrenze (Å)", "runIf": "Grenzfläche analysieren", "ifTitle": "Zusammenfassung der Grenzfläche", "pairs": "Reste im Kontakt (Paare)", "ifA": "Grenzflächenreste (Impfstoff)", "ifB": "Grenzflächenreste (Rezeptor)", "polar": "Kandidaten polarer Kontakte", "salt": "Kandidaten für Salzbrücken", "err": "Anfrage fehlgeschlagen", "disclaimer": "Nur für Forschung und Lehre. Nicht für klinische, Dosierungs- oder Sicherheitsentscheidungen.", "cdTitle": "Codon-Optimierung", "strategy": "Strategie", "stW": "Häufigkeitsgewichtet (vermeidet Wiederholungen)", "stB": "Häufigstes Codon", "seed": "Seed", "stopC": "Stopp-Codon", "avoidEnz": "Restriktionsstellen vermeiden für", "startM": "Startcodon (Met) ergänzen, falls es fehlt", "customT": "Eigene Codon-Tabelle des Wirts (optional)", "optRun": "Codons optimieren", "optRes": "Optimierte kodierende Sequenz", "caiL": "CAI", "gcL": "GC-Gehalt", "gcWinL": "GC, 50-nt-Fenster (min–max)", "rareL": "Seltene Codons", "unresL": "Ungelöste Stellen oder Wiederholungen", "hostL": "Wirtstabelle", "clTitle": "In-silico-Klonierungsdesign", "enz5": "5′-Enzym", "enz3": "3′-Enzym", "clampL": "Clamp 5′ / 3′", "buildIns": "Insert erstellen", "insL": "Insert (5′ bis 3′)", "ftrL": "Merkmale", "dlFasta": "FASTA herunterladen", "learn": [["Warum Epitop-basierte Impfstoffe", "Statt eines ganzen Erregers oder Proteins zeigt der Impfstoff kurze Bereiche (Epitope), die Immunzellen erkennen. Das fokussiert die Antwort und vermeidet unerwünschte Bereiche, doch die Immunogenität jedes Epitops muss weiterhin nachgewiesen werden."], ["Drei Arten von Epitopen", "CTL-Epitope (8–11 AS) binden an MHC-Klasse I und aktivieren CD8+-T-Zellen. HTL-Epitope (etwa 15 AS) binden an MHC-Klasse II und unterstützen CD4+-Zellen. B-Zell-Epitope erkennen Antikörper; lineare lassen sich aus der Sequenz vorhersagen, Konformationsepitope brauchen die Struktur."], ["Warum viele HLA-Allele", "HLA-Gene sind stark polymorph, ein Epitop, das an ein Allel bindet, bindet nicht zwingend an ein anderes. Mehrere Allele und später die Populationsabdeckung zeigen, wie breit ein Design wirken könnte."], ["Adjuvantien und Linker", "Adjuvantien wie TLR-Agonisten verstärken die Antwort. Linker (EAAAK, AAY, GPGPG, KK) trennen die Epitope und unterstützen die Prozessierung. Ihre Wahl sollte im Methodenteil begründet werden."], ["Was Vorhersagen nicht leisten", "Bindungsscores sind keine Immunogenität, berechnete Eigenschaften keine Sicherheit. Vor jeder Aussage sind Antigenität, Allergenität und Toxizität zu prüfen und anschließend Experimente nötig."]]},
  fr: {"kicker": "Immuno-informatique · usage de recherche uniquement", "title": "Espace de conception de vaccins à base d'épitopes", "intro": "Un parcours guidé avec sources traçables. Les prédictions viennent d'outils nommés et gardent leur provenance. Ce sont des hypothèses à tester en laboratoire, pas une preuve de protection ou de sécurité.", "steps": ["Fondamentaux", "Cible et séquence", "Épitopes B", "Épitopes T", "Couverture de population", "Conception multi-épitopes", "Évaluation de la construction", "Structure", "Docking", "Expression et clonage", "Rapport"], "run": "Lancer", "running": "En cours…", "add": "Ajouter", "remove": "Retirer", "copy": "Copier", "copied": "Copié", "load": "Charger", "use": "Utiliser", "acc": "Accession UniProt (ex. P0DTC2)", "or": "ou collez une séquence / FASTA", "from": "De", "to": "À", "residues": "résidus", "noSignal": "Retirer le peptide signal", "features": "Annotation UniProt", "retrieved": "Récupéré", "source": "Source", "method": "Méthode", "cutoff": "Seuil de rang percentile (plus bas = plus fort)", "panel": "Panel d'allèles", "quick": "Rapide (allèles courants)", "ref": "Panel de référence IEDB", "lens": "Longueurs de peptides", "peptide": "Peptide", "alleles": "Allèles", "best": "Meilleur rang", "pos": "Position", "score": "Score moyen", "none": "Aucun résultat avec les réglages actuels.", "needSeq": "Chargez ou collez d'abord une séquence cible à l'étape 2.", "selected": "Épitopes sélectionnés", "ctl": "CTL (CMH-I)", "htl": "HTL (CMH-II)", "bc": "Cellules B", "adjuvant": "Séquence de l'adjuvant (facultatif)", "his": "Ajouter une étiquette His C-terminale", "assemble": "Assembler la construction", "construct": "Construction", "layout": "Disposition", "evalTitle": "Profil physico-chimique (calculé ici)", "prop": "Propriété", "value": "Valeur", "ext": "Non calculé ici : utilisez les outils d'origine et notez le résultat", "antigen": "Antigénicité (ex. VaxiJen)", "allergen": "Allergénicité (ex. AllerTOP)", "toxin": "Toxicité (ex. ToxinPred)", "solub": "Solubilité (ex. Protein-Sol)", "report": "Télécharger le rapport (Markdown)", "reportHint": "Contient entrées, paramètres, sources, dates de récupération et limites.", "planned": "Prévu", "covTitle": "Épitopes sélectionnés et allèles restrictifs", "covNeed": "Lancez d'abord l'étape 4 et ajoutez des épitopes CTL/HTL à la sélection.", "covIedb": "Entrée pour l'outil IEDB Population Coverage (épitope, tabulation, allèles)", "covOpen": "Ouvrir IEDB Population Coverage", "covLocal": "Estimation locale à partir de vos fréquences alléliques", "covRun": "Calculer la couverture", "covC1": "Classe I", "covC2": "Classe II", "covAll": "Combinée", "covMissing": "Allèles sans fréquence", "popName": "Population (pour le rapport)", "pred": "Prédire la structure avec ESMFold", "consent": "J'accepte d'envoyer cette séquence à l'ESM Metagenomic Atlas (service externe).", "pdbLoad": "Charger un fichier PDB ou coller le texte PDB", "isPlddt": "La colonne B-factor contient le pLDDT (AlphaFold / ESMFold)", "runQc": "Analyser la structure", "dlPdb": "Télécharger le PDB", "qcTitle": "Qualité du modèle", "mean": "pLDDT moyen", "rama": "Ramachandran (approximatif)", "fav": "Favorable", "allow": "Permis", "outl": "Aberrants", "outList": "Résidus aberrants", "needCons": "Construisez d'abord une construction à l'étape 6.", "recs": "Entrées de récepteurs souvent utilisées (vérifiez chacune dans le visualiseur 3D ci-dessus)", "servers": "Serveurs de docking (vérifiez les liens)", "cplx": "Complexe docké (PDB)", "chA": "Chaîne(s) du vaccin", "chB": "Chaîne(s) du récepteur", "cut": "Seuil de contact (Å)", "runIf": "Analyser l'interface", "ifTitle": "Résumé de l'interface", "pairs": "Paires de résidus en contact", "ifA": "Résidus d'interface (vaccin)", "ifB": "Résidus d'interface (récepteur)", "polar": "Candidats de contacts polaires", "salt": "Candidats de ponts salins", "err": "La requête a échoué", "disclaimer": "Usage de recherche et d'enseignement uniquement. Pas pour des décisions cliniques, de dosage ou de sécurité.", "cdTitle": "Optimisation des codons", "strategy": "Stratégie", "stW": "Pondérée par la fréquence (évite les répétitions)", "stB": "Codon le plus fréquent", "seed": "Graine", "stopC": "Codon stop", "avoidEnz": "Éviter les sites de restriction pour", "startM": "Ajouter un codon de départ (Met) s'il manque", "customT": "Table de codons de l'hôte personnalisée (facultatif)", "optRun": "Optimiser les codons", "optRes": "Séquence codante optimisée", "caiL": "CAI", "gcL": "Teneur en GC", "gcWinL": "GC, fenêtres de 50 nt (min–max)", "rareL": "Codons rares", "unresL": "Sites ou répétitions non résolus", "hostL": "Table de l'hôte", "clTitle": "Conception de clonage in silico", "enz5": "Enzyme 5′", "enz3": "Enzyme 3′", "clampL": "Clamp 5′ / 3′", "buildIns": "Construire l'insert", "insL": "Insert (5′ vers 3′)", "ftrL": "Caractéristiques", "dlFasta": "Télécharger le FASTA", "learn": [["Pourquoi des vaccins à base d'épitopes", "Au lieu d'un pathogène ou d'une protéine entière, le vaccin présente de courtes régions (épitopes) reconnues par les cellules immunitaires. Cela concentre la réponse et évite des régions indésirables, mais l'immunogénicité de chaque épitope doit encore être démontrée."], ["Trois types d'épitopes", "Les épitopes CTL (8–11 aa) se lient au CMH de classe I et activent les lymphocytes CD8+. Les épitopes HTL (environ 15 aa) se lient au CMH de classe II et aident les CD4+. Les épitopes B sont reconnus par les anticorps ; les linéaires se prédisent à partir de la séquence, les conformationnels demandent la structure."], ["Pourquoi plusieurs allèles HLA", "Les gènes HLA sont très polymorphes : un épitope qui se lie à un allèle peut ne pas se lier à un autre. Utiliser plusieurs allèles, puis la couverture de population, montre l'étendue possible d'une conception."], ["Adjuvants et linkers", "Les adjuvants, comme les agonistes des TLR, renforcent la réponse. Les linkers (EAAAK, AAY, GPGPG, KK) séparent les épitopes et aident à leur traitement. Leur choix doit être justifié dans les méthodes."], ["Ce que les prédictions ne peuvent pas faire", "Un score de liaison n'est pas de l'immunogénicité, et des propriétés calculées ne sont pas de la sécurité. Il faut vérifier antigénicité, allergénicité et toxicité, puis expérimenter, avant toute affirmation."]]},
  ru: {"kicker": "Иммуноинформатика · только для исследований", "title": "Рабочее пространство для разработки эпитопных вакцин", "intro": "Пошаговый процесс с прослеживаемыми источниками. Предсказания получены от названных инструментов и сохраняют происхождение. Это гипотезы для лабораторной проверки, а не доказательство защиты или безопасности.", "steps": ["Основы", "Мишень и последовательность", "В-клеточные эпитопы", "Т-клеточные эпитопы", "Охват популяции", "Дизайн мультиэпитопа", "Оценка конструкции", "Структура", "Докинг", "Экспрессия и клонирование", "Отчёт"], "run": "Запустить", "running": "Выполняется…", "add": "Добавить", "remove": "Удалить", "copy": "Копировать", "copied": "Скопировано", "load": "Загрузить", "use": "Использовать", "acc": "Код UniProt (например, P0DTC2)", "or": "или вставьте последовательность / FASTA", "from": "От", "to": "До", "residues": "остатков", "noSignal": "Удалить сигнальный пептид", "features": "Аннотация UniProt", "retrieved": "Получено", "source": "Источник", "method": "Метод", "cutoff": "Порог процентильного ранга (ниже = сильнее)", "panel": "Панель аллелей", "quick": "Быстрая (частые аллели)", "ref": "Эталонная панель IEDB", "lens": "Длины пептидов", "peptide": "Пептид", "alleles": "Аллели", "best": "Лучший ранг", "pos": "Позиция", "score": "Средняя оценка", "none": "При текущих настройках результатов нет.", "needSeq": "Сначала загрузите или вставьте целевую последовательность на шаге 2.", "selected": "Выбранные эпитопы", "ctl": "CTL (MHC-I)", "htl": "HTL (MHC-II)", "bc": "В-клеточные", "adjuvant": "Последовательность адъюванта (необязательно)", "his": "Добавить His-метку на C-конце", "assemble": "Собрать конструкцию", "construct": "Конструкция", "layout": "Схема", "evalTitle": "Физико-химический профиль (рассчитан здесь)", "prop": "Свойство", "value": "Значение", "ext": "Здесь не рассчитывается: используйте исходные инструменты и внесите результат", "antigen": "Антигенность (например, VaxiJen)", "allergen": "Аллергенность (например, AllerTOP)", "toxin": "Токсичность (например, ToxinPred)", "solub": "Растворимость (например, Protein-Sol)", "report": "Скачать отчёт (Markdown)", "reportHint": "Содержит входные данные, параметры, источники, время получения и ограничения.", "planned": "Запланировано", "covTitle": "Выбранные эпитопы и ограничивающие аллели", "covNeed": "Сначала выполните шаг 4 и добавьте CTL/HTL-эпитопы в выбор.", "covIedb": "Ввод для инструмента IEDB Population Coverage (эпитоп, табуляция, аллели)", "covOpen": "Открыть IEDB Population Coverage", "covLocal": "Локальная оценка по вашим частотам аллелей", "covRun": "Рассчитать охват", "covC1": "Класс I", "covC2": "Класс II", "covAll": "Совокупно", "covMissing": "Аллели без частоты", "popName": "Популяция (для отчёта)", "pred": "Предсказать структуру с помощью ESMFold", "consent": "Я согласен отправить эту последовательность в ESM Metagenomic Atlas (внешний сервис).", "pdbLoad": "Загрузите PDB-файл или вставьте текст PDB", "isPlddt": "Столбец B-фактора содержит pLDDT (AlphaFold / ESMFold)", "runQc": "Проанализировать структуру", "dlPdb": "Скачать PDB", "qcTitle": "Качество модели", "mean": "Средний pLDDT", "rama": "Рамачандран (приблизительно)", "fav": "Благоприятные", "allow": "Допустимые", "outl": "Выбросы", "outList": "Остатки-выбросы", "needCons": "Сначала создайте конструкцию на шаге 6.", "recs": "Часто используемые рецепторы (проверьте каждый в 3D-просмотрщике выше)", "servers": "Серверы докинга (проверьте ссылки)", "cplx": "Докированный комплекс (PDB)", "chA": "Цепь(и) вакцины", "chB": "Цепь(и) рецептора", "cut": "Порог контакта (Å)", "runIf": "Проанализировать интерфейс", "ifTitle": "Сводка по интерфейсу", "pairs": "Пары остатков в контакте", "ifA": "Остатки интерфейса (вакцина)", "ifB": "Остатки интерфейса (рецептор)", "polar": "Кандидаты полярных контактов", "salt": "Кандидаты солевых мостиков", "err": "Запрос не выполнен", "disclaimer": "Только для исследований и обучения. Не для клинических решений, дозировки или оценки безопасности.", "cdTitle": "Оптимизация кодонов", "strategy": "Стратегия", "stW": "Взвешенная по частоте (избегает повторов)", "stB": "Самый частый кодон", "seed": "Seed", "stopC": "Стоп-кодон", "avoidEnz": "Избегать сайтов рестрикции для", "startM": "Добавить стартовый кодон (Met), если его нет", "customT": "Своя таблица кодонов хозяина (необязательно)", "optRun": "Оптимизировать кодоны", "optRes": "Оптимизированная кодирующая последовательность", "caiL": "CAI", "gcL": "GC-состав", "gcWinL": "GC в окнах по 50 нт (мин–макс)", "rareL": "Редкие кодоны", "unresL": "Нерешённые сайты или повторы", "hostL": "Таблица хозяина", "clTitle": "Дизайн клонирования in silico", "enz5": "Фермент 5′", "enz3": "Фермент 3′", "clampL": "Clamp 5′ / 3′", "buildIns": "Собрать вставку", "insL": "Вставка (5′→3′)", "ftrL": "Элементы", "dlFasta": "Скачать FASTA", "learn": [["Зачем эпитопные вакцины", "Вместо целого патогена или белка вакцина представляет короткие участки (эпитопы), которые распознают иммунные клетки. Это фокусирует ответ и позволяет избежать нежелательных участков, но иммуногенность каждого эпитопа всё равно нужно подтвердить."], ["Три типа эпитопов", "CTL-эпитопы (8–11 ак) связываются с MHC класса I и активируют CD8+ Т-клетки. HTL-эпитопы (около 15 ак) связываются с MHC класса II и помогают CD4+ клеткам. В-клеточные эпитопы распознают антитела: линейные предсказывают по последовательности, конформационные требуют структуры."], ["Почему много аллелей HLA", "Гены HLA очень полиморфны, и эпитоп, связывающийся с одним аллелем, может не связываться с другим. Несколько аллелей, а позже охват популяции показывают, насколько широко может работать дизайн."], ["Адъюванты и линкеры", "Адъюванты, например агонисты TLR, усиливают ответ. Линкеры (EAAAK, AAY, GPGPG, KK) разделяют эпитопы и облегчают процессинг. Их выбор нужно обосновать в разделе методов."], ["Чего предсказания не могут", "Оценка связывания — не иммуногенность, а расчётные свойства — не безопасность. До любых утверждений нужны проверки антигенности, аллергенности и токсичности, а затем эксперименты."]]},
  ar: {"kicker": "المعلوماتية المناعية · للأبحاث فقط", "title": "مساحة عمل لتصميم لقاحات قائمة على الحواتم (Epitopes)", "intro": "مسار موجَّه بمصادر قابلة للتتبع. تأتي التنبؤات من أدوات مسمّاة وتحتفظ بمصدرها. هي فرضيات تُختبر مخبريًا وليست دليلًا على الحماية أو الأمان.", "steps": ["الأساسيات", "الهدف والتسلسل", "حواتم الخلايا البائية", "حواتم الخلايا التائية", "التغطية السكانية", "تصميم متعدد الحواتم", "تقييم البنية المصمّمة", "البنية", "الالتحام (Docking)", "التعبير والاستنساخ", "التقرير"], "run": "تشغيل", "running": "جارٍ التشغيل…", "add": "إضافة", "remove": "إزالة", "copy": "نسخ", "copied": "تم النسخ", "load": "تحميل", "use": "استخدام", "acc": "رمز UniProt (مثل P0DTC2)", "or": "أو الصق تسلسلًا / FASTA", "from": "من", "to": "إلى", "residues": "بقايا", "noSignal": "إزالة ببتيد الإشارة", "features": "توصيف UniProt", "retrieved": "وقت الجلب", "source": "المصدر", "method": "الطريقة", "cutoff": "عتبة رتبة النسبة المئوية (الأقل = الأقوى)", "panel": "لوحة الأليلات", "quick": "سريعة (أليلات شائعة)", "ref": "لوحة IEDB المرجعية", "lens": "أطوال الببتيدات", "peptide": "الببتيد", "alleles": "الأليلات", "best": "أفضل رتبة", "pos": "الموضع", "score": "متوسط الدرجة", "none": "لا توجد نتائج بالإعدادات الحالية.", "needSeq": "حمّل أو الصق تسلسل الهدف في الخطوة 2 أولًا.", "selected": "الحواتم المختارة", "ctl": "CTL (MHC-I)", "htl": "HTL (MHC-II)", "bc": "الخلايا البائية", "adjuvant": "تسلسل المادة المساعدة (اختياري)", "his": "إضافة وسم His في الطرف C", "assemble": "تجميع البنية", "construct": "البنية المصمّمة", "layout": "الترتيب", "evalTitle": "الخصائص الفيزيائية الكيميائية (تُحسب هنا)", "prop": "الخاصية", "value": "القيمة", "ext": "لا تُحسب هنا: استخدم الأدوات الأصلية وسجّل النتيجة", "antigen": "القدرة المستضدية (مثل VaxiJen)", "allergen": "التحسسية (مثل AllerTOP)", "toxin": "السمّية (مثل ToxinPred)", "solub": "الذوبانية (مثل Protein-Sol)", "report": "تنزيل التقرير (Markdown)", "reportHint": "يتضمن المدخلات والمعاملات والمصادر وأوقات الجلب والقيود.", "planned": "مخطَّط", "covTitle": "الحواتم المختارة والأليلات المقيِّدة", "covNeed": "شغّل الخطوة 4 أولًا وأضف حواتم CTL/HTL إلى الاختيار.", "covIedb": "مدخل أداة IEDB Population Coverage (الحاتمة، علامة جدولة، الأليلات)", "covOpen": "فتح IEDB Population Coverage", "covLocal": "تقدير محلي من ترددات الأليلات التي تدخلها", "covRun": "احسب التغطية", "covC1": "الفئة I", "covC2": "الفئة II", "covAll": "مجتمعة", "covMissing": "أليلات بلا تردد", "popName": "السكان (للتقرير)", "pred": "تنبؤ البنية باستخدام ESMFold", "consent": "أوافق على إرسال هذا التسلسل إلى ESM Metagenomic Atlas (خدمة خارجية).", "pdbLoad": "حمّل ملف PDB أو الصق نصه", "isPlddt": "عمود B-factor يحمل pLDDT (AlphaFold / ESMFold)", "runQc": "تحليل البنية", "dlPdb": "تنزيل PDB", "qcTitle": "جودة النموذج", "mean": "متوسط pLDDT", "rama": "راماتشاندران (تقريبي)", "fav": "مفضّلة", "allow": "مسموحة", "outl": "شاذّة", "outList": "البقايا الشاذّة", "needCons": "ابنِ البنية المصمّمة في الخطوة 6 أولًا.", "recs": "مستقبِلات شائعة الاستخدام (تحقق من كلٍّ منها في العارض ثلاثي الأبعاد أعلاه)", "servers": "خوادم الالتحام (تحقق من الروابط)", "cplx": "المعقّد الملتحم (PDB)", "chA": "سلسلة/سلاسل اللقاح", "chB": "سلسلة/سلاسل المستقبِل", "cut": "عتبة التماس (Å)", "runIf": "تحليل الواجهة", "ifTitle": "ملخص الواجهة", "pairs": "أزواج البقايا المتلامسة", "ifA": "بقايا الواجهة (اللقاح)", "ifB": "بقايا الواجهة (المستقبِل)", "polar": "مرشّحو التماسّ القطبي", "salt": "مرشّحو الجسور الملحية", "err": "فشل الطلب", "disclaimer": "للأبحاث والتعليم فقط. ليس لقرارات سريرية أو جرعات أو أمان.", "cdTitle": "تحسين الكودونات", "strategy": "الاستراتيجية", "stW": "موزونة بالتردد (تتجنب التكرار)", "stB": "الكودون الأكثر تكرارًا", "seed": "Seed", "stopC": "كودون التوقف", "avoidEnz": "تجنّب مواقع القطع لـ", "startM": "أضف كودون البدء (Met) إن كان مفقودًا", "customT": "جدول كودونات مخصص للمضيف (اختياري)", "optRun": "حسّن الكودونات", "optRes": "التسلسل المشفّر المحسَّن", "caiL": "CAI", "gcL": "محتوى GC", "gcWinL": "GC في نوافذ 50 نوكليوتيدًا (الأدنى–الأعلى)", "rareL": "كودونات نادرة", "unresL": "مواقع أو تكرارات غير محلولة", "hostL": "جدول المضيف", "clTitle": "تصميم الاستنساخ حاسوبيًا", "enz5": "إنزيم ′5", "enz3": "إنزيم ′3", "clampL": "Clamp ′5 / ′3", "buildIns": "ابنِ المُدخَل", "insL": "المُدخَل (′5 إلى ′3)", "ftrL": "المعالم", "dlFasta": "تنزيل FASTA", "learn": [["لماذا اللقاحات القائمة على الحواتم", "بدل عرض الممرض أو البروتين كاملًا، يعرض اللقاح مناطق قصيرة (حواتم) تتعرّف عليها الخلايا المناعية. هذا يركّز الاستجابة ويتجنّب مناطق غير مرغوبة، لكن يجب إثبات قدرة كل حاتمة على إثارة المناعة."], ["ثلاثة أنواع من الحواتم", "حواتم CTL (8–11 حمضًا أمينيًا) ترتبط بـ MHC الفئة I وتنشّط الخلايا التائية CD8+. حواتم HTL (نحو 15 حمضًا) ترتبط بـ MHC الفئة II وتساعد الخلايا CD4+. حواتم الخلايا البائية تتعرّف عليها الأجسام المضادة؛ الخطية تُتنبّأ من التسلسل، أما التوافقية فتحتاج إلى البنية."], ["لماذا عدة أليلات HLA", "جينات HLA شديدة التعدد الشكلي، وقد ترتبط حاتمة بأليل ولا ترتبط بآخر. استخدام عدة أليلات، ثم التغطية السكانية، يبيّن مدى اتساع فاعلية التصميم."], ["المواد المساعدة والروابط", "المواد المساعدة مثل منبّهات TLR تعزّز الاستجابة. الروابط (EAAAK وAAY وGPGPG وKK) تفصل الحواتم وتساعد على معالجتها. ينبغي تبرير اختيارها في قسم الطرائق."], ["ما لا تستطيعه التنبؤات", "درجة الارتباط ليست قدرة على إثارة المناعة، والخصائص المحسوبة ليست أمانًا. يلزم فحص القدرة المستضدية والتحسسية والسمّية ثم التجارب قبل أي ادعاء."]]},
  zh: {"kicker": "免疫信息学 · 仅供科研使用", "title": "基于表位的疫苗设计工作台", "intro": "带可追溯来源的引导式流程。预测来自指明的工具并保留出处，它们是待实验验证的假设，不代表保护效果或安全性。", "steps": ["基础", "靶标与序列", "B 细胞表位", "T 细胞表位", "人群覆盖率", "多表位设计", "构建体评估", "结构", "对接", "表达与克隆", "报告"], "run": "运行", "running": "运行中…", "add": "添加", "remove": "移除", "copy": "复制", "copied": "已复制", "load": "加载", "use": "使用", "acc": "UniProt 登录号（如 P0DTC2）", "or": "或粘贴序列 / FASTA", "from": "起", "to": "止", "residues": "个残基", "noSignal": "去除信号肽", "features": "UniProt 注释", "retrieved": "获取时间", "source": "来源", "method": "方法", "cutoff": "百分位排名阈值（越低越强）", "panel": "等位基因面板", "quick": "快速（常见等位基因）", "ref": "IEDB 参考面板", "lens": "肽段长度", "peptide": "肽段", "alleles": "等位基因", "best": "最佳排名", "pos": "位置", "score": "平均得分", "none": "当前设置下没有结果。", "needSeq": "请先在第 2 步加载或粘贴靶标序列。", "selected": "已选表位", "ctl": "CTL（MHC-I）", "htl": "HTL（MHC-II）", "bc": "B 细胞", "adjuvant": "佐剂序列（可选）", "his": "添加 C 端 His 标签", "assemble": "组装构建体", "construct": "构建体", "layout": "排布", "evalTitle": "理化性质（在此计算）", "prop": "属性", "value": "数值", "ext": "此处不计算：请使用原始工具并记录结果", "antigen": "抗原性（如 VaxiJen）", "allergen": "致敏性（如 AllerTOP）", "toxin": "毒性（如 ToxinPred）", "solub": "溶解性（如 Protein-Sol）", "report": "下载报告（Markdown）", "reportHint": "包含输入、参数、来源、获取时间与局限性。", "planned": "计划中", "covTitle": "已选表位及其限制性等位基因", "covNeed": "请先运行第 4 步，并把 CTL/HTL 表位加入选择。", "covIedb": "IEDB Population Coverage 工具的输入（表位、制表符、等位基因）", "covOpen": "打开 IEDB Population Coverage", "covLocal": "基于您自己的等位基因频率的本地估算", "covRun": "计算覆盖率", "covC1": "I 类", "covC2": "II 类", "covAll": "合并", "covMissing": "缺少频率的等位基因", "popName": "人群（用于报告）", "pred": "用 ESMFold 预测结构", "consent": "我同意将此序列发送到 ESM Metagenomic Atlas（外部服务）。", "pdbLoad": "加载 PDB 文件或粘贴 PDB 文本", "isPlddt": "B 因子列为 pLDDT（AlphaFold / ESMFold）", "runQc": "分析结构", "dlPdb": "下载 PDB", "qcTitle": "模型质量", "mean": "平均 pLDDT", "rama": "Ramachandran（近似）", "fav": "有利区", "allow": "允许区", "outl": "离群", "outList": "离群残基", "needCons": "请先在第 6 步构建构建体。", "recs": "常用受体条目（请在上方 3D 查看器中逐一核对）", "servers": "对接服务器（请核对链接）", "cplx": "对接复合物（PDB）", "chA": "疫苗链", "chB": "受体链", "cut": "接触阈值（Å）", "runIf": "分析界面", "ifTitle": "界面摘要", "pairs": "接触残基对", "ifA": "界面残基（疫苗）", "ifB": "界面残基（受体）", "polar": "极性接触候选", "salt": "盐桥候选", "err": "请求失败", "disclaimer": "仅用于科研与教学，不用于临床、剂量或安全性决策。", "cdTitle": "密码子优化", "strategy": "策略", "stW": "按频率加权（避免重复）", "stB": "最高频密码子", "seed": "随机种子", "stopC": "终止密码子", "avoidEnz": "避开以下酶切位点", "startM": "若缺失则添加起始密码子（Met）", "customT": "自定义宿主密码子表（可选）", "optRun": "优化密码子", "optRes": "优化后的编码序列", "caiL": "CAI", "gcL": "GC 含量", "gcWinL": "GC（50 nt 窗口，最小–最大）", "rareL": "稀有密码子", "unresL": "未解决的位点或重复", "hostL": "宿主表", "clTitle": "计算机克隆设计", "enz5": "5′ 酶", "enz3": "3′ 酶", "clampL": "保护碱基 5′ / 3′", "buildIns": "生成插入片段", "insL": "插入片段（5′→3′）", "ftrL": "特征", "dlFasta": "下载 FASTA", "learn": [["为什么用基于表位的疫苗", "疫苗不展示完整病原体或蛋白，而是呈现免疫细胞可识别的短片段（表位）。这能聚焦免疫应答并避开不需要的区域，但每个表位的免疫原性仍需证实。"], ["三类表位", "CTL 表位（8–11 个氨基酸）结合 MHC I 类分子并激活 CD8+ T 细胞；HTL 表位（约 15 个氨基酸）结合 MHC II 类分子并辅助 CD4+ 细胞；B 细胞表位由抗体识别，线性表位可由序列预测，构象表位则需要结构信息。"], ["为什么要考虑多个 HLA 等位基因", "HLA 基因高度多态，能结合某一等位基因的表位未必结合另一个。使用多个等位基因，并在后续评估人群覆盖率，可反映设计的适用范围。"], ["佐剂与连接肽", "TLR 激动剂等佐剂可增强免疫应答。连接肽（EAAAK、AAY、GPGPG、KK）用于分隔表位并有助于加工，其选择应在方法部分说明理由。"], ["预测做不到的事", "结合得分不等于免疫原性，计算得到的性质也不等于安全性。在做出任何结论之前，需要检查抗原性、致敏性和毒性，并进行实验验证。"]]},
};

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

const ENZ = ["NdeI", "NcoI", "BamHI", "EcoRI", "HindIII", "XhoI", "NotI", "XbaI", "SalI", "KpnI", "SacI", "NheI", "BglII", "PstI", "SpeI"];
const wrap = (x: string) => x.replace(/(.{70})/g, "$1\n");
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
  const rtl = lang === "fa" || lang === "ar";
  const t: Dict = { ...BASE.en, ...(lang === "fa" ? BASE.fa : EXTRA[lang || ""] || {}) } as Dict;
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
  const [queuedMsg, setQueuedMsg] = useState("");
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
  const [strat, setStrat] = useState("weighted");
  const [seed, setSeed] = useState(1);
  const [stopC, setStopC] = useState("TAA");
  const [addM, setAddM] = useState(true);
  const [avoid, setAvoid] = useState<string[]>(["NdeI", "XhoI", "BamHI", "EcoRI", "HindIII"]);
  const [customTbl, setCustomTbl] = useState("");
  const [codon, setCodon] = useState<any>(null);
  const [e5, setE5] = useState("NdeI");
  const [e3, setE3] = useState("XhoI");
  const [cl5, setCl5] = useState("GCGCGC");
  const [cl3, setCl3] = useState("GCGCGC");
  const [ins, setIns] = useState<any>(null);

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
  const runCodon = () => void post("cod", "/pharma/vaccine/codon",
    { protein: cons.sequence, strategy: strat, seed, avoid_enzymes: avoid, custom_table: customTbl, add_start: addM, stop: stopC }, (r) => { setCodon(r); setIns(null); });
  const runIns = () => void post("ins", "/pharma/vaccine/clone", { cds: codon.cds, enzyme5: e5, enzyme3: e3, clamp5: cl5, clamp3: cl3, spacer5: "", spacer3: "" }, setIns);
  const queueAll = () => {
    const items: any[] = [];
    if (protein) items.push({ kind: "uniprot", title: "Target protein", data: { ...protein, sequence: undefined } });
    if (bRes) items.push({ kind: "bcell", title: "B-cell epitopes", data: bRes });
    for (const c of ["I", "II"]) if (tRes[c]) items.push({ kind: "tcell", title: `T-cell MHC-${c}`, data: tRes[c] });
    if (cov) items.push({ kind: "coverage", title: "Population coverage", data: { ...cov, population: popName } });
    if (cons) items.push({ kind: "construct", title: "Multi-epitope construct", data: cons });
    if (qc) items.push({ kind: "structure_qc", title: "Structure model quality", data: qc });
    if (iface) items.push({ kind: "interface", title: "Docked-complex interface", data: iface });
    if (codon) items.push({ kind: "codon", title: "Codon optimization", data: codon });
    if (ins) items.push({ kind: "clone", title: "In-silico cloning design", data: ins });
    items.push({ kind: "vaccine_report", title: "Vaccine design report (Markdown)", text: report });
    const ok = items.filter((it) => addToQueue(it).ok).length;
    setQueuedMsg(`${ok}/${items.length} ${t.queuedN}`);
  };
  const saveTxt = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };

  const report = useMemo(() => {
    const L: string[] = [`# Vaccine design report (Primer AI)`, "", `Generated: ${new Date().toISOString()}`, `> ${BASE.en.disclaimer} All predictions are hypotheses.`, ""];
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
    if (codon) L.push("## Codon optimization", `- Host table: ${codon.host_table}; strategy: ${codon.strategy}; seed ${codon.seed}`, `- ${codon.length_nt} nt; GC ${codon.gc_percent}%; CAI ${codon.cai}; rare codons ${codon.rare_codon_count}`,
      `- Avoided sites: ${codon.avoided_enzymes.join(", ") || "none"}; unresolved: ${codon.unresolved.length}`, `- Method: ${codon.method}`, `- Limits: ${codon.limits}`, "```", codon.cds, "```", "");
    if (ins) L.push("## In-silico cloning design", `- ${e5} / ${e3}; insert ${ins.length_nt} nt; site counts ${JSON.stringify(ins.site_counts)}`, `- ${ins.frame_note}`, `- ${ins.limits}`, "```", ins.insert, "```", "");
    const e = Object.entries(ext).filter(([, v]) => v.trim());
    if (e.length) L.push("## Results entered by the user (not computed by Primer AI)", ...e.map(([k, v]) => `- ${k}: ${v}`), "");
    L.push("## Limitations", "- Binding and epitope predictions are not proof of immunogenicity.", "- Antigenicity, allergenicity, toxicity and docking scores were not computed by this tool; population coverage and interface values are projections or geometry only.", "- Experimental validation is required.");
    return L.join("\n");
  }, [fullSeq, protein, from, hi, work, bRes, tRes, cons, ext, cov, popName, qc, iface, codon, ins, e5, e3]);

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

  return <section id="pharma-vaccine" dir={rtl ? "rtl" : "ltr"} aria-labelledby="pharma-vaccine-title" className="space-y-4 rounded-2xl border border-slate-600 bg-[#111c34] p-4 text-slate-100">
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

    {step === 6 && (!cons ? <p className="text-sm text-slate-300">{t.needCons}</p> : <div className="space-y-4">
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
            <svg viewBox="0 0 300 60" className="h-14 w-full" role="img" aria-label="pLDDT per residue" style={{ direction: "ltr" }}>
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
    {step === 9 && (!cons ? <p className="text-sm text-slate-300">{t.needCons}</p> : <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <h4 className="font-bold text-emerald-200">{t.cdTitle}</h4>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">{t.strategy}<select className={`${field} mt-1`} value={strat} onChange={(e) => setStrat(e.target.value)}>
            <option value="weighted">{t.stW}</option><option value="most_frequent">{t.stB}</option></select></label>
          <label className="text-sm">{t.seed}<input type="number" min={1} dir="ltr" className={`${field} mt-1 w-24`} value={seed} onChange={(e) => setSeed(Math.max(1, parseInt(e.target.value || "1", 10)))} /></label>
          <label className="text-sm">{t.stopC}<select className={`${field} mt-1`} value={stopC} onChange={(e) => setStopC(e.target.value)}>{["TAA", "TGA", "TAG"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addM} onChange={(e) => setAddM(e.target.checked)} />{t.startM}</label>
        </div>
        <fieldset><legend className="text-sm">{t.avoidEnz}</legend>
          <div className="mt-1 flex flex-wrap gap-2">{ENZ.map((n) => <label key={n} className="flex items-center gap-1 rounded-full border border-slate-500 px-2.5 py-1 text-xs" dir="ltr">
            <input type="checkbox" checked={avoid.includes(n)} onChange={() => setAvoid((a) => (a.includes(n) ? a.filter((x) => x !== n) : [...a, n]))} />{n}</label>)}</div></fieldset>
        <details><summary className="cursor-pointer text-sm">{t.customT}</summary>
          <p className="mt-1 text-xs text-slate-300">{t.customHelp}</p>
          <textarea aria-label={t.customT} rows={5} dir="ltr" className={`${field} mt-2 font-mono text-xs`} value={customTbl} onChange={(e) => setCustomTbl(e.target.value)} placeholder={"GCU 17.1\nGCC 24.2"} /></details>
        <button type="button" className={btnP} disabled={!!busy} onClick={runCodon}>{busy === "cod" ? t.running : t.optRun}</button>
      </div>
      {codon && <div className={`${card} space-y-2 text-sm`}>
        <h4 className="font-bold text-emerald-200">{t.optRes}</h4>
        <div className="grid gap-2 sm:grid-cols-4">{([[t.caiL, codon.cai], [t.gcL, `${codon.gc_percent}%`], [t.gcWinL, `${codon.gc_window50_min}–${codon.gc_window50_max}%`], [t.rareL, codon.rare_codon_count]] as any[]).map(([k, v]) =>
          <div key={k} className="rounded-lg border border-slate-600 bg-[#0c182a] p-3"><p className="text-lg font-bold tabular-nums text-emerald-300" dir="ltr">{String(v)}</p><p className="text-xs text-slate-300">{k}</p></div>)}</div>
        <p className="text-xs text-slate-300">{t.hostL}: {codon.host_table} · {codon.length_nt} nt</p>
        {codon.unresolved.length > 0 && <p className="text-amber-200">{t.unresL}: <span dir="ltr">{codon.unresolved.map((u: any) => `${u.type} ${u.start}-${u.end}`).join(", ")}</span></p>}
        <textarea readOnly aria-label={t.optRes} rows={5} dir="ltr" className={`${field} font-mono text-xs`} value={codon.cds} />
        <button type="button" className={btnG} onClick={() => void copy(codon.cds)}>{copied ? t.copied : t.copy}</button>
        <p className="text-xs text-slate-300">{codon.method} {codon.limits}</p>
      </div>}
      {codon && <div className={`${card} space-y-3`}>
        <h4 className="font-bold text-emerald-200">{t.clTitle}</h4>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">{t.enz5}<select dir="ltr" className={`${field} mt-1`} value={e5} onChange={(e) => { setE5(e.target.value); setIns(null); }}>{ENZ.filter((n) => n !== "NcoI").map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="text-sm">{t.enz3}<select dir="ltr" className={`${field} mt-1`} value={e3} onChange={(e) => { setE3(e.target.value); setIns(null); }}>{ENZ.filter((n) => n !== "NcoI").map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="text-sm">{t.clampL}<span className="mt-1 flex gap-1"><input dir="ltr" maxLength={12} className={`${field} w-28 font-mono text-xs`} value={cl5} onChange={(e) => setCl5(e.target.value.toUpperCase())} />
            <input dir="ltr" maxLength={12} className={`${field} w-28 font-mono text-xs`} value={cl3} onChange={(e) => setCl3(e.target.value.toUpperCase())} /></span></label>
          <button type="button" className={btnP} disabled={!!busy} onClick={runIns}>{busy === "ins" ? t.running : t.buildIns}</button>
        </div>
        {ins && <div className="space-y-2 text-sm">
          <p dir="ltr" className="text-xs text-slate-300">{ins.length_nt} nt · {Object.entries(ins.site_counts).map(([k, v]) => `${k}×${v}`).join(" · ")} · {ins.sites_ok ? "✓" : "⚠"}</p>
          {ins.warnings.map((w: string) => <p key={w} className="text-amber-200">{w}</p>)}
          <div className="overflow-x-auto"><table className="w-full text-start text-xs" dir="ltr"><caption className="pb-1 text-start font-semibold text-emerald-200">{t.ftrL}</caption><tbody>{ins.features.map((f: any) =>
            <tr key={f.name} className="border-t border-slate-700"><td className="py-1 pe-3">{f.name}</td><td className="pe-3">{f.start}–{f.end}</td></tr>)}</tbody></table></div>
          <textarea readOnly aria-label={t.insL} rows={5} dir="ltr" className={`${field} font-mono text-xs`} value={ins.insert} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnG} onClick={() => void copy(ins.insert)}>{copied ? t.copied : t.copy}</button>
            <button type="button" className={btnG} onClick={() => saveTxt("vaccine-insert.fasta", `>optimized_cds\n${wrap(codon.cds)}\n>insert_${e5}_${e3}\n${wrap(ins.insert)}\n`)}>{t.dlFasta}</button>
          </div>
          <p className="text-xs text-slate-300">{ins.frame_note} {ins.limits}</p>
        </div>}
      </div>}
    </div>)}
    {step === 10 && <div className="space-y-2">
      <p className="text-sm text-slate-300">{t.reportHint}</p>
      <div className="flex flex-wrap items-center gap-2"><button type="button" className={btnP} onClick={download}>{t.report}</button>
        <button type="button" className={btnG} onClick={queueAll}>{t.toQueue}</button>{queuedMsg && <span className="text-xs text-emerald-300" role="status">{queuedMsg}</span>}</div>
      <pre className="max-h-72 overflow-auto rounded-lg border border-slate-600 bg-[#0c182a] p-3 text-xs text-slate-200" dir="ltr">{report}</pre>
    </div>}

    <p className="text-xs text-slate-400">{t.disclaimer}</p>
  </section>;
}
