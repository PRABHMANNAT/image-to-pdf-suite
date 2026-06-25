import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';

interface Props {
  onFiles: (files: File[]) => void;
  accept?: Record<string, string[]>;
  multiple?: boolean;
  label?: string;
}

export function FileDropzone({ onFiles, accept, multiple = true, label }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple,
    onDrop: (acc) => onFiles(acc),
  });
  return (
    <div
      {...getRootProps()}
      className={
        'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ' +
        (isDragActive
          ? 'border-brand-600 bg-brand-50 dark:bg-slate-800'
          : 'border-slate-300 dark:border-slate-600 hover:border-brand-500')
      }
    >
      <input {...getInputProps()} />
      <UploadCloud className="mx-auto mb-3 text-slate-400" size={42} />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label || 'Drop files here or click to select'}
      </p>
      <p className="text-xs text-slate-500 mt-1">Processed locally - nothing is uploaded to the cloud.</p>
    </div>
  );
}
