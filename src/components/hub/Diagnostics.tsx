import { TestRecorder } from "./TestRecorder";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsbConsole } from "./UsbConsole";
import { SpeechTest } from "./SpeechTest";
import { PerformancePanel } from "./PerformancePanel";
import { AudioTest } from "./AudioTest";
import { StereoTest } from "./StereoTest";
import { DialogueLog } from "./DialogueLog";

export function Diagnostics() {
  const [view, setView] = useState("console");
  return <><TestRecorder /><Tabs value={view} onValueChange={setView}>
    <TabsList className="mb-5 flex h-auto w-fit max-w-full flex-wrap justify-start">
      <TabsTrigger value="console">USB-logg</TabsTrigger>
      <TabsTrigger value="speech">Svarstider</TabsTrigger>
      <TabsTrigger value="audio">Mikrofoner</TabsTrigger>
      <TabsTrigger value="performance">Prestanda</TabsTrigger>
      <TabsTrigger value="dialogue">Samtalslogg</TabsTrigger>
    </TabsList>
    <TabsContent value="console" forceMount className="data-[state=inactive]:hidden"><UsbConsole /></TabsContent>
    <TabsContent value="speech" forceMount className="data-[state=inactive]:hidden"><SpeechTest /></TabsContent>
    <TabsContent value="audio" forceMount className="data-[state=inactive]:hidden"><div className="grid gap-4 xl:grid-cols-2"><AudioTest /><StereoTest /></div></TabsContent>
    <TabsContent value="performance" forceMount className="data-[state=inactive]:hidden"><PerformancePanel /></TabsContent>
    <TabsContent value="dialogue" forceMount className="data-[state=inactive]:hidden"><DialogueLog /></TabsContent>
  </Tabs></>;
}
