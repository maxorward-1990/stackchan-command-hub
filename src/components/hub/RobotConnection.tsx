import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bluetooth, Cable, Loader2, Network, Unplug, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serialSupported, useWebSerial } from "@/lib/web-serial";
import { useWebBluetooth } from "@/lib/web-bluetooth";
import { bridgeOnline, getProxy, setProxy, robot } from "@/lib/gemini-robot";
import { toast } from "sonner";

type Connection = { connected: boolean; requestConnection: (action?: () => void) => void };
const ConnectionContext = createContext<Connection>({ connected: false, requestConnection: () => {} });
export const useRobotConnection = () => useContext(ConnectionContext);

export function RobotConnection({ children }: { children: ReactNode }) {
  const usb = useWebSerial();
  const bt = useWebBluetooth();
  const [network, setNetwork] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const [proxy, setProxyInput] = useState("");
  const [networkError, setNetworkError] = useState("");
  const pending = useRef<(() => void) | undefined>(undefined);
  const connected = usb.connected || bt.connected || network;
  useEffect(() => { setSupported(serialSupported()); setProxyInput(getProxy()); }, []);
  useEffect(() => {
    if (usb.connected || bt.connected) { setNetwork(false); return; }
    let active = true;
    const check = () => void bridgeOnline().then((ok) => { if (active) setNetwork(ok); });
    check(); const timer = setInterval(check, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [usb.connected, bt.connected]);
  useEffect(() => {
    if (!connected || !pending.current) return;
    const action = pending.current; pending.current = undefined; setOpen(false); action();
  }, [connected]);
  const requestConnection = (action?: () => void) => {
    if (connected && action) { action(); return; }
    pending.current = action; setOpen(true);
  };
  const connectUsb = async () => { setBusy(true); try { await usb.connect(); } finally { setBusy(false); } };
  const testNetwork = async () => {
    setBusy(true); setNetworkError(""); setProxy(proxy);
    try { const ok = await bridgeOnline(); setNetwork(ok); if (!ok) setNetworkError("Bryggan svarar inte på den adressen."); }
    finally { setBusy(false); }
  };
  const mode = usb.connected ? "USB ansluten" : bt.connected ? `Bluetooth · ${bt.name}` : network ? "Nätverksbrygga ansluten" : "Ingen robot ansluten";
  return <ConnectionContext.Provider value={{ connected, requestConnection }}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 text-sm" role="status">
        {usb.connected ? <Usb className="size-4 shrink-0 text-primary" /> : bt.connected ? <Bluetooth className="size-4 shrink-0 text-primary" /> : <Cable className="size-4 shrink-0 text-muted-foreground" />}
        <span className="break-words">{mode}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {!connected && <Button size="sm" disabled={!supported || busy} onClick={() => void connectUsb()}>{busy ? <Loader2 className="animate-spin" /> : <Usb />}Anslut USB</Button>}
        <Button size="sm" variant="outline" onClick={() => requestConnection()}>{connected ? "Anslutning" : "Fler anslutningssätt"}</Button>
      </div>
    </div>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) pending.current = undefined; }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Anslut roboten</DialogTitle><DialogDescription>{mode}</DialogDescription></DialogHeader>
        <section className="space-y-3 border-b pb-4">
          <h3 className="flex items-center gap-2 font-semibold"><Usb className="size-4" />USB-kabel</h3>
          <Button disabled={busy || (!usb.connected && !supported)} variant={usb.connected ? "outline" : "default"} onClick={() => void (usb.connected ? usb.disconnect() : connectUsb())}>{usb.connected ? <Unplug /> : <Usb />}{usb.connected ? "Koppla från USB" : "Anslut USB"}</Button>
          {!supported && <p className="text-sm text-muted-foreground">USB kräver Chrome eller Edge på datorn.</p>}
          {usb.error && <p className="text-sm text-destructive" role="alert">{usb.error}</p>}
        </section>
        <section className="space-y-3 border-b pb-4">
          <h3 className="flex items-center gap-2 font-semibold"><Bluetooth className="size-4" />Bluetooth</h3>
          <p className="text-sm text-muted-foreground">Slå på Bluetooth i robotens meny. Ange PIN-koden som visas på roboten vid parkoppling.</p>
          <Button variant="outline" disabled={bt.busy || (!bt.connected && !bt.supported)} onClick={() => void (bt.connected ? bt.disconnect() : bt.connect())}><Bluetooth />{bt.connected ? "Koppla från Bluetooth" : bt.busy ? "Ansluter…" : "Anslut Bluetooth"}</Button>
          {bt.connected && <Button variant="ghost" size="sm" onClick={() => void robot.setBluetooth({ at_boot: true }).then(() => toast.success("Bluetooth startar vid uppstart")).catch((e: Error) => toast.error(e.message))}>Starta Bluetooth vid uppstart</Button>}
          {!bt.supported && <p className="text-sm text-muted-foreground">Bluetooth kräver Chrome på Android/dator eller Bluefy på iPhone.</p>}
          {bt.error && <p className="text-sm text-destructive" role="alert">{bt.error}</p>}
        </section>
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-semibold">Nätverksbrygga · avancerat</summary>
          <Label htmlFor="bridge-address">Bryggans adress</Label>
          <Input id="bridge-address" value={proxy} onChange={(e) => setProxyInput(e.target.value)} />
          <Button variant="outline" disabled={busy || usb.connected || bt.connected} onClick={() => void testNetwork()}><Network />Testa brygga</Button>
          <p className="break-words text-xs text-muted-foreground">Starta på datorn: <code>node tools/robot-proxy.mjs ROBOTENS-IP</code>. USB används först, därefter Bluetooth, sedan bryggan.</p>
          {networkError && <p className="text-sm text-destructive" role="alert">{networkError}</p>}
        </details>
      </DialogContent>
    </Dialog>
    {children}
  </ConnectionContext.Provider>;
}