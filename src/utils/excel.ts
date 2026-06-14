import * as XLSX from "xlsx";
import { Student } from "../types";
import { getRankedCenters } from "../data";

/**
 * Downloads a list of student records in a formatted .xlsx (Excel) workbook with three worksheets:
 * 1. "Students Ledger": Complete student rows so that users can edit and re-upload seamlessly.
 * 2. "Center Rankings & Scores": Real-time computed matrices and score breakdowns based on the current dataset.
 * 3. "Dashboard Scoring Logics": Documents the exact weights, rules, and mathematical boundaries shown in the image logic.
 */
export function downloadStudentsXLSX(studentsList: Student[], fileName: string) {
  try {
    // =====================================
    // SHEET 1: Students Ledger
    // =====================================
    const headers = [
      "Student ID",
      "Student Name",
      "Grade (9, 10, 11, 12)",
      "Center Name",
      "Test 1 Attendance (Present/Absent)",
      "Test 2 Attendance (Present/Absent)",
      "T1 Physics Score (%)",
      "T1 Chemistry Score (%)",
      "T1 Maths Score (%)",
      "T2 Physics Score (%)",
      "T2 Chemistry Score (%)",
      "T2 Maths Score (%)",
      "IOQM Score (%)",
      "Ramp Up Score (%)",
      "Retained (Yes/No)"
    ];

    const rows = studentsList.map(s => [
      s.id,
      s.name,
      s.grade,
      s.center,
      s.t1_attendance,
      s.t2_attendance,
      s.t1_scores.physics !== undefined ? s.t1_scores.physics : "",
      s.t1_scores.chemistry !== undefined ? s.t1_scores.chemistry : "",
      s.t1_scores.maths !== undefined ? s.t1_scores.maths : "",
      s.t2_scores.physics !== undefined ? s.t2_scores.physics : "",
      s.t2_scores.chemistry !== undefined ? s.t2_scores.chemistry : "",
      s.t2_scores.maths !== undefined ? s.t2_scores.maths : "",
      s.ioqm_score,
      s.ramp_up_score !== undefined ? s.ramp_up_score : "",
      s.retained ? "Yes" : "No"
    ]);

    const wb = XLSX.utils.book_new();
    const ws_ledger = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Apply auto-fit column widths to Student Ledger sheet
    ws_ledger["!cols"] = [
      { wch: 15 }, // Student ID
      { wch: 22 }, // Student Name
      { wch: 15 }, // Grade (9,10,11,12)
      { wch: 24 }, // Center Name
      { wch: 20 }, // T1 Attendance
      { wch: 20 }, // T2 Attendance
      { wch: 15 }, // T1 Physics Score (%)
      { wch: 15 }, // T1 Chem
      { wch: 15 }, // T1 Maths
      { wch: 15 }, // T2 Physics
      { wch: 15 }, // T2 Chem
      { wch: 15 }, // T2 Maths
      { wch: 12 }, // IOQM Score (%)
      { wch: 14 }, // Ramp Up Score (%)
      { wch: 12 }  // Retained (Yes/No)
    ];

    XLSX.utils.book_append_sheet(wb, ws_ledger, "Students Ledger");

    // =====================================
    // SHEET 2: Center Rankings & Scores (Computed dynamically based on active dataset)
    // =====================================
    const rankedCenters = getRankedCenters(studentsList);
    const centerHeaders = [
      "Center Name",
      "Overall Rank",
      "Active Students Count",
      "Consolidated Overall Score (out of 100)",
      "Subjective Test Score (25% Weight)",
      "Element A % (Avg >= 90%)",
      "Element A Scaled Score (out of 100)",
      "Element B % (Papers < 40%)",
      "Element B Scaled Score (out of 100)",
      "IOQM Achievement Score (20% Weight)",
      "IOQM Avg Achievement %",
      "Ramp Up Score (15% Weight)",
      "Ramp Up Topper % (>80% ramp)",
      "Test Attendance Score (10% Weight)",
      "Attendance Avg %",
      "Student Retention Score (30% Weight)",
      "Retention %"
    ];

    const centerRows = rankedCenters.map(c => [
      c.centerName,
      c.rank,
      c.activeStudents,
      Math.round(c.consolidatedScore * 100) / 100,
      Math.round(c.subjectiveTestScore * 100) / 100,
      Math.round(c.elementA_percent * 100) / 100,
      Math.round(c.elementA_score * 100) / 100,
      Math.round(c.elementB_percent * 100) / 100,
      Math.round(c.elementB_score * 100) / 100,
      Math.round(c.ioqmScore * 100) / 100,
      Math.round(c.ioqm_percent * 100) / 100,
      Math.round(c.rampUpScore * 100) / 100,
      Math.round(c.rampUp_percent * 100) / 100,
      Math.round(c.testAttendanceScore * 100) / 100,
      Math.round(c.attendance_percent * 100) / 100,
      Math.round(c.studentRetentionScore * 100) / 100,
      Math.round(c.retention_percent * 100) / 100
    ]);

    const ws_centers = XLSX.utils.aoa_to_sheet([centerHeaders, ...centerRows]);
    ws_centers["!cols"] = [
      { wch: 25 }, // Center Name
      { wch: 12 }, // Overall Rank
      { wch: 18 }, // Active Students
      { wch: 28 }, // Consolidated
      { wch: 24 }, // Subjective Test Score
      { wch: 22 }, // Element A %
      { wch: 24 }, // Element A Scaled
      { wch: 22 }, // Element B %
      { wch: 24 }, // Element B Scaled
      { wch: 25 }, // IOQM Score
      { wch: 20 }, // IOQM Avg
      { wch: 22 }, // Ramp Up Score
      { wch: 22 }, // Ramp Up Topper
      { wch: 24 }, // Test Attendance Score
      { wch: 18 }, // Attendance Avg
      { wch: 24 }, // Student Retention Score
      { wch: 15 }  // Retention %
    ];
    XLSX.utils.book_append_sheet(wb, ws_centers, "Center Rankings & Scores");

    // =====================================
    // SHEET 3: Dashboard Scoring Logics (Exact mapping of the user's provided logic image)
    // =====================================
    const ruleHeaders = [
      "Metric Component",
      "Weight",
      "Scoring Logic Rules & Formulas",
      "Score Mapping Scale"
    ];

    const ruleRows = [
      [
        "Subjective Test",
        "25%",
        "60% weight to Element A and 40% weight to Element B.\n• Element A: Students with last 2 tests subject average >= 90%\n• Element B: Frequency of individual papers with marks < 40%",
        "• Element A Score: 0-15% of students linearly vary; above 15% gives 100 marks.\n• Element B Score: less than 5% failing gives 100 marks; above 15% gives 0 marks; 5-15% linearly vary."
      ],
      [
        "IOQM Achievement",
        "20%",
        "Based on center average of IOQM percentage scores.",
        "• Less than 40% average gives 0 marks.\n• Above 90% average gives 100 marks.\n• 40% to 90% average linearly varies."
      ],
      [
        "Ramp Up Tests",
        "15%",
        "Based on percentage of 9th & 10th grade students who scored > 80% in the latest 2 Ramp Up tests.",
        "• Contribution < 1% of pool gives 0 marks.\n• Contribution > 5% of pool gives 100 marks.\n• 1% to 5% contribution linearly varies."
      ],
      [
        "Test Attendance",
        "10%",
        "Based on center's average attendance across the last 2 subjective tests.",
        "• Less than 50% attendance gives 0 marks.\n• Above 75% attendance gives 100 marks.\n• 50% to 75% attendance linearly varies."
      ],
      [
        "Student Retention",
        "30%",
        "Formula: Retention = (Total 1st EMI Students - Refund - Fee Defaulters - inactive (last 15 schedule days)) / Total 1st EMI Students",
        "• Less than 75% retention gives 0 marks.\n• Above 95% retention gives 100 marks.\n• 75% to 95% retention linearly varies."
      ]
    ];

    const ws_rules = XLSX.utils.aoa_to_sheet([ruleHeaders, ...ruleRows]);
    ws_rules["!cols"] = [
      { wch: 22 }, // Metric Component
      { wch: 10 }, // Weight
      { wch: 60 }, // Rules
      { wch: 60 }  // Scale
    ];
    XLSX.utils.book_append_sheet(wb, ws_rules, "Dashboard Scoring Logics");

    XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
  } catch (err) {
    console.error("XLSX Download helper failed:", err);
    throw err;
  }
}

/**
 * Parses any incoming Excel (.xlsx, .xls) or CSV file with SheetJS on the client side
 * into a structured two-dimensional Array format [ [row1_cell1, row1_cell2], [row2_cell1...] ].
 */
export function parseLocalSpreadsheetFile(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("Empty file data received."));
          return;
        }
        
        let readData: any;
        if (typeof data === "string") {
          readData = data;
        } else {
          readData = new Uint8Array(data);
        }

        const wb = XLSX.read(readData, { type: typeof data === "string" ? "binary" : "array" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json<any[][]>(ws, { header: 1 });
        resolve(rows);
      } catch (err) {
        console.error("SheetJS local file parse error", err);
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    
    // Read raw data
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parses and fetches a publicly shared Google Spreadsheet ("Anyone with the link can view") 
 * directly as an .xlsx export client-side without requiring Google Client authentication or API keys.
 */
export async function fetchPublicSpreadsheet(spreadsheetId: string): Promise<any[][]> {
  const cleanId = spreadsheetId.includes("/d/") 
    ? spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetId 
    : spreadsheetId;
  
  const url = `https://docs.google.com/spreadsheets/d/${cleanId.trim()}/export?format=xlsx`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Direct Cloud Fetch Terminated (Status ${res.status}). ` +
      `Google Sheets requires view permissions to bypass sign-in. ` +
      `Please verify your spreadsheet is shared as "Anyone with the link can view" under Google Sheet Share settings, then click Sync again!`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error("Invalid spreadsheet parsed - no sheets found in the Cloud file.");
  }

  const wsname = wb.SheetNames[0];
  const ws = wb.Sheets[wsname];
  const rows = XLSX.utils.sheet_to_json<any[][]>(ws, { header: 1 });
  return rows;
}

