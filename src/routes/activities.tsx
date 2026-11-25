import { createFileRoute } from "@tanstack/react-router";
import { Skills } from "@/components/hub/Skills";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/activities")({
  head: () => hubHead("Aktiviteter", "Egna snabbkommandon, fokuspass och lokala anteckningar för StackChan."),
  component: Skills,
});
