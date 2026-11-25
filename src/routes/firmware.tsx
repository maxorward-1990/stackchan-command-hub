import { createFileRoute } from "@tanstack/react-router";
import { Firmware } from "@/components/hub/Firmware";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/firmware")({
  head: () => hubHead("Uppdatera roboten", "Uppdatera StackChan via USB och se firmwarehistorik och återställningsalternativ."),
  component: Firmware,
});
