import { createFileRoute } from "@tanstack/react-router";
import { AppsPage } from "@/components/hub/AppsPage";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/apps")({
  head: () => hubHead("Appar", "Skapa egna klock- och väderappar för StackChan med lokalt bibliotek och skärmförhandsvisning."),
  component: AppsPage,
});