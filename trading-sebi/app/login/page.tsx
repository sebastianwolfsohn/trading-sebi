import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected || !safeEqual(await sessionToken(password), await sessionToken(expected))) {
    redirect("/login?error=1");
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm card">
      <h1 className="mb-4 text-lg font-semibold">Entrar a Trading Sebi</h1>
      <form action={login} className="space-y-3">
        <input className="input" type="password" name="password" placeholder="Contraseña" autoFocus required />
        {error && <p className="text-sm text-loss">Contraseña incorrecta.</p>}
        <button className="btn w-full">Entrar</button>
      </form>
    </div>
  );
}
