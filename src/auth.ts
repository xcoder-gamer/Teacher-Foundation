import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { Student, SubjectScores } from "./types";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/spreadsheets.readonly");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Google Sign-In with popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to retrieve access token from Google Sign-In.");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Logout
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Extract spreadsheet ID from diverse URL formats or raw ID input
export function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return urlOrId.trim();
}

// Fetch raw sheet values via Google API
export async function fetchSpreadsheetValues(
  spreadsheetId: string,
  rangeOrSheetName: string = "Sheet1!A:Z",
  accessToken: string
): Promise<any[][] | null> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error("Invalid Spreadsheet URL or ID");

  // Encode range
  const encodedRange = encodeURIComponent(rangeOrSheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodedRange}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google API returned status ${res.status}`);
  }

  const data = await res.json();
  return data.values || null;
}

// Map column header text to recognized student properties
function sanitizeHeader(h: string): string {
  return (h || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // strip space, underscore, symbols, brackets
}

export function parseGoogleSheetRows(rows: any[][]): Student[] {
  if (!rows || rows.length < 2) {
    throw new Error("Empty spreadsheet or sufficient header row missing.");
  }

  const rawHeaders = rows[0].map(h => String(h || "").trim());
  const sanitizedHeaders = rawHeaders.map(sanitizeHeader);

  // Identify column roles
  const colIndex = {
    id: sanitizedHeaders.findIndex(h => ["id", "regno", "registrationnumber", "studentid", "rollno", "rollnumber"].includes(h) || h === "id" || h.includes("studentid") || h.includes("registrationnumber") || h.includes("rollnumber") || h.includes("rollno")),
    name: sanitizedHeaders.findIndex(h => ["name", "studentname", "student"].includes(h) || h.includes("studentname") || h.includes("name")),
    grade: sanitizedHeaders.findIndex(h => ["grade", "class", "division", "standard"].includes(h) || h.includes("grade") || h.includes("class")),
    center: sanitizedHeaders.findIndex(h => ["center", "centername", "branch"].includes(h) || h.includes("center")),
    t1_attendance: sanitizedHeaders.findIndex(h => ["t1attendance", "test1attendance", "t1present", "t1status"].includes(h) || h.includes("t1attendance") || h.includes("test1attendance") || (h.includes("attendance") && (h.includes("t1") || h.includes("1")))),
    t2_attendance: sanitizedHeaders.findIndex(h => ["t2attendance", "test2attendance", "t2present", "t2status"].includes(h) || h.includes("t2attendance") || h.includes("test2attendance") || (h.includes("attendance") && (h.includes("t2") || h.includes("2")))),
    t1_physics: sanitizedHeaders.findIndex(h => ["t1physics", "test1physics", "t1phy", "physics1", "physicist1"].includes(h) || (h.includes("physics") && (h.includes("t1") || h.includes("test1") || h.includes("1")))),
    t1_chemistry: sanitizedHeaders.findIndex(h => ["t1chemistry", "test1chemistry", "t1chem", "chemistry1"].includes(h) || (h.includes("chemistry") && (h.includes("t1") || h.includes("test1") || h.includes("1")))),
    t1_maths: sanitizedHeaders.findIndex(h => ["t1maths", "t1math", "test1math", "test1maths", "math1", "maths1"].includes(h) || ((h.includes("maths") || h.includes("math")) && (h.includes("t1") || h.includes("test1") || h.includes("1")))),
    t2_physics: sanitizedHeaders.findIndex(h => ["t2physics", "test2physics", "t2phy", "physics2", "physicist2"].includes(h) || (h.includes("physics") && (h.includes("t2") || h.includes("test2") || h.includes("2")))),
    t2_chemistry: sanitizedHeaders.findIndex(h => ["t2chemistry", "test2chemistry", "t2chem", "chemistry2"].includes(h) || (h.includes("chemistry") && (h.includes("t2") || h.includes("test2") || h.includes("2")))),
    t2_maths: sanitizedHeaders.findIndex(h => ["t2maths", "t2math", "test2math", "test2maths", "math2", "maths2"].includes(h) || ((h.includes("maths") || h.includes("math")) && (h.includes("t2") || h.includes("test2") || h.includes("2")))),
    ioqm_score: sanitizedHeaders.findIndex(h => ["ioqm", "ioqmscore", "ioqmachievement", "olympiad"].includes(h) || h.includes("ioqm") || h.includes("olympiad")),
    ramp_up_score: sanitizedHeaders.findIndex(h => ["rampup", "rampupscore", "rampup exam"].includes(h) || h.includes("rampup")),
    retained: sanitizedHeaders.findIndex(h => ["retained", "isretained", "retention", "activestatus", "retainsstatus"].includes(h) || h.includes("retained") || h.includes("retention"))
  };

  // Helper parser for numbers
  const parsePercent = (val: any): number | undefined => {
    if (val === undefined || val === null || String(val).trim() === "") return undefined;
    const clean = String(val).replace(/[^0-9.-]/g, "");
    if (clean === "") return undefined;
    const num = parseFloat(clean);
    return isNaN(num) ? undefined : num;
  };

  // Helper parser for attendance
  const parseAttendance = (val: any): "Present" | "Absent" => {
    const str = String(val || "").trim().toLowerCase();
    if (["present", "p", "yes", "y", "1", "present status", "true"].includes(str)) return "Present";
    return "Absent";
  };

  // Helper parser for retention flag
  const parseRetained = (val: any): boolean => {
    const str = String(val || "").trim().toLowerCase();
    if (["retained", "true", "yes", "y", "1"].includes(str)) return true;
    if (["dropped", "false", "no", "n", "0"].includes(str)) return false;
    // Default fallback is true
    return true;
  };

  // Helper parser for grade
  const parseGrade = (val: any): "9" | "10" | "11" | "12" => {
    const str = String(val || "").trim();
    if (["9", "10", "11", "12"].includes(str)) {
      return str as "9" | "10" | "11" | "12";
    }
    // Default to a realistic standard
    return "10";
  };

  const studentsList: Student[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || !row.some(val => val !== "")) continue; // skip blank rows

    // Safe cell extractor
    const cellValue = (idx: number): string => {
      if (idx < 0 || idx >= row.length) return "";
      return String(row[idx] || "").trim();
    };

    const id = cellValue(colIndex.id) || `PW-IMPORTED-${1000 + i}`;
    const name = cellValue(colIndex.name) || `Student ${i}`;
    const grade = parseGrade(cellValue(colIndex.grade));
    const center = cellValue(colIndex.center) || "Imported Center";
    const t1_attendance = parseAttendance(cellValue(colIndex.t1_attendance));
    const t2_attendance = parseAttendance(cellValue(colIndex.t2_attendance));

    // Construct scores safely
    const t1_scores: SubjectScores = {};
    if (t1_attendance === "Present") {
      const p = parsePercent(cellValue(colIndex.t1_physics));
      const c = parsePercent(cellValue(colIndex.t1_chemistry));
      const m = parsePercent(cellValue(colIndex.t1_maths));
      if (p !== undefined) t1_scores.physics = p;
      if (c !== undefined) t1_scores.chemistry = c;
      if (m !== undefined) t1_scores.maths = m;
    }

    const t2_scores: SubjectScores = {};
    if (t2_attendance === "Present") {
      const p = parsePercent(cellValue(colIndex.t2_physics));
      const c = parsePercent(cellValue(colIndex.t2_chemistry));
      const m = parsePercent(cellValue(colIndex.t2_maths));
      if (p !== undefined) t2_scores.physics = p;
      if (c !== undefined) t2_scores.chemistry = c;
      if (m !== undefined) t2_scores.maths = m;
    }

    const ioqm_score = parsePercent(cellValue(colIndex.ioqm_score)) ?? 0;
    const ramp_up_score = parsePercent(cellValue(colIndex.ramp_up_score));
    const retained = parseRetained(cellValue(colIndex.retained));

    studentsList.push({
      id,
      name,
      grade,
      center,
      t1_attendance,
      t2_attendance,
      t1_scores,
      t2_scores,
      ioqm_score,
      ramp_up_score,
      retained
    });
  }

  return studentsList;
}

// Generates a fully formatted CSV representation of preset students for the user to copy/paste directly to Google Sheets!
export function generateCSVTemplateString(students: Student[]): string {
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

  const lines = [headers.join(",")];

  students.forEach(s => {
    const row = [
      s.id,
      `"${s.name.replace(/"/g, '""')}"`,
      s.grade,
      `"${s.center.replace(/"/g, '""')}"`,
      s.t1_attendance,
      s.t2_attendance,
      s.t1_scores.physics ?? "",
      s.t1_scores.chemistry ?? "",
      s.t1_scores.maths ?? "",
      s.t2_scores.physics ?? "",
      s.t2_scores.chemistry ?? "",
      s.t2_scores.maths ?? "",
      s.ioqm_score,
      s.ramp_up_score ?? "",
      s.retained ? "Yes" : "No"
    ];
    lines.push(row.join(","));
  });

  return lines.join("\n");
}
