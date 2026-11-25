import { useEffect, useMemo, useState } from 'react';
import { Download, Flag, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { onSerialCommand, onSerialLine, serialConnected, useWebSerial } from '@/lib/web-serial';
import { onRobotCommand, robot } from '@/lib/gemini-robot';
import { TestRecording, type TestReport } from '@/lib/test-recording';

function download(report: TestReport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `stackchan-test-${report.startedAt.replaceAll(':', '_')}.json`; a.click(); URL.revokeObjectURL(url);
}
export function TestRecorder() {
  const { connected } = useWebSerial();
  const recorder = useMemo(() => new TestRecording({ connected: serialConnected, subscribe: onSerialLine, commands: fn => { const a = onRobotCommand(fn); const b = onSerialCommand(fn); return () => { a(); b(); }; }, performance: robot.performance, status: robot.status, runtime: robot.runtime, now: Date.now }), []);
  const [, refresh] = useState(0);
  const [consent, setConsent] = useState(false); const [note, setNote] = useState(''); const [error, setError] = useState('');
  useEffect(() => { const t = setInterval(() => refresh(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const start = async () => { setError(''); refresh(n => n + 1); try { await recorder.start(); } catch (e) { setError((e as Error).message); } finally { refresh(n => n + 1); } };
  const stop = async () => { setError(''); try { const pending = recorder.stop(); refresh(n => n + 1); download(await pending); } catch (e) { setError((e as Error).message); } finally { refresh(n => n + 1); } };
  return <section className="mb-6 space-y-3 border-b pb-5" aria-label="Samlat robot-test">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">Samlat robot-test</h3>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!connected || !consent || recorder.active || recorder.busy} onClick={() => void start()}><Play />{recorder.busy && !recorder.report && !recorder.events.length ? 'Startar…' : 'Starta test'}</Button>
        <Button variant="outline" disabled={!recorder.active || recorder.busy} onClick={() => void stop()}><Square />Stoppa och spara</Button>
        {recorder.report && <Button variant="outline" onClick={() => { if (recorder.report) download(recorder.report); }}><Download />Spara testpaket</Button>}
      </div>
    </div>
    <label className="flex items-start gap-2 text-sm text-muted-foreground"><Checkbox checked={consent} disabled={recorder.active || recorder.busy} onCheckedChange={value => setConsent(value === true)} aria-label="Tillåt lokal insamling av samtalstext" />Samtalstext och tekniska loggar får samlas lokalt på datorn. Inget ljud spelas in eller laddas upp.</label>
    <p className="text-sm text-muted-foreground" role="status">{recorder.busy ? 'Samlar status och bekräftar prestandamätning…' : recorder.active ? `Test pågår · ${recorder.events.length} händelser · ${recorder.events.filter(e => e.text.startsWith('[PERF]')).length} prestandaprov${!connected ? ' · USB frånkopplad' : ''}` : recorder.report ? `Test klart · ${recorder.report.events.length} händelser · ${recorder.report.performance.length} prestandaprov` : connected ? 'USB ansluten · redo' : 'Anslut USB för fullständig testinsamling.'}</p>
    {recorder.active && <div className="flex gap-2"><Input aria-label="Testanteckning" placeholder="Vad märkte du just nu?" value={note} onChange={e => setNote(e.target.value)} maxLength={500} /><Button variant="outline" disabled={!note.trim() || recorder.busy} onClick={() => { recorder.marker(note.trim()); setNote(''); refresh(n => n + 1); }}><Flag />Markera</Button></div>}
    {recorder.dropped > 0 && <p className="text-sm text-destructive">{recorder.dropped} händelser utelämnade vid storleksgränsen.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {recorder.report && <p className="text-xs text-muted-foreground">Granska samtalstexten innan du delar filen. Släppta eller saknade mätningar framgår i paketet.</p>}
  </section>;
}
