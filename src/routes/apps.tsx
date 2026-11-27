import { createFileRoute } from "@tanstack/react-router";
import { AppsPage } from "@/components/hub/AppsPage";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/apps")({
  head: () => hubHead("Appar", "Bygg egna StackChan-appar (om … så …) med sensorer, röst, klockslag, LED, gester, skärm och lampor, samt klock- och väderappar."),
  component: AppsPage,
});