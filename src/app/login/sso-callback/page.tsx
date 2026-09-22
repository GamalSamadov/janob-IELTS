import type { Metadata } from "next";
import { SsoCallback } from "@/components/auth/sso-callback";
import { safeRedirect } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: PageProps<"/login/sso-callback">) {
  const { next } = await searchParams;
  return <SsoCallback next={safeRedirect(typeof next === "string" ? next : null)} />;
}
