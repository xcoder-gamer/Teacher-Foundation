import React from "react";
import { Student } from "../data";
import {
  FileSpreadsheet,
  Upload,
  RefreshCw,
  AlertCircle,
  Download,
  BookOpen,
  Clipboard,
  Check,
  Sliders,
} from "lucide-react";
import {
  generateRetentionCSVTemplateString,
  generateResultsCSVTemplateString,
  generateAttendanceCSVTemplateString,
  generateIoqmCSVTemplateString,
  generateRampUpCSVTemplateString,
} from "../utils/excel";
import { generateCSVTemplateString } from "../auth";

interface DailyLedgerImporterProps {
  students: Student[];
  hasImportedData: boolean;
  isImporting: boolean;
  importError: string;
  dragActive: boolean;
  showTemplateModal: boolean;
  copiedTemplate: boolean;
  handleResetToDefaultDemo: () => Promise<void>;
  handleWipeAllData: () => Promise<void>;
  handleCopyTemplateCSV: () => void;
  handleDownloadSampleCSV: () => void;
  handleDownloadActiveXLSX: () => void;
  handleDownloadRetentionXLSX: () => void;
  handleDownloadResultsXLSX: () => void;
  handleDownloadAttendanceXLSX: () => void;
  handleDownloadIoqmXLSX: () => void;
  handleDownloadRampUpXLSX: () => void;
  selectedUploadMatrix: "all" | "retention" | "subjective" | "attendance" | "ioqm" | "rampup";
  setSelectedUploadMatrix: (format: "all" | "retention" | "subjective" | "attendance" | "ioqm" | "rampup") => void;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowTemplateModal: (show: boolean) => void;
  isAdmin?: boolean;
  googleUser?: any;
  handleGoogleLogin?: () => void;
}

export const DailyLedgerImporter: React.FC<DailyLedgerImporterProps> = ({
  students,
  hasImportedData,
  isImporting,
  importError,
  dragActive,
  showTemplateModal,
  copiedTemplate,
  handleResetToDefaultDemo,
  handleWipeAllData,
  handleCopyTemplateCSV,
  handleDownloadSampleCSV,
  handleDownloadActiveXLSX,
  handleDownloadRetentionXLSX,
  handleDownloadResultsXLSX,
  handleDownloadAttendanceXLSX,
  handleDownloadIoqmXLSX,
  handleDownloadRampUpXLSX,
  selectedUploadMatrix,
  setSelectedUploadMatrix,
  handleDrag,
  handleDrop,
  handleFileChange,
  setShowTemplateModal,
  isAdmin = true,
  googleUser = null,
  handleGoogleLogin,
}) => {
  const [selectedGuideFormat, setSelectedGuideFormat] = React.useState<"master" | "retention" | "results" | "attendance" | "ioqm" | "rampup">("master");
  const [localCopied, setLocalCopied] = React.useState(false);

  // Synchronize guide tabs with selected upload matrix for visual consistency
  React.useEffect(() => {
    if (selectedUploadMatrix === "all") setSelectedGuideFormat("master");
    else if (selectedUploadMatrix === "retention") setSelectedGuideFormat("retention");
    else if (selectedUploadMatrix === "subjective") setSelectedGuideFormat("results");
    else if (selectedUploadMatrix === "attendance") setSelectedGuideFormat("attendance");
    else if (selectedUploadMatrix === "ioqm") setSelectedGuideFormat("ioqm");
    else if (selectedUploadMatrix === "rampup") setSelectedGuideFormat("rampup");
  }, [selectedUploadMatrix]);

  const handleLocalCopy = () => {
    try {
      let csv = "";
      if (selectedGuideFormat === "master") csv = generateCSVTemplateString(students);
      else if (selectedGuideFormat === "retention") csv = generateRetentionCSVTemplateString(students);
      else if (selectedGuideFormat === "results") csv = generateResultsCSVTemplateString(students);
      else if (selectedGuideFormat === "attendance") csv = generateAttendanceCSVTemplateString(students);
      else if (selectedGuideFormat === "ioqm") csv = generateIoqmCSVTemplateString(students);
      else if (selectedGuideFormat === "rampup") csv = generateRampUpCSVTemplateString(students);

      navigator.clipboard.writeText(csv);
      setLocalCopied(true);
      setTimeout(() => setLocalCopied(false), 2000);
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  };

  const handleLocalDownload = () => {
    try {
      let csv = "";
      let filename = "";
      if (selectedGuideFormat === "master") {
        csv = generateCSVTemplateString(students);
        filename = "pw_master_combined_ledger.csv";
      } else if (selectedGuideFormat === "retention") {
        csv = generateRetentionCSVTemplateString(students);
        filename = "pw_retention_format1_sample.csv";
      } else if (selectedGuideFormat === "results") {
        csv = generateResultsCSVTemplateString(students);
        filename = "pw_results_format2_sample.csv";
      } else if (selectedGuideFormat === "attendance") {
        csv = generateAttendanceCSVTemplateString(students);
        filename = "pw_attendance_format3_sample.csv";
      } else if (selectedGuideFormat === "ioqm") {
        csv = generateIoqmCSVTemplateString(students);
        filename = "pw_ioqm_format4_sample.csv";
      } else if (selectedGuideFormat === "rampup") {
        csv = generateRampUpCSVTemplateString(students);
        filename = "pw_rampup_format5_sample.csv";
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("CSV Download failed", e);
    }
  };

  return (
    <section
      className={`lg:col-span-12 bg-slate-900 border rounded-xl p-5 shadow-2xl relative overflow-hidden transition-all duration-300 ${
        hasImportedData ? "border-emerald-500/40 bg-slate-900/90" : "border-slate-800"
      }`}
      id="daily-ledger-widget"
    >
      {/* Subtle background visual glows */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              hasImportedData ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"
            }`}
          >
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-md font-bold font-display tracking-tight text-slate-50 flex items-center gap-2">
              Student Attendance & Marks Upload
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload Excel (.xlsx, .xls) files or CSV templates to selectively update your student metrics in the database.
            </p>
          </div>
        </div>

        {/* Database mode badge */}
        <div className="flex items-center gap-2 text-xs">
          {hasImportedData ? (
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-mono shadow-sm">
              <span className="w-2 h-2 bg-emerald-400 block animate-pulse rounded-full" />
              DATABASE ACTIVE
            </span>
          ) : (
            <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-mono shadow-sm font-bold">
              <span className="w-2 h-2 bg-yellow-400 block animate-pulse rounded-full" />
              USING DEMO DATA
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMN 1: Database Status & Actions */}
        <div className="lg:col-span-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 pb-5 lg:pb-0 lg:pr-6 space-y-4 animate-fade-in">
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-yellow-500 mb-1 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-yellow-500" />
              Database Status & Downloader
            </h3>

            <div className="bg-slate-950/45 p-4 rounded-lg border border-slate-800/80 space-y-3">
              <div className="flex items-center gap-2">
                {hasImportedData ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    SAVED IN DATABASE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    USING DEMO DATA
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                {hasImportedData
                  ? "The database is currently holding your custom student records and showing live metrics."
                  : "Viewing preloaded demo rankings. Select a matrix dropdown first, download its template, and upload to replace with real students."}
              </p>

              <div className="pt-2 border-t border-slate-800/50 grid grid-cols-2 gap-3 text-left">
                <div>
                  <div className="text-[9px] font-mono font-bold text-slate-500 uppercase">Active Students</div>
                  <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">{students.length}</div>
                </div>
                <div>
                  <div className="text-[9px] font-mono font-bold text-slate-500 uppercase">Registered Centers</div>
                  <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                    {Array.from(new Set(students.map((s) => s.center))).length}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/25 mt-1">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                📥 EXPORT CHANNELS (CHOOSE METRIC DATABASE)
              </div>
              
              <button
                onClick={handleDownloadActiveXLSX}
                className="w-full bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 font-semibold py-2 px-3 text-[11.5px] rounded-lg flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer shadow-md"
                title="Download combined master sheet of all data fields"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Master Combined (.xlsx)</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">All Fields</span>
              </button>

              <button
                onClick={handleDownloadRetentionXLSX}
                className="w-full bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 font-semibold py-2 px-3 text-[11.5px] rounded-lg flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer shadow-md"
                title="Download active student dataset in student retention ledger layout"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Retention Format (.xlsx)</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">Format 1</span>
              </button>

              <button
                onClick={handleDownloadResultsXLSX}
                className="w-full bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 font-semibold py-2 px-3 text-[11.5px] rounded-lg flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer shadow-md"
                title="Download active student marksheet results layout"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-purple-400" />
                  <span>Subjective Marks (.xlsx)</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">Format 2</span>
              </button>

              <button
                onClick={handleDownloadAttendanceXLSX}
                className="w-full bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 font-semibold py-2 px-3 text-[11.5px] rounded-lg flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer shadow-md"
                title="Download attendance records in specialized ledger layout"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-amber-450" />
                  <span>Test Attendance (.xlsx)</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">Format 3</span>
              </button>

              <button
                onClick={handleDownloadIoqmXLSX}
                className="w-full bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 font-semibold py-2 px-3 text-[11.5px] rounded-lg flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer shadow-md"
                title="Download Olympiad metrics scores ledger"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>IOQM Olympiad (.xlsx)</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">Format 4</span>
              </button>

              <button
                onClick={handleDownloadRampUpXLSX}
                className="w-full bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 font-semibold py-2 px-3 text-[11.5px] rounded-lg flex items-center justify-between gap-2 transition active:scale-98 cursor-pointer shadow-md"
                title="Download 9th/10th grade Ramp Up foundation score ledger"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-pink-400" />
                  <span>Ramp Up Scores (.xlsx)</span>
                </span>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">Format 5</span>
              </button>

              {isAdmin && (
                <div className="space-y-2 mt-2">
                  {hasImportedData && (
                    <button
                      onClick={handleResetToDefaultDemo}
                      className="w-full bg-slate-800/80 hover:bg-slate-800 border border-slate-755 text-slate-300 font-medium py-2 px-3 text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition active:scale-98 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Restore Preloaded Demo Data
                    </button>
                  )}
                  
                  <button
                    onClick={handleWipeAllData}
                    className="w-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold py-2.5 px-3 text-[11.5px] rounded-lg flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer shadow-lg"
                    title="Clear sandbox data completely and prepare for clean live imports"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 stroke-[2.5]" />
                    <span>Wipe Sandbox & Start Fresh</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowTemplateModal(!showTemplateModal)}
              className="text-xs text-yellow-500 hover:text-yellow-400 font-mono flex items-center gap-1.5 transition pb-0.5 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              {showTemplateModal ? "Hide Spreadsheet Guidelines" : "Show Spreadsheet Guidelines"}
            </button>
          </div>
        </div>

        {/* COLUMN 2: Prominent Select & Upload File Importer or Admin Gate Card */}
        <div className="lg:col-span-7 flex flex-col justify-between pl-0 lg:pl-6 space-y-4 animate-fade-in">
          {!isAdmin ? (
            <div className="bg-slate-950/75 border border-slate-800/80 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-5 shadow-xl relative min-h-[350px]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="p-4 bg-yellow-500/5 text-yellow-500 border border-yellow-500/20 rounded-full">
                <Sliders className="w-8 h-8 font-thin animate-pulse" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h4 className="text-sm font-bold text-slate-100 font-display">🔒 Administrative Ledger Gating</h4>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">
                  Student database write access, schema updates, and live matrix spreadsheet uploader are restricted to the authorized admin:
                </p>
                <div className="bg-slate-900 border border-slate-850 py-1.5 px-3 rounded font-mono text-[10.5px] text-yellow-400 select-all font-bold tracking-tight">
                  sharma.devansh987@gmail.com
                </div>
              </div>

              {!googleUser ? (
                <div className="space-y-3 pt-2">
                  <p className="text-[10px] text-slate-500 italic max-w-xs leading-normal">
                    If you are the admin, please authenticate using Google to activate write privileges.
                  </p>
                  <button
                    onClick={handleGoogleLogin}
                    className="bg-yellow-500 hover:bg-yellow-605 hover:bg-yellow-600 text-slate-950 font-extrabold px-5 py-2.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-2 mx-auto active:scale-98 shadow-md"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.24 10.285V13.4h6.86c-.277 1.56-1.602 4.585-6.86 4.585-4.54 0-8.24-3.765-8.24-8.4s3.7-8.4 8.24-8.4c2.58 0 4.307 1.095 5.298 2.045l2.465-2.37C18.435 1.21 15.62 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.89 11.57-11.79 0-.795-.085-1.4-.195-1.925H12.24z" />
                    </svg>
                    <span>Sign In with Google</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="text-[10px] bg-rose-500/10 text-rose-450 text-rose-400 border border-rose-500/20 py-2 px-3 rounded font-mono break-all leading-tight">
                     Logged in as: <strong className="font-bold">{googleUser.email}</strong> (REJECTED)
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal max-w-xs">
                    View-Only access is active. Non-admin accounts can visualize results and download Excel reports, but cannot overwrite database state records.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-cyan-400 flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400" />
                Step-by-Step Matrix Data Upload
              </h3>

              {/* Matrix Dropdown Select Area (USER REQUEST REQUISITE) */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <label htmlFor="matrix-upload-select" className="text-xs font-bold text-slate-200 flex items-center gap-2 font-display">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 font-mono text-[10px] font-bold">1</span>
                  Choose Matrix (Metric Type) to Update:
                </label>
                
                <select
                  id="matrix-upload-select"
                  value={selectedUploadMatrix}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setSelectedUploadMatrix(val);
                  }}
                  className="w-full bg-slate-900 border border-slate-850 hover:border-slate-700/80 focus:border-cyan-500 text-slate-100 py-2.5 px-3.5 text-xs rounded-lg font-mono focus:outline-none transition-all cursor-pointer"
                >
                  <option value="all">📁 Combined Master Template (Updates All 5 Metrics)</option>
                  <option value="retention">🔄 Student Retention Status (Format #1 - defaulters, cancellations)</option>
                  <option value="subjective">📝 Subjective Marks & Results (Format #2 - T1 & T2 marks)</option>
                  <option value="attendance">📅 Test Attendance Status (Format #3 - T1 & T2 Presence)</option>
                  <option value="ioqm">🏆 IOQM Olympiad Achievement Scores (Format #4)</option>
                  <option value="rampup">📈 Ramp Up Test Scores (Format #5 - Class 9/10 transition)</option>
                </select>

                <div className="bg-slate-900 p-2.5 rounded border border-slate-850 text-[10px] leading-relaxed text-slate-300 font-mono">
                  <strong>🔧 Expected Behavior on Upload:</strong>{" "}
                  {selectedUploadMatrix === "all" && "Will scan and overwrite all credentials for matching student rows in the spreadsheet."}
                  {selectedUploadMatrix === "retention" && "Only updates retention fields (retained status, defaulter, active logs). Other subjective scores remain preserved!"}
                  {selectedUploadMatrix === "subjective" && "Only merges subjective subjects tests marks (Physics, Chemistry, Maths, Science, English, SST, Urdu % scores). Other indicators remain preserved!"}
                  {selectedUploadMatrix === "attendance" && "Only updates presence/absence logs for Test 1 & Test 2 cycles. No scores or stats are modified!"}
                  {selectedUploadMatrix === "ioqm" && "Only matches registration number to update the IOQM achievement rate percentages."}
                  {selectedUploadMatrix === "rampup" && "Only matches registration number to update the Ramp Up test score percentages (9/10th grade only)."}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-2 font-display">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 font-mono text-[10px] font-bold">2</span>
                  Drag and drop or select your Spreadsheet file:
                </label>

                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    dragActive
                      ? "border-cyan-400 bg-cyan-500/10 scale-[1.01] shadow-lg shadow-cyan-500/5"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-700/80 hover:bg-slate-950/60"
                  } relative cursor-pointer min-h-[150px] flex flex-col items-center justify-center`}
                >
                  <input
                    type="file"
                    id="excel-file-upload-input"
                    multiple={false}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2.5">
                    <div
                      className={`p-3 rounded-full ${
                        dragActive ? "bg-cyan-500/10 text-cyan-400" : "bg-slate-800/60 text-slate-400"
                      }`}
                    >
                      <FileSpreadsheet className={`w-8 h-8 ${dragActive ? "animate-bounce" : ""}`} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11.5px] font-bold text-slate-200 block">
                        {isImporting ? "Reading spreadsheet..." : `Upload [${selectedUploadMatrix.toUpperCase()}] matrix sheet here`}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        Supports general Excel (.xlsx, .xls) and CSV files
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {isImporting && (
                <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-lg p-3.5 flex items-center gap-2.5 text-xs text-cyan-300">
                  <RefreshCw className="w-4 h-4 text-cyan-450 animate-spin" />
                  <span>Processing selected matrix spreadsheet and updating database...</span>
                </div>
              )}

              {importError && (
                <div className="bg-rose-500/10 border border-rose-500/25 rounded-lg p-3.5 space-y-2 text-xs text-rose-300 leading-relaxed shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 text-rose-400 font-bold font-mono">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>Upload Failed</span>
                  </div>
                  <p className="font-mono text-[10.5px] bg-slate-950 p-2.5 rounded border border-rose-950/45 text-rose-300 select-all overflow-x-auto whitespace-pre-wrap leading-tight">
                    {importError}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Accordion expand block for Instructions / Guidelines */}
      {showTemplateModal && (
        <div
          className="mt-6 pt-5 border-t border-slate-800/80 bg-slate-950/40 rounded-lg p-5 space-y-5 animate-fade-in"
          id="sheet-instructions-panel"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-yellow-500" />
              <div>
                <h4 className="text-sm font-bold text-yellow-500 font-sans">
                  Real-time Spreadsheet Format Guidelines & Previews
                </h4>
                <p className="text-[11px] text-slate-400 font-mono">
                  Select a category tab to view exact columns, preview realistic sample rows, copy headers, or download sample templates.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleLocalCopy}
                className="bg-slate-900 hover:bg-slate-800 text-slate-200 font-mono text-xs py-1.5 px-3 rounded-lg border border-slate-700 hover:border-slate-650 transition flex items-center gap-1.5 cursor-pointer active:scale-98"
              >
                {localCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                {localCopied ? "Copied!" : "📋 Copy Header Names"}
              </button>

              <button
                onClick={handleLocalDownload}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-98 shadow-md"
              >
                <Download className="w-3.5 h-3.5" />
                📥 Download Template CSV
              </button>
            </div>
          </div>

          {/* Tab Selector Buttons for Guidelines */}
          <div className="flex border-b border-slate-850 gap-1 overflow-x-auto pb-1 select-none font-sans scrollbar-thin">
            <button
              onClick={() => {
                setSelectedGuideFormat("master");
                setLocalCopied(false);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all font-sans whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedGuideFormat === "master"
                  ? "bg-slate-900 border-slate-800 text-cyan-400 font-bold border-b-2 border-b-cyan-500/90"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              🌟 Combined Format (All 15 Columns)
            </button>

            <button
              onClick={() => {
                setSelectedGuideFormat("retention");
                setLocalCopied(false);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all font-sans whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedGuideFormat === "retention"
                  ? "bg-slate-900 border-slate-800 text-emerald-400 font-bold border-b-2 border-b-emerald-500/90"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Format #1: Student Retention (Y/N)
            </button>
            
            <button
              onClick={() => {
                setSelectedGuideFormat("results");
                setLocalCopied(false);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all font-sans whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedGuideFormat === "results"
                  ? "bg-slate-900 border-slate-800 text-purple-400 font-bold border-b-2 border-b-purple-500/90"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              Format #2: Marks & Results
            </button>

            <button
              onClick={() => {
                setSelectedGuideFormat("attendance");
                setLocalCopied(false);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all font-sans whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedGuideFormat === "attendance"
                  ? "bg-slate-900 border-slate-800 text-amber-400 font-bold border-b-2 border-b-amber-500/90"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Format #3: Test Attendance (Present/Absent)
            </button>

            <button
              onClick={() => {
                setSelectedGuideFormat("ioqm");
                setLocalCopied(false);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all font-sans whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedGuideFormat === "ioqm"
                  ? "bg-slate-900 border-slate-800 text-teal-400 font-bold border-b-2 border-b-teal-500/90"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              Format #4: IOQM Achievements
            </button>

            <button
              onClick={() => {
                setSelectedGuideFormat("rampup");
                setLocalCopied(false);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all font-sans whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedGuideFormat === "rampup"
                  ? "bg-slate-900 border-slate-800 text-pink-400 font-bold border-b-2 border-b-pink-500/90"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
              Format #5: Ramp Up Scores
            </button>
          </div>

          {/* MASTER COMBINED LEDGER CONTENT */}
          {selectedGuideFormat === "master" && (
            <div className="space-y-3 animate-fade-in font-sans">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                  Combined Master Ledger Columns & Previews
                </span>

                <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
                  The Master Ledger contains all metrics (attendance, scores, retention) in a single consolidated Excel (.xlsx) or CSV template. Any values you upload here will overwrite matching students' records.
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner">
                  <table className="w-full text-[10px] md:text-[11px] font-mono border-collapse min-w-[1550px]">
                    <thead className="bg-slate-900 text-slate-400 select-none border-b border-slate-800 text-[10.5px]">
                      <tr>
                        <th className="w-10 bg-slate-950 border-r border-slate-800 text-center font-bold"></th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">A</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">B</th>
                        <th className="py-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/30">C</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">D</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">E</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">F</th>
                        <th className="py-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/30">G</th>
                        <th className="py-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/30">H</th>
                        <th className="py-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/30">I</th>
                        <th className="py-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/30">J</th>
                        <th className="py-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/30">K</th>
                        <th className="py-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/30">L</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">M</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">N</th>
                        <th className="py-1 px-3 text-center font-semibold bg-slate-900/30">O</th>
                      </tr>
                      <tr className="bg-slate-900 text-yellow-500 border-b border-slate-800 font-bold">
                        <td className="bg-slate-950 text-slate-500 text-center border-r border-slate-800 select-none">1</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student ID</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student Name</td>
                        <td className="py-1.5 px-1 border-r border-slate-800 bg-yellow-500/5 text-center">Grade (9, 10, 11, 12)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Center Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5 text-center">Test 1 Attendance (Present/Absent)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5 text-center">Test 2 Attendance (Present/Absent)</td>
                        <td className="py-1.5 px-1 border-r border-slate-800 text-cyan-400 bg-cyan-500/5 text-center">T1 Physics Score (%)</td>
                        <td className="py-1.5 px-1 border-r border-slate-800 text-cyan-400 bg-cyan-500/5 text-center">T1 Chemistry Score (%)</td>
                        <td className="py-1.5 px-1 border-r border-slate-800 text-cyan-400 bg-cyan-500/5 text-center">T1 Maths Score (%)</td>
                        <td className="py-1.5 px-1 border-r border-slate-800 text-cyan-400 bg-cyan-500/5 text-center">T2 Physics Score (%)</td>
                        <td className="py-1.5 px-1 border-r border-slate-800 text-cyan-400 bg-cyan-500/5 text-center">T2 Chemistry Score (%)</td>
                        <td className="py-1.5 px-1 border-r border-slate-800 text-cyan-400 bg-cyan-500/5 text-center">T2 Maths Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-purple-400 bg-purple-500/5 text-center">IOQM Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-pink-400 bg-pink-500/5 text-center">Ramp Up Score (%)</td>
                        <td className="py-1.5 px-3 text-emerald-450 bg-emerald-500/5 text-center">Retained (Yes/No)</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300">
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">2</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-001</td>
                        <td className="p-1 px-2 border-r border-slate-800">Aarav Sharma</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold text-cyan-400">11</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400 font-sans">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-emerald-400 font-semibold">Present</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-emerald-400 font-semibold">Present</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold bg-slate-900/20">92</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold bg-slate-900/20">95</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold bg-slate-900/20">94</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold bg-slate-900/10">90</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold bg-slate-900/10">92</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold bg-slate-900/10">96</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-purple-400 font-semibold">82</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-3 text-center text-emerald-400 font-semibold">Yes</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">3</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-002</td>
                        <td className="p-1 px-2 border-r border-slate-800">Rahul Gupta</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold text-cyan-400">10</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400 font-sans">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-emerald-400 font-semibold">Present</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-emerald-400 font-semibold">Present</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/20">55</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/20">34</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/20">45</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/10">58</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/10">42</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/10">48</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-purple-405 font-semibold text-purple-400">35</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-pink-400 font-semibold">55</td>
                        <td className="p-1 px-3 text-center text-emerald-400 font-semibold">Yes</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">4</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-003</td>
                        <td className="p-1 px-2 border-r border-slate-800">Sunita Yadav</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold text-cyan-400">12</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400 font-sans">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-emerald-400 font-semibold">Present</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-emerald-400 font-semibold">Present</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/20">71</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/20">68</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/20">72</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/10">69</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/10">74</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-semibold bg-slate-900/10">70</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-purple-400 font-semibold">52</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-3 text-center text-emerald-400 font-semibold">Yes</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">5</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-004</td>
                        <td className="p-1 px-2 border-r border-slate-800">Vikram Malhotra</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center font-bold text-cyan-400">9</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400 font-sans">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-rose-400 font-semibold">Absent</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center text-rose-400 font-semibold">Absent</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center text-slate-650 italic">blank</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center text-slate-650 italic">blank</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center text-slate-650 italic">blank</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center text-slate-650 italic">blank</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center text-slate-650 italic">blank</td>
                        <td className="p-1 px-1 border-r border-slate-800 text-center text-slate-650 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-purple-400 font-semibold">20</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-pink-400 font-semibold">30</td>
                        <td className="p-1 px-3 text-center text-rose-400 font-semibold">No</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: RETENTION LEDGER CONTENT */}
          {selectedGuideFormat === "retention" && (
            <div className="space-y-3 animate-fade-in font-sans">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  Format #1: Student Retention (Y/N) Table columns
                </span>

                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  Is layout ka use karke aap student list updates directly apply kar sakte hain. Required headers exactly in rows:
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner">
                  <table className="w-full text-[10px] md:text-[11px] font-mono border-collapse min-w-[750px]">
                    <thead className="bg-slate-900 text-slate-400 select-none border-b border-slate-800">
                      <tr>
                        <th className="w-10 bg-slate-950 border-r border-slate-800 text-[10.5px] text-center font-bold"></th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">A</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">B</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">C</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">D</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">E</th>
                        <th className="py-1 px-3 text-center font-semibold bg-slate-900/30">F</th>
                      </tr>
                      <tr className="bg-slate-900 text-yellow-500 border-b border-slate-800 font-bold">
                        <td className="bg-slate-950 text-slate-500 text-center border-r border-slate-800 select-none">1</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student ID</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Grade (9, 10, 11, 12)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Center Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-emerald-400 bg-emerald-500/5">defaulter_status</td>
                        <td className="py-1.5 px-3 text-teal-450 bg-teal-500/5">Retained (Yes/No)</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300">
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">2</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-001</td>
                        <td className="p-1 px-2 border-r border-slate-800">Aarav Sharma</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-bold text-cyan-400">11</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-500">Not Defaulter</td>
                        <td className="p-1 px-3 text-center text-emerald-400 font-semibold">Yes</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">3</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-004</td>
                        <td className="p-1 px-2 border-r border-slate-800">Vikram Malhotra</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-bold text-cyan-400">9</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-rose-400">2nd EMI Defaulter</td>
                        <td className="p-1 px-3 text-center text-rose-450 font-semibold">No</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MARKS & RESULTS CONTENT */}
          {selectedGuideFormat === "results" && (
            <div className="space-y-3 animate-fade-in font-sans">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                  Format #2: Student Marks & Results Guidelines
                </span>

                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  Requires numerical percentages for subjects. If absent, leave columns blank:
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner">
                  <table className="w-full text-[10px] md:text-[11px] font-mono border-collapse min-w-[900px]">
                    <thead className="bg-slate-900 text-slate-400 select-none border-b border-slate-800">
                      <tr>
                        <th className="w-10 bg-slate-950 border-r border-slate-800 text-[10px] text-center font-bold"></th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">A</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">B</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">C</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">D</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">E</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">F</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">G</th>
                        <th className="py-1 px-3 text-center font-semibold bg-slate-900/30">H</th>
                      </tr>
                      <tr className="bg-slate-900 text-yellow-500 border-b border-slate-800 font-bold">
                        <td className="bg-slate-950 text-slate-500 text-center border-r border-slate-800 select-none font-bold">1</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student ID</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-400 bg-cyan-500/5">maths_pct (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-400 bg-cyan-500/5">science_pct (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-400 bg-cyan-500/5">english_pct (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-400 bg-cyan-500/5">sst_pct (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-400 bg-cyan-500/5">urdu_pct (%)</td>
                        <td className="py-1.5 px-3 text-emerald-400 bg-emerald-500/5">attendance</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300 font-mono">
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800 font-bold">2</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-001</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-300">Aarav Sharma</td>
                        <td className="p-1 px-2 border-r border-slate-800 bg-cyan-500/5 text-right font-mono">92</td>
                        <td className="p-1 px-2 border-r border-slate-800 bg-cyan-500/5 text-right font-mono">90</td>
                        <td className="p-1 px-2 border-r border-slate-800 bg-cyan-500/5 text-right font-mono">88</td>
                        <td className="p-1 px-2 border-r border-slate-800 bg-cyan-500/5 text-right font-mono">94</td>
                        <td className="p-1 px-2 border-r border-slate-800 bg-cyan-500/5 text-right font-mono">91</td>
                        <td className="p-1 px-3 text-center text-emerald-400 font-bold">Present</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800 font-bold">3</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-004</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-300">Vikram Malhotra</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-3 text-center text-rose-400 font-bold">Absent</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TEST ATTENDANCE CONTENT */}
          {selectedGuideFormat === "attendance" && (
            <div className="space-y-3 animate-fade-in font-sans">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-amber-450" />
                  Format #3: Test Attendance Sheet Guidelines
                </span>

                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  Defines students' presence/absence logs for active test cycles (Test 1 and Test 2). Expected headers:
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner">
                  <table className="w-full text-[10px] md:text-[11px] font-mono border-collapse min-w-[700px]">
                    <thead className="bg-slate-900 text-slate-400 select-none border-b border-slate-800">
                      <tr>
                        <th className="w-10 bg-slate-950 border-r border-slate-800 text-[10px] text-center font-bold"></th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">A</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">B</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">C</th>
                        <th className="py-1 px-3 text-center font-semibold bg-slate-900/30">D</th>
                      </tr>
                      <tr className="bg-slate-900 text-yellow-500 border-b border-slate-800 font-bold">
                        <td className="bg-slate-950 text-slate-500 text-center border-r border-slate-800 select-none font-bold">1</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student ID</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-emerald-400 bg-emerald-500/5">Test 1 Attendance (Present/Absent)</td>
                        <td className="py-1.5 px-3 text-emerald-400 bg-emerald-500/5">Test 2 Attendance (Present/Absent)</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300 font-mono">
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">2</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-001</td>
                        <td className="p-1 px-2 border-r border-slate-800">Aarav Sharma</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center font-semibold text-emerald-400 bg-emerald-500/5">Present</td>
                        <td className="p-1 px-3 text-center font-semibold text-emerald-400 bg-emerald-500/5">Present</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">3</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-004</td>
                        <td className="p-1 px-2 border-r border-slate-800">Vikram Malhotra</td>
                        <td className="p-1 px-2 border-r border-slate-805 text-center font-semibold text-rose-400 bg-rose-500/5">Absent</td>
                        <td className="p-1 px-3 text-center font-semibold text-rose-450 bg-rose-500/5">Absent</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: IOQM ACHIEVEMENT */}
          {selectedGuideFormat === "ioqm" && (
            <div className="space-y-3 animate-fade-in font-sans">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                  Format #4: IOQM Olympiad Achievement Score Guidelines
                </span>

                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  Scan and parse Olympiad qualification rates, scores, and center stats. Expected headers:
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner block">
                  <table className="w-full text-[10px] md:text-[11px] font-mono border-collapse min-w-[700px]">
                    <thead className="bg-slate-900 text-slate-400 select-none border-b border-slate-800">
                      <tr>
                        <th className="w-10 bg-slate-950 border-r border-slate-800 text-[10px] text-center font-bold"></th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">A</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">B</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">C</th>
                        <th className="py-1 px-3 text-center font-semibold bg-slate-900/30">D</th>
                      </tr>
                      <tr className="bg-slate-900 text-yellow-500 border-b border-slate-800 font-bold font-mono">
                        <td className="bg-slate-950 text-slate-500 text-center border-r border-slate-800 select-none">1</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student ID</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5 font-mono">Student Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-slate-400 font-mono">Center Name</td>
                        <td className="py-1.5 px-3 text-purple-400 bg-purple-500/5 font-mono">IOQM Score (%)</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300 font-mono">
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">2</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-001</td>
                        <td className="p-1 px-2 border-r border-slate-800">Aarav Sharma</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-3 text-right font-bold text-purple-400 bg-purple-500/5">82</td>
                      </tr>
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">3</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-002</td>
                        <td className="p-1 px-2 border-r border-slate-800">Rahul Gupta</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-3 text-right font-bold text-purple-400 bg-purple-500/5">35</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: RAMP UP SCORES */}
          {selectedGuideFormat === "rampup" && (
            <div className="space-y-3 animate-fade-in font-sans">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-pink-400" />
                  Format #5: Ramp Up Scores Sheet Guidelines
                </span>

                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  Used for class 9 and 10 students target score rankings (transition score). Expected headers:
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner">
                  <table className="w-full text-[10px] md:text-[11px] font-mono border-collapse min-w-[700px]">
                    <thead className="bg-slate-900 text-slate-400 select-none border-b border-slate-800">
                      <tr>
                        <th className="w-10 bg-slate-950 border-r border-slate-800 text-[10px] text-center font-bold"></th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">A</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">B</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">C</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold bg-slate-900/30">D</th>
                        <th className="py-1 px-3 text-center font-semibold bg-slate-900/30">E</th>
                      </tr>
                      <tr className="bg-slate-900 text-yellow-500 border-b border-slate-800 font-bold font-mono">
                        <td className="bg-slate-950 text-slate-500 text-center border-r border-slate-800 select-none font-bold">1</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student ID</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 bg-yellow-500/5">Student Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-cyan-400 bg-cyan-500/5">Grade (9 or 10)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 text-slate-400">Center Name</td>
                        <td className="py-1.5 px-3 text-purple-400 bg-purple-500/5">Ramp Up Score (%)</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300 font-mono">
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">2</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100 font-mono">PW-LKO-004</td>
                        <td className="p-1 px-2 border-r border-slate-800 whitespace-nowrap text-slate-200">Vikram Malhotra</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-bold text-cyan-400">9</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-slate-400 whitespace-nowrap">Lucknow Chowk Center</td>
                        <td className="p-1 px-3 text-right font-bold text-purple-400 bg-purple-500/5">55</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="english-data-type-guide">
            <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm">
              <div className="text-[12px] font-bold text-yellow-405 flex items-center gap-1 font-sans">
                <span className="w-2 h-2 rounded-full bg-yellow-400 block" />
                1. Class aur Center Name
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                <strong>ID & Name:</strong> Har student ka apna unique ID aur name likhein.
                <br />
                <strong>Grade (Class):</strong> Grade me strictly <code className="text-yellow-400 font-mono">9, 10, 11 ya 12</code> likhein.
                <br />
                <strong>Center:</strong> Center ka sahi naam likhein (Jaise Lucknow Chowk Centre).
              </p>
            </div>

            <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-emerald-500/10">
              <div className="text-[12px] font-bold text-emerald-400 flex items-center gap-1 font-sans">
                <span className="w-2 h-2 rounded-full bg-emerald-400 block" />
                2. Attendance Status
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                <strong>Present / Absent:</strong> Attendance columns me ya to <code className="text-emerald-400 font-mono bg-slate-950 px-1 rounded">Present</code> likhein ya fir <code className="text-rose-400 font-mono bg-slate-950 px-1 rounded">Absent</code> likhein.
                <br />
                Agar student absent hai, to unke marks details blank chhod dein.
              </p>
            </div>

            <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-cyan-500/10">
              <div className="text-[12px] font-bold text-cyan-400 flex items-center gap-1 font-sans">
                <span className="w-2 h-2 rounded-full bg-cyan-400 block" />
                3. Subject Marks Rules
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                <strong>Marks range:</strong> Har subject (Physics, Chemistry, Maths, Science, English, SST, Urdu) ke scores <code className="text-cyan-400 font-mono">0 se 100</code> ke beech percentage me dalein.
              </p>
            </div>

            <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-purple-500/10 font-sans">
              <div className="text-[12px] font-bold text-purple-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-400 block" />
                4. Retention Status (Sahi rules)
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                <strong>Retained Column:</strong> Is column me strictly <code className="text-purple-400 bg-slate-950 px-1 rounded font-mono">Yes</code> ya <code className="text-purple-405 bg-slate-950 px-1 rounded font-mono">No</code> fill karein.
                <br />
                <strong>Ramp Up / IOQM:</strong> In columns me numerical percentage score dalein (0 se 100).
              </p>
            </div>
          </div>

          {/* Directions for daily uploading */}
          <div className="text-[11px] bg-slate-950 border border-slate-800 rounded-lg p-4 text-slate-400 font-mono space-y-2">
            <div className="text-slate-200 font-bold flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <span className="flex items-center gap-1.5 font-sans">⚡ Steps to Upload Student Data:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-300 font-sans">
              <li>Pehle <strong>"Choose Matrix to Update"</strong> se desired format select karein.</li>
              <li>Sahi Format tab me jakar <strong>"Download Template CSV"</strong> block click karein.</li>
              <li>Aap apne spreadsheets ke parameters (marks ya retention status) fill karein.</li>
              <li>File ko active drag border uploader block me drop karein.</li>
              <li>System custom columns auto-detect karke database update kar dega!</li>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
};
