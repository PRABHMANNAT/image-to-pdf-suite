import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './lib/theme';
import { SettingsProvider } from './lib/settings';

import Dashboard from './pages/Dashboard';
import CategoryView from './pages/CategoryView';
import PlaceholderPage from './pages/PlaceholderPage';
import Settings from './pages/Settings';

// Existing tool pages — kept fully working under their new routes.
import ImageToPdf from './pages/ImageToPdf';
import CropImage from './pages/CropImage';
import MergePdf from './pages/MergePdf';
import SplitPdf from './pages/SplitPdf';
import PdfPageEditor from './pages/PdfPageEditor';

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <ToastProvider>
          <Shell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/category/:id" element={<CategoryView />} />
            <Route path="/settings" element={<Settings />} />

            {/* Working tools — wired to their existing implementations. */}
            <Route path="/tools/image-to-pdf" element={<ImageToPdf />} />
            <Route path="/tools/jpg-to-pdf" element={<ImageToPdf />} />
            <Route path="/tools/crop-image" element={<CropImage />} />
            <Route path="/tools/merge-pdf" element={<MergePdf />} />
            <Route path="/tools/split-pdf" element={<SplitPdf />} />
            <Route path="/tools/remove-pages" element={<PdfPageEditor />} />
            <Route path="/tools/extract-pages" element={<PdfPageEditor />} />
            <Route path="/tools/organize-pdf" element={<PdfPageEditor />} />
            <Route path="/tools/rotate-pdf" element={<PdfPageEditor />} />

            {/* Catch-all tool route — renders the placeholder for any coming-soon tool. */}
            <Route path="/tools/:toolId" element={<PlaceholderPage />} />

            {/* Legacy paths kept working with redirects. */}
            <Route path="/crop" element={<Navigate to="/tools/crop-image" replace />} />
            <Route path="/merge" element={<Navigate to="/tools/merge-pdf" replace />} />
            <Route path="/split" element={<Navigate to="/tools/split-pdf" replace />} />
            <Route path="/edit" element={<Navigate to="/tools/organize-pdf" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
