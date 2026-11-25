import { createFileRoute } from "@tanstack/react-router";
import { RobotControl } from "@/components/hub/RobotControl";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/")({
  head: () => hubHead("Styr roboten", "Styr StackChans samtal, huvud, ansikte och LED-lampor via USB, Bluetooth eller nätverksbrygga."),
  component: RobotControl,
});
