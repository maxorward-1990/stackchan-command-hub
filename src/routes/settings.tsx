import { createFileRoute } from "@tanstack/react-router";
import { RobotSettings } from "@/components/hub/RobotControl";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/settings")({
  head: () => hubHead("Inställningar", "Konfigurera StackChans Wi-Fi, ljud, språk, förmågor och instruktioner."),
  component: RobotSettings,
});
