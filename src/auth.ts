import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import defaultFirebaseConfig from "../firebase-applet-config.json";
import { Student, SubjectScores } from "./types";

// Load custom firebase configurations if configured by the user
const getActiveFirebaseConfig = () => {
  try {
    const saved = localStorage.getItem("custom_firebase_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not read custom Firebase config from localStorage", e);
  }
  return defaultFirebaseConfig;
};

export const activeFirebaseConfig = getActiveFirebaseConfig();

// Initialize Firebase App
const app = initializeApp(activeFirebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, activeFirebaseConfig.firestoreDatabaseId);

const provider = new GoogleAuthProvider();

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

// Map column header text to recognized student properties
function sanitizeHeader(h: string): string {
  return (h || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // strip space, underscore, symbols, brackets
}

export function parseSpreadsheetRowsToStudents(
  rows: any[][],
  existingStudents: Student[] = [],
  matrixType?: "all" | "retention" | "subjective" | "attendance" | "ioqm" | "rampup"
): Student[] {
  if (!rows || rows.length < 2) {
    throw new Error("Empty spreadsheet or sufficient header row missing.");
  }

  const rawHeaders = rows[0].map(h => String(h || "").trim());
  const sanitizedHeaders = rawHeaders.map(sanitizeHeader);

  // Identify column roles including custom result and retention indicators
  const colIndex = {
    id: sanitizedHeaders.findIndex(h => ["id", "regno", "registrationnumber", "studentid", "rollno", "rollnumber"].includes(h) || h === "id" || h.includes("studentid") || h.includes("registrationnumber") || h.includes("rollnumber") || h.includes("rollno") || h.includes("regno")),
    name: sanitizedHeaders.findIndex(h => ["name", "studentname", "student", "nameofstudents", "nameofstudent"].includes(h) || h.includes("studentname") || h.includes("name") || h.includes("nameofstudent")),
    grade: sanitizedHeaders.findIndex(h => ["grade", "class", "division", "standard", "cohort", "grade9or10"].includes(h) || h.includes("grade") || h.includes("class") || h.includes("cohort")),
    center: sanitizedHeaders.findIndex(h => ["center", "centername", "branch", "centrename"].includes(h) || (h.includes("center") && !h.includes("combined"))),
    combined_center: sanitizedHeaders.findIndex(h => ["combinedcenter", "combined_center", "combined_centre", "combcenter"].includes(h) || h.includes("combined")),
    
    // extra details columns
    region: sanitizedHeaders.findIndex(h => ["region", "state", "zone"].includes(h) || h === "region" || h.includes("region")),
    batch: sanitizedHeaders.findIndex(h => ["batch", "section", "batchname"].includes(h) || h === "batch" || h.includes("batch")),

    // retention specific columns
    defaulter_status: sanitizedHeaders.findIndex(h => ["defaulterstatus", "defaulter", "defaulter_status"].includes(h) || h.includes("defaulter")),
    admission_cancellation: sanitizedHeaders.findIndex(h => ["admissioncancellation", "cancellation", "cancel", "admission_cancellation"].includes(h) || h.includes("cancellation")),
    inactive: sanitizedHeaders.findIndex(h => h === "inactive" || h.includes("inactive")),
    retention: sanitizedHeaders.findIndex(h => ["retained", "isretained", "retention", "activestatus"].includes(h) || h.includes("retained") || h.includes("retention")),

    // result specific columns
    test_no: sanitizedHeaders.findIndex(h => ["testno", "test_no", "testnumber"].includes(h) || h === "testno" || h.includes("testno") || h.includes("test_no")),
    test_name: sanitizedHeaders.findIndex(h => ["testname", "test", "examname", "test_name"].includes(h) || h.includes("testname") || h.includes("test_name")),
    test_date: sanitizedHeaders.findIndex(h => ["testdate", "date", "test_date"].includes(h) || h.includes("date") || h.includes("test_date")),
    attendance: sanitizedHeaders.findIndex(h => ["attendance", "present", "attstatus", "testattendance", "testattndance"].includes(h) || h.includes("attendance") || h.includes("attndance")),
    test_attendance: sanitizedHeaders.findIndex(h => ["testattendance", "testattndance"].includes(h) || h.includes("attendance") || h.includes("attndance")),
    total_subject: sanitizedHeaders.findIndex(h => ["totalsubject", "totalsub"].includes(h) || h.includes("totalsubject")),
    maths_pct: sanitizedHeaders.findIndex(h => ["mathspct", "mathpct", "maths", "maths_pct"].includes(h) || h.includes("maths")),
    science_pct: sanitizedHeaders.findIndex(h => ["sciencepct", "science", "sci", "science_pct"].includes(h) || h.includes("science") || h === "sci"),
    english_pct: sanitizedHeaders.findIndex(h => ["englishpct", "english", "eng", "english_pct"].includes(h) || h.includes("english")),
    sst_pct: sanitizedHeaders.findIndex(h => ["sstpct", "sst", "sst_pct"].includes(h) || h.includes("sst")),
    urdu_pct: sanitizedHeaders.findIndex(h => ["urdupct", "urdu", "urdu_pct"].includes(h) || h.includes("urdu")),

    // standard templates columns
    t1_attendance: sanitizedHeaders.findIndex(h => ["t1attendance", "test1attendance", "t1present", "t1status"].includes(h) || h.includes("t1attendance") || h.includes("test1attendance") || (h.includes("attendance") && (h.includes("t1") || h.includes("1")))),
    t2_attendance: sanitizedHeaders.findIndex(h => ["t2attendance", "test2attendance", "t2present", "t2status"].includes(h) || h.includes("t2attendance") || h.includes("test2attendance") || (h.includes("attendance") && (h.includes("t2") || h.includes("2")))),
    t1_physics: sanitizedHeaders.findIndex(h => ["t1physics", "test1physics", "t1phy", "physics1", "physicist1"].includes(h) || (h.includes("physics") && (h.includes("t1") || h.includes("test1") || h.includes("1")))),
    t1_chemistry: sanitizedHeaders.findIndex(h => ["t1chemistry", "test1chemistry", "t1chem", "chemistry1"].includes(h) || (h.includes("chemistry") && (h.includes("t1") || h.includes("test1") || h.includes("1")))),
    t1_maths: sanitizedHeaders.findIndex(h => ["t1maths", "t1math", "test1math", "test1maths", "math1", "maths1"].includes(h) || ((h.includes("maths") || h.includes("math")) && (h.includes("t1") || h.includes("test1") || h.includes("1")))),
    t2_physics: sanitizedHeaders.findIndex(h => ["t2physics", "test2physics", "t2phy", "physics2", "physicist2"].includes(h) || (h.includes("physics") && (h.includes("t2") || h.includes("test2") || h.includes("2")))),
    t2_chemistry: sanitizedHeaders.findIndex(h => ["t2chemistry", "test2chemistry", "t2chem", "chemistry2"].includes(h) || (h.includes("chemistry") && (h.includes("t2") || h.includes("test2") || h.includes("2")))),
    t2_maths: sanitizedHeaders.findIndex(h => ["t2maths", "t2math", "test2math", "test2maths", "math2", "maths2"].includes(h) || ((h.includes("maths") || h.includes("math")) && (h.includes("t2") || h.includes("test2") || h.includes("2")))),
    ioqm_score: sanitizedHeaders.findIndex(h => ["ioqm", "ioqmscore", "ioqmachievement", "olympiad"].includes(h) || h.includes("ioqm") || h.includes("olympiad")),
    ramp_up_score: sanitizedHeaders.findIndex(h => ["rampup", "rampupscore", "rampup_score", "rampup exam"].includes(h) || h.includes("rampup")),
    retained: sanitizedHeaders.findIndex(h => ["retained", "isretained", "retention", "activestatus", "retainsstatus"].includes(h) || h.includes("retained") || h.includes("retention")),
    total_marks: sanitizedHeaders.findIndex(h => ["totalmarks", "total_marks", "maxmarks", "maximummarks", "total_obt"].includes(h) || h.includes("totalmarks") || h.includes("maxmarks") || h === "total_marks"),
    subject_total_marks: sanitizedHeaders.findIndex(h => ["subjecttotalmarks", "subject_total_marks", "subjectmaxmarks", "subject_max_marks", "subjecttotal"].includes(h) || h.includes("subjecttotal") || h.includes("subjectmax") || h === "subject_total_marks")
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
    return true;
  };

  // Helper parser for grade
  const parseGrade = (val: any): "9" | "10" | "11" | "12" => {
    const str = String(val || "").trim();
    if (["9", "10", "11", "12"].includes(str)) {
      return str as "9" | "10" | "11" | "12";
    }
    return "10";
  };

  // Safe cell extractor
  const getCellValue = (row: any[], idx: number): string => {
    if (idx < 0 || idx >= row.length) return "";
    return String(row[idx] || "").trim();
  };

  // Detect sheet schema style dynamically or enforce selection
  const activeMatrix = matrixType || "all";
  const isRetentionSheet = activeMatrix === "retention" || (activeMatrix === "all" && (colIndex.defaulter_status >= 0 || colIndex.inactive >= 0 || colIndex.admission_cancellation >= 0));
  const isResultSheet = activeMatrix === "subjective" || (activeMatrix === "all" && colIndex.test_name >= 0 && (colIndex.maths_pct >= 0 || colIndex.science_pct >= 0 || colIndex.english_pct >= 0 || colIndex.attendance >= 0));

  // --- CASE 1: Retention spreadsheet updates ---
  if (isRetentionSheet) {
    const mergedMap = new Map<string, Student>();
    // Pre-seed matching maps with database snapshots to allow lossless updates
    existingStudents.forEach(s => {
      mergedMap.set(s.id.toLowerCase(), { ...s });
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || !row.some(val => val !== "")) continue;

      const id = getCellValue(row, colIndex.id) || `PW-IMPORTED-${1000 + i}`;
      const name = getCellValue(row, colIndex.name) || `Student ${i}`;
      
      const cohortStr = getCellValue(row, colIndex.grade);
      let grade: "9" | "10" | "11" | "12" = "10";
      if (cohortStr.includes("9") || cohortStr.toLowerCase().includes("9th")) grade = "9";
      else if (cohortStr.includes("11") || cohortStr.toLowerCase().includes("11th")) grade = "11";
      else if (cohortStr.includes("12") || cohortStr.toLowerCase().includes("12th")) grade = "12";
      else if (cohortStr.includes("10") || cohortStr.toLowerCase().includes("10th")) grade = "10";

      const center = getCellValue(row, colIndex.center) || "Imported Center";

      // Compute Retention based on: not defaulter + no cancellation + no refund + no inactive
      const defStatus = getCellValue(row, colIndex.defaulter_status).toLowerCase();
      const admCancel = getCellValue(row, colIndex.admission_cancellation).toLowerCase();
      const inactiveVal = getCellValue(row, colIndex.inactive).toLowerCase();
      const retVal = getCellValue(row, colIndex.retention).toLowerCase();

      let isRetained = true;
      if (retVal === "no" || retVal === "false" || retVal === "0") {
        isRetained = false;
      } else {
        const isDefaulter = defStatus.includes("defaulter") && !defStatus.includes("not");
        const hasCancel = admCancel !== "" && admCancel !== "no" && admCancel !== "none" && !admCancel.includes("not");
        const isInactive = inactiveVal !== "" && inactiveVal !== "no" && inactiveVal !== "none" && !inactiveVal.includes("not");

        if (isDefaulter || hasCancel || isInactive) {
          isRetained = false;
        }
      }

      const key = id.toLowerCase();
      const regValue = getCellValue(row, colIndex.region) || "Rajasthan";
      const combCenterValue = getCellValue(row, colIndex.combined_center) || (center.includes("Combined") ? center : (center + " Combined"));
      const batValue = getCellValue(row, colIndex.batch) || "11-NF101EA";
      const defStatusVal = getCellValue(row, colIndex.defaulter_status) || "Not Defaulter";
      const admCancelVal = getCellValue(row, colIndex.admission_cancellation);
      const inactiveStatusVal = getCellValue(row, colIndex.inactive);

      if (mergedMap.has(key)) {
        const existingStudent = mergedMap.get(key)!;
        existingStudent.name = name;
        existingStudent.center = center;
        existingStudent.grade = grade;
        existingStudent.retained = isRetained;
        existingStudent.region = regValue;
        existingStudent.combined_center = combCenterValue;
        existingStudent.batch = batValue;
        existingStudent.defaulter_status = defStatusVal;
        existingStudent.admission_cancellation = admCancelVal;
        existingStudent.inactive = inactiveStatusVal;
      } else {
        mergedMap.set(key, {
          id,
          name,
          grade,
          center,
          t1_scores: {},
          t2_scores: {},
          retained: isRetained,
          region: regValue,
          combined_center: combCenterValue,
          batch: batValue,
          defaulter_status: defStatusVal,
          admission_cancellation: admCancelVal,
          inactive: inactiveStatusVal
        });
      }
    }
    return Array.from(mergedMap.values());
  }

  // --- CASE 2: Result details spreadsheet updates ---
  if (isResultSheet) {
    const mergedMap = new Map<string, Student>();
    existingStudents.forEach(s => {
      mergedMap.set(s.id.toLowerCase(), { ...s });
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || !row.some(val => val !== "")) continue;

      const id = getCellValue(row, colIndex.id) || `PW-IMPORTED-${1000 + i}`;
      const name = getCellValue(row, colIndex.name) || `Student ${i}`;
      
      const classStr = getCellValue(row, colIndex.grade);
      let grade: "9" | "10" | "11" | "12" = "10";
      if (classStr.includes("9") || classStr.toLowerCase().includes("9th")) grade = "9";
      else if (classStr.includes("11") || classStr.toLowerCase().includes("11th")) grade = "11";
      else if (classStr.includes("12") || classStr.toLowerCase().includes("12th")) grade = "12";
      else if (classStr.includes("8") || classStr.toLowerCase().includes("8th")) grade = "9";
      else grade = "10";

      const center = getCellValue(row, colIndex.center) || "Imported Center";

      const testName = getCellValue(row, colIndex.test_name);
      const testNameLower = testName.toLowerCase();
      
      // Determine if Test 2 (T2) or Test 1 (T1) based on standard terms and substrings
      const isT2 = testNameLower.includes("test 2") || 
                   testNameLower.includes("test -2") || 
                   testNameLower.includes("test-2") || 
                   testNameLower.includes("term 2") || 
                   testNameLower.includes("term ii") || 
                   testNameLower.includes("test ii") || 
                   testNameLower.includes("t2") || 
                   testNameLower.includes("half") || 
                   (testNameLower.includes("2") && !testNameLower.includes("term 1") && !testNameLower.includes("term i"));

      // Attendance check
      const attStr = getCellValue(row, colIndex.attendance).toLowerCase();
      const isAbsent = attStr.includes("absent") || attStr.includes("rescheduled") || attStr.includes("no test");
      const attendanceStatus = isAbsent ? "Absent" : "Present";

      // Percentage and absolute metrics extraction
      const mathsScore = parsePercent(getCellValue(row, colIndex.maths_pct));
      const scienceScore = parsePercent(getCellValue(row, colIndex.science_pct));
      const englishScore = parsePercent(getCellValue(row, colIndex.english_pct));
      const sstScore = parsePercent(getCellValue(row, colIndex.sst_pct));
      const urduScore = parsePercent(getCellValue(row, colIndex.urdu_pct));

      // Build balanced subject allocations
      const hasAnyScore = scienceScore !== undefined || englishScore !== undefined || sstScore !== undefined || mathsScore !== undefined || urduScore !== undefined;
      const physicsVal = hasAnyScore ? (scienceScore ?? englishScore ?? sstScore ?? 75) : undefined;
      const chemistryVal = hasAnyScore ? (scienceScore ?? urduScore ?? sstScore ?? 75) : undefined;
      const mathsVal = hasAnyScore ? (mathsScore ?? scienceScore ?? 75) : undefined;

      const key = id.toLowerCase();
      if (!mergedMap.has(key)) {
        mergedMap.set(key, {
          id,
          name,
          grade,
          center,
          t1_attendance: "Absent",
          t2_attendance: "Absent",
          t1_scores: {},
          t2_scores: {},
          retained: true
        });
      }

      const stud = mergedMap.get(key)!;
      stud.name = name;
      stud.center = center;
      stud.grade = grade;
      
      const regValue = getCellValue(row, colIndex.region);
      if (regValue) stud.region = regValue;
      const combCenterValue = getCellValue(row, colIndex.combined_center);
      if (combCenterValue) stud.combined_center = combCenterValue;
      
      // Save original values
      stud.batch = getCellValue(row, colIndex.batch) || "44-UP121ES";
      stud.test_date = getCellValue(row, colIndex.test_date) || "25 May, 2026";
      stud.test_name = testName;
      stud.test_no = colIndex.test_no >= 0 ? getCellValue(row, colIndex.test_no) : "Test 1";
      stud.attendance = getCellValue(row, colIndex.attendance) || (attendanceStatus === "Present" ? "Present" : "Absent");
      stud.sst_pct = sstScore ?? physicsVal;
      stud.urdu_pct = urduScore ?? chemistryVal;
      stud.maths_pct = mathsScore ?? mathsVal;
      stud.english_pct = englishScore ?? scienceScore ?? (hasAnyScore ? 75 : undefined);
      stud.science_pct = scienceScore ?? physicsVal;

      // Detect test count based on total_marks and subject_total_marks
      const totalMarksVal = colIndex.total_marks >= 0 ? parsePercent(getCellValue(row, colIndex.total_marks)) : undefined;
      const subjTotalMarksVal = colIndex.subject_total_marks >= 0 ? parsePercent(getCellValue(row, colIndex.subject_total_marks)) : undefined;
      let testCount = 2; // Default to 2
      if (totalMarksVal !== undefined && subjTotalMarksVal !== undefined && totalMarksVal > 0) {
        if (Math.abs(totalMarksVal - subjTotalMarksVal) < 0.1) {
          testCount = 1;
        } else if (totalMarksVal / subjTotalMarksVal >= 1.5) {
          testCount = 2;
        }
      }

      stud.test_count = testCount;

      if (testCount === 1) {
        stud.t1_attendance = attendanceStatus;
        stud.t2_attendance = "Absent";
        if (attendanceStatus === "Present") {
          stud.t1_scores = {};
          if (physicsVal !== undefined) stud.t1_scores.physics = physicsVal;
          if (chemistryVal !== undefined) stud.t1_scores.chemistry = chemistryVal;
          if (mathsVal !== undefined) stud.t1_scores.maths = mathsVal;
          stud.t2_scores = {};
        } else {
          stud.t1_scores = {};
          stud.t2_scores = {};
        }
      } else {
        if (isT2) {
          stud.t2_attendance = attendanceStatus;
          if (attendanceStatus === "Present") {
            stud.t2_scores = {};
            if (physicsVal !== undefined) stud.t2_scores.physics = physicsVal;
            if (chemistryVal !== undefined) stud.t2_scores.chemistry = chemistryVal;
            if (mathsVal !== undefined) stud.t2_scores.maths = mathsVal;
          } else {
            stud.t2_scores = {};
          }
        } else {
          stud.t1_attendance = attendanceStatus;
          if (attendanceStatus === "Present") {
            stud.t1_scores = {};
            if (physicsVal !== undefined) stud.t1_scores.physics = physicsVal;
            if (chemistryVal !== undefined) stud.t1_scores.chemistry = chemistryVal;
            if (mathsVal !== undefined) stud.t1_scores.maths = mathsVal;
          } else {
            stud.t1_scores = {};
          }
        }
      }
    }

    return Array.from(mergedMap.values());
  }

  // --- CASE 4: Test Attendance specific updates ---
  if (activeMatrix === "attendance") {
    const mergedMap = new Map<string, Student>();
    existingStudents.forEach(s => {
      mergedMap.set(s.id.toLowerCase(), { ...s });
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || !row.some(val => val !== "")) continue;

      const id = getCellValue(row, colIndex.id);
      if (!id) continue;
      const key = id.toLowerCase();

      const t1Att = colIndex.t1_attendance >= 0 ? parseAttendance(getCellValue(row, colIndex.t1_attendance)) : undefined;
      const t2Att = colIndex.t2_attendance >= 0 ? parseAttendance(getCellValue(row, colIndex.t2_attendance)) : undefined;
      const genAtt = colIndex.attendance >= 0 ? parseAttendance(getCellValue(row, colIndex.attendance)) : undefined;

      // Extract ratio-based attendance (e.g., 2/4 means Present, 0/4 means Absent)
      let parsedAttendanceStatus: "Present" | "Absent" | undefined = undefined;
      
      const testAttVal = colIndex.test_attendance >= 0 ? getCellValue(row, colIndex.test_attendance) : "";
      if (testAttVal !== "") {
        const valNum = parseFloat(testAttVal.replace(/[^0-9.-]/g, ""));
        if (!isNaN(valNum)) {
          parsedAttendanceStatus = valNum > 0 ? "Present" : "Absent";
        }
      }
      
      const totalSubVal = colIndex.total_subject >= 0 ? getCellValue(row, colIndex.total_subject) : "";
      if (totalSubVal !== "" && parsedAttendanceStatus === undefined) {
        if (totalSubVal.includes("/")) {
          const numSg = parseInt(totalSubVal.split("/")[0]);
          if (!isNaN(numSg)) {
            parsedAttendanceStatus = numSg > 0 ? "Present" : "Absent";
          }
        } else {
          const numSg = parseInt(totalSubVal);
          if (!isNaN(numSg)) {
            parsedAttendanceStatus = numSg > 0 ? "Present" : "Absent";
          }
        }
      }

      const finalStatus = parsedAttendanceStatus ?? genAtt;
      const tNo = colIndex.test_no >= 0 ? getCellValue(row, colIndex.test_no).toLowerCase() : "";
      const isT2 = tNo.includes("2") || tNo.includes("ii") || tNo.includes("t2");

      if (mergedMap.has(key)) {
        const stud = mergedMap.get(key)!;
        if (t1Att !== undefined) stud.t1_attendance = t1Att;
        if (t2Att !== undefined) stud.t2_attendance = t2Att;
        if (finalStatus !== undefined) {
          if (isT2) {
            stud.t2_attendance = finalStatus;
          } else {
            stud.t1_attendance = finalStatus;
          }
        }
      } else {
        const name = getCellValue(row, colIndex.name) || `Student ${i}`;
        const center = getCellValue(row, colIndex.center) || "Imported Center";
        const grade = parseGrade(getCellValue(row, colIndex.grade));
        
        const finalT1 = !isT2 ? (finalStatus ?? t1Att ?? "Present") : (t1Att ?? "Present");
        const finalT2 = isT2 ? (finalStatus ?? t2Att ?? "Present") : (t2Att ?? "Present");

        mergedMap.set(key, {
          id,
          name,
          grade,
          center,
          t1_attendance: finalT1,
          t2_attendance: finalT2,
          t1_scores: {},
          t2_scores: {},
          retained: true
        });
      }
    }
    return Array.from(mergedMap.values());
  }

  // --- CASE 5: IOQM Achievement Score updates ---
  if (activeMatrix === "ioqm") {
    const mergedMap = new Map<string, Student>();
    existingStudents.forEach(s => {
      mergedMap.set(s.id.toLowerCase(), { ...s });
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || !row.some(val => val !== "")) continue;

      const id = getCellValue(row, colIndex.id);
      if (!id) continue;
      const key = id.toLowerCase();

      const ioqmVal = parsePercent(getCellValue(row, colIndex.ioqm_score));

      if (mergedMap.has(key)) {
        if (ioqmVal !== undefined) {
          mergedMap.get(key)!.ioqm_score = ioqmVal;
        }
      } else {
        const name = getCellValue(row, colIndex.name) || `Student ${i}`;
        const center = getCellValue(row, colIndex.center) || "Imported Center";
        const grade = parseGrade(getCellValue(row, colIndex.grade));
        mergedMap.set(key, {
          id,
          name,
          grade,
          center,
          t1_scores: {},
          t2_scores: {},
          ioqm_score: ioqmVal ?? 0,
          retained: true
        });
      }
    }
    return Array.from(mergedMap.values());
  }

  // --- CASE 6: Ramp Up Test Score updates ---
  if (activeMatrix === "rampup") {
    const mergedMap = new Map<string, Student>();
    existingStudents.forEach(s => {
      mergedMap.set(s.id.toLowerCase(), { ...s });
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || !row.some(val => val !== "")) continue;

      const id = getCellValue(row, colIndex.id);
      if (!id) continue;
      const key = id.toLowerCase();

      const rampUpVal = parsePercent(getCellValue(row, colIndex.ramp_up_score));

      if (mergedMap.has(key)) {
        if (rampUpVal !== undefined) {
          mergedMap.get(key)!.ramp_up_score = rampUpVal;
        }
      } else {
        const name = getCellValue(row, colIndex.name) || `Student ${i}`;
        const center = getCellValue(row, colIndex.center) || "Imported Center";
        const grade = parseGrade(getCellValue(row, colIndex.grade));
        mergedMap.set(key, {
          id,
          name,
          grade,
          center,
          t1_scores: {},
          t2_scores: {},
          ramp_up_score: rampUpVal,
          retained: true
        });
      }
    }
    return Array.from(mergedMap.values());
  }

  // --- CASE 3: Standard pre-loaded / template export schema ---
  const studentsList: Student[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || !row.some(val => val !== "")) continue;

    const id = getCellValue(row, colIndex.id) || `PW-IMPORTED-${1000 + i}`;
    const name = getCellValue(row, colIndex.name) || `Student ${i}`;
    const grade = parseGrade(getCellValue(row, colIndex.grade));
    const center = getCellValue(row, colIndex.center) || "Imported Center";
    const t1_attendance = parseAttendance(getCellValue(row, colIndex.t1_attendance));
    const t2_attendance = parseAttendance(getCellValue(row, colIndex.t2_attendance));

    const t1_scores: SubjectScores = {};
    if (t1_attendance === "Present") {
      const p = parsePercent(getCellValue(row, colIndex.t1_physics));
      const c = parsePercent(getCellValue(row, colIndex.t1_chemistry));
      const m = parsePercent(getCellValue(row, colIndex.t1_maths));
      if (p !== undefined) t1_scores.physics = p;
      if (c !== undefined) t1_scores.chemistry = c;
      if (m !== undefined) t1_scores.maths = m;
    }

    const t2_scores: SubjectScores = {};
    if (t2_attendance === "Present") {
      const p = parsePercent(getCellValue(row, colIndex.t2_physics));
      const c = parsePercent(getCellValue(row, colIndex.t2_chemistry));
      const m = parsePercent(getCellValue(row, colIndex.t2_maths));
      if (p !== undefined) t2_scores.physics = p;
      if (c !== undefined) t2_scores.chemistry = c;
      if (m !== undefined) t2_scores.maths = m;
    }

    const ioqm_score = parsePercent(getCellValue(row, colIndex.ioqm_score)) ?? 0;
    const ramp_up_score = parsePercent(getCellValue(row, colIndex.ramp_up_score));
    const retained = parseRetained(getCellValue(row, colIndex.retained));

    // Detect test count based on total_marks and subject_total_marks
    const totalMarksVal = colIndex.total_marks >= 0 ? parsePercent(getCellValue(row, colIndex.total_marks)) : undefined;
    const subjTotalMarksVal = colIndex.subject_total_marks >= 0 ? parsePercent(getCellValue(row, colIndex.subject_total_marks)) : undefined;
    let testCount = 2; // Default to 2
    if (totalMarksVal !== undefined && subjTotalMarksVal !== undefined && totalMarksVal > 0) {
      if (Math.abs(totalMarksVal - subjTotalMarksVal) < 0.1) {
        testCount = 1;
      } else if (totalMarksVal / subjTotalMarksVal >= 1.5) {
        testCount = 2;
      }
    }

    studentsList.push({
      id,
      name,
      grade,
      center,
      t1_attendance,
      t2_attendance: testCount === 1 ? "Absent" : t2_attendance,
      t1_scores,
      t2_scores: testCount === 1 ? {} : t2_scores,
      ioqm_score,
      ramp_up_score,
      retained,
      test_count: testCount
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
