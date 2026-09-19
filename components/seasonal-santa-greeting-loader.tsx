"use client";

import dynamic from "next/dynamic";

const SeasonalSantaGreeting = dynamic(() => import("./seasonal-santa-greeting").then((module) => module.SeasonalSantaGreeting), { ssr: false });

export function SeasonalSantaGreetingLoader(props: { tenantId: string; associationName: string; logoUrl?: string | null }) {
  return <SeasonalSantaGreeting {...props} />;
}
