import type { Metadata } from "next";
import { Suspense } from "react";
import { PlansScreen } from "@/components/billing/plans-screen";

export const metadata: Metadata = { title: "Plans" };

export default function Page() {
  // PlansScreen reads the ?checkout= parameters Stripe redirects back with.
  return (
    <Suspense>
      <PlansScreen />
    </Suspense>
  );
}
