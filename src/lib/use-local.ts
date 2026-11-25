import { useEffect, useState } from "react";
import { readStored, writeStored } from "./app-storage";

export function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raw = readStored(key);
    if (raw !== null) try { setV(JSON.parse(raw)); } catch { /* ignore */ }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready) writeStored(key, JSON.stringify(v));
  }, [key, v, ready]);
  return [v, setV] as const;
}
