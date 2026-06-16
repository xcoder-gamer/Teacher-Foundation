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
    const wb = XLSX.utils.book_new();

    // =====================================
    // WORKSHEET 1: Students Ledger (Combined Standard)
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

    const ws_ledger = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws_ledger["!cols"] = [
      { wch: 15 }, // Student ID
      { wch: 22 }, // Student Name
      { wch: 15 }, // Grade
      { wch: 24 }, // Center Name
      { wch: 20 }, // T1 Attendance
      { wch: 20 }, // T2 Attendance
      { wch: 15 }, // T1 Physics
      { wch: 15 }, // T1 Chem
      { wch: 15 }, // T1 Maths
      { wch: 15 }, // T2 Physics
      { wch: 15 }, // T2 Chem
      { wch: 15 }, // T2 Maths
      { wch: 12 }, // IOQM
      { wch: 14 }, // Ramp Up
      { wch: 12 }  // Retained
    ];
    XLSX.utils.book_append_sheet(wb, ws_ledger, "Students Ledger");

    // =====================================
    // WORKSHEET 2: Retention Ledger (Format #1)
    // =====================================
    const retentionHeaders = [
      "regno",
      "region",
      "combined_center",
      "cohort",
      "batch",
      "student_name",
      "defaulter_status",
      "Admission Cancellation",
      "Inactive",
      "Retention"
    ];

    const retentionRows = studentsList.map(s => [
      s.id,
      s.region || (s.center.toLowerCase().includes("lucknow") ? "Uttar Pradesh" : "Rajasthan"),
      s.center,
      s.grade ? `${s.grade}th Foundation` : "10th Foundation",
      s.batch || "11-NF101EA",
      s.name,
      s.defaulter_status || (s.retained ? "Not Defaulter" : "2nd EMI Defaulter"),
      s.admission_cancellation || (s.retained ? "" : "Cancellation Requested"),
      s.inactive || (s.retained ? "" : "Inactive"),
      s.retained ? "Yes" : "No"
    ]);

    const ws_retention = XLSX.utils.aoa_to_sheet([retentionHeaders, ...retentionRows]);
    ws_retention["!cols"] = [
      { wch: 15 }, // regno
      { wch: 15 }, // region
      { wch: 24 }, // combined_center
      { wch: 18 }, // cohort
      { wch: 15 }, // batch
      { wch: 22 }, // student_name
      { wch: 20 }, // defaulter_status
      { wch: 22 }, // Admission Cancellation
      { wch: 15 }, // Inactive
      { wch: 12 }  // Retention
    ];
    XLSX.utils.book_append_sheet(wb, ws_retention, "Retention Ledger");

    // =====================================
    // WORKSHEET 3: Results Ledger (Format #2)
    // =====================================
    const resultHeaders = [
      "center",
      "registration_number",
      "name_of_students",
      "batch",
      "class",
      "test_date",
      "test_name",
      "attendance",
      "sst",
      "urdu",
      "maths",
      "english",
      "science",
      "english_languageicse",
      "sst_icse",
      "total_marks",
      "subject_total_marks",
      "total_obtained",
      "sst_pct",
      "urdu_pct",
      "maths_pct",
      "english_pct",
      "science_pct"
    ];

    const resultRows = studentsList.map(s => {
      const attendanceVal = s.attendance || (s.t2_attendance === "Present" ? "Present" : "Absent");
      const isAbsent = attendanceVal.toLowerCase().includes("abs") || attendanceVal.toLowerCase().includes("no");
      
      const pMaths = s.maths_pct ?? s.t2_scores.maths ?? (isAbsent ? undefined : 76);
      const pScience = s.science_pct ?? s.t2_scores.chemistry ?? (isAbsent ? undefined : 82);
      const pEnglish = s.english_pct ?? s.t2_scores.physics ?? (isAbsent ? undefined : 70);
      const pSst = s.sst_pct ?? s.t1_scores.physics ?? (isAbsent ? undefined : 75);
      const pUrdu = s.urdu_pct ?? s.t1_scores.chemistry ?? (isAbsent ? undefined : 80);

      // Convert percentages to out-of-40 absolute score helper
      const calcAbs = (pct?: number) => pct !== undefined ? Math.round((pct / 100) * 40) : "";

      const sstAbs = calcAbs(pSst);
      const urduAbs = calcAbs(pUrdu);
      const mathsAbs = calcAbs(pMaths);
      const englishAbs = calcAbs(pEnglish);
      const scienceAbs = calcAbs(pScience);

      const totalObtained = isAbsent ? 0 : [sstAbs, urduAbs, mathsAbs, englishAbs, scienceAbs].reduce((sum: number, cur) => sum + (typeof cur === "number" ? cur : 0), 0);

      return [
        s.center,
        s.id,
        s.name,
        s.batch || "44-UP121ES",
        s.grade,
        s.test_date || "25 May, 2026",
        s.test_name || "Term II Subjective Test - 2",
        attendanceVal,
        sstAbs,
        urduAbs,
        mathsAbs,
        englishAbs,
        scienceAbs,
        "", // english_languageicse
        "", // sst_icse
        200, // total_marks
        40,  // subject_total_marks
        totalObtained,
        pSst !== undefined ? `${pSst}%` : "",
        pUrdu !== undefined ? `${pUrdu}%` : "",
        pMaths !== undefined ? `${pMaths}%` : "",
        pEnglish !== undefined ? `${pEnglish}%` : "",
        pScience !== undefined ? `${pScience}%` : ""
      ];
    });

    const ws_results = XLSX.utils.aoa_to_sheet([resultHeaders, ...resultRows]);
    ws_results["!cols"] = [
      { wch: 24 }, // center
      { wch: 15 }, // registration_number
      { wch: 22 }, // name_of_students
      { wch: 15 }, // batch
      { wch: 10 }, // class
      { wch: 15 }, // test_date
      { wch: 25 }, // test_name
      { wch: 15 }, // attendance
      { wch: 8 },  // sst
      { wch: 8 },  // urdu
      { wch: 8 },  // maths
      { wch: 8 },  // english
      { wch: 8 },  // science
      { wch: 15 }, // english_icse
      { wch: 10 }, // sst_icse
      { wch: 12 }, // total_marks
      { wch: 15 }, // subject_total_marks
      { wch: 15 }, // total_obtained
      { wch: 10 }, // sst_pct
      { wch: 10 }, // urdu_pct
      { wch: 10 }, // maths_pct
      { wch: 10 }, // english_pct
      { wch: 10 }  // science_pct
    ];
    XLSX.utils.book_append_sheet(wb, ws_results, "Results Ledger");

    // =====================================
    // WORKSHEET 4: Center Rankings & Scores (Computed dynamically based on active dataset)
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
    // WORKSHEET 5: Dashboard Scoring Logics (Exact mapping of the user's provided logic image)
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

/**
 * Downloads the active students in Format #1: Retention Ledger format.
 */
export function downloadRetentionXLSX(studentsList: Student[], fileName: string) {
  try {
    const wb = XLSX.utils.book_new();
    const retentionHeaders = [
      "regno",
      "region",
      "combined_center",
      "cohort",
      "batch",
      "student_name",
      "defaulter_status",
      "Admission Cancellation",
      "Inactive",
      "Retention"
    ];

    const retentionRows = studentsList.map(s => [
      s.id,
      s.region || (s.center.toLowerCase().includes("lucknow") ? "Uttar Pradesh" : "Rajasthan"),
      s.center,
      s.grade ? `${s.grade}th Foundation` : "10th Foundation",
      s.batch || "11-NF101EA",
      s.name,
      s.defaulter_status || (s.retained ? "Not Defaulter" : "2nd EMI Defaulter"),
      s.admission_cancellation || (s.retained ? "" : "Cancellation Requested"),
      s.inactive || (s.retained ? "" : "Inactive"),
      s.retained ? "Yes" : "No"
    ]);

    const ws_retention = XLSX.utils.aoa_to_sheet([retentionHeaders, ...retentionRows]);
    ws_retention["!cols"] = [
      { wch: 15 }, // regno
      { wch: 15 }, // region
      { wch: 24 }, // combined_center
      { wch: 18 }, // cohort
      { wch: 15 }, // batch
      { wch: 22 }, // student_name
      { wch: 20 }, // defaulter_status
      { wch: 22 }, // Admission Cancellation
      { wch: 15 }, // Inactive
      { wch: 12 }  // Retention
    ];
    XLSX.utils.book_append_sheet(wb, ws_retention, "Retention Ledger");
    XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
  } catch (err) {
    console.error("Retention XLSX write failed:", err);
  }
}

/**
 * Downloads the active students in Format #2: Results Marks format.
 */
export function downloadResultsXLSX(studentsList: Student[], fileName: string) {
  try {
    const wb = XLSX.utils.book_new();
    const resultHeaders = [
      "center",
      "registration_number",
      "name_of_students",
      "batch",
      "class",
      "test_date",
      "test_name",
      "attendance",
      "sst",
      "urdu",
      "maths",
      "english",
      "science",
      "english_languageicse",
      "sst_icse",
      "total_marks",
      "subject_total_marks",
      "total_obtained",
      "sst_pct",
      "urdu_pct",
      "maths_pct",
      "english_pct",
      "science_pct"
    ];

    const resultRows = studentsList.map(s => {
      const attendanceVal = s.attendance || (s.t2_attendance === "Present" ? "Present" : "Absent");
      const isAbsent = attendanceVal.toLowerCase().includes("abs") || attendanceVal.toLowerCase().includes("no");
      
      const pMaths = s.maths_pct ?? s.t2_scores.maths ?? (isAbsent ? undefined : 76);
      const pScience = s.science_pct ?? s.t2_scores.chemistry ?? (isAbsent ? undefined : 82);
      const pEnglish = s.english_pct ?? s.t2_scores.physics ?? (isAbsent ? undefined : 70);
      const pSst = s.sst_pct ?? s.t1_scores.physics ?? (isAbsent ? undefined : 75);
      const pUrdu = s.urdu_pct ?? s.t1_scores.chemistry ?? (isAbsent ? undefined : 80);

      const calcAbs = (pct?: number) => pct !== undefined ? Math.round((pct / 100) * 40) : "";

      const sstAbs = calcAbs(pSst);
      const urduAbs = calcAbs(pUrdu);
      const mathsAbs = calcAbs(pMaths);
      const englishAbs = calcAbs(pEnglish);
      const scienceAbs = calcAbs(pScience);

      const totalObtained = isAbsent ? 0 : [sstAbs, urduAbs, mathsAbs, englishAbs, scienceAbs].reduce((sum: number, cur) => sum + (typeof cur === "number" ? cur : 0), 0);

      return [
        s.center,
        s.id,
        s.name,
        s.batch || "44-UP121ES",
        s.grade,
        s.test_date || "25 May, 2026",
        s.test_name || "Term II Subjective Test - 2",
        attendanceVal,
        sstAbs,
        urduAbs,
        mathsAbs,
        englishAbs,
        scienceAbs,
        "", // english_languageicse
        "", // sst_icse
        200, // total_marks
        40,  // subject_total_marks
        totalObtained,
        pSst !== undefined ? `${pSst}%` : "",
        pUrdu !== undefined ? `${pUrdu}%` : "",
        pMaths !== undefined ? `${pMaths}%` : "",
        pEnglish !== undefined ? `${pEnglish}%` : "",
        pScience !== undefined ? `${pScience}%` : ""
      ];
    });

    const ws_results = XLSX.utils.aoa_to_sheet([resultHeaders, ...resultRows]);
    ws_results["!cols"] = [
      { wch: 24 }, // center
      { wch: 15 }, // registration_number
      { wch: 22 }, // name_of_students
      { wch: 15 }, // batch
      { wch: 10 }, // class
      { wch: 15 }, // test_date
      { wch: 25 }, // test_name
      { wch: 15 }, // attendance
      { wch: 8 },  // sst
      { wch: 8 },  // urdu
      { wch: 8 },  // maths
      { wch: 8 },  // english
      { wch: 8 },  // science
      { wch: 15 }, // english_icse
      { wch: 10 }, // sst_icse
      { wch: 12 }, // total_marks
      { wch: 15 }, // subject_total_marks
      { wch: 15 }, // total_obtained
      { wch: 10 }, // sst_pct
      { wch: 10 }, // urdu_pct
      { wch: 10 }, // maths_pct
      { wch: 10 }, // english_pct
      { wch: 10 }  // science_pct
    ];
    XLSX.utils.book_append_sheet(wb, ws_results, "Results Ledger");
    XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
  } catch (err) {
    console.error("Results XLSX write failed:", err);
  }
}

/**
 * Generates a fully formatted CSV representation of preset students in Retention Sheet format.
 */
export function generateRetentionCSVTemplateString(studentsList: Student[]): string {
  const retentionHeaders = [
    "regno",
    "region",
    "combined_center",
    "cohort",
    "batch",
    "student_name",
    "defaulter_status",
    "Admission Cancellation",
    "Inactive",
    "Retention"
  ];

  const lines = [retentionHeaders.join(",")];

  studentsList.forEach(s => {
    const row = [
      s.id,
      s.region || (s.center.toLowerCase().includes("lucknow") ? "Uttar Pradesh" : "Rajasthan"),
      `"${s.center.replace(/"/g, '""')}"`,
      s.grade ? `"${s.grade}th Foundation"` : `"10th Foundation"`,
      s.batch || "11-NF101EA",
      `"${s.name.replace(/"/g, '""')}"`,
      s.defaulter_status || (s.retained ? "Not Defaulter" : "2nd EMI Defaulter"),
      s.admission_cancellation || (s.retained ? "" : "Cancellation Requested"),
      s.inactive || (s.retained ? "" : "Inactive"),
      s.retained ? "Yes" : "No"
    ];
    lines.push(row.join(","));
  });

  return lines.join("\n");
}

/**
 * Generates a fully formatted CSV representation of preset students in Results Sheet format.
 */
export function generateResultsCSVTemplateString(studentsList: Student[]): string {
  const resultHeaders = [
    "center",
    "registration_number",
    "name_of_students",
    "batch",
    "class",
    "test_date",
    "test_name",
    "attendance",
    "sst",
    "urdu",
    "maths",
    "english",
    "science",
    "english_languageicse",
    "sst_icse",
    "total_marks",
    "subject_total_marks",
    "total_obtained",
    "sst_pct",
    "urdu_pct",
    "maths_pct",
    "english_pct",
    "science_pct"
  ];

  const lines = [resultHeaders.join(",")];

  studentsList.forEach(s => {
    const attendanceVal = s.attendance || (s.t2_attendance === "Present" ? "Present" : "Absent");
    const isAbsent = attendanceVal.toLowerCase().includes("abs") || attendanceVal.toLowerCase().includes("no");
    
    const pMaths = s.maths_pct ?? s.t2_scores.maths ?? (isAbsent ? undefined : 76);
    const pScience = s.science_pct ?? s.t2_scores.chemistry ?? (isAbsent ? undefined : 82);
    const pEnglish = s.english_pct ?? s.t2_scores.physics ?? (isAbsent ? undefined : 70);
    const pSst = s.sst_pct ?? s.t1_scores.physics ?? (isAbsent ? undefined : 75);
    const pUrdu = s.urdu_pct ?? s.t1_scores.chemistry ?? (isAbsent ? undefined : 80);

    const calcAbs = (pct?: number) => pct !== undefined ? Math.round((pct / 100) * 40) : "";

    const sstAbs = calcAbs(pSst);
    const urduAbs = calcAbs(pUrdu);
    const mathsAbs = calcAbs(pMaths);
    const englishAbs = calcAbs(pEnglish);
    const scienceAbs = calcAbs(pScience);

    const totalObtained = isAbsent ? 0 : [sstAbs, urduAbs, mathsAbs, englishAbs, scienceAbs].reduce((sum: number, cur) => sum + (typeof cur === "number" ? cur : 0), 0);

    const row = [
      `"${s.center.replace(/"/g, '""')}"`,
      s.id,
      `"${s.name.replace(/"/g, '""')}"`,
      s.batch || "44-UP121ES",
      s.grade,
      s.test_date || "25 May, 2026",
      s.test_name || "Term II Subjective Test - 2",
      attendanceVal,
      sstAbs,
      urduAbs,
      mathsAbs,
      englishAbs,
      scienceAbs,
      "", // english_languageicse
      "", // sst_icse
      200, // total_marks
      40,  // subject_total_marks
      totalObtained,
      pSst !== undefined ? `${pSst}%` : "",
      pUrdu !== undefined ? `${pUrdu}%` : "",
      pMaths !== undefined ? `${pMaths}%` : "",
      pEnglish !== undefined ? `${pEnglish}%` : "",
      pScience !== undefined ? `${pScience}%` : ""
    ];
    lines.push(row.join(","));
  });

  return lines.join("\n");
}

/**
 * Generates formatted CSV for Test Attendance template
 */
export function generateAttendanceCSVTemplateString(studentsList: Student[]): string {
  const headers = ["Student ID", "Student Name", "Test 1 Attendance (Present/Absent)", "Test 2 Attendance (Present/Absent)"];
  const lines = [headers.join(",")];
  studentsList.forEach(s => {
    const row = [
      s.id,
      `"${s.name.replace(/"/g, '""')}"`,
      s.t1_attendance,
      s.t2_attendance
    ];
    lines.push(row.join(","));
  });
  return lines.join("\n");
}

/**
 * Generates formatted CSV for IOQM Achievement template
 */
export function generateIoqmCSVTemplateString(studentsList: Student[]): string {
  const headers = ["Student ID", "Student Name", "Center Name", "IOQM Score (%)"];
  const lines = [headers.join(",")];
  studentsList.forEach(s => {
    const row = [
      s.id,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.center.replace(/"/g, '""')}"`,
      s.ioqm_score
    ];
    lines.push(row.join(","));
  });
  return lines.join("\n");
}

/**
 * Generates formatted CSV for Ramp Up Test template
 */
export function generateRampUpCSVTemplateString(studentsList: Student[]): string {
  const headers = ["Student ID", "Student Name", "Grade (9 or 10)", "Center Name", "Ramp Up Score (%)"];
  const lines = [headers.join(",")];
  studentsList.forEach(s => {
    const row = [
      s.id,
      `"${s.name.replace(/"/g, '""')}"`,
      s.grade,
      `"${s.center.replace(/"/g, '""')}"`,
      s.ramp_up_score !== undefined ? s.ramp_up_score : ""
    ];
    lines.push(row.join(","));
  });
  return lines.join("\n");
}

/**
 * Downloads Test Attendance XLSX Sheet
 */
export function downloadAttendanceXLSX(studentsList: Student[], fileName: string) {
  try {
    const wb = XLSX.utils.book_new();
    const headers = ["Student ID", "Student Name", "Test 1 Attendance (Present/Absent)", "Test 2 Attendance (Present/Absent)"];
    const rows = studentsList.map(s => [
      s.id,
      s.name,
      s.t1_attendance,
      s.t2_attendance
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 15 }, { wch: 22 }, { wch: 25 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Ledger");
    XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
  } catch (err) {
    console.error("Attendance XLSX write failed:", err);
  }
}

/**
 * Downloads IOQM XLSX Sheet
 */
export function downloadIoqmXLSX(studentsList: Student[], fileName: string) {
  try {
    const wb = XLSX.utils.book_new();
    const headers = ["Student ID", "Student Name", "Center Name", "IOQM Score (%)"];
    const rows = studentsList.map(s => [
      s.id,
      s.name,
      s.center,
      s.ioqm_score
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 15 }, { wch: 22 }, { wch: 24 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, "IOQM Achievement");
    XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
  } catch (err) {
    console.error("IOQM XLSX write failed:", err);
  }
}

/**
 * Downloads Ramp Up XLSX Sheet
 */
export function downloadRampUpXLSX(studentsList: Student[], fileName: string) {
  try {
    const wb = XLSX.utils.book_new();
    const headers = ["Student ID", "Student Name", "Grade (9 or 10)", "Center Name", "Ramp Up Score (%)"];
    const rows = studentsList.map(s => [
      s.id,
      s.name,
      s.grade,
      s.center,
      s.ramp_up_score !== undefined ? s.ramp_up_score : ""
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 15 }, { wch: 22 }, { wch: 15 }, { wch: 24 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Ramp Up Scores");
    XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
  } catch (err) {
    console.error("Ramp Up XLSX write failed:", err);
  }
}
