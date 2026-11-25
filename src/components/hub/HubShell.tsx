import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Activity, Blocks, Bot, Camera, CheckSquare, ChevronRight, Cpu, Lightbulb, ListTodo, Menu, Moon, Settings, Smile, Sun, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RobotConnection } from "./RobotConnection";
import { Diagnostics } from "./Diagnostics";
import { setGeminiRobotLogger } from "@/lib/gemini-robot";

type HubPath = "/" | "/personality" | "/camera" | "/lights" | "/tasks" | "/activities" | "/apps" | "/settings" | "/diagnostics" | "/firmware" | "/build";
const groups: { label: string; items: { to: HubPath; label: string; icon: LucideIcon }[] }[] = [
  { label: "Robot", items: [{ to: "/", label: "Styr roboten", icon: Bot }, { to: "/personality", label: "Personlighet", icon: Smile }, { to: "/camera", label: "Kamera", icon: Camera }] },
  { label: "Vardag", items: [{ to: "/apps", label: "Appar", icon: Blocks }, { to: "/lights", label: "Lampor & scener", icon: Lightbulb }, { to: "/tasks", label: "Att-göra", icon: ListTodo }, { to: "/activities", label: "Aktiviteter", icon: CheckSquare }] },
  { label: "System", items: [{ to: "/settings", label: "Inställningar", icon: Settings }, { to: "/diagnostics", label: "Felsökning", icon: Activity }, { to: "/firmware", label: "Uppdatera roboten", icon: Cpu }, { to: "/build", label: "LEGO-bygge", icon: Blocks }] },
];

export function HubShell({ children }: { children: ReactNode }) {
  const path = useLocation({ select: (location) => location.pathname });
  const active = groups.flatMap((group) => group.items).find((item) => item.to === path);
  const [dark, setDark] = useState(true);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => { setDark(localStorage.getItem("sc.theme") !== "light"); setThemeLoaded(true); }, []);
  useEffect(() => { if (!themeLoaded) return; document.documentElement.classList.toggle("dark", dark); localStorage.setItem("sc.theme", dark ? "dark" : "light"); }, [dark, themeLoaded]);
  useEffect(() => {
    setGeminiRobotLogger((message) => setLog((lines) => [`${new Date().toLocaleTimeString("sv-SE")} ${message}`, ...lines].slice(0, 40)));
    return () => { setGeminiRobotLogger(() => {}); };
  }, []);
  useEffect(() => { setMenu(false); }, [path]);
  return <div className="min-h-screen bg-background">
    <header className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Bot className="size-7 shrink-0 text-primary" />
        <div className="min-w-0"><h1 className="text-base font-bold sm:text-lg">StackChan Command Hub</h1><p className="text-xs text-muted-foreground">CoreS3</p></div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" aria-label="Byt tema" title="Byt tema" onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</Button>
        <Button size="icon" variant="ghost" className="md:hidden" aria-label={menu ? "Stäng navigation" : "Öppna navigation"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</Button>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1440px] md:grid-cols-[210px_minmax(0,1fr)]">
      <aside className={`${menu ? "block" : "hidden"} border-b bg-background md:block md:min-h-[calc(100dvh-77px)] md:border-r md:border-b-0`}>
        <nav aria-label="Huvudnavigation" className="space-y-6 px-3 py-6 md:sticky md:top-0">
          {groups.map((group) => <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
            <div className="space-y-1">{group.items.map(({ to, label, icon: Icon }) => <Button key={to} asChild variant={path === to ? "secondary" : "ghost"} className={`h-10 w-full justify-start gap-3 px-3 ${path === to ? "text-foreground" : "text-muted-foreground"}`}>
              <Link to={to} aria-current={path === to ? "page" : undefined}><Icon className="size-4 shrink-0" /><span>{label}</span>{path === to && <ChevronRight className="ml-auto size-3.5" />}</Link>
            </Button>)}</div>
          </div>)}
        </nav>
      </aside>
      <div className="min-w-0">
        <RobotConnection>
          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center gap-3">{active && <active.icon className="size-5 text-primary" />}<h2 className="text-2xl font-semibold">{active?.label ?? "StackChan"}</h2></div>
            {children}
            <div hidden={path !== "/diagnostics"}>
              <Diagnostics />
              <details className="mt-6 border-t pt-4 text-xs"><summary className="cursor-pointer font-semibold">Skickade robotkommandon ({log.length})</summary><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-muted-foreground">{log.join("\n") || "Inget skickat än."}</pre></details>
            </div>
          </main>
        </RobotConnection>
      </div>
    </div>
  </div>;
}
