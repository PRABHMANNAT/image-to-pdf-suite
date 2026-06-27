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
import ScanToPdf from './pages/ScanToPdf';
import RemovePages from './pages/RemovePages';
import ExtractPages from './pages/ExtractPages';
import OrganizePdf from './pages/OrganizePdf';
import CompressPdf from './pages/CompressPdf';
import RepairPdf from './pages/RepairPdf';
import OcrPdf from './pages/OcrPdf';
import OfficeToPdf from './pages/OfficeToPdf';
import HtmlToPdf from './pages/HtmlToPdf';
import PdfToJpg from './pages/PdfToJpg';
import PdfToWord from './pages/PdfToWord';
import PdfToPpt from './pages/PdfToPpt';
import PdfToExcel from './pages/PdfToExcel';
import PdfToPdfA from './pages/PdfToPdfA';
import RotatePdf from './pages/RotatePdf';
import AddPageNumbers from './pages/AddPageNumbers';
import AddWatermark from './pages/AddWatermark';
import CropPdf from './pages/CropPdf';
import EditPdf from './pages/EditPdf';
import PdfForms from './pages/PdfForms';
import ProtectPdf from './pages/ProtectPdf';
import UnlockPdf from './pages/UnlockPdf';
import SignPdf from './pages/SignPdf';

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
            <Route path="/tools/image-to-pdf" element={<ImageToPdf toolId="image-to-pdf" />} />
            <Route path="/tools/jpg-to-pdf" element={<ImageToPdf toolId="jpg-to-pdf" />} />
            <Route path="/tools/crop-image" element={<CropImage />} />
            <Route path="/tools/merge-pdf" element={<MergePdf />} />
            <Route path="/tools/split-pdf" element={<SplitPdf />} />
            <Route path="/tools/remove-pages" element={<RemovePages />} />
            <Route path="/tools/extract-pages" element={<ExtractPages />} />
            <Route path="/tools/organize-pdf" element={<OrganizePdf />} />
            <Route path="/tools/compress-pdf" element={<CompressPdf />} />
            <Route path="/tools/repair-pdf" element={<RepairPdf />} />
            <Route path="/tools/ocr-pdf" element={<OcrPdf />} />
            <Route path="/tools/word-to-pdf" element={<OfficeToPdf toolId="word-to-pdf" />} />
            <Route path="/tools/ppt-to-pdf" element={<OfficeToPdf toolId="ppt-to-pdf" />} />
            <Route path="/tools/excel-to-pdf" element={<OfficeToPdf toolId="excel-to-pdf" />} />
            <Route path="/tools/html-to-pdf" element={<HtmlToPdf />} />
            <Route path="/tools/pdf-to-jpg" element={<PdfToJpg />} />
            <Route path="/tools/pdf-to-word" element={<PdfToWord />} />
            <Route path="/tools/pdf-to-ppt" element={<PdfToPpt />} />
            <Route path="/tools/pdf-to-excel" element={<PdfToExcel />} />
            <Route path="/tools/pdf-to-pdfa" element={<PdfToPdfA />} />
            <Route path="/tools/rotate-pdf" element={<RotatePdf />} />
            <Route path="/tools/page-numbers" element={<AddPageNumbers />} />
            <Route path="/tools/watermark" element={<AddWatermark />} />
            <Route path="/tools/crop-pdf" element={<CropPdf />} />
            <Route path="/tools/edit-pdf" element={<EditPdf />} />
            <Route path="/tools/pdf-forms" element={<PdfForms />} />
            <Route path="/tools/protect-pdf" element={<ProtectPdf />} />
            <Route path="/tools/unlock-pdf" element={<UnlockPdf />} />
            <Route path="/tools/sign-pdf" element={<SignPdf />} />
            <Route path="/tools/scan-to-pdf" element={<ScanToPdf />} />

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
