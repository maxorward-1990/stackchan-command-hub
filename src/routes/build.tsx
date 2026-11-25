import { createFileRoute } from "@tanstack/react-router";
import { BuildGuide } from "@/components/hub/BuildGuide";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/build")({
  head: () => hubHead("LEGO-bygge", "Bygg en LEGO Technic-extension till din StackChan med stegvisa byggvyer."),
  component: BuildGuide,
});
