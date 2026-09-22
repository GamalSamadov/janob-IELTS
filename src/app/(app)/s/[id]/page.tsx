import type { Metadata } from "next";
import { ResultScreen } from "@/components/result/result-screen";

export const metadata: Metadata = { title: "Result" };

export default async function Page({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  return <ResultScreen id={id} />;
}
