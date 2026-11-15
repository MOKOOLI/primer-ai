"use client";

import Link from "next/link";

type Props = { lang?: string };

export default function AboutUs({ lang = "en" }: Props) {
  const fa = lang === "fa";

  return (
    <main className="min-h-screen bg-[#f3f6f4] bg-[radial-gradient(1200px_500px_at_100%_-10%,#dcefe6_0%,transparent_60%)] px-4 py-12 text-slate-800 md:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#101a30] px-4 py-1.5 text-xs font-semibold tracking-wider text-emerald-300">
            {fa ? "درباره ما" : "About us"}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#101a30] md:text-4xl">
            {fa ? "داستان Primer AI" : "The Primer AI story"}
          </h1>
        </div>

        {/* Card */}
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
          <div className="prose prose-slate max-w-none leading-relaxed">
            {fa ? (
              <>
                <p>
                  ما، محسن و فاطمه، دو نفر با یک دغدغه مشترک بودیم: اینکه چرا ابزارهای علمی قدرتمند و
                  کاربردی، همیشه پیچیده، پراکنده و دور از دسترس دانشجویان و پژوهشگران هستند؟ در
                  اوقات فراغت خود تصمیم گرفتیم کاری کنیم که این فاصله را کم کنیم.
                </p>
                <p>
                  ایده اولیه ساده بود: یک میز کار دیجیتال که همه‌چیز را از یک جا شروع کند. از یک ژن
                  تا طراحی پرایمر، از تحلیل qPCR تا بررسی ساختار سه‌بعدی پروتئین، و حتی کاوش در
                  داده‌های دارویی و پژوهشی. جایی که یک دانشجو بتواند بدون نصب نرم‌افزارهای سنگین،
                  بدون نیاز به دانش برنامه‌نویسی، و فقط با یک مرورگر، به ابزارهای حرفه‌ای دسترسی
                  داشته باشد.
                </p>
                <p>
                  ما معتقدیم علم باید در دسترس باشد. به همین دلیل، بخش بزرگی از ابزارهای Primer AI
                  بدون نیاز به ثبت‌نام کار می‌کنند و برای دانشجویانی که در آزمایشگاه‌های دانشگاهی با
                  منابع محدود کار می‌کنند، طراحی شده‌اند.
                </p>
                <p>
                  این پروژه برای ما فقط یک وب‌سایت نیست؛ تلاشی است برای اینکه پژوهشگران جوان بتوانند
                  روی ایده‌های خود تمرکز کنند، نه روی پیچیدگی‌های فنی. ما همچنان در حال یادگیری و
                  توسعه هستیم و هر بازخوردی از جامعه علمی را با آغوش باز می‌پذیریم.
                </p>
                <p className="font-semibold text-[#101a30]">
                  Primer AI — ساخته شده برای دانشمندان، توسط دانشمندان.
                </p>
              </>
            ) : (
              <>
                <p>
                  We are Mohsen and Fatemeh, two people with a shared concern: why are powerful,
                  practical scientific tools always complex, scattered, and out of reach for students
                  and researchers? In our free time, we decided to close that gap.
                </p>
                <p>
                  The idea was simple: a digital workbench that starts everything from one place. From
                  a gene to primer design, from qPCR analysis to 3D protein structures, and even
                  exploring drug and research data. A place where a student can access professional
                  tools with just a browser, without installing heavy software or needing to know how
                  to program.
                </p>
                <p>
                  We believe science should be accessible. That is why many Primer AI tools work without
                  signing in, designed for students working in university labs with limited resources.
                </p>
                <p>
                  This project is not just a website for us; it is an effort to let young researchers
                  focus on their ideas instead of technical complexity. We are still learning and
                  building, and we welcome feedback from the scientific community.
                </p>
                <p className="font-semibold text-[#101a30]">
                  Primer AI — built for scientists, by scientists.
                </p>
              </>
            )}
          </div>
        </article>

        {/* Back link */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-block rounded-xl bg-[#16233f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#22345c]"
          >
            {fa ? "← بازگشت به خانه" : "← Back to home"}
          </Link>
        </div>
      </div>
    </main>
  );
}