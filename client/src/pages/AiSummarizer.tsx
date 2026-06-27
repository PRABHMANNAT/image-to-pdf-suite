import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Brain, FileDown, FileText, KeyRound, Sparkles } from 'lucide-react';
import {
  ToolLayout,
  FileDropzone,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { extractPdfText, joinExtractedAsText } from '../lib/pdfText';
import { applyNamePattern } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';
import {
  generateWithProvider,
  getAiStatus,
  providerConfigured,
  type AiStatus,
} from '../lib/intelligence';
import { exportText, type TextExportFormat } from '../lib/textExport';

type SummaryStyle =
  | 'short'
  | 'detailed'
  | 'bullets'
  | 'exam'
  | 'questions'
  | 'definitions';
type SummaryMode = 'local' | 'provider';

const STYLE_OPTIONS: { id: SummaryStyle; label: string }[] = [
  { id: 'short', label: 'Short summary' },
  { id: 'detailed', label: 'Detailed notes' },
  { id: 'bullets', label: 'Bullet points' },
  { id: 'exam', label: 'Exam notes' },
  { id: 'questions', label: 'Key questions' },
  { id: 'definitions', label: 'Important definitions' },
];

const STOPWORDS = new Set(
  'the a an and or but if then is are was were be been being of to in for on with as by from this that these those it its into about between through over under than such may can will would should could not no their them they you your we our he she his her has have had'.split(
    ' ',
  ),
);

function sentencesFrom(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 35 && s.length < 500);
}

function keywords(text: string, limit = 14): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function topSentences(text: string, count: number): string[] {
  const sents = sentencesFrom(text);
  const key = keywords(text, 24);
  const scored = sents.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const keywordScore = key.reduce((n, word) => n + (lower.includes(word) ? 1 : 0), 0);
    const earlyBoost = index < 8 ? 2 : index < 20 ? 1 : 0;
    return { sentence, index, score: keywordScore + earlyBoost };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.sentence);
}

function localSummary(text: string, style: SummaryStyle): string {
  const key = keywords(text, 10);
  const main = topSentences(text, style === 'short' ? 3 : 8);
  if (!text.trim()) return 'No extractable text was found in this PDF.';

  if (style === 'short') return main.join(' ');
  if (style === 'bullets') return main.map((s) => `- ${s}`).join('\n');
  if (style === 'detailed') {
    return [
      'Overview',
      main.slice(0, 3).join(' '),
      '',
      'Main points',
      ...main.slice(3).map((s) => `- ${s}`),
      '',
      `Keywords: ${key.join(', ')}`,
    ].join('\n');
  }
  if (style === 'exam') {
    return [
      'Exam notes',
      ...main.map((s, i) => `${i + 1}. ${s}`),
      '',
      'Terms to review',
      ...key.slice(0, 8).map((k) => `- ${k}`),
    ].join('\n');
  }
  if (style === 'questions') {
    return main
      .slice(0, 8)
      .map((s, i) => `${i + 1}. What is the significance of: ${s.replace(/[.?!]$/, '')}?`)
      .join('\n');
  }
  const definitions = sentencesFrom(text).filter((s) =>
    /\b(is|are|means|refers to|defined as|known as)\b/i.test(s),
  );
  return (definitions.length ? definitions : main)
    .slice(0, 10)
    .map((s) => `- ${s}`)
    .join('\n');
}

function providerPrompt(text: string, style: SummaryStyle): string {
  const styleLabel = STYLE_OPTIONS.find((s) => s.id === style)?.label || style;
  return `Summarize the extracted PDF text as "${styleLabel}". Use only the text below. If information is missing, say so briefly.\n\n${text.slice(0, 24000)}`;
}

export default function AiSummarizer() {
  const tool = findTool('ai-summarize')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [style, setStyle] = useState<SummaryStyle>('short');
  const [mode, setMode] = useState<SummaryMode>('local');
  const [format, setFormat] = useState<TextExportFormat>('txt');
  const [extracted, setExtracted] = useState('');
  const [summary, setSummary] = useState('');
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void getAiStatus().then(setAiStatus);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    setExtracted('');
    setSummary('');
    setResult(null);
    setState('idle');
    setError(undefined);
  }, [file?.id]);

  const hasProvider = providerConfigured(
    { apiKey: settings.aiApiKey, endpoint: settings.aiEndpoint, model: settings.aiModel },
    aiStatus,
  );

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(0);
    setMessage('Extracting text...');
    setError(undefined);
    setResult(null);
    try {
      const pages = await extractPdfText(
        file.file,
        (info) => {
          setProgress(Math.min(65, Math.round(info.pct * 0.65)));
          setMessage(`Reading page ${info.current}/${info.total}`);
        },
        abortRef.current.signal,
      );
      const text = joinExtractedAsText(pages);
      setExtracted(text);

      setMessage(mode === 'provider' ? 'Calling provider...' : 'Building local summary...');
      const nextSummary =
        mode === 'provider'
          ? await generateWithProvider({
              task: 'summarize',
              prompt: providerPrompt(text, style),
              endpoint: settings.aiEndpoint,
              apiKey: settings.aiApiKey,
              model: settings.aiModel,
              signal: abortRef.current.signal,
            })
          : localSummary(text, style);

      setSummary(nextSummary);
      setProgress(85);
      const blob = await exportText('PDF summary', nextSummary, format);
      const ext = format === 'docx' ? '.docx' : format === 'pdf' ? '.pdf' : '.txt';
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: 'summary',
          ext,
        }),
      });
      setProgress(100);
      setMessage(mode === 'provider' ? 'Provider summary ready.' : 'Local summary ready.');
      setState('success');
    } catch (e) {
      if (abortRef.current?.signal.aborted) {
        setState('idle');
        return;
      }
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function reset(): void {
    abortRef.current?.abort();
    setState('idle');
    setResult(null);
    setProgress(0);
    setMessage(undefined);
    setError(undefined);
  }

  const providerNote = useMemo(() => {
    if (hasProvider) return 'Provider mode is available.';
    return 'No provider key is configured. Local summary works without paid API access.';
  }, [hasProvider]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Sparkles}
      runtime={tool.runtime}
      status="beta"
      layout="split"
      upload={
        <FileDropzone
          files={files}
          onChange={setFiles}
          accept="pdf"
          multiple={false}
          hideZoneWhenFilled={files.length > 0}
          label="Drop a PDF to summarize"
          helperText="Local summary is the default and does not require an API key."
        />
      }
      preview={
        <div className="space-y-4">
          <section className="card border border-cyan-300/60 bg-cyan-50/60 dark:border-cyan-500/30 dark:bg-cyan-500/10 text-sm">
            <div className="flex items-start gap-2 text-cyan-800 dark:text-cyan-200">
              <Brain size={16} className="mt-0.5 shrink-0" />
              <p>
                Local mode extracts text and summarizes it with a deterministic algorithm. Provider mode can improve quality if you configure an OpenAI-compatible endpoint and key.
              </p>
            </div>
          </section>

          {extracted && (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">Extracted text</h3>
              <textarea className="input w-full min-h-[220px] font-mono text-xs" value={extracted} onChange={(e) => setExtracted(e.target.value)} />
            </section>
          )}

          {summary && (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">Summary</h3>
              <textarea className="input w-full min-h-[260px] text-sm" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Mode</h3>
            <div className="mt-2 grid gap-1.5">
              {([
                { id: 'local' as SummaryMode, label: 'Local summary', note: 'Free, fast, no API key.' },
                { id: 'provider' as SummaryMode, label: 'AI provider', note: providerNote },
              ]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  disabled={m.id === 'provider' && !hasProvider}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-left text-xs font-semibold transition',
                    mode === m.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-glow'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                    m.id === 'provider' && !hasProvider && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {m.id === 'provider' ? <KeyRound size={13} /> : <FileText size={13} />}
                    {m.label}
                  </span>
                  <span className="block text-[10px] font-normal text-slate-500 mt-0.5">{m.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Summary style</h3>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStyle(opt.id)}
                  className={cn(
                    'px-2 py-2 rounded-lg border text-xs font-medium transition',
                    style === opt.id
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Export</h3>
            <div className="mt-2 flex gap-1.5">
              {(['txt', 'docx', 'pdf'] as TextExportFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-md border text-xs font-semibold uppercase',
                    format === f
                      ? 'bg-brand-50 dark:bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand-500/40',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-[11px] text-amber-700 dark:text-amber-300 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>Provider summaries send extracted text to the configured endpoint. Local summaries never leave the browser.</p>
          </div>
        </section>
      }
      action={
        <ProcessingPanel
          files={files}
          state={state}
          progress={progress}
          message={message}
          error={error}
          onAction={run}
          actionLabel={mode === 'provider' ? 'Summarize with provider' : 'Summarize locally'}
          actionDisabled={!file || (mode === 'provider' && !hasProvider)}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
