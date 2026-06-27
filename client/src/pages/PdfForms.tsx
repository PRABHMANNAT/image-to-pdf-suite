import { useEffect, useMemo, useRef, useState } from 'react';
import { FormInput, Info } from 'lucide-react';
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';
import {
  ToolLayout,
  FileDropzone,
  PreviewViewer,
  ProcessingPanel,
  DownloadResult,
} from '../components/shared';
import type { AcceptedFile, ProcessingState, ToolResult } from '../components/shared';
import { applyNamePattern, readAsArrayBuffer } from '../lib/fileUtils';
import { useSettings } from '../lib/settings';
import { findTool } from '../lib/tools';
import { cn } from '../lib/cn';

type FieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'optionlist' | 'unknown';

interface FieldInfo {
  name: string;
  kind: FieldKind;
  value?: string;
  options?: string[];
  selectedOptions?: string[];
  readOnly: boolean;
}

function describeField(field: PDFField): FieldInfo {
  const name = field.getName();
  const readOnly = field.isReadOnly();
  if (field instanceof PDFTextField) {
    return { name, kind: 'text', value: field.getText() ?? '', readOnly };
  }
  if (field instanceof PDFCheckBox) {
    return { name, kind: 'checkbox', value: field.isChecked() ? '1' : '', readOnly };
  }
  if (field instanceof PDFDropdown) {
    return {
      name,
      kind: 'dropdown',
      options: field.getOptions(),
      selectedOptions: field.getSelected(),
      readOnly,
    };
  }
  if (field instanceof PDFRadioGroup) {
    return {
      name,
      kind: 'radio',
      options: field.getOptions(),
      value: field.getSelected() ?? '',
      readOnly,
    };
  }
  if (field instanceof PDFOptionList) {
    return {
      name,
      kind: 'optionlist',
      options: field.getOptions(),
      selectedOptions: field.getSelected(),
      readOnly,
    };
  }
  return { name, kind: 'unknown', readOnly };
}

export default function PdfForms() {
  const tool = findTool('pdf-forms')!;
  const { settings } = useSettings();
  const [files, setFiles] = useState<AcceptedFile[]>([]);
  const file = files[0] ?? null;
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>({});
  const [flatten, setFlatten] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ToolResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) {
      setFields([]);
      setValues({});
      setScanError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const buf = await readAsArrayBuffer(file.file);
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const form = src.getForm();
        const detected = form.getFields().map(describeField);
        if (cancelled) return;
        setFields(detected);
        const initial: Record<string, string | boolean | string[]> = {};
        for (const f of detected) {
          if (f.kind === 'checkbox') initial[f.name] = f.value === '1';
          else if (f.kind === 'optionlist') initial[f.name] = f.selectedOptions ?? [];
          else if (f.kind === 'dropdown') initial[f.name] = f.selectedOptions?.[0] ?? '';
          else initial[f.name] = f.value ?? '';
        }
        setValues(initial);
        setScanError(null);
      } catch (e) {
        if (!cancelled) setScanError(e instanceof Error ? e.message : 'Failed to read form');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function setValue(name: string, v: string | boolean | string[]) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function run(): Promise<void> {
    if (!file) return;
    abortRef.current = new AbortController();
    setState('processing');
    setProgress(20);
    setMessage('Filling fields…');
    setError(undefined);
    setResult(null);

    try {
      const buf = await readAsArrayBuffer(file.file);
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const form = src.getForm();
      for (const info of fields) {
        if (info.readOnly) continue;
        const value = values[info.name];
        const field = form.getField(info.name);
        if (info.kind === 'text' && field instanceof PDFTextField) {
          field.setText(typeof value === 'string' ? value : '');
        } else if (info.kind === 'checkbox' && field instanceof PDFCheckBox) {
          if (value) field.check();
          else field.uncheck();
        } else if (info.kind === 'dropdown' && field instanceof PDFDropdown) {
          if (typeof value === 'string' && value) field.select(value);
        } else if (info.kind === 'radio' && field instanceof PDFRadioGroup) {
          if (typeof value === 'string' && value) field.select(value);
        } else if (info.kind === 'optionlist' && field instanceof PDFOptionList) {
          if (Array.isArray(value) && value.length) field.select(value);
        }
      }
      setProgress(70);
      if (flatten) {
        form.flatten();
        setMessage('Flattening fields…');
      }
      const bytes = await src.save({ useObjectStreams: true });
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: 'application/pdf' });
      setResult({
        kind: 'single',
        blob,
        suggestedName: applyNamePattern(settings.outputNamePattern, {
          name: file.file.name.replace(/\.pdf$/i, ''),
          tool: flatten ? 'filled-flat' : 'filled',
          ext: '.pdf',
        }),
      });
      setProgress(100);
      setMessage(`Saved with ${fields.filter((f) => !f.readOnly).length} fillable field(s).`);
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

  const previewBlob = result?.kind === 'single' ? result.blob : null;
  const fillable = useMemo(() => fields.filter((f) => !f.readOnly), [fields]);

  return (
    <ToolLayout
      title={tool.name}
      description={tool.description}
      icon={FormInput}
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
          label="Drop a PDF with form fields"
          helperText="Existing AcroForm fields are detected automatically — text inputs, checkboxes, dropdowns, radio groups."
        />
      }
      preview={
        <div className="space-y-4">
          {scanError && (
            <div className="card border border-red-300/60 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-300">
              <div className="font-semibold">Couldn't read form</div>
              <div className="text-xs">{scanError}</div>
            </div>
          )}
          {file && fields.length === 0 && !scanError && (
            <div className="card text-sm text-slate-500 dark:text-slate-400">
              No interactive form fields found in this PDF. (First-version of this tool only fills existing AcroForm fields. Creating new fields is a future phase.)
            </div>
          )}
          {fields.length > 0 && (
            <section className="card">
              <h3 className="text-sm font-semibold mb-2">
                {fields.length} field{fields.length === 1 ? '' : 's'} ({fillable.length} fillable)
              </h3>
              <div className="space-y-3 max-h-[60vh] overflow-auto thin-scroll pr-1">
                {fields.map((f) => {
                  const v = values[f.name];
                  const labelExtra = f.readOnly ? <span className="text-[10px] uppercase ml-2 text-amber-600 dark:text-amber-300">read only</span> : null;
                  if (f.kind === 'text') {
                    return (
                      <label key={f.name} className="block">
                        <span className="label flex items-center">{f.name}{labelExtra}</span>
                        <input className="input w-full" disabled={f.readOnly} value={typeof v === 'string' ? v : ''} onChange={(e) => setValue(f.name, e.target.value)} />
                      </label>
                    );
                  }
                  if (f.kind === 'checkbox') {
                    return (
                      <label key={f.name} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" disabled={f.readOnly} checked={!!v} onChange={(e) => setValue(f.name, e.target.checked)} className="accent-brand-600" />
                        <span>{f.name}{labelExtra}</span>
                      </label>
                    );
                  }
                  if (f.kind === 'dropdown') {
                    return (
                      <label key={f.name} className="block">
                        <span className="label flex items-center">{f.name}{labelExtra}</span>
                        <select className="input w-full" disabled={f.readOnly} value={typeof v === 'string' ? v : ''} onChange={(e) => setValue(f.name, e.target.value)}>
                          <option value="">— choose —</option>
                          {f.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  if (f.kind === 'radio') {
                    return (
                      <fieldset key={f.name} className="block">
                        <legend className="label flex items-center">{f.name}{labelExtra}</legend>
                        <div className="flex flex-wrap gap-3 text-sm">
                          {f.options?.map((opt) => (
                            <label key={opt} className="inline-flex items-center gap-1.5">
                              <input
                                type="radio"
                                name={f.name}
                                value={opt}
                                disabled={f.readOnly}
                                checked={v === opt}
                                onChange={(e) => setValue(f.name, e.target.value)}
                                className="accent-brand-600"
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  }
                  if (f.kind === 'optionlist') {
                    const cur = Array.isArray(v) ? v : [];
                    return (
                      <label key={f.name} className="block">
                        <span className="label flex items-center">{f.name}{labelExtra}</span>
                        <select
                          multiple
                          className="input w-full h-32"
                          disabled={f.readOnly}
                          value={cur}
                          onChange={(e) => {
                            const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
                            setValue(f.name, sel);
                          }}
                        >
                          {f.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  return (
                    <div key={f.name} className="text-xs text-slate-500 dark:text-slate-400">
                      {f.name} <span className="italic">(unsupported field kind)</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {previewBlob && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Filled PDF preview</h3>
              <PreviewViewer source={previewBlob} type="pdf" />
            </section>
          )}
        </div>
      }
      options={
        <section className="card space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} className="accent-brand-600 mt-0.5" />
            <span>
              <span className="font-medium">Flatten on save</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                Bakes the values into the page contents so the PDF no longer has editable fields. Use for "final" copies.
              </span>
            </span>
          </label>
          <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5 text-brand-500" />
            <p>
              This first version detects and fills existing AcroForm fields.
              Adding new fields (text, checkbox, signature) to PDFs without
              forms is on the roadmap.
            </p>
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
          actionLabel={flatten ? 'Save flattened PDF' : 'Save filled PDF'}
          actionDisabled={!file || fields.length === 0}
          onCancel={() => abortRef.current?.abort()}
          onReset={reset}
        />
      }
      result={<DownloadResult result={result} onReset={reset} />}
    />
  );
}
