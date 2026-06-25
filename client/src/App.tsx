import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import ImageToPdf from './pages/ImageToPdf';
import CropImage from './pages/CropImage';
import MergePdf from './pages/MergePdf';
import SplitPdf from './pages/SplitPdf';
import PdfPageEditor from './pages/PdfPageEditor';
import Settings from './pages/Settings';
import { ToastProvider } from './hooks/useToast';

export default function App() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen text-slate-900 dark:text-slate-100">
        <Sidebar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<ImageToPdf />} />
            <Route path="/crop" element={<CropImage />} />
            <Route path="/merge" element={<MergePdf />} />
            <Route path="/split" element={<SplitPdf />} />
            <Route path="/edit" element={<PdfPageEditor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
