"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isLogin) {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      try {
        const res = await fetch("http://127.0.0.1:8000/login", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });

        if (!res.ok) throw new Error("Invalid credentials");
        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        router.push("/");
      } catch (err) {
        setError("ایمیل یا رمز عبور اشتباه است.");
      }
    } else {
      try {
        const res = await fetch("http://127.0.0.1:8000/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) throw new Error("Registration failed");
        alert("ثبت‌نام با موفقیت انجام شد! حالا وارد شوید.");
        setIsLogin(true);
      } catch (err) {
        setError("خطا در ثبت‌نام. ممکن است ایمیل تکراری باشد.");
      }
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans text-gray-800" dir="rtl">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-blue-700 text-center mb-6">
          {isLogin ? "ورود به پرایمر AI" : "ساخت حساب جدید"}
        </h1>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">ایمیل</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dir-ltr"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dir-ltr"
              required
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition">
            {isLogin ? "ورود" : "ثبت‌نام"}
          </button>
        </form>

        <p className="text-center mt-4 text-sm text-gray-600">
          {isLogin ? "حساب ندارید؟" : "قبلاً ثبت‌نام کرده‌اید؟"}
          <button onClick={() => setIsLogin(!isLogin)} className="text-blue-600 font-bold ml-1 hover:underline">
            {isLogin ? "ثبت‌نام کنید" : "وارد شوید"}
          </button>
        </p>
      </div>
    </main>
  );
}