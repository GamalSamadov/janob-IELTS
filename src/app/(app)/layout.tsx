import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ExamGuardProvider } from "@/components/exam-guard";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The proxy already sends signed-out visitors to /login; this guards against a missed matcher.
  const { userId } = await auth();
  if (!userId) redirect("/login");

  return (
    <ExamGuardProvider>
      <AppShell key={userId} userId={userId}>
        {children}
      </AppShell>
    </ExamGuardProvider>
  );
}
