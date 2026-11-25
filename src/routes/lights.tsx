import { createFileRoute } from "@tanstack/react-router";
import { SmartHomeCard } from "@/components/hub/SmartHomeCard";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/lights")({
  head: () => hubHead("Lampor och scener", "Styr Smart Life-enheter och skapa egna scener på StackChan."),
  component: SmartHomeCard,
});
