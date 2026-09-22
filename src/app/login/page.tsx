import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/login-screen";
import { safeRedirect } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <LoginScreen next={safeRedirect(typeof next === "string" ? next : null)} />;
}
