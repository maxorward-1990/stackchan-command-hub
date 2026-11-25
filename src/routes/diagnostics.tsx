import { createFileRoute } from "@tanstack/react-router";
import { hubHead } from "@/lib/hub-head";

// The workspace stays mounted in HubShell so tests and logs survive navigation.
export const Route = createFileRoute("/diagnostics")({
  head: () => hubHead("Felsökning", "Felsök StackChans USB-logg, svarstider, mikrofoner och prestanda och exportera mätningar."),
  component: () => null,
});
