import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileDown, FileText, KeyRound, Languages } from 'lucide-react';
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

const LANGUAGES = [
  'Auto-detect',
  'English',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Arabic',
  'Bengali',
  'Chinese',
  'Japanese',
  'Korean',
  'Russian',
  'Tamil',
  'Telugu',
  'Marathi',
  'Gujarati',
];

function translationPrompt(text: string, source: string, target: string): string {
  const src = source === 'Auto-detect' ? 'the detected source language' : source;
  return `Translate this extracted PDF text from ${src} to ${target}. Preserve page labels, headings, bullet lists, numbers, table-like rows, names, and citations. Return only the translated text.\n\n${text.slice(0, 26000)}`;
}

export default function TranslatePdf() {
  const tool = findTool('translate-pdf')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [sourceLang, setSourceLang] = useState('Auto-detect');
  const [targetLang, setTargetLang] = useState('English');
  const [format, setFormat] = useState<TextExportFormat>('txt');
  const [extracted, setExtracted] = useState('');
  const [translated, setTranslated] = useState('');
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
    setTranslated('');
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
          setProgress(Math.min(55, Math.round(info.pct * 0.55)));
          setMessage(`Reading page ${info.current}/${info.total}`);
        },
        abortRef.current.signal,
      );
      const text = joinExtractedAsText(pages);
      setExtracted(text);
      if (!text.trim()) throw new Error('No extractable text was found in this PDF.');
      if (!hasProvider) {
        throw new Error('Translation requires an optional provider key in Settings or OPENAI_API_KEY in .env.');
      }

      setProgress(65);
      setMessage('Translating with provider...');
      const nextTranslated = await generateWithProvider({
        task: 'translate',
        prompt: translationPrompt(text, sourceLang, targetLang),
        endpoint: settings.aiEndpoint,
        apiKey: settings.aiApiKey,
        model: settings.aiModel,
        signal: abortRef.current.signal,
      });
      setTranslated(nextTranslated);
      setProgress(85);
      const blob = await exportText(`Translated PDF text (${targetLang})`, nextTranslated, format);
      const ext = format === 'docx' ? '.docx' : format === 'pdf' ? '.pdf' : '.txt';
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: `translated-${targetLang.toLowerCase().replace(/\s+/g, '-')}`,
          ext,
        }),
      });
      setProgress(100);
      setMessage('Translated text ready.');
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

  const providerLabel = useMemo(() => {
    if (hasProvider) return 'Provider configured';
    return 'Provider required for translation';
  }, [hasProvider]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={Languages}
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
          label="Drop a PDF to translate"
          helperText="The original PDF is never modified; translated text is exported separately."
        />
      }
      preview={
        <div className="space-y-4">
          <section className="card border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10 text-sm">
            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>
                High-quality translation requires an optional AI/translation backend or a user-provided OpenAI-compatible API key. This tool extracts text first and keeps the original PDF safe.
              </p>
            </div>
          </section>

          {extracted && (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">Extracted text</h3>
              <textarea className="input w-full min-h-[220px] font-mono text-xs" value={extracted} onChange={(e) => setExtracted(e.target.value)} />
            </section>
          )}

          {translated && (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">Translated text</h3>
              <textarea className="input w-full min-h-[280px] text-sm" value={translated} onChange={(e) => setTranslated(e.target.value)} />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 text-xs flex items-start gap-2">
            <KeyRound size={14} className={cn('mt-0.5 shrink-0', hasProvider ? 'text-emerald-600' : 'text-amber-600')} />
            <div>
              <div className="font-semibold">{providerLabel}</div>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                Configure Settings or set OPENAI_API_KEY in the server .env. No keys are hardcoded in the app.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">Source</span>
              <select className="input w-full" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Target</span>
              <select className="input w-full" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                {LANGUAGES.filter((l) => l !== 'Auto-detect').map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Export translated text</h3>
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
                  <FileDown size={12} className="inline mr-1" />
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <FileText size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>Scanned PDFs need OCR before translation. This first version translates extracted text and exports the translated document separately.</p>
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
          actionLabel="Translate PDF text"
          actionDisabled={!file || !hasProvider}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
