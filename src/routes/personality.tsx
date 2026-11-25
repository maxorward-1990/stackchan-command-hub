import { createFileRoute } from "@tanstack/react-router";
import { PersonalityPage } from "@/components/hub/PersonalityPage";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/personality")({
  head: () => hubHead("Personlighet", "Ställ in StackChans viloskärm, ögonfärger, lampor, undertexter och tryckbeteende utan att flasha om."),
  component: PersonalityPage,
});
