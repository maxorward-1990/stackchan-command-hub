import { createFileRoute } from "@tanstack/react-router";
import { CameraView } from "@/components/hub/CameraView";
import { PhotosPanel } from "@/components/hub/PhotosPanel";
import { hubHead } from "@/lib/hub-head";

export const Route = createFileRoute("/camera")({
  head: () => hubHead("Kamera", "Se StackChans kamera, styr huvudets riktning och se foton som apparna tagit."),
  component: () => <><CameraView /><PhotosPanel /></>,
});
