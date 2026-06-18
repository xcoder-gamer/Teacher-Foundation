import React, { useState, useMemo, useEffect } from "react";
import {
  PRELOADED_STUDENTS,
  getStudentPerformance,
  getRankedCenters,
  calculateCenterMetrics,
  Student,
  CenterScores,
  getRankedMetricGroups,
  getStudentRegionAndCombinedCenter,
} from "./data";
import {
  parseSpreadsheetRowsToStudents,
  generateCSVTemplateString,
  db,
  auth,
  googleSignIn,
  logout,
} from "./auth";
import { onAuthStateChanged } from "firebase/auth";
import { DailyLedgerImporter } from "./components/DailyLedgerImporter";
import { collection, getDocs, doc, setDoc, writeBatch, getDoc } from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
import { downloadStudentsXLSX, parseLocalSpreadsheetFile, downloadRetentionXLSX, downloadResultsXLSX, downloadAttendanceXLSX, downloadIoqmXLSX, downloadRampUpXLSX } from "./utils/excel";
import {
  Award,
  AlertCircle,
  TrendingUp,
  BookOpen,
  Users,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Lock,
  Shield,
  User,
  ChevronRight,
  TrendingDown,
  Info,
  Sliders,
  CheckSquare,
  Square,
  UserX,
  FileSpreadsheet,
  Link as LinkIcon,
  LogOut,
  Download,
  Check,
  Clipboard,
  ExternalLink,
  Upload,
  UserCheck,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

// Helper utilities to check student presence correctly across plain "Present" / "Absent", percentages and ratios
export function checkT1Present(s: Student): boolean {
  if (s.t1_attendance === undefined || s.t1_attendance === null) return false;
  const str = String(s.t1_attendance).trim().toLowerCase();
  return str !== "absent" && str !== "a" && str !== "no" && str !== "0" && str !== "0%" && !str.startsWith("0/");
}

export function checkT2Present(s: Student): boolean {
  if (s.t2_attendance === undefined || s.t2_attendance === null) return false;
  const str = String(s.t2_attendance).trim().toLowerCase();
  return str !== "absent" && str !== "a" && str !== "no" && str !== "0" && str !== "0%" && !str.startsWith("0/");
}

export default function App() {
  // --- STATES ---
  const [students, setStudents] = useState<Student[]>(PRELOADED_STUDENTS);
  const [selectedCenterName, setSelectedCenterName] = useState<string>("Lucknow Chowk Centre");
  const [leaderboardLevel, setLeaderboardLevel] = useState<"region" | "combined_center" | "center">("center");
  const [selectedTab, setSelectedTab] = useState<string>("combined");
  const [leaderboardMetric, setLeaderboardMetric] = useState<"combined" | "subjective" | "ioqm" | "ramp_up" | "attendance" | "retention">("combined");
  const [benchmarkRefType, setBenchmarkRefType] = useState<"overall" | "metric_wise">("overall");
  
  // Custom Dynamic Sidebar Filters
  const [regionFilter, setRegionFilter] = useState<string>("All");
  const [combinedCenterFilter, setCombinedCenterFilter] = useState<string>("All");
  const [sidebarSortAsc, setSidebarSortAsc] = useState<boolean>(false);
  
  // Track IDs of students whose borderline grades we are simulating coaching for
  const [coachedStudentIds, setCoachedStudentIds] = useState<string[]>([]);
  const [subjectiveSortBy, setSubjectiveSortBy] = useState<"percentage" | "name">("percentage");
  
  // Gemini AI Expert report states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [aiReport, setAiReport] = useState<string>("");
  const [aiError, setAiError] = useState<string>("");

  // --- DAILY LEDGER IMPORT & SYNCHRONIZATION STATES ---
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string>("");
  const [hasImportedData, setHasImportedData] = useState<boolean>(false);
  const [selectedUploadMatrix, setSelectedUploadMatrix] = useState<"all" | "retention" | "subjective" | "attendance" | "ioqm" | "rampup">("all");
  const [importMode, setImportMode] = useState<"overwrite" | "merge">("overwrite");
  
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(true);
  const [copiedTemplate, setCopiedTemplate] = useState<boolean>(false);

  // --- PAGINATION & SEARCH STATES FOR LARGE DATASETS ---
  const [poolPage, setPoolPage] = useState<number>(1);
  const [ioqmPage, setIoqmPage] = useState<number>(1);
  const [rampUpPage, setRampUpPage] = useState<number>(1);
  const [attendancePage, setAttendancePage] = useState<number>(1);
  const [retentionPage, setRetentionPage] = useState<number>(1);
  
  const [poolSearch, setPoolSearch] = useState<string>("");
  const [ioqmSearch, setIoqmSearch] = useState<string>("");
  const [rampUpSearch, setRampUpSearch] = useState<string>("");
  const [attendanceSearch, setAttendanceSearch] = useState<string>("");
  const [retentionSearch, setRetentionSearch] = useState<string>("");

  // Reset pagination when active center or tab shifts
  useEffect(() => {
    setPoolPage(1);
    setIoqmPage(1);
    setRampUpPage(1);
    setAttendancePage(1);
    setRetentionPage(1);
  }, [selectedCenterName, selectedTab]);

  // --- REAL GOOGLE SHEETS & FIREBASE AUTHENTICATION MECHANISMS ---
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState<string>("");
  const [passcodeError, setPasscodeError] = useState<string>("");
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  const [spreadsheetInput, setSpreadsheetInput] = useState<string>("");
  const [sheetRangeInput, setSheetRangeInput] = useState<string>("");
  const [fetchSheetError, setFetchSheetError] = useState<string>("");
  const [isFetchingSheet, setIsFetchingSheet] = useState<boolean>(false);

  // Monitor Google Authentication session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setGoogleUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setAuthError(null);
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
      }
    } catch (e: any) {
      console.error("Google login failed:", e);
      if (e.code === "auth/unauthorized-domain" || (e.message && e.message.includes("unauthorized-domain"))) {
        setAuthError("unauthorized-domain");
      } else {
        setAuthError(e.message || "Google Sign-In failed.");
      }
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await logout();
      setGoogleUser(null);
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const handlePasscodeLogin = () => {
    if (passcode.toLowerCase() === "admin") {
      setGoogleUser({
        email: "gurukul.ops@pw.live",
        displayName: "Demo Administrator",
        photoURL: ""
      });
      setPasscodeError("");
    } else if (passcode.toLowerCase() === "viewer") {
      setGoogleUser({
        email: "guest.viewer@pw.live",
        displayName: "Guest Educator",
        photoURL: ""
      });
      setPasscodeError("");
    } else if (passcode.trim() !== "") {
      setPasscodeError("Invalid demo passcode. Try 'admin'.");
    } else {
      setPasscodeError("Please enter a passcode.");
    }
  };

  const handleFetchGoogleSheet = () => {
    setFetchSheetError("Google Sheet direct sync is restricted. Please download as .xlsx or .csv and drag into Step-by-Step Matrix Data Upload instead.");
  };

  // Load additional admin emails from localStorage
  const [customAdmins, setCustomAdmins] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("custom_admin_emails");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Check if current authenticated user has administrative database access
  const lowercaseEmail = googleUser?.email?.toLowerCase() || "";
  const isAdmin = 
    lowercaseEmail === "sharma.devansh987@gmail.com" ||
    lowercaseEmail === "gurukul.ops@pw.live" ||
    lowercaseEmail.startsWith("sharma.devansh") ||
    lowercaseEmail.startsWith("gurukul.ops") ||
    customAdmins.some(email => email.toLowerCase() === lowercaseEmail);

  // Track if initial load from Firebase Firestore is completed
  const [isInitialLoadDone, setIsInitialLoadDone] = useState<boolean>(false);

  // Initialize and load saved students & active coaching simulation state from Firestore on start
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // 1. Fetch Students from Firestore (High-perf Chunks first with safe legacy fallback)
        const parsed: Student[] = [];
        try {
          const chunkSnapshot = await getDocs(collection(db, "students_chunks"));
          if (!chunkSnapshot.empty) {
            const chunks: any[] = [];
            chunkSnapshot.forEach((docSnap) => {
              chunks.push(docSnap.data());
            });
            chunks.sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
            chunks.forEach((c) => {
              if (Array.isArray(c.students)) {
                parsed.push(...c.students);
              }
            });
          }
        } catch (chunkErr) {
          console.warn("Could not read students_chunks collection; falling back to legacy.", chunkErr);
        }

        // Drop down to legacy singular document load if chunks was empty or not found
        if (parsed.length === 0) {
          try {
            const querySnapshot = await getDocs(collection(db, "students"));
            querySnapshot.forEach((docSnap) => {
              parsed.push(docSnap.data() as Student);
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, "students");
            return;
          }
        }

        // Check custom state initialization status
        let dbHasImportedData = false;
        try {
          const metaStatus = await getDoc(doc(db, "meta", "status"));
          if (metaStatus.exists()) {
            dbHasImportedData = metaStatus.data().hasImportedData ?? false;
          }
        } catch (metaErr) {
          console.warn("Could not read meta status, falling back to parsed lengths check", metaErr);
        }

        let loadedCenter = "Lucknow Chowk Centre";
        if (parsed.length > 0) {
          setStudents(parsed);
          setHasImportedData(true);
          loadedCenter = parsed[0].center || "All Centers Combined";
        } else if (dbHasImportedData) {
          // Intentionally blank slate/wiped database state
          setStudents([]);
          setHasImportedData(true);
          loadedCenter = "All Centers Combined";
        }

        // 2. Fetch Active Coaching/Simulation State from Firestore
        let coachingDoc;
        try {
          coachingDoc = await getDoc(doc(db, "coaching", "current"));
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, "coaching/current");
          return;
        }

        if (coachingDoc.exists()) {
          const coachingData = coachingDoc.data();
          if (coachingData.coachedStudentIds) {
            setCoachedStudentIds(coachingData.coachedStudentIds);
          }
          if (coachingData.selectedCenterName) {
            setSelectedCenterName(coachingData.selectedCenterName);
          } else if (parsed.length > 0) {
            setSelectedCenterName(loadedCenter);
          }
        } else if (parsed.length > 0) {
          setSelectedCenterName(loadedCenter);
        }
      } catch (e) {
        console.error("Firestore initial data load error", e);
      } finally {
        setIsInitialLoadDone(true);
      }
    };

    fetchInitialData();
  }, []);

  // Auto-persist coaching list & selected center to Firestore on updates to keep sessions persistent
  useEffect(() => {
    if (!isInitialLoadDone) return;
    
    const persistCoaching = async () => {
      try {
        await setDoc(doc(db, "coaching", "current"), {
          coachedStudentIds,
          selectedCenterName,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, "coaching/current");
        } catch (wrappedErr) {
          console.error("Failed to persist coaching selections to Firestore", wrappedErr);
        }
      }
    };

    persistCoaching();
  }, [coachedStudentIds, selectedCenterName, isInitialLoadDone]);

  // Clear simulated AI reports on center transitions so users see fresh relevant analysis
  useEffect(() => {
    setAiReport("");
    setAiError("");
  }, [selectedCenterName]);

  // --- RECALCULATION PIPELINE ---
  // Apply "What-If" coaching simulations to student marks in real-time
  const simulatedStudents = useMemo(() => {
    return students.map((s) => {
      if (coachedStudentIds.includes(s.id)) {
        // Build simulated student with all failing papers boosted to 40% (pass line)
        const updatedT1 = { ...s.t1_scores };
        const updatedT2 = { ...s.t2_scores };

        if (updatedT1.physics !== undefined && updatedT1.physics < 40) updatedT1.physics = 40;
        if (updatedT1.chemistry !== undefined && updatedT1.chemistry < 40) updatedT1.chemistry = 40;
        if (updatedT1.maths !== undefined && updatedT1.maths < 40) updatedT1.maths = 40;

        if (updatedT2.physics !== undefined && updatedT2.physics < 40) updatedT2.physics = 40;
        if (updatedT2.chemistry !== undefined && updatedT2.chemistry < 40) updatedT2.chemistry = 40;
        if (updatedT2.maths !== undefined && updatedT2.maths < 40) updatedT2.maths = 40;

        // Boost Olympiad IOQM scores to 90%
        const simulatedIoqm = s.ioqm_score !== undefined ? (s.ioqm_score < 90 ? 90 : s.ioqm_score) : undefined;

        // Boost Ramp Up scores for 9th/10th graders to 85% (>80% topper ceiling)
        const simulatedRampUp = s.ramp_up_score !== undefined && s.ramp_up_score <= 80 ? 85 : s.ramp_up_score;

        // Cover attendance failures by converting Absent to Present
        const simT1Attendance = s.t1_attendance === "Absent" ? "Present" : s.t1_attendance;
        const simT2Attendance = s.t2_attendance === "Absent" ? "Present" : s.t2_attendance;

        if (s.t1_attendance === "Absent") {
          updatedT1.physics = updatedT1.physics ?? 60;
          updatedT1.chemistry = updatedT1.chemistry ?? 60;
          updatedT1.maths = updatedT1.maths ?? 60;
        }
        if (s.t2_attendance === "Absent") {
          updatedT2.physics = updatedT2.physics ?? 60;
          updatedT2.chemistry = updatedT2.chemistry ?? 60;
          updatedT2.maths = updatedT2.maths ?? 60;
        }

        // Recover retention status
        const simulatedRetained = true;

        return {
          ...s,
          t1_attendance: simT1Attendance,
          t2_attendance: simT2Attendance,
          t1_scores: updatedT1,
          t2_scores: updatedT2,
          ioqm_score: simulatedIoqm,
          ramp_up_score: simulatedRampUp,
          retained: simulatedRetained,
        };
      }
      return s;
    });
  }, [students, coachedStudentIds]);

  // Calculate dynamic ranking of centers based on current simulation state
  const rankedCenters = useMemo(() => {
    return getRankedMetricGroups(simulatedStudents, leaderboardLevel);
  }, [simulatedStudents, leaderboardLevel]);

  // Safe Empty Center Standard
  const emptyCenterScores = useMemo(() => ({
    centerName: "No Active Centers",
    activeStudents: 0,
    rank: 1,
    subjectiveTestScore: 0,
    elementA_percent: 0,
    elementA_score: 0,
    elementB_percent: 0,
    elementB_score: 0,
    testAttendanceScore: 0,
    attendance_percent: 0,
    ioqmScore: 0,
    ioqm_percent: 0,
    rampUpScore: 0,
    rampUp_percent: 0,
    studentRetentionScore: 0,
    retention_percent: 0,
    consolidatedScore: 0
  }), []);

  const nationalCombinedMetrics = useMemo(() => {
    return calculateCenterMetrics("All Centers Combined", simulatedStudents);
  }, [simulatedStudents]);

  const nationalBaselineMetrics = useMemo(() => {
    return calculateCenterMetrics("All Centers Combined", students);
  }, [students]);

  // Find the currently selected center's simulated and default scores
  const selectedCenterScores = useMemo(() => {
    if (selectedCenterName === "All Centers Combined") {
      return {
        ...nationalCombinedMetrics,
        rank: 0,
      } as CenterScores;
    }
    return rankedCenters.find((c) => c.centerName === selectedCenterName) || rankedCenters[0] || emptyCenterScores;
  }, [rankedCenters, selectedCenterName, simulatedStudents, emptyCenterScores]);

  // Get raw baseline scores (without simulation) to compare
  const baselineCenters = useMemo(() => {
    return getRankedMetricGroups(students, leaderboardLevel);
  }, [students, leaderboardLevel]);

  const selectedCenterBaseline = useMemo(() => {
    if (selectedCenterName === "All Centers Combined") {
      return {
        ...nationalBaselineMetrics,
        rank: 0,
      } as CenterScores;
    }
    return baselineCenters.find((c) => c.centerName === selectedCenterName) || baselineCenters[0] || emptyCenterScores;
  }, [baselineCenters, selectedCenterName, nationalBaselineMetrics, emptyCenterScores]);

  // Planned Rank & Score Simulator Helper
  const plannedMetrics = useMemo(() => {
    const baseRank = selectedCenterBaseline.rank;
    const simRank = selectedCenterScores.rank;
    
    // Core points impact
    const baseScore = selectedCenterBaseline.consolidatedScore;
    const simScore = selectedCenterScores.consolidatedScore;
    const scoreDiff = simScore - baseScore;
    
    // Categories
    const baseRetention = selectedCenterBaseline.studentRetentionScore;
    const simRetention = selectedCenterScores.studentRetentionScore;
    
    const baseSubjective = selectedCenterBaseline.subjectiveTestScore;
    const simSubjective = selectedCenterScores.subjectiveTestScore;
    
    const baseIoqm = selectedCenterBaseline.ioqmScore;
    const simIoqm = selectedCenterScores.ioqmScore;
    
    const baseRampUp = selectedCenterBaseline.rampUpScore;
    const simRampUp = selectedCenterScores.rampUpScore;
    
    const baseAttendance = selectedCenterBaseline.testAttendanceScore;
    const simAttendance = selectedCenterScores.testAttendanceScore;
    
    return {
      baseRank,
      simRank,
      baseScore,
      simScore,
      scoreDiff,
      baseRetention,
      simRetention,
      baseSubjective,
      simSubjective,
      baseIoqm,
      simIoqm,
      baseRampUp,
      simRampUp,
      baseAttendance,
      simAttendance
    };
  }, [selectedCenterBaseline, selectedCenterScores]);

  // Filtered active students matching the currently selected entity / hierarchy level
  const selectedCenterStudents = useMemo(() => {
    if (selectedCenterName === "All Centers Combined") {
      return students;
    }
    return students.filter(s => {
      const { region, combined_center } = getStudentRegionAndCombinedCenter(s);
      if (leaderboardLevel === "region") {
        return region === selectedCenterName;
      } else if (leaderboardLevel === "combined_center") {
        return combined_center === selectedCenterName;
      } else {
        return s.center === selectedCenterName;
      }
    });
  }, [students, selectedCenterName, leaderboardLevel]);

  // Filtered simulated student list matching the selected entity / hierarchy level
  const simulatedSelectedCenterStudents = useMemo(() => {
    if (selectedCenterName === "All Centers Combined") {
      return simulatedStudents;
    }
    return simulatedStudents.filter(s => {
      const { region, combined_center } = getStudentRegionAndCombinedCenter(s);
      if (leaderboardLevel === "region") {
        return region === selectedCenterName;
      } else if (leaderboardLevel === "combined_center") {
        return combined_center === selectedCenterName;
      } else {
        return s.center === selectedCenterName;
      }
    });
  }, [simulatedStudents, selectedCenterName, leaderboardLevel]);

  // --- TARGET STUDENT LIST (Lucknow specific borderline students) ---
  const currentCenterBorderlineStudents = useMemo(() => {
    const centerStudents = selectedCenterStudents;
    
    // Filter out double absent students
    const active = centerStudents.filter(
      (s) => checkT1Present(s) || checkT2Present(s)
    );

    // Identify students with at least 1 failing paper in the 30% to 39% range
    const filtered = active.filter((s) => {
      const papers: number[] = [];
      if (checkT1Present(s)) {
        if (s.t1_scores.physics !== undefined) papers.push(s.t1_scores.physics);
        if (s.t1_scores.chemistry !== undefined) papers.push(s.t1_scores.chemistry);
        if (s.t1_scores.maths !== undefined) papers.push(s.t1_scores.maths);
      }
      if (checkT2Present(s)) {
        if (s.t2_scores.physics !== undefined) papers.push(s.t2_scores.physics);
        if (s.t2_scores.chemistry !== undefined) papers.push(s.t2_scores.chemistry);
        if (s.t2_scores.maths !== undefined) papers.push(s.t2_scores.maths);
      }
      return papers.some((score) => score >= 30 && score <= 39);
    });

    // Sort accordingly
    const sorted = [...filtered].sort((a, b) => {
      if (subjectiveSortBy === "percentage") {
        const failingPaperA = getStudentPerformance(a).papers.find(p => (p.score || 0) < 40);
        const failingPaperB = getStudentPerformance(b).papers.find(p => (p.score || 0) < 40);
        const scoreA = failingPaperA ? failingPaperA.score : 35;
        const scoreB = failingPaperB ? failingPaperB.score : 35;
        return scoreA - scoreB; // Lowest passing score first
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    return sorted.slice(0, 15); // Expand to 15 students for better workspace interaction
  }, [students, selectedCenterName, subjectiveSortBy]);

  // --- LEAK ANALYSER ---
  // Identify the component that underperformed the most compared to perfection (or dynamic topper baseline)
  const rankLeakInfo = useMemo(() => {
    const baseline = selectedCenterBaseline;
    const items = [
      { name: "Subjective Tests", score: baseline.subjectiveTestScore, weight: "25%", id: "subjective" },
      { name: "IOQM Achievements", score: baseline.ioqmScore, weight: "20%", id: "ioqm" },
      { name: "Ramp Up Exams", score: baseline.rampUpScore, weight: "15%", id: "ramp_up" },
      { name: "Test Attendance", score: baseline.testAttendanceScore, weight: "10%", id: "attendance" },
      { name: "Student Retention", score: baseline.studentRetentionScore, weight: "30%", id: "retention" },
    ];
    // Find the min score (highest room for improvement)
    items.sort((a, b) => a.score - b.score);
    return items[0];
  }, [selectedCenterBaseline]);

  // --- INDIVIDUAL METRIC RANKINGS ---
  const subjectiveRanked = useMemo(() => {
    return [...rankedCenters]
      .sort((a, b) => b.subjectiveTestScore - a.subjectiveTestScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [rankedCenters]);

  const ioqmRanked = useMemo(() => {
    return [...rankedCenters]
      .sort((a, b) => b.ioqmScore - a.ioqmScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [rankedCenters]);

  const rampUpRanked = useMemo(() => {
    return [...rankedCenters]
      .sort((a, b) => b.rampUpScore - a.rampUpScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [rankedCenters]);

  const attendanceRanked = useMemo(() => {
    return [...rankedCenters]
      .sort((a, b) => b.testAttendanceScore - a.testAttendanceScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [rankedCenters]);

  const retentionRanked = useMemo(() => {
    return [...rankedCenters]
      .sort((a, b) => b.studentRetentionScore - a.studentRetentionScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [rankedCenters]);

  // --- DYNAMIC REGIONS & COMBINED CENTERS FROM STUDENTS ---
  const allRegions = useMemo(() => {
    const list = students.map(s => {
      const { region } = getStudentRegionAndCombinedCenter(s);
      return region;
    });
    return ["All", ...Array.from(new Set(list)).filter(Boolean).sort()];
  }, [students]);

  const allCombinedCenters = useMemo(() => {
    const filteredStudents = students.filter(s => {
      if (regionFilter === "All") return true;
      const { region } = getStudentRegionAndCombinedCenter(s);
      return region === regionFilter;
    });
    const list = filteredStudents.map(s => {
      const { combined_center } = getStudentRegionAndCombinedCenter(s);
      return combined_center;
    });
    return ["All", ...Array.from(new Set(list)).filter(Boolean).sort()];
  }, [students, regionFilter]);

  const activeMetricList = useMemo(() => {
    let list = [];
    switch (leaderboardMetric) {
      case "subjective":
        list = [...subjectiveRanked];
        break;
      case "ioqm":
        list = [...ioqmRanked];
        break;
      case "ramp_up":
        list = [...rampUpRanked];
        break;
      case "attendance":
        list = [...attendanceRanked];
        break;
      case "retention":
        list = [...retentionRanked];
        break;
      case "combined":
      default:
        list = rankedCenters.map((item, index) => ({ ...item, metricRank: index + 1 }));
        break;
    }

    // Apply Region Filter
    if (regionFilter !== "All") {
      list = list.filter(c => c.region === regionFilter);
    }

    // Apply Combined Center Filter
    if (combinedCenterFilter !== "All") {
      list = list.filter(c => c.combined_center === combinedCenterFilter);
    }

    // Apply sorting order
    list.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      if (leaderboardMetric === "combined") {
        scoreA = a.consolidatedScore;
        scoreB = b.consolidatedScore;
      } else if (leaderboardMetric === "subjective") {
        scoreA = a.subjectiveTestScore;
        scoreB = b.subjectiveTestScore;
      } else if (leaderboardMetric === "ioqm") {
        scoreA = a.ioqmScore;
        scoreB = b.ioqmScore;
      } else if (leaderboardMetric === "ramp_up") {
        scoreA = a.rampUpScore;
        scoreB = b.rampUpScore;
      } else if (leaderboardMetric === "attendance") {
        scoreA = a.testAttendanceScore;
        scoreB = b.testAttendanceScore;
      } else if (leaderboardMetric === "retention") {
        scoreA = a.studentRetentionScore;
        scoreB = b.studentRetentionScore;
      }

      if (sidebarSortAsc) {
        return scoreA - scoreB; // Lowest score first (ascending)
      } else {
        return scoreB - scoreA; // Highest score first (descending)
      }
    });

    return list;
  }, [rankedCenters, leaderboardMetric, subjectiveRanked, ioqmRanked, rampUpRanked, attendanceRanked, retentionRanked, regionFilter, combinedCenterFilter, sidebarSortAsc]);

  // Safely auto-shift selected center if it gets filtered out of active list
  useEffect(() => {
    if (selectedCenterName === "All Centers Combined") return;
    if (activeMetricList.length === 0) return;
    const exists = activeMetricList.some(c => c.centerName === selectedCenterName);
    if (!exists) {
      // Find default first center or Lucknow if exists
      const firstMat = activeMetricList[0];
      if (firstMat) {
        setSelectedCenterName(firstMat.centerName);
      }
    }
  }, [activeMetricList, selectedCenterName]);

  // --- BASELINE INDIVIDUAL METRIC RANKINGS ---
  const subjectiveBaselineRanked = useMemo(() => {
    return [...baselineCenters]
      .sort((a, b) => b.subjectiveTestScore - a.subjectiveTestScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [baselineCenters]);

  const ioqmBaselineRanked = useMemo(() => {
    return [...baselineCenters]
      .sort((a, b) => b.ioqmScore - a.ioqmScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [baselineCenters]);

  const rampUpBaselineRanked = useMemo(() => {
    return [...baselineCenters]
      .sort((a, b) => b.rampUpScore - a.rampUpScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [baselineCenters]);

  const attendanceBaselineRanked = useMemo(() => {
    return [...baselineCenters]
      .sort((a, b) => b.testAttendanceScore - a.testAttendanceScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [baselineCenters]);

  const retentionBaselineRanked = useMemo(() => {
    return [...baselineCenters]
      .sort((a, b) => b.studentRetentionScore - a.studentRetentionScore)
      .map((c, i) => ({ ...c, metricRank: i + 1 }));
  }, [baselineCenters]);

  // Friendly name for active metric on UI
  const selectedMetricFriendlyName = useMemo(() => {
    switch (leaderboardMetric) {
      case "subjective": return "Subjective Test Focus";
      case "ioqm": return "IOQM Achievement Focus";
      case "ramp_up": return "9th/10th Ramp Up Focus";
      case "attendance": return "Attendance Focus";
      case "retention": return "Student Retention Focus";
      case "combined":
      default:
        return "Overall Consolidated";
    }
  }, [leaderboardMetric]);

  // Baseline Rank and Score for the selected metric
  const selectedMetricRankBaseline = useMemo(() => {
    if (selectedCenterName === "All Centers Combined") return 0;
    let list;
    switch (leaderboardMetric) {
      case "subjective": list = subjectiveBaselineRanked; break;
      case "ioqm": list = ioqmBaselineRanked; break;
      case "ramp_up": list = rampUpBaselineRanked; break;
      case "attendance": list = attendanceBaselineRanked; break;
      case "retention": list = retentionBaselineRanked; break;
      case "combined":
      default:
        return selectedCenterBaseline.rank;
    }
    const found = list.find(c => c.centerName === selectedCenterName);
    return found ? found.metricRank : 0;
  }, [leaderboardMetric, selectedCenterName, selectedCenterBaseline, subjectiveBaselineRanked, ioqmBaselineRanked, rampUpBaselineRanked, attendanceBaselineRanked, retentionBaselineRanked]);

  const selectedMetricScoreBaseline = useMemo(() => {
    switch (leaderboardMetric) {
      case "subjective": return selectedCenterBaseline.subjectiveTestScore;
      case "ioqm": return selectedCenterBaseline.ioqmScore;
      case "ramp_up": return selectedCenterBaseline.rampUpScore;
      case "attendance": return selectedCenterBaseline.testAttendanceScore;
      case "retention": return selectedCenterBaseline.studentRetentionScore;
      case "combined":
      default:
        return selectedCenterBaseline.consolidatedScore;
    }
  }, [leaderboardMetric, selectedCenterBaseline]);

  // Simulated Rank and Score for the selected metric
  const selectedMetricRankSimulated = useMemo(() => {
    if (selectedCenterName === "All Centers Combined") return 0;
    let list;
    switch (leaderboardMetric) {
      case "subjective": list = subjectiveRanked; break;
      case "ioqm": list = ioqmRanked; break;
      case "ramp_up": list = rampUpRanked; break;
      case "attendance": list = attendanceRanked; break;
      case "retention": list = retentionRanked; break;
      case "combined":
      default:
        return selectedCenterScores.rank;
    }
    const found = list.find(c => c.centerName === selectedCenterName);
    return found ? found.metricRank : 0;
  }, [leaderboardMetric, selectedCenterName, selectedCenterScores, subjectiveRanked, ioqmRanked, rampUpRanked, attendanceRanked, retentionRanked]);

  const selectedMetricScoreSimulated = useMemo(() => {
    switch (leaderboardMetric) {
      case "subjective": return selectedCenterScores.subjectiveTestScore;
      case "ioqm": return selectedCenterScores.ioqmScore;
      case "ramp_up": return selectedCenterScores.rampUpScore;
      case "attendance": return selectedCenterScores.testAttendanceScore;
      case "retention": return selectedCenterScores.studentRetentionScore;
      case "combined":
      default:
        return selectedCenterScores.consolidatedScore;
    }
  }, [leaderboardMetric, selectedCenterScores]);

  // --- NATIONAL CENTER LEADERBOARD SORTING ENGINE ---
  const [centerSortField, setCenterSortField] = useState<string>("rank");
  const [centerSortAsc, setCenterSortAsc] = useState<boolean>(true);

  const sortedRankedCenters = useMemo(() => {
    let list = [...rankedCenters];

    // Apply Region Filter to table rows (if we are checking drill down level 'combined_center' or 'center')
    if (leaderboardLevel !== "region" && regionFilter !== "All") {
      list = list.filter(c => c.region === regionFilter);
    }

    // Apply Combined Center Filter to table rows (if we are checking drill down level 'center')
    if (leaderboardLevel === "center" && combinedCenterFilter !== "All") {
      list = list.filter(c => c.combined_center === combinedCenterFilter);
    }

    // Assign group standing local rank (computed over the score descending)
    const sortedByScore = [...list].sort((a, b) => b.consolidatedScore - a.consolidatedScore);
    const listWithLocalRanks = list.map(item => {
      const gIndex = sortedByScore.findIndex(x => x.centerName === item.centerName);
      return {
        ...item,
        localRank: gIndex !== -1 ? gIndex + 1 : 1
      };
    });

    return listWithLocalRanks.sort((a, b) => {
      let valA: any;
      let valB: any;
      if (centerSortField === "rank") {
        valA = a.rank;
        valB = b.rank;
      } else if (centerSortField === "centerName") {
        valA = a.centerName;
        valB = b.centerName;
      } else if (centerSortField === "region") {
        valA = a.region || "General";
        valB = b.region || "General";
      } else if (centerSortField === "combined_center") {
        valA = a.combined_center || "General Combined";
        valB = b.combined_center || "General Combined";
      } else if (centerSortField === "consolidatedScore") {
        valA = a.consolidatedScore;
        valB = b.consolidatedScore;
      } else if (centerSortField === "subjective") {
        valA = a.subjectiveTestScore;
        valB = b.subjectiveTestScore;
      } else if (centerSortField === "ioqm") {
        valA = a.ioqmScore;
        valB = b.ioqmScore;
      } else if (centerSortField === "rampUp") {
        valA = a.rampUpScore;
        valB = b.rampUpScore;
      } else if (centerSortField === "attendance") {
        valA = a.testAttendanceScore;
        valB = b.testAttendanceScore;
      } else if (centerSortField === "retention") {
        valA = a.studentRetentionScore;
        valB = b.studentRetentionScore;
      }

      if (valA === undefined) return 1;
      if (valB === undefined) return -1;
      if (typeof valA === "string") {
        return centerSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return centerSortAsc ? valA - valB : valB - valA;
    });
  }, [rankedCenters, leaderboardLevel, regionFilter, combinedCenterFilter, centerSortField, centerSortAsc]);

  // --- LOCAL EVALUATION STUDENT POOL SORTING ENGINE ---
  const [studentSortField, setStudentSortField] = useState<string>("name");
  const [studentSortAsc, setStudentSortAsc] = useState<boolean>(true);

  const sortedSelectedCenterStudents = useMemo(() => {
    const centerStudents = selectedCenterStudents;
    return [...centerStudents].sort((a, b) => {
      let valA: any;
      let valB: any;
      
      if (studentSortField === "name") {
        valA = a.name;
        valB = b.name;
      } else if (studentSortField === "id") {
        valA = a.id;
        valB = b.id;
      } else if (studentSortField === "grade") {
        valA = parseInt(a.grade) || 0;
        valB = parseInt(b.grade) || 0;
      } else if (studentSortField === "averageScore") {
        const perfA = getStudentPerformance(a);
        const perfB = getStudentPerformance(b);
        valA = perfA.isActive && perfA.averagePercent !== null ? perfA.averagePercent : -1;
        valB = perfB.isActive && perfB.averagePercent !== null ? perfB.averagePercent : -1;
      } else if (studentSortField === "retained") {
        valA = a.retained ? 1 : 0;
        valB = b.retained ? 1 : 0;
      } else if (studentSortField === "t1_attendance") {
        valA = a.t1_attendance;
        valB = b.t1_attendance;
      } else if (studentSortField === "t2_attendance") {
        valA = a.t2_attendance;
        valB = b.t2_attendance;
      }
      
      if (valA === undefined) return 1;
      if (valB === undefined) return -1;
      if (typeof valA === "string") {
        return studentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return studentSortAsc ? valA - valB : valB - valA;
    });
  }, [selectedCenterStudents, studentSortField, studentSortAsc]);

  // Priority Action Items for the Selected Center and Metric Focus
  const actionablePlan = useMemo(() => {
    const centerStudents = selectedCenterStudents;
    const activeStudents = centerStudents.filter(
      (s) => checkT1Present(s) || checkT2Present(s)
    );

    const activeCoachedIds = coachedStudentIds;
    const isCoached = (sid: string) => activeCoachedIds.includes(sid);

    // Filter students who are failing in *any* subjective paper (marks < 40)
    const getSubjectiveFailings = () => {
      const items: { student: Student; originalPaper: string; originalScore: number; gap: number; simulatedScore: number; isSimulated: boolean }[] = [];
      activeStudents.forEach((s) => {
        const perf = getStudentPerformance(s);
        perf.papers.forEach((p) => {
          if (p.score !== undefined && p.score < 40) {
            const simulated = isCoached(s.id) ? 40 : p.score;
            items.push({
              student: s,
              originalPaper: `${p.test} ${p.name}`,
              originalScore: p.score,
              gap: 40 - p.score,
              simulatedScore: simulated,
              isSimulated: isCoached(s.id),
            });
          }
        });
      });
      return items;
    };

    // Filter students whose average is 80% to 89% (near Topper baseline >= 90%)
    const getSubjectiveTopperPotentials = () => {
      return activeStudents
        .map((s) => {
          const perf = getStudentPerformance(s);
          return { student: s, perf };
        })
        .filter(
          ({ perf }) =>
            perf.averagePercent !== null &&
            perf.averagePercent >= 80 &&
            perf.averagePercent < 90
        )
        .map(({ student, perf }) => ({
          student,
          currentAvg: perf.averagePercent || 0,
          gap: 90 - (perf.averagePercent || 0),
        }));
    };

    // Filter students who missed tests
    const getAbsentees = () => {
      const items: { student: Student; type: string; action: string }[] = [];
      activeStudents.forEach((s) => {
        if (!checkT1Present(s)) {
          items.push({ student: s, type: "Absent on Test 1", action: "Missed Test 1! Contact to ensure presence in next test cycle." });
        }
        if (!checkT2Present(s)) {
          items.push({ student: s, type: "Absent on Test 2", action: "Missed Test 2! Follow up on weekend test attendance." });
        }
      });
      // Also grab double absents from raw center list
      centerStudents.forEach((s) => {
        if (!checkT1Present(s) && !checkT2Present(s)) {
          items.push({ student: s, type: "Double Absent (Excluded)", action: "Highly At-Risk! Excluded from pool. Schedule critical direct consultation." });
        }
      });
      return items;
    };

    // Filter students with low IOQM scores
    const getIoqmItems = () => {
      return activeStudents
        .filter((s) => s.ioqm_score !== undefined && s.ioqm_score < 90)
        .map((s) => ({
          student: s,
          currentScore: s.ioqm_score ?? 0,
          severity: (s.ioqm_score ?? 0) < 40 ? ("critical" as const) : ("high" as const),
          action: (s.ioqm_score ?? 0) < 40 
            ? "Scores <40% get 0 metrics weight! Focus on intermediate conceptual sheet practice immediately." 
            : "Scores 40-90% linearly scale. Pushing closer to 90% adds maximum rating points.",
        }));
    };

    // Filter 9th/10th graders with Ramp Up scores <80% (especially 60-80%)
    const getRampUpItems = () => {
      const activeRamp = activeStudents.filter((s) => (s.grade === "9" || s.grade === "10") && s.ramp_up_score !== undefined);
      return activeRamp
        .filter((s) => s.ramp_up_score !== undefined && s.ramp_up_score < 80)
        .map((s) => ({
          student: s,
          currentScore: s.ramp_up_score ?? 0,
          severity: (s.ramp_up_score ?? 0) >= 60 ? ("high" as const) : ("medium" as const),
          action: (s.ramp_up_score ?? 0) >= 60
            ? `Close to topper line! Just needs +${81 - (s.ramp_up_score ?? 0)}% score shift to clear 80% marks. Give standard review tests.`
            : `Low score: ${s.ramp_up_score ?? 0}%. Needs personal core concept homework guides.`,
        }));
    };

    // Filter students not retained
    const getRetentionItems = () => {
      const items = centerStudents
        .filter((s) => !s.retained)
        .map((s) => {
          const isDefaulter = s.defaulter_status?.toLowerCase().includes("defaulter") && !s.defaulter_status?.toLowerCase().includes("not");
          const isInactive = s.inactive !== undefined && s.inactive !== "" && s.inactive !== "no" && !s.inactive.toLowerCase().includes("not");
          
          let subType = "Inactive Student";
          let actionLabel = "Fulfill academic contact: Schedule parent counseling to change Inactive status to Active.";
          
          if (isDefaulter) {
            subType = "Fee Defaulter Student";
            actionLabel = "Fulfill fee collection: Contact parents to resolve late payment of 2nd EMI of fees.";
          }
          
          // Calculate dynamic conversion probability (Possibility of converting)
          // Fee Defaulters are generally easier to resolve (75% base) than Academic Inactives (40% base)
          let baseProb = isDefaulter ? 75 : 40;
          
          // Students active in tests are highly engaged and easier to retain
          if (checkT1Present(s)) baseProb += 10;
          if (checkT2Present(s)) baseProb += 10;
          if (!checkT1Present(s) && !checkT2Present(s)) baseProb -= 15;
          
          // Good academic performers are easier to counsel back to active status
          const perf = getStudentPerformance(s);
          if (perf.averagePercent !== null) {
            if (perf.averagePercent >= 75) baseProb += 8;
            else if (perf.averagePercent >= 50) baseProb += 4;
          }
          
          const conversionProb = Math.max(15, Math.min(95, baseProb));
          
          return {
            student: s,
            subType,
            action: actionLabel,
            conversionProb
          };
        });

      // Sort by conversion probability (highest probability first - "easily scoring")
      return items.sort((a, b) => b.conversionProb - a.conversionProb);
    };

    return {
      subjectiveFailings: getSubjectiveFailings(),
      subjectiveTopperPotentials: getSubjectiveTopperPotentials(),
      absentees: getAbsentees(),
      ioqmItems: getIoqmItems(),
      rampUpItems: getRampUpItems(),
      retentionItems: getRetentionItems(),
    };
  }, [selectedCenterStudents, coachedStudentIds]);

  // --- CLIENT-SIDE PAGINATOR & SEARCH ENGINE FOR LARGE LIST RENDERING PERFORMANCE ---
  const filteredAndSortedPoolStudents = useMemo(() => {
    const searchClean = poolSearch.trim().toLowerCase();
    let res = sortedSelectedCenterStudents;
    if (searchClean) {
      res = res.filter(
        (s) => s.name.toLowerCase().includes(searchClean) || s.id.toLowerCase().includes(searchClean)
      );
    }
    return res;
  }, [sortedSelectedCenterStudents, poolSearch]);

  const poolPageSize = 25;
  const poolTotalPages = Math.max(1, Math.ceil(filteredAndSortedPoolStudents.length / poolPageSize));
  const paginatedPoolStudents = useMemo(() => {
    const start = (poolPage - 1) * poolPageSize;
    return filteredAndSortedPoolStudents.slice(start, start + poolPageSize);
  }, [filteredAndSortedPoolStudents, poolPage]);

  // IOQM pagination
  const filteredIoqmItems = useMemo(() => {
    const searchClean = ioqmSearch.trim().toLowerCase();
    let res = actionablePlan.ioqmItems;
    if (searchClean) {
      res = res.filter(
        (item) => item.student.name.toLowerCase().includes(searchClean) || item.student.id.toLowerCase().includes(searchClean)
      );
    }
    return res;
  }, [actionablePlan.ioqmItems, ioqmSearch]);

  const ioqmPageSize = 15;
  const ioqmTotalPages = Math.max(1, Math.ceil(filteredIoqmItems.length / ioqmPageSize));
  const paginatedIoqmItems = useMemo(() => {
    const start = (ioqmPage - 1) * ioqmPageSize;
    return filteredIoqmItems.slice(start, start + ioqmPageSize);
  }, [filteredIoqmItems, ioqmPage]);

  // Ramp Up pagination
  const filteredRampUpItems = useMemo(() => {
    const searchClean = rampUpSearch.trim().toLowerCase();
    let res = actionablePlan.rampUpItems;
    if (searchClean) {
      res = res.filter(
        (item) => item.student.name.toLowerCase().includes(searchClean) || item.student.id.toLowerCase().includes(searchClean)
      );
    }
    return res;
  }, [actionablePlan.rampUpItems, rampUpSearch]);

  const rampUpPageSize = 15;
  const rampUpTotalPages = Math.max(1, Math.ceil(filteredRampUpItems.length / rampUpPageSize));
  const paginatedRampUpItems = useMemo(() => {
    const start = (rampUpPage - 1) * rampUpPageSize;
    return filteredRampUpItems.slice(start, start + rampUpPageSize);
  }, [filteredRampUpItems, rampUpPage]);

  // Attendance/Absentees pagination
  const filteredAbsenteeItems = useMemo(() => {
    const searchClean = attendanceSearch.trim().toLowerCase();
    let res = actionablePlan.absentees;
    if (searchClean) {
      res = res.filter(
        (item) => item.student.name.toLowerCase().includes(searchClean) || item.student.id.toLowerCase().includes(searchClean)
      );
    }
    return res;
  }, [actionablePlan.absentees, attendanceSearch]);

  const attendancePageSize = 15;
  const attendanceTotalPages = Math.max(1, Math.ceil(filteredAbsenteeItems.length / attendancePageSize));
  const paginatedAbsenteeItems = useMemo(() => {
    const start = (attendancePage - 1) * attendancePageSize;
    return filteredAbsenteeItems.slice(start, start + attendancePageSize);
  }, [filteredAbsenteeItems, attendancePage]);

  // Retention pagination
  const filteredRetentionItems = useMemo(() => {
    const searchClean = retentionSearch.trim().toLowerCase();
    let res = actionablePlan.retentionItems;
    if (searchClean) {
      res = res.filter(
        (item) => item.student.name.toLowerCase().includes(searchClean) || item.student.id.toLowerCase().includes(searchClean)
      );
    }
    return res;
  }, [actionablePlan.retentionItems, retentionSearch]);

  // Retention grouping
  const groupedRetentionItems = useMemo(() => {
    const feeDefaulters = filteredRetentionItems.filter(item => item.subType === "Fee Defaulter Student");
    const inactiveStudents = filteredRetentionItems.filter(item => item.subType === "Inactive Student");
    return { feeDefaulters, inactiveStudents };
  }, [filteredRetentionItems]);

  // --- MASS SIMULATION TRIGGERS ---
  const handleApplyPresetTier1 = () => {
    // Coach exactly 6 borderline students (all 6)
    const borderlineIds = currentCenterBorderlineStudents.map((s) => s.id);
    setCoachedStudentIds(borderlineIds);
    setAiReport("");
  };

  const handleApplyPresetTier2 = () => {
    // Coach ALL students with any failing papers in the center to 45%
    const centerStudents = selectedCenterStudents;
    const activeWithFailures = centerStudents.filter((s) => {
      const perf = getStudentPerformance(s);
      return perf.isActive && perf.failingPapersCount > 0;
    }).map(s => s.id);
    
    setCoachedStudentIds(activeWithFailures);
    setAiReport("");
  };

  const handleToggleCoach = (studentId: string) => {
    if (coachedStudentIds.includes(studentId)) {
      setCoachedStudentIds(coachedStudentIds.filter((id) => id !== studentId));
    } else {
      setCoachedStudentIds([...coachedStudentIds, studentId]);
    }
  };

  const handleResetSimulation = () => {
    setCoachedStudentIds([]);
    setAiReport("");
  };

  // --- BULK SIMULATION COMMANDS FOR ADMINE/TEACHER IMPROVEMENT SCOPE ---
  const handleBulkToggleFailing = () => {
    const failingStudentIds = Array.from(new Set(actionablePlan.subjectiveFailings.map(f => f.student.id)));
    const combined = Array.from(new Set([...coachedStudentIds, ...failingStudentIds]));
    setCoachedStudentIds(combined);
    setAiReport("");
  };

  const handleBulkToggleNearToppers = () => {
    const potIds = actionablePlan.subjectiveTopperPotentials.map(p => p.student.id);
    const combined = Array.from(new Set([...coachedStudentIds, ...potIds]));
    setCoachedStudentIds(combined);
    setAiReport("");
  };

  const handleBulkToggleIoqm = () => {
    const ioqmIds = actionablePlan.ioqmItems.map(i => i.student.id);
    const combined = Array.from(new Set([...coachedStudentIds, ...ioqmIds]));
    setCoachedStudentIds(combined);
    setAiReport("");
  };

  const handleBulkToggleAbsentees = () => {
    const absIds = actionablePlan.absentees.map(a => a.student.id);
    const combined = Array.from(new Set([...coachedStudentIds, ...absIds]));
    setCoachedStudentIds(combined);
    setAiReport("");
  };

  const handleBulkToggleRetention = () => {
    const retIds = actionablePlan.retentionItems.map(r => r.student.id);
    const combined = Array.from(new Set([...coachedStudentIds, ...retIds]));
    setCoachedStudentIds(combined);
    setAiReport("");
  };

  // --- DYNAMIC VIEW EXPORT HANDLERS ---
  const handleExportLeaderboardCSV = () => {
    try {
      let headers = "Rank,Center Hub,Consolidated Score,Subjective (25%),IOQM (20%),Ramp Up (15%),Test Attendance (10%),Student Retention (30%)\n";
      let rows = sortedRankedCenters.map(item => 
        `"${item.rank}","${item.centerName}","${item.consolidatedScore.toFixed(1)}","${item.subjectiveTestScore.toFixed(1)}","${item.ioqmScore.toFixed(1)}","${item.rampUpScore.toFixed(1)}","${item.testAttendanceScore.toFixed(1)}","${item.studentRetentionScore.toFixed(1)}"`
      ).join("\n");
      const csvContent = headers + rows;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `pw_national_center_leaderboard.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Leaderboard CSV export failed", e);
    }
  };

  const handleExportStudentPoolCSV = () => {
    try {
      const centerStudents = selectedCenterName === "All Centers Combined" ? students : students.filter(s => s.center === selectedCenterName);
      let headers = "Student Name,Registration ID,Center,Grade,T1 Attendance,T2 Attendance,Evaluated Average,Retention Status\n";
      let rows = centerStudents.map(student => {
        const perf = getStudentPerformance(student);
        const isRetained = student.retained ? "Retained" : "Defaulter / Left";
        const isT1Present = student.t1_attendance !== undefined ? student.t1_attendance : "Absent";
        const isT2Present = student.t2_attendance !== undefined ? student.t2_attendance : "Absent";
        const avgScore = perf.isActive && perf.averagePercent !== null ? `${perf.averagePercent.toFixed(1)}%` : "N/A (Double Absent)";
        return `"${student.name}","${student.id}","${student.center}","${student.grade}","${isT1Present}","${isT2Present}","${avgScore}","${isRetained}"`;
      }).join("\n");
      const csvContent = headers + rows;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${selectedCenterName.replace(/\s+/g, "_")}_student_directory.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Student pool export failed", e);
    }
  };

  // --- DAILY LEDGER HANDLERS ---
  const handleResetToDefaultDemo = async () => {
    const confirmReset = window.confirm("Are you sure you want to restore the default pre-loaded Physics Wallah centers demo dataset?");
    if (!confirmReset) return;

    setStudents(PRELOADED_STUDENTS);
    setHasImportedData(false);
    setCoachedStudentIds([]);
    setAiReport("");
    setAiError("");
    setSelectedCenterName("Lucknow Chowk Centre");

    // Clear Firestore student collections (both chunks and legacy singulars) safely
    try {
      // 1. Wipe students_chunks collection
      const chunksSnap = await getDocs(collection(db, "students_chunks"));
      const chunkBatch = writeBatch(db);
      chunksSnap.docs.forEach((docSnap) => {
        chunkBatch.delete(docSnap.ref);
      });
      await chunkBatch.commit();

      // 2. Wipe legacy students collection in 400-doc sub-batches
      const qSnap = await getDocs(collection(db, "students"));
      let batch = writeBatch(db);
      let count = 0;
      for (const docSnap of qSnap.docs) {
        batch.delete(docSnap.ref);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    } catch (writeErr) {
      handleFirestoreError(writeErr, OperationType.DELETE, "students_chunks");
    }
  };

  const handleWipeAllData = async () => {
    const confirmWipe = window.confirm(
      "☢️ WARNING: Are you absolutely sure you want to wipe all student records? This will clear the database so you can import custom live data."
    );
    if (!confirmWipe) return;

    setStudents([]);
    setHasImportedData(true); // Treat as imported setup so general demo alerts don't conflict
    setCoachedStudentIds([]);
    setAiReport("");
    setAiError("");
    setSelectedCenterName("");

    // Clear Firestore student collections (both chunks and legacy singulars) safely
    try {
      // 1. Wipe students_chunks collection
      const chunksSnap = await getDocs(collection(db, "students_chunks"));
      const chunkBatch = writeBatch(db);
      chunksSnap.docs.forEach((docSnap) => {
        chunkBatch.delete(docSnap.ref);
      });
      await chunkBatch.commit();

      // 2. Wipe legacy students collection in 400-doc sub-batches
      const qSnap = await getDocs(collection(db, "students"));
      let batch = writeBatch(db);
      let count = 0;
      for (const docSnap of qSnap.docs) {
        batch.delete(docSnap.ref);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      
      await setDoc(doc(db, "meta", "status"), {
        hasImportedData: true,
        updatedAt: new Date().toISOString()
      });

      alert("🧹 Clean slate initialized! Database cleared. You can now upload your custom live spreadsheets.");
    } catch (writeErr) {
      handleFirestoreError(writeErr, OperationType.DELETE, "students_chunks");
    }
  };

  const handleCopyTemplateCSV = () => {
    try {
      const csv = generateCSVTemplateString(PRELOADED_STUDENTS);
      navigator.clipboard.writeText(csv);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 2000);
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  };

  const handleDownloadSampleCSV = () => {
    try {
      const csv = generateCSVTemplateString(PRELOADED_STUDENTS); // Provide all clean comprehensive student columns
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "pw_student_tracker_test_data.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("CSV Download failed", e);
    }
  };

  const handleDownloadXLSXTemplate = () => {
    try {
      downloadStudentsXLSX(PRELOADED_STUDENTS, "pw_student_tracker_template.xlsx");
    } catch (e) {
      console.error("Template XLSX download failed:", e);
    }
  };

  const handleDownloadActiveXLSX = () => {
    try {
      downloadStudentsXLSX(students, "pw_active_students_ledger.xlsx");
    } catch (e) {
      console.error("Active XLSX download failed:", e);
    }
  };

  const handleDownloadRetentionXLSX = () => {
    try {
      downloadRetentionXLSX(students, "pw_active_retention_ledger_format1.xlsx");
    } catch (e) {
      console.error("Retention XLSX download failed:", e);
    }
  };

  const handleDownloadResultsXLSX = () => {
    try {
      downloadResultsXLSX(students, "pw_active_results_ledger_format2.xlsx");
    } catch (e) {
      console.error("Results XLSX download failed:", e);
    }
  };

  const handleDownloadAttendanceXLSX = () => {
    try {
      downloadAttendanceXLSX(students, "pw_active_attendance_ledger.xlsx");
    } catch (e) {
      console.error("Attendance XLSX download failed:", e);
    }
  };

  const handleDownloadIoqmXLSX = () => {
    try {
      downloadIoqmXLSX(students, "pw_active_ioqm_ledger.xlsx");
    } catch (e) {
      console.error("IOQM XLSX download failed:", e);
    }
  };

  const handleDownloadRampUpXLSX = () => {
    try {
      downloadRampUpXLSX(students, "pw_active_rampup_ledger.xlsx");
    } catch (e) {
      console.error("Ramp Up XLSX download failed:", e);
    }
  };

  const [dragActive, setDragActive] = useState<boolean>(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleParseLocalSpreadsheet(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleParseLocalSpreadsheet(e.target.files[0]);
    }
  };

  const handleParseLocalSpreadsheet = async (file: File) => {
    try {
      setImportError("");
      setIsImporting(true);
      const rows = await parseLocalSpreadsheetFile(file);
      
      if (!rows || rows.length < 2) {
        throw new Error("The selected file is empty or missing headers.");
      }

      const useExistingList = importMode === "merge" && hasImportedData;
      const parsedStudents = parseSpreadsheetRowsToStudents(
        rows,
        useExistingList ? students : [],
        selectedUploadMatrix
      );
      if (parsedStudents.length === 0) {
        throw new Error("Could not extract any valid student records. Check column header spellings.");
      }

      setStudents(parsedStudents);
      setHasImportedData(true);
      if (parsedStudents.length > 0) {
        const firstCenter = parsedStudents[0].center || "All Centers Combined";
        setSelectedCenterName(firstCenter);
      }
      setCoachedStudentIds([]);
      setAiReport("");
      setAiError("");

      // Save to Firestore using high-performance chunked collection
      try {
        // Step 1: Wipe all existing students chunks and legacy individual docs safely
        const chunksSnap = await getDocs(collection(db, "students_chunks"));
        const chunkBatch = writeBatch(db);
        chunksSnap.docs.forEach((docSnap) => {
          chunkBatch.delete(docSnap.ref);
        });
        await chunkBatch.commit();

        // Note: We skip the massive, slow sequential legacy singular student deletions during standard imports.
        // Wiping the high-perf chunks is sufficient and near-instant (typically under 2 seconds total).
        // A full database reset can still be executed via the dedicated 'Wipe All Data' admin button if needed.
        
        // Step 2: Clean and chunk data for Firestore to bypass any batch size/network payload limits
        const cleanDataForFirestore = (obj: any): any => {
          if (obj === undefined) return null;
          if (obj === null) return null;
          if (Array.isArray(obj)) {
            return obj.map(cleanDataForFirestore);
          }
          if (typeof obj === "object") {
            const cleaned: any = {};
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              if (val !== undefined) {
                cleaned[key] = cleanDataForFirestore(val);
              }
            }
            return cleaned;
          }
          return obj;
        };

        const CHUNK_SIZE = 1000;
        const totalCount = parsedStudents.length;

        for (let idx = 0; idx < totalCount; idx += CHUNK_SIZE) {
          const chunk = parsedStudents.slice(idx, idx + CHUNK_SIZE).map(cleanDataForFirestore);
          const chunkIndex = Math.floor(idx / CHUNK_SIZE);
          await setDoc(doc(db, "students_chunks", `chunk_${chunkIndex}`), {
            chunkIndex,
            students: chunk,
            updatedAt: new Date().toISOString()
          });
        }
        await setDoc(doc(db, "meta", "status"), {
          hasImportedData: true,
          updatedAt: new Date().toISOString()
        });
      } catch (writeErr) {
        handleFirestoreError(writeErr, OperationType.WRITE, "students_chunks");
      }

      const centers = Array.from(new Set(parsedStudents.map(s => s.center)));
      if (centers.length > 0 && !centers.includes(selectedCenterName)) {
        setSelectedCenterName(centers[0]);
      }
    } catch (err: any) {
      console.error("Local spreadsheet import failed:", err);
      setImportError(`Spreadsheet failure: ${err.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleForceRecalculate = async () => {
    setIsImporting(true);
    setImportError("");
    try {
      const parsed: Student[] = [];
      const chunkSnapshot = await getDocs(collection(db, "students_chunks"));
      if (!chunkSnapshot.empty) {
        const chunks: any[] = [];
        chunkSnapshot.forEach((docSnap) => {
          chunks.push(docSnap.data());
        });
        chunks.sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
        chunks.forEach((c) => {
          if (Array.isArray(c.students)) {
            parsed.push(...c.students);
          }
        });
      }
      if (parsed.length === 0) {
        const querySnapshot = await getDocs(collection(db, "students"));
        querySnapshot.forEach((docSnap) => {
          parsed.push(docSnap.data() as Student);
        });
      }

      setStudents(parsed);
      if (parsed.length > 0) {
        setHasImportedData(true);
        setSelectedCenterName(parsed[0].center || "All Centers Combined");
      }
      alert("🔄 Calculations synced successfully! All classroom metrics under active Windows have been recalculated perfectly.");
    } catch (e: any) {
      setImportError("Calculation sync failed: " + e.message);
    } finally {
      setIsImporting(false);
    }
  };

  // --- GEMINI EXPERT DIAGNOSTIC RETRIEVER ---
  const handleRequestAIDiagnostic = async () => {
    setIsGenerating(true);
    setAiReport("");
    setAiError("");
    try {
      const response = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerName: selectedCenterName,
          selectedTab: selectedTab === "subjective" ? "subjective" : "rank",
          scores: selectedCenterScores,
          borderlineCount: currentCenterBorderlineStudents.length,
          simulatedMetrics: coachedStudentIds.length > 0,
        }),
      });

      const data = await response.json();
      if (data.success && data.diagnostic) {
        setAiReport(data.diagnostic);
      } else {
        setAiError(data.error || "No response received. Key config may be generic.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError("Connection to API failed. Please ensure the dev server is fully functional and keys are active.");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- RECHARTS CHART DATA PREPARATION ---
  // Find Overall Topper at active leaderboard level (rank 1)
  const overallTopper = useMemo(() => {
    return rankedCenters.length > 0 ? rankedCenters[0] : null;
  }, [rankedCenters]);

  const benchmarkLabel = useMemo(() => {
    if (benchmarkRefType === "overall") {
      const topperName = overallTopper ? overallTopper.centerName : "Overall Topper";
      return `${topperName} (Overall Topper)`;
    } else {
      return "Metric Topper (Max Achieved)";
    }
  }, [benchmarkRefType, overallTopper]);

  const chartData = useMemo(() => {
    const refSubjective = benchmarkRefType === "overall" 
      ? (overallTopper ? Math.round(overallTopper.subjectiveTestScore) : 100)
      : (rankedCenters.length > 0 ? Math.round(Math.max(...rankedCenters.map(c => c.subjectiveTestScore))) : 100);

    const refIoqm = benchmarkRefType === "overall"
      ? (overallTopper ? Math.round(overallTopper.ioqmScore) : 97)
      : (rankedCenters.length > 0 ? Math.round(Math.max(...rankedCenters.map(c => c.ioqmScore))) : 100);

    const refRampUp = benchmarkRefType === "overall"
      ? (overallTopper ? Math.round(overallTopper.rampUpScore) : 100)
      : (rankedCenters.length > 0 ? Math.round(Math.max(...rankedCenters.map(c => c.rampUpScore))) : 100);

    const refAttendance = benchmarkRefType === "overall"
      ? (overallTopper ? Math.round(overallTopper.testAttendanceScore) : 100)
      : (rankedCenters.length > 0 ? Math.round(Math.max(...rankedCenters.map(c => c.testAttendanceScore))) : 100);

    const refRetention = benchmarkRefType === "overall"
      ? (overallTopper ? Math.round(overallTopper.studentRetentionScore) : 100)
      : (rankedCenters.length > 0 ? Math.round(Math.max(...rankedCenters.map(c => c.studentRetentionScore))) : 100);

    return [
      {
        metric: "Subjective T. (25%)",
        "Current Center": Math.round(selectedCenterScores.subjectiveTestScore),
        "Benchmark (Ref)": refSubjective,
      },
      {
        metric: "IOQM (20%)",
        "Current Center": Math.round(selectedCenterScores.ioqmScore),
        "Benchmark (Ref)": refIoqm,
      },
      {
        metric: "Ramp Up (15%)",
        "Current Center": Math.round(selectedCenterScores.rampUpScore),
        "Benchmark (Ref)": refRampUp,
      },
      {
        metric: "Attendance (10%)",
        "Current Center": Math.round(selectedCenterScores.testAttendanceScore),
        "Benchmark (Ref)": refAttendance,
      },
      {
        metric: "Retention (30%)",
        "Current Center": Math.round(selectedCenterScores.studentRetentionScore),
        "Benchmark (Ref)": refRetention,
      },
    ];
  }, [selectedCenterScores, benchmarkRefType, overallTopper, rankedCenters]);

  // Render Dynamic Improvement & Rank Impact Simulator Banner
  const renderSimulatorImpactPanel = (metricTab: "retention" | "subjective" | "ioqm" | "ramp_up" | "attendance") => {
    const tabLabel = 
      metricTab === "retention" ? "Retention (30% Weight)" :
      metricTab === "subjective" ? "Subjective (25% Weight)" :
      metricTab === "ioqm" ? "IOQM (20% Weight)" :
      metricTab === "ramp_up" ? "Ramp Up (15% Weight)" :
      "Attendance (10% Weight)";

    const tabLabelNoWeight = 
      metricTab === "retention" ? "Retention" :
      metricTab === "subjective" ? "Subjective Plan" :
      metricTab === "ioqm" ? "IOQM" :
      metricTab === "ramp_up" ? "Ramp Up" :
      "Attendance";

    const baseMetricVal = 
      metricTab === "retention" ? plannedMetrics.baseRetention :
      metricTab === "subjective" ? plannedMetrics.baseSubjective :
      metricTab === "ioqm" ? plannedMetrics.baseIoqm :
      metricTab === "ramp_up" ? plannedMetrics.baseRampUp :
      plannedMetrics.baseAttendance;

    const simMetricVal = 
      metricTab === "retention" ? plannedMetrics.simRetention :
      metricTab === "subjective" ? plannedMetrics.simSubjective :
      metricTab === "ioqm" ? plannedMetrics.simIoqm :
      metricTab === "ramp_up" ? plannedMetrics.simRampUp :
      plannedMetrics.simAttendance;

    const metricColor = 
      metricTab === "retention" ? "text-orange-400" :
      metricTab === "subjective" ? "text-cyan-400" :
      metricTab === "ioqm" ? "text-cyan-400" :
      metricTab === "ramp_up" ? "text-purple-400" :
      "text-emerald-400";

    return (
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 border-slate-800 space-y-3.5 my-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-805 border-slate-800 pb-2.5">
          <div>
            <h4 className="text-xs font-bold font-mono text-slate-150 text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              ⚙️ Corrective Action & Planned Rank Improvement Predictor
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Predicting the real-time impact of supporting at-risk student cohorts on the overall national standing.
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] text-slate-500 font-mono font-bold block uppercase">Drill Level</span>
            <span className="text-xs font-mono font-bold text-yellow-400 capitalize">{leaderboardLevel.replace("_", " ")}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-805 border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block">Overall Score</span>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="text-[11px] font-mono text-slate-400 line-through">{plannedMetrics.baseScore.toFixed(1)}</span>
              <span className="text-slate-500 text-xs">→</span>
              <span className="text-sm font-mono font-bold text-slate-100">{plannedMetrics.simScore.toFixed(1)}</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold block mt-1">
              {plannedMetrics.scoreDiff > 0 ? `+${plannedMetrics.scoreDiff.toFixed(1)} Points` : "0.0 Change"}
            </span>
          </div>

          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-805 border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block">{tabLabelNoWeight}</span>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="text-[11px] font-mono text-slate-400 line-through">{baseMetricVal.toFixed(1)}</span>
              <span className="text-slate-500 text-xs">→</span>
              <span className="text-sm font-mono font-bold text-slate-100">{simMetricVal.toFixed(1)}</span>
            </div>
            <span className={`text-[10px] font-bold block mt-1 ${metricColor}`}>
              {(simMetricVal - baseMetricVal) > 0 ? `+${(simMetricVal - baseMetricVal).toFixed(1)}% Change` : "0.0% Change"}
            </span>
          </div>

          <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-805 border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block">Predicted Rank</span>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="text-[11px] font-mono text-slate-400 line-through">Rank #{plannedMetrics.baseRank || 1}</span>
              <span className="text-slate-500 text-xs">→</span>
              <span className="text-sm font-mono font-bold text-emerald-400">Rank #{plannedMetrics.simRank || 1}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-bold block mt-1 flex items-center justify-center gap-1">
              {plannedMetrics.baseRank - plannedMetrics.simRank > 0 ? (
                <>
                  <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400">+{plannedMetrics.baseRank - plannedMetrics.simRank} Rank Jump</span>
                </>
              ) : (
                "Same Rank"
              )}
            </span>
          </div>

          <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-850 border-slate-800 flex flex-col justify-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block">Predicted Students</span>
            <span className="text-xs font-mono font-bold text-indigo-400 mt-1">{coachedStudentIds.length} Total</span>
            <span className="text-[9px] text-slate-500 font-mono block mt-0.5">Toggle student card checkmarks below</span>
          </div>
        </div>

        {/* Dynamic Target Pupils Status Summary Checklist */}
        {(() => {
          let tabTargetStudents: Student[] = [];
          if (metricTab === "subjective") {
            tabTargetStudents = currentCenterBorderlineStudents;
          } else if (metricTab === "ioqm") {
            tabTargetStudents = actionablePlan.ioqmItems.map(item => item.student);
          } else if (metricTab === "ramp_up") {
            tabTargetStudents = actionablePlan.rampUpItems.map(item => item.student);
          } else if (metricTab === "attendance") {
            const seenIds = new Set<string>();
            tabTargetStudents = [];
            actionablePlan.absentees.forEach(item => {
              if (!seenIds.has(item.student.id)) {
                seenIds.add(item.student.id);
                tabTargetStudents.push(item.student);
              }
            });
          } else if (metricTab === "retention") {
            tabTargetStudents = actionablePlan.retentionItems.map(item => item.student);
          }

          const coachedForTab = tabTargetStudents.filter(s => coachedStudentIds.includes(s.id));
          const pendingForTab = tabTargetStudents.filter(s => !coachedStudentIds.includes(s.id));

          if (tabTargetStudents.length === 0) return null;

          return (
            <div className="mt-4 border-t border-slate-800/80 pt-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider font-semibold">
                  📋 TARGET STUDENTS INTERVENTION STATUS (CHECKLIST)
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Toggle student checkboxes below to apply active support
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mt-1.5">
                <div className="bg-slate-900/40 p-2.5 rounded-lg border border-emerald-500/10">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400 mb-1.5 font-mono text-[10px] uppercase">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Support Active / Worked On ({coachedForTab.length})</span>
                  </div>
                  {coachedForTab.length === 0 ? (
                    <span className="text-slate-500 text-[10.5px] italic block">No student selected yet. Check cards below.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {coachedForTab.map(s => (
                        <span key={s.id} className="bg-emerald-500/10 text-emerald-300 font-medium px-2 py-0.5 rounded text-[10px] border border-emerald-500/20 font-mono">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="bg-slate-900/40 p-2.5 rounded-lg border border-rose-500/10">
                  <div className="flex items-center gap-1.5 font-bold text-rose-400 mb-1.5 font-mono text-[10px] uppercase">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                    <span>Pending Intervention / Needs Work ({pendingForTab.length})</span>
                  </div>
                  {pendingForTab.length === 0 ? (
                    <span className="text-emerald-400 text-[10.5px] font-medium block">🎯 Perfect! All target students are covered under active support.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {pendingForTab.map(s => (
                        <span key={s.id} className="bg-rose-500/10 text-rose-300 font-medium px-2 py-0.5 rounded text-[10px] border border-rose-500/20 font-mono">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans" id="teacher-analytics-app">
      {!googleUser ? (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans w-full" id="login-gateway">
          {/* Ambient Grid Background */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(26,54,93,0.15)_0,transparent_100%)] pointer-events-none" />
          
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6 relative z-10 animate-fade-in">
            {/* Logo Heading */}
            <div className="text-center space-y-2">
              <div className="inline-block bg-yellow-500 text-slate-950 px-4 py-2 rounded-xl font-black font-display tracking-wider text-2xl shadow-xl shadow-yellow-500/10">
                PHYSICS WALLAH
              </div>
              <h2 className="text-xl font-bold font-display tracking-tight text-slate-100 mt-4">
                Regional Center Standing Gateway
              </h2>
              <p className="text-xs text-slate-400">
                Comprehensive analytics, national standing scores & action drill-downs.
              </p>
            </div>

            <div className="space-y-4">
              {/* Authentications Section */}
              <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800/80 space-y-3.5">
                <h3 className="text-xs font-bold font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> Google Workspace Login
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Connect your official <code>@pw.live</code> account to sync spreadsheet files and make administrative adjustments.
                </p>
                
                <button
                  onClick={handleGoogleLogin}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 hover:text-white text-slate-50 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 shadow-md text-xs font-sans"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.86-3.577-7.86-8s3.53-8 7.86-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 1.036 15.422 0 12.24 0c-6.63 0-12 5.37-12 12s5.37 12 12 12c6.92 0 11.52-4.84 11.52-11.72 0-.788-.085-1.39-.188-1.995H12.24z"/>
                  </svg>
                  <span>Sign In with Google</span>
                </button>

                {authError && (
                  <div className="bg-rose-500/15 text-rose-400 text-[11px] p-2.5 rounded-lg border border-rose-500/20 text-center">
                    ⚠️ {authError === "unauthorized-domain" ? "This Google account is unauthorized. Please log in with an approved administrator account or proceed as a Normal User below." : authError}
                  </div>
                )}
              </div>

              {/* Quick Guest Entrance */}
              <div className="bg-slate-950/40 p-5 rounded-xl border border-slate-800/60 text-center space-y-3">
                <h4 className="text-[11px] font-bold font-mono text-slate-400 uppercase tracking-widest">
                  👉 Are you a general user / center lead?
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Click below to proceed as a <strong>Standard Participant</strong>. You will access the <strong>National Leaderboard</strong> immediately.
                </p>
                <button
                  onClick={() => {
                    setGoogleUser({
                      email: "guest.viewer@pw.live",
                      displayName: "Guest Educator",
                      photoURL: ""
                    });
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-slate-50 font-bold py-2.5 px-4 rounded-xl transition cursor-pointer text-xs font-sans shadow border border-slate-700/60"
                >
                  Proceed as Normal User (Leaderboard Only)
                </button>
              </div>

              {/* Demo admin Bypass Passcode */}
              <div className="bg-slate-950/40 p-5 rounded-xl border border-slate-800/60 space-y-3">
                <h4 className="text-[11px] font-bold font-mono text-yellow-500 uppercase tracking-widest flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-yellow-550 mr-1" /> Demo Admin Access
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Type <code>admin</code> (demo credentials) to unlock all charts, data importers, and academic diagnostics.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Enter passcode..."
                    value={passcode}
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      setPasscodeError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handlePasscodeLogin();
                      }
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-1.5 focus:outline-none focus:border-yellow-500 w-full font-mono placeholder:text-slate-600"
                  />
                  <button
                    onClick={handlePasscodeLogin}
                    className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold text-xs py-1.5 px-4 rounded-lg transition whitespace-nowrap cursor-pointer active:scale-98 shadow hover:shadow-yellow-500/5 font-sans"
                  >
                    Verify Key
                  </button>
                </div>
                {passcodeError && (
                  <p className="text-[10px] text-rose-400 font-medium text-center">
                    ❌ {passcodeError}
                  </p>
                )}
              </div>

            </div>

            <div className="text-center text-[10px] text-slate-500 font-mono">
              Physics Wallah Academic Operations Audit Portal • 2026-27
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* 1. TOP HEADER BANNER */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4" id="portal-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-500 text-slate-950 p-2 rounded-lg font-bold font-display tracking-tight text-xl shadow-lg shadow-yellow-500/10">
              PW
            </div>
            <div>
              <h1 className="text-lg font-bold font-display tracking-tight text-slate-50">
                Teacher Analytics Dashboard
              </h1>
              <span className="text-xs font-mono text-slate-400">
                Interactive Center Diagnostic Engine
              </span>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono bg-slate-950/60 px-4 py-2 rounded-md border border-slate-800">
            {googleUser && (
              <>
                <div className="flex items-center gap-2 mr-2">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || "User"}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full border border-slate-700"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px]">
                      {String(googleUser.displayName || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-slate-300 font-sans truncate max-w-[120px]" title={googleUser.email}>
                    {googleUser.displayName || googleUser.email}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    isAdmin ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                  }`}>
                    {isAdmin ? "Admin" : "Viewer"}
                  </span>
                </div>
                <button
                  onClick={handleDisconnectGoogle}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 px-2.5 py-1 rounded text-[10px] font-sans font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3 h-3 text-rose-455 text-rose-400 whitespace-nowrap" />
                  Sign Out
                </button>
                <span className="text-slate-800 font-sans">|</span>
              </>
            )}
            <span className="text-slate-400">Academic Session: <strong className="text-yellow-400">2026-27</strong></span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Windows evaluated: <strong className="text-cyan-400">T1 & T2 (Latest 2)</strong></span>
          </div>
        </div>
      </header>

      {!hasImportedData && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-500 px-6 py-3 text-xs" id="demo-mode-alert">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
            <span className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 text-yellow-500 animate-pulse" />
              <span>📊 <strong>DEMO MODE (Viewing Sample Test Data Only):</strong> Is samay aap preloaded test data dekh rahe hain. Apni real student file lagane ke liye right side me Excel (.xlsx) file upload karein ya connected Google Sheet use karein.</span>
            </span>
            <div className="flex gap-2">
              <button 
                onClick={handleDownloadXLSXTemplate}
                className="bg-yellow-500/20 hover:bg-yellow-500/35 text-yellow-400 font-bold px-3 py-1 rounded border border-yellow-500/30 transition text-[11px] cursor-pointer"
              >
                📥 Download Excel Template (.xlsx)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT CONTAINER */}
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-main">
        
        {/* GOOGLE SHEETS RIBBON CARDS */}
        {(!googleUser || isAdmin) && (
          <section className={`lg:col-span-12 bg-slate-900 border rounded-xl p-5 shadow-2xl relative overflow-hidden transition-all duration-300 ${
            hasImportedData ? "border-emerald-500/40 bg-slate-900/90" : "border-slate-800"
          }`} id="google-sheets-widget">
            <DailyLedgerImporter
              students={students}
              hasImportedData={hasImportedData}
              isImporting={isImporting}
              importError={importError}
              dragActive={dragActive}
              showTemplateModal={showTemplateModal}
              copiedTemplate={copiedTemplate}
              handleResetToDefaultDemo={handleResetToDefaultDemo}
              handleWipeAllData={handleWipeAllData}
              handleCopyTemplateCSV={handleCopyTemplateCSV}
              handleDownloadSampleCSV={handleDownloadSampleCSV}
              handleDownloadActiveXLSX={handleDownloadActiveXLSX}
              handleDownloadRetentionXLSX={handleDownloadRetentionXLSX}
              handleDownloadResultsXLSX={handleDownloadResultsXLSX}
              handleDownloadAttendanceXLSX={handleDownloadAttendanceXLSX}
              handleDownloadIoqmXLSX={handleDownloadIoqmXLSX}
              handleDownloadRampUpXLSX={handleDownloadRampUpXLSX}
              selectedUploadMatrix={selectedUploadMatrix}
              setSelectedUploadMatrix={setSelectedUploadMatrix}
              importMode={importMode}
              setImportMode={setImportMode}
              handleForceRecalculate={handleForceRecalculate}
              handleDrag={handleDrag}
              handleDrop={handleDrop}
              handleFileChange={handleFileChange}
              setShowTemplateModal={setShowTemplateModal}
              isAdmin={isAdmin}
              googleUser={googleUser}
              handleGoogleLogin={handleGoogleLogin}
              authError={authError}
              setAuthError={setAuthError}
              customAdmins={customAdmins}
              setCustomAdmins={setCustomAdmins}
            />
          </section>
        )}

        {false && (
          <section id="old-google-sheets-widget">
            {/* Subtle background visual glows */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${hasImportedData ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-md font-bold font-display tracking-tight text-slate-50 flex items-center gap-2">
                  Student Ledger & Spreadsheet Manager
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Apna study ledger sync ya upload karein! Authenticate Google Sheets or upload direct offline Excel (.xlsx/.csv) files.
                </p>
              </div>
            </div>
            
            {/* Database mode badge */}
            <div className="flex items-center gap-2 text-xs">
              {hasImportedData ? (
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-mono shadow-sm animate-pulse-subtle">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 block" />
                  Live Sync Database Active
                </span>
              ) : (
                <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-mono shadow-sm font-bold">
                  <span className="w-2 h-2 bg-yellow-400 block animate-pulse w-2 h-2 rounded-full" />
                  PRELOADED TEST DATA ACTIVE
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* COLUMN 1: Google Account Cloud Mode (Cloud Live Sync) */}
            <div className="lg:col-span-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 pb-5 lg:pb-0 lg:pr-6 space-y-4">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-yellow-500 mb-2.5 flex items-center gap-2">
                  <Users className="w-4 h-4 text-yellow-500" />
                  Option A: Google Sheets Sync
                </h3>
                
                {!googleUser ? (
                  <div className="space-y-3">
                    <div className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-4 space-y-3">
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                        Connect your Google Account to authorize direct spreadsheet downloads. Secure and fast.
                      </p>
                      <button
                        onClick={handleGoogleLogin}
                        className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-2.5 transition active:scale-98 cursor-pointer shadow-lg"
                      >
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 block">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                          <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                        Sign In with Google
                      </button>
                    </div>

                    {authError === "unauthorized-domain" && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3.5 space-y-2.5 text-xs animate-fade-in shadow-inner" id="unauthorized-domain-help-panel">
                        <div className="flex items-center gap-1.5 text-amber-500 font-bold">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>Authorized Domain Required</span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-relaxed font-sans">
                          Firebase blocks Authentication requests from dynamically generated URLs path until registered in the console:
                        </p>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800 space-y-1.5">
                          <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Your Dynamic App URL Domain</div>
                          <div className="flex items-center justify-between gap-2 overflow-hidden bg-slate-900 px-2 py-1 rounded">
                            <code className="text-[10px] font-mono text-slate-200 truncate select-all">
                              {window.location.hostname || "localhost"}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(window.location.hostname);
                                setCopiedDomain(true);
                                setTimeout(() => setCopiedDomain(false), 2500);
                              }}
                              className="shrink-0 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-205 text-slate-100 font-bold px-2 py-0.5 rounded flex items-center gap-1 font-mono transition active:scale-95"
                            >
                              {copiedDomain ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Clipboard className="w-2.5 h-2.5" />}
                              {copiedDomain ? "Copied" : "Copy"}
                            </button>
                          </div>
                        </div>
                        <ol className="text-[10px] text-slate-405 text-slate-300 list-decimal list-inside space-y-1 bg-slate-950/45 p-2 rounded leading-relaxed">
                          <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-yellow-500 underline hover:text-yellow-405 inline-flex items-center gap-0.5">Firebase Console <ExternalLink className="w-2.5 h-2.5 inline" /></a></li>
                          <li>Open your project: <strong className="text-slate-200 font-mono">gen-lang-client-0793240528</strong></li>
                          <li>Navigate to <strong className="text-slate-100">Authentication &gt; Settings &gt; Authorized domains</strong></li>
                          <li>Click <strong className="text-slate-100">Add domain</strong>, paste the domain copied above, and save.</li>
                        </ol>
                        <p className="text-[10px] text-yellow-500 leading-relaxed font-sans font-medium">
                          💡 Quick Option: You can completely bypass cloud sync by dragging any workbook file into **Option C (Offline Excel Upload)** right beside!
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5 space-y-3">
                    <div className="flex items-center gap-3">
                      {googleUser.photoURL ? (
                        <img
                          src={googleUser.photoURL}
                          alt={googleUser.displayName || "Google User"}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full border border-slate-700 shadow-inner"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                          {String(googleUser.displayName || "G").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold text-slate-100 truncate">{googleUser.displayName}</div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">{googleUser.email}</div>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDisconnectGoogle}
                      className="w-full bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold py-1.5 px-3 rounded text-[11px] font-mono flex items-center justify-center gap-1.5 border border-slate-700 hover:text-slate-100 active:scale-98 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Disconnect Google Session
                    </button>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => setShowTemplateModal(!showTemplateModal)}
                  className="text-xs text-yellow-500 hover:text-yellow-400 font-mono flex items-center gap-1 border-b border-transparent hover:border-yellow-500/30 transition pb-0.5"
                >
                  <Info className="w-3.5 h-3.5" />
                  {showTemplateModal ? "Hide Sheet Design Instructions" : "Show Sheet Design Instructions"}
                </button>
              </div>
            </div>

            {/* COLUMN 2: Spreadsheet URL target input & Cloud fetch buttons */}
            <div className="lg:col-span-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 pb-5 lg:pb-0 lg:px-6 space-y-3">
              <div className="space-y-3">
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Option B: Feed Google spreadsheet
                </h3>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider font-semibold">
                      Google Spreadsheet URL / ID
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={spreadsheetInput}
                        onChange={(e) => setSpreadsheetInput(e.target.value)}
                        placeholder="Paste Google Sheet URL directly..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 pl-8 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                      />
                      <LinkIcon className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-600" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider font-semibold">
                        Target Range (Sheet!Cells)
                      </label>
                      <span className="text-[9px] text-slate-500 font-sans italic">Only for authenticated sync</span>
                    </div>
                    <input
                      type="text"
                      value={sheetRangeInput}
                      onChange={(e) => setSheetRangeInput(e.target.value)}
                      placeholder="e.g. Sheet1!A:Z (Not needed for public view URL)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 font-mono"
                    />
                  </div>
                </div>

                {fetchSheetError && (
                  <div className="bg-rose-500/10 border border-rose-500/35 rounded-lg p-3.5 space-y-2 text-xs text-rose-450 text-rose-400 font-sans leading-relaxed shadow-sm">
                    <div className="flex items-start justify-between gap-2 text-rose-300 font-bold font-mono text-[11px]">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                        <span>Sync Cloud Sheet Terminated with Errors</span>
                      </div>
                      <button 
                        onClick={() => setFetchSheetError("")}
                        className="text-slate-400 hover:text-slate-250 bg-slate-900/60 hover:bg-slate-900 border border-slate-850 px-1.5 py-0.5 rounded text-[9px] font-bold transition hover:scale-102 cursor-pointer"
                        title="Clear this error notification"
                      >
                        Clear Error
                      </button>
                    </div>
                    
                    <p className="font-mono text-[10px] bg-slate-950 px-2 py-1.5 rounded border border-rose-950/40 text-rose-350 text-rose-300 select-all overflow-x-auto whitespace-pre-wrap leading-tight">
                      {fetchSheetError}
                    </p>

                    {/* Check if error relates to disabled Sheets API */}
                    {(fetchSheetError.includes("Sheets API") || fetchSheetError.includes("has not been used") || fetchSheetError.includes("disabled")) ? (
                      <div className="mt-2.5 p-3 bg-slate-950 rounded-lg border border-yellow-500/20 text-[11px] text-slate-300 space-y-2">
                        <span className="font-bold text-yellow-500 flex items-center gap-1">
                          🛠️ Troubleshooting: Enable Google Sheets API
                        </span>
                        <p>
                          Your Google API console requires Sheets API permission to read values. Please enable it:
                        </p>
                        <div className="pt-1 font-mono">
                          <a 
                            href={(() => {
                              const match = fetchSheetError.match(/(https:\/\/console\.[a-zA-Z0-9\-\.\/\?_=&\+]+)/);
                              return match ? match[1] : "https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=521419247947";
                            })()} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-350 hover:text-yellow-350 text-yellow-300 border border-yellow-500/35 px-2.5 py-1 rounded font-bold transition hover:scale-102"
                          >
                            Enable Google Sheets API <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          After enabling, please wait 1-2 minutes for Google's servers to update, then click **Sync cloud sheet** again!
                        </p>
                      </div>
                    ) : null}

                    {/* Check if error relates to Office file (.xlsx / .xls format) */}
                    {(fetchSheetError.includes("Office file") || fetchSheetError.includes("not supported") || fetchSheetError.includes("document must not be")) ? (
                      <div className="mt-2.5 p-3 bg-slate-950 rounded-lg border border-rose-500/20 text-[11px] text-slate-300 space-y-2">
                        <span className="font-bold text-rose-450 flex items-center gap-1">
                          📁 Troubleshooting: Convert XLSX to Google Sheet format
                        </span>
                        <p>
                          Google Sheets API cannot directly read Excel (.xlsx/Office) formats saved on your Drive. Please convert your file:
                        </p>
                        <ol className="list-decimal list-inside space-y-1 pl-1 text-[10.5px] text-slate-300">
                          <li>Open the XLSX file in Google Drive.</li>
                          <li>In the top menu, click <strong className="text-slate-100">File &rarr; Save as Google Sheets</strong>.</li>
                          <li>Copy the URL of the newly created sheet and paste it here.</li>
                        </ol>
                        <p className="text-[10px] text-slate-400 leading-normal italic">
                          💡 Tip: Alternatively, you can drag your offline XLSX file directly into Option C (Offline Excel Upload) next door!
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  onClick={handleFetchGoogleSheet}
                  disabled={isFetchingSheet || !spreadsheetInput}
                  className="bg-emerald-650 hover:bg-emerald-600 disabled:bg-slate-800 disabled:opacity-40 text-slate-50 font-semibold px-3.5 py-1.5 rounded-lg text-[11px] flex items-center justify-center gap-1.5 active:scale-98 transition shadow-lg cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isFetchingSheet ? "animate-spin" : ""}`} />
                  Sync cloud sheet
                </button>

                {hasImportedData && (
                  <button
                    onClick={handleResetToDefaultDemo}
                    className="bg-slate-800 hover:bg-slate-755 text-slate-350 font-semibold px-2.5 py-1.5 rounded-lg text-[11px] flex items-center justify-center gap-1 border border-slate-700/85 hover:text-slate-200 transition"
                  >
                    Reset Demo
                  </button>
                )}
              </div>
            </div>

            {/* COLUMN 3: Drag & Drop / Click local Excel/CSV uploader */}
            <div className="lg:col-span-4 flex flex-col justify-between pl-0 lg:pl-6 space-y-3">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-cyan-400 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-cyan-450" />
                  Option C: Offline Excel Upload
                </h3>
                <p className="text-[10px] text-slate-450 leading-relaxed">
                  Apni offline <strong className="text-slate-200">XLSX, XLS, ya CSV</strong> file direct drag kar ke import karein.
                </p>

                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-all mt-1.5 min-h-[105px] flex flex-col justify-center ${
                    dragActive
                      ? "border-cyan-400 bg-cyan-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                  } relative cursor-pointer`}
                >
                  <input
                    type="file"
                    id="excel-file-upload-input"
                    multiple={false}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <FileSpreadsheet className={`w-8 h-8 ${dragActive ? "text-cyan-400 animate-bounce" : "text-slate-500"}`} />
                    <span className="text-[11px] font-medium text-slate-300">
                      {isFetchingSheet ? "Processing..." : "Drag file here or click to browse"}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">Supports Excel / CSV format</span>
                  </div>
                </div>
              </div>

              {/* Workspace Download & Export Ledger */}
              <div className="pt-2 border-t border-slate-800/80 mt-2">
                <button
                  onClick={handleDownloadActiveXLSX}
                  className="w-full bg-slate-805 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold py-1.5 px-2 bg-slate-800 text-[10px] rounded flex items-center justify-center gap-1.5 transition active:scale-98 cursor-pointer"
                  title="Aapke current selected and coached records ko save krein"
                >
                  <Download className="w-3 h-3 text-cyan-400" />
                  📥 Download Active Ledger (.xlsx)
                </button>
              </div>
            </div>

          </div>

          {/* Accordion expand block for Instructions / Guidelines */}
          {showTemplateModal && (
            <div className="mt-5 pt-4 border-t border-slate-800/80 bg-slate-950/40 rounded-lg p-5 space-y-5 animate-fade-in" id="sheet-instructions-panel">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-yellow-500" />
                  <div>
                    <h4 className="text-sm font-bold text-yellow-500 font-sans">
                      Google Sheet Structure & Mock Test Ledger Guidelines
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Sheet me kis tarah data likhna hai (Data entry guide)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleCopyTemplateCSV}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-200 font-mono text-xs py-1.5 px-3 rounded-lg border border-slate-700 hover:border-slate-650 transition flex items-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                    {copiedTemplate ? "Copied!" : "📋 Copy Clean Headers"}
                  </button>

                  <button
                    onClick={handleDownloadSampleCSV}
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-98 shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    📥 Download Mock Data Table (.csv)
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  Visual Spreadsheet Mockup (Exactly how your Sheet1 should look)
                </span>
                
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  Niche diye gye interactive sheet pattern ko dhyan se dekho. Apne Google Sheet me headers (Row 1) bilkul aisi hi spelling me daalein. Column automatic map ho jayenge!
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner">
                  <table className="w-full text-[10px] md:text-[11px] font-mono border-collapse min-w-[1250px]">
                    <thead className="bg-slate-900 text-slate-400 select-none border-b border-slate-800">
                      <tr>
                        <th className="w-10 bg-slate-950 border-r border-slate-800 text-[10px] text-center font-bold"></th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">A</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">B</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">C</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">D</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">E</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">F</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">G</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">H</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">I</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">J</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">K</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">L</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">M</th>
                        <th className="py-1 px-2 border-r border-slate-800 text-center font-semibold text-[10px] bg-slate-900/30">N</th>
                        <th className="py-1 px-2 text-center font-semibold text-[10px] bg-slate-900/30">O</th>
                      </tr>
                      <tr className="bg-slate-900 text-yellow-500 border-b border-slate-800">
                        <td className="bg-slate-950 text-slate-500 text-center text-[10px] border-r border-slate-800 font-bold select-none">1</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-yellow-500/90 bg-yellow-500/5">Student ID</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-yellow-500/90 bg-yellow-500/5">Student Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-yellow-500/90 bg-yellow-500/5">Grade (9, 10, 11, 12)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-yellow-500/90 bg-yellow-500/5">Center Name</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-emerald-400 bg-emerald-500/5">Test 1 Attendance (Present/Absent)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-emerald-400 bg-emerald-500/5">Test 2 Attendance (Present/Absent)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-cyan-400 bg-cyan-500/5">T1 Physics Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-cyan-400 bg-cyan-500/5">T1 Chemistry Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-cyan-400 bg-cyan-500/5">T1 Maths Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-cyan-400 bg-cyan-500/5">T2 Physics Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-cyan-400 bg-cyan-500/5">T2 Chemistry Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-cyan-400 bg-cyan-500/5">T2 Maths Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-purple-400 bg-purple-500/5">IOQM Score (%)</td>
                        <td className="py-1.5 px-2 border-r border-slate-800 font-bold text-left whitespace-nowrap text-purple-400 bg-purple-500/5">Ramp Up Score (%)</td>
                        <td className="py-1.5 px-2 font-bold text-left whitespace-nowrap text-teal-400 bg-teal-500/5">Retained (Yes/No)</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300">
                      {/* Row 2: Standard Present Case */}
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">2</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-001</td>
                        <td className="p-1 px-2 border-r border-slate-800">Aarav Sharma</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-bold text-cyan-400">11</td>
                        <td className="p-1 px-2 border-r border-slate-800 whitespace-nowrap text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-emerald-400 bg-emerald-500/5">Present</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-emerald-400 bg-emerald-500/5">Present</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">92</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">95</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">94</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">90</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">92</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">96</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-purple-400/90">82</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 text-center text-emerald-400 font-semibold">Yes</td>
                      </tr>
                      {/* Row 3: Borderline Case with Ramp Up (10th) */}
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">3</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-002</td>
                        <td className="p-1 px-2 border-r border-slate-800">Rahul Gupta</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-bold text-cyan-400">10</td>
                        <td className="p-1 px-2 border-r border-slate-800 whitespace-nowrap text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-emerald-400 bg-emerald-500/5">Present</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-emerald-400 bg-emerald-500/5">Present</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">55</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">34</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">45</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">58</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">42</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">48</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-purple-400/90">35</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-purple-400 bg-purple-500/5">55</td>
                        <td className="p-1 px-2 text-center text-emerald-400 font-semibold">Yes</td>
                      </tr>
                      {/* Row 4: Single Absent evaluated from remaining test (Rule B) */}
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">4</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-006</td>
                        <td className="p-1 px-2 border-r border-slate-800">Rohan Kapoor</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-bold text-cyan-400">11</td>
                        <td className="p-1 px-2 border-r border-slate-800 whitespace-nowrap text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-emerald-400 bg-emerald-500/5">Present</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-rose-400 bg-rose-500/5 anim-pulse">Absent</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">82</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">78</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-cyan-400/90">81</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-purple-400/90">65</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 text-center text-emerald-400 font-semibold">Yes</td>
                      </tr>
                      {/* Row 5: Double Absent completely excluded from center metrics denominator (Rule A) */}
                      <tr className="hover:bg-slate-900/40 text-slate-200">
                        <td className="bg-slate-950 text-slate-500 text-center select-none font-bold border-r border-slate-800">5</td>
                        <td className="p-1 px-2 border-r border-slate-800 font-semibold text-slate-100">PW-LKO-004</td>
                        <td className="p-1 px-2 border-r border-slate-800">Vikram Malhotra</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-bold text-cyan-400">9</td>
                        <td className="p-1 px-2 border-r border-slate-800 whitespace-nowrap text-slate-400">Lucknow Chowk Centre</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-rose-400 bg-rose-500/5">Absent</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center font-semibold text-rose-400 bg-rose-500/5">Absent</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-center text-slate-600 italic">blank</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-purple-400/90">20</td>
                        <td className="p-1 px-2 border-r border-slate-800 text-right font-mono text-purple-400 bg-purple-500/5">30</td>
                        <td className="p-1 px-2 text-center text-rose-450 font-semibold">No</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Data Type Descriptions in simple English */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="english-data-type-guide">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm">
                  <div className="text-[12px] font-bold text-yellow-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 block" />
                    1. Classes & Centers (Basic Information)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>Student ID:</strong> This is a unique roll number or registration code.
                    <br /><strong>Grade:</strong> The sheet must strictly contain <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">9</code>, <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">10</code>, <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">11</code>, or <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">12</code>.
                    <br /><strong>Center Name:</strong> Write the branch name exactly (e.g., Lucknow Chowk Centre).
                  </p>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-emerald-500/10">
                  <div className="text-[12px] font-bold text-emerald-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 block" />
                    2. Attendance (Attendance Type)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>Test 1 & Test 2 Attendance:</strong> Columns must strictly contain <code className="text-emerald-400 font-mono bg-slate-950 px-1 rounded">Present</code> or <code className="text-rose-400 font-mono bg-slate-950 px-1 rounded">Absent</code>.
                    <br /><em className="text-slate-400 text-[10px]">Note: Students marked Absent for both tests are completely excluded from the metric's denominator.</em>
                  </p>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-cyan-500/10">
                  <div className="text-[12px] font-bold text-cyan-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 block" />
                    3. Marks / Percentage (Score Formats)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>Physics, Chemistry, Maths marks:</strong> Set numeric scores between <code className="text-cyan-400 font-mono bg-slate-950 px-1 rounded">0 and 100</code>.
                    <br /><strong>When to leave blank?</strong> If test attendance is marked as <code className="text-rose-450">Absent</code>, leave these score fields completely blank!
                  </p>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-purple-500/10">
                  <div className="text-[12px] font-bold text-purple-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-400 block" />
                    4. Other Marks & Retention (General Rules)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>IOQM Score / Ramp Up:</strong> Metric range between <code className="text-purple-400 font-mono bg-slate-950 px-1 rounded">0 and 100</code> percentage marks.
                    <br /><strong>Ramp Up:</strong> Optional marks for 9th and 10th graders; leave completely blank for 11th and 12th graders.
                    <br /><strong>Retained Status:</strong> Strictly specify <code className="text-purple-400 bg-slate-950 px-1 rounded font-mono">Yes</code> or <code className="text-purple-400 bg-slate-950 px-1 rounded font-mono">No</code>.
                  </p>
                </div>
              </div>

              {/* Step instructions */}
              <div className="text-[11px] bg-slate-950 border border-slate-800 rounded-lg p-4 text-slate-400 font-mono space-y-2">
                <div className="text-slate-200 font-bold flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="flex items-center gap-1.5">⚡ Directions for Importing Main Google Sheets Data:</span>
                  {spreadsheetInput && (
                    <a
                      href={spreadsheetInput.startsWith("http") ? spreadsheetInput : `https://docs.google.com/spreadsheets/d/${spreadsheetInput}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      Open Connected Sheet <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 font-sans">
                  <li>Click the **"Download Mock Data Table"** button below to download the CSV mock template structure.</li>
                  <li>Open a new spreadsheet file on Google Drive and click on the first cell (**A1**).</li>
                  <li>Click **File &rarr; Import** inside your Google Sheet interface and upload the downloaded CSV file.</li>
                  <li>Click the **Share** button in the top-right corner of Google Sheets. Set the sharing status to **"Anyone with the link can view"** so the dashboard can access the data.</li>
                  <li>Copy the public URL of your Google Sheet, paste it in the connection input field above, and click **"Fetch & Sync Student Ledger"**!</li>
                </ol>
              </div>
            </div>
          )}
        </section>
        )}

        {/* SECTION B: CORE NATIONAL COMPREHENSIVE RANK CHECKS COMPARATOR TABLE (Start with this 2nd Screen shot, full width) */}
        <section className="lg:col-span-12" id="national-rank-section">
          {/* SECTION B: CORE NATIONAL COMPREHENSIVE RANK CHECKS COMPARATOR TABLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold font-display text-slate-50 flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-500 shrink-0" />
                  🥇 Comprehensive National Leaderboard (Region, Combined Center, Center Hub Drill-down)
                </h3>
                <p className="text-xs text-slate-400">Review other standing criteria scores in a unified admin spreadsheet index grid. Click headers to sort.</p>
              </div>
              <button
                onClick={handleExportLeaderboardCSV}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-98 shadow-md shrink-0"
                title="Export the national leaderboard data directly to a CSV spreadsheet"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Leaderboard (.csv)</span>
              </button>
            </div>

            {/* Dynamic Hierarchy Selector for Drill-Down Check */}
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono font-bold uppercase tracking-wider shrink-0">
                  🎯 View Drill Level:
                </span>
                <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-lg border border-slate-800 font-sans">
                  <button
                    onClick={() => {
                      setLeaderboardLevel("region");
                      const list = getRankedMetricGroups(simulatedStudents, "region");
                      const topItem = list[0]?.centerName || "General";
                      setSelectedCenterName(topItem);
                    }}
                    className={`px-3.5 py-1.5 rounded-md font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                      leaderboardLevel === "region"
                        ? "bg-emerald-600 text-slate-50 shadow-md"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-850"
                    }`}
                  >
                    🌍 Region Ranks
                  </button>
                  <button
                    onClick={() => {
                      setLeaderboardLevel("combined_center");
                      const list = getRankedMetricGroups(simulatedStudents, "combined_center");
                      const topItem = list[0]?.centerName || "General Combined";
                      setSelectedCenterName(topItem);
                    }}
                    className={`px-3.5 py-1.5 rounded-md font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                      leaderboardLevel === "combined_center"
                        ? "bg-cyan-600 text-slate-50 shadow-md"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-850"
                    }`}
                  >
                    🏢 Combined Center
                  </button>
                  <button
                    onClick={() => {
                      setLeaderboardLevel("center");
                      const list = getRankedMetricGroups(simulatedStudents, "center");
                      const topItem = list[0]?.centerName || "No Active Centers";
                      setSelectedCenterName(topItem);
                    }}
                    className={`px-3.5 py-1.5 rounded-md font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                      leaderboardLevel === "center"
                        ? "bg-yellow-500 text-slate-950 shadow-md font-extrabold"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-850"
                    }`}
                  >
                    📍 Center Hub
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-400 bg-slate-900 border border-slate-800 py-1.5 px-3 rounded-lg shrink-0 font-medium font-mono">
                Showing <strong className="text-slate-200 capitalize">{leaderboardLevel.replace("_", " ")}</strong> stats individually.
              </div>
            </div>

            {/* Highly interactive, easy-to-use search and quick filters toolbar in the front */}
            <div className="bg-slate-950/65 p-3.5 rounded-xl border border-slate-800/80 mb-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-850 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300 uppercase tracking-wide">
                  <Sliders className="w-3.5 h-3.5 text-yellow-500 text-yellow-405" />
                  <span>📋 Quick Leaderboard Standing Filters</span>
                </div>
                {(regionFilter !== "All" || combinedCenterFilter !== "All" || sidebarSortAsc) && (
                  <button
                    onClick={() => {
                      setRegionFilter("All");
                      setCombinedCenterFilter("All");
                      setSidebarSortAsc(false);
                    }}
                    className="text-[11px] text-yellow-405 text-yellow-400 hover:text-yellow-300 font-mono font-bold underline transition cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" />
                    Reset Filter Criteria
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Region Dropdown Filter */}
                <div>
                  <label className="text-[10px] text-slate-450 text-slate-400 block font-mono font-semibold mb-1 uppercase tracking-wider">
                    🌍 Filter Region:
                  </label>
                  <select
                    value={regionFilter}
                    onChange={(e) => {
                      setRegionFilter(e.target.value);
                      setCombinedCenterFilter("All");
                    }}
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-yellow-500/85 transition"
                  >
                    {allRegions.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg === "All" ? "🌍 National (All Regions)" : reg}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Combined Center Dropdown Filter */}
                <div>
                  <label className="text-[10px] text-slate-455 text-slate-400 block font-mono font-semibold mb-1 uppercase tracking-wider">
                    🏢 Filter Combined Center:
                  </label>
                  <select
                    value={combinedCenterFilter}
                    disabled={regionFilter === "All"}
                    onChange={(e) => setCombinedCenterFilter(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-yellow-500/85 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {allCombinedCenters.map((cc) => (
                      <option key={cc} value={cc}>
                        {cc === "All" ? "🏢 All Combined Centers" : cc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Direction Toggle control right in the front! */}
                <div className="flex flex-col justify-end">
                  <span className="text-[10px] text-slate-460 text-slate-400 block font-mono font-semibold mb-1 uppercase tracking-wider">
                    🔄 Leaderboard Sort Mode:
                  </span>
                  <button
                    onClick={() => setSidebarSortAsc(!sidebarSortAsc)}
                    className="w-full flex items-center justify-between bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-slate-250 text-slate-200 hover:text-yellow-405 hover:border-yellow-500/30 p-2 rounded-lg transition cursor-pointer"
                    title="Toggle Sorting Direction to find low performance units quickly"
                  >
                    <span className="text-[11px]">Ascending order?</span>
                    {sidebarSortAsc ? (
                      <span className="text-rose-450 text-rose-400 flex items-center gap-1 font-bold">
                        Low to High <ArrowUpNarrowWide className="w-3.5 text-rose-400" />
                      </span>
                    ) : (
                      <span className="text-emerald-450 text-emerald-400 flex items-center gap-1 font-bold">
                        High to Low <ArrowDownWideNarrow className="w-3.5 text-emerald-400" />
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10.5px] text-slate-500 font-mono pt-1">
                <span>
                  Found <strong className="text-slate-205 text-slate-300 font-bold">{sortedRankedCenters.length}</strong> matching entries out of <strong className="text-slate-205 text-slate-300 font-bold">{rankedCenters.length}</strong> total in Drill level.
                </span>
                {regionFilter !== "All" && (
                  <span className="text-yellow-500 font-bold">
                    📍 Sub-Group Rank Active
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs bg-slate-950 font-sans">
                  <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 text-[10px] uppercase select-none">
                    <tr>
                      <th 
                        onClick={() => {
                          if (centerSortField === "rank") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("rank");
                            setCenterSortAsc(true);
                          }
                        }}
                        className="p-3 cursor-pointer hover:bg-slate-800 hover:text-slate-100 transition whitespace-nowrap"
                      >
                        Rank {centerSortField === "rank" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                      <th 
                        onClick={() => {
                          if (centerSortField === "centerName") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("centerName");
                            setCenterSortAsc(true);
                          }
                        }}
                        className="p-3 text-left cursor-pointer hover:bg-slate-800 hover:text-slate-100 transition whitespace-nowrap text-yellow-400 font-bold"
                      >
                        {leaderboardLevel === "region" ? "🌍 Region" : leaderboardLevel === "combined_center" ? "🏢 Combined Center" : "📍 Center Hub"} {centerSortField === "centerName" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                      {leaderboardLevel !== "region" && (
                        <th 
                          onClick={() => {
                            if (centerSortField === "region") {
                              setCenterSortAsc(!centerSortAsc);
                            } else {
                              setCenterSortField("region");
                              setCenterSortAsc(true);
                            }
                          }}
                          className="p-3 text-left cursor-pointer hover:bg-slate-800 hover:text-slate-100 transition whitespace-nowrap text-emerald-400"
                        >
                          Region {centerSortField === "region" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                      )}
                      {leaderboardLevel === "center" && (
                        <th 
                          onClick={() => {
                            if (centerSortField === "combined_center") {
                              setCenterSortAsc(!centerSortAsc);
                            } else {
                              setCenterSortField("combined_center");
                              setCenterSortAsc(true);
                            }
                          }}
                          className="p-3 text-left cursor-pointer hover:bg-slate-800 hover:text-slate-105 transition whitespace-nowrap text-cyan-400"
                        >
                          Combined Center {centerSortField === "combined_center" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                      )}
                      <th 
                        onClick={() => {
                          if (centerSortField === "consolidatedScore") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("consolidatedScore");
                            setCenterSortAsc(false);
                          }
                        }}
                        className="p-3 text-center cursor-pointer hover:bg-slate-800 hover:text-slate-105 transition text-yellow-400 font-bold bg-yellow-500/5 whitespace-nowrap"
                      >
                        Overall Score {centerSortField === "consolidatedScore" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                      <th 
                        onClick={() => {
                          if (centerSortField === "subjective") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("subjective");
                            setCenterSortAsc(false);
                          }
                        }}
                        className="p-3 text-center cursor-pointer hover:bg-slate-800 hover:text-slate-105 transition text-cyan-400 whitespace-nowrap"
                      >
                        Subjective (25%) {centerSortField === "subjective" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                      <th 
                        onClick={() => {
                          if (centerSortField === "ioqm") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("ioqm");
                            setCenterSortAsc(false);
                          }
                        }}
                        className="p-3 text-center cursor-pointer hover:bg-slate-800 hover:text-slate-105 transition text-yellow-550 font-medium whitespace-nowrap"
                      >
                        IOQM (20%) {centerSortField === "ioqm" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                      <th 
                        onClick={() => {
                          if (centerSortField === "rampUp") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("rampUp");
                            setCenterSortAsc(false);
                          }
                        }}
                        className="p-3 text-center cursor-pointer hover:bg-slate-800 hover:text-slate-105 transition text-purple-405 whitespace-nowrap"
                      >
                        Ramp Up (15%) {centerSortField === "rampUp" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                      <th 
                        onClick={() => {
                          if (centerSortField === "attendance") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("attendance");
                            setCenterSortAsc(false);
                          }
                        }}
                        className="p-2.5 text-center cursor-pointer hover:bg-slate-800 hover:text-slate-105 transition text-emerald-400 whitespace-nowrap"
                      >
                        Attn (10%) {centerSortField === "attendance" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                      <th 
                        onClick={() => {
                          if (centerSortField === "retention") {
                            setCenterSortAsc(!centerSortAsc);
                          } else {
                            setCenterSortField("retention");
                            setCenterSortAsc(false);
                          }
                        }}
                        className="p-2.5 text-center cursor-pointer hover:bg-slate-800 hover:text-slate-150 transition text-orange-400 whitespace-nowrap"
                      >
                        Retn (30%) {centerSortField === "retention" ? (centerSortAsc ? "▲" : "▼") : "↕"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {/* Special National Combined Row */}
                    <tr 
                      onClick={() => setSelectedCenterName("All Centers Combined")}
                      className={`transition-colors cursor-pointer hover:bg-slate-850/40 text-[11px] ${
                        selectedCenterName === "All Centers Combined" ? "bg-cyan-950/40 border-y border-cyan-500/50" : ""
                      }`}
                    >
                      <td className="p-3 font-mono font-extrabold text-slate-50 border-r border-slate-800/40">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                          NAT
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-200">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={selectedCenterName === "All Centers Combined" ? "text-cyan-400 font-bold" : "text-slate-300"}>
                            👑 All Centers Combined (National)
                          </span>
                          {selectedCenterName === "All Centers Combined" && (
                            <span className="bg-cyan-500 text-slate-950 font-mono font-bold text-[8px] px-1.5 py-0.2 rounded shrink-0 uppercase">Active</span>
                          )}
                        </div>
                      </td>
                      {leaderboardLevel !== "region" && (
                        <td className="p-3 text-left font-semibold text-emerald-400 font-mono">
                          All Regions
                        </td>
                      )}
                      {leaderboardLevel === "center" && (
                        <td className="p-3 text-left font-semibold text-cyan-400">
                          All Combined
                        </td>
                      )}
                      <td className="p-3 font-mono font-bold text-center bg-cyan-500/10 text-cyan-400 text-xs shadow-inner">
                        {nationalCombinedMetrics.consolidatedScore.toFixed(1)}
                      </td>
                      <td className="p-3 font-mono text-center text-slate-300">
                        {nationalCombinedMetrics.subjectiveTestScore.toFixed(1)}
                      </td>
                      <td className="p-3 font-mono text-center text-slate-300">
                        {nationalCombinedMetrics.ioqmScore.toFixed(1)}
                      </td>
                      <td className="p-3 font-mono text-center text-slate-300">
                        {nationalCombinedMetrics.rampUpScore.toFixed(1)}
                      </td>
                      <td className="p-2.5 font-mono text-center text-slate-300">
                        {nationalCombinedMetrics.testAttendanceScore.toFixed(1)}
                      </td>
                      <td className="p-2.5 font-mono text-center text-slate-300">
                        {nationalCombinedMetrics.studentRetentionScore.toFixed(1)}
                      </td>
                    </tr>

                    {sortedRankedCenters.map((item) => {
                      const isSelectedCenter = item.centerName === selectedCenterName;
                      return (
                        <tr 
                          key={item.centerName} 
                          onClick={() => setSelectedCenterName(item.centerName)}
                          className={`transition-colors cursor-pointer hover:bg-slate-850/40 text-[11px] ${
                            isSelectedCenter ? "bg-slate-800/70 border-y-2 border-yellow-500/50 animate-pulse" : ""
                          }`}
                        >
                          <td className="p-3 font-mono font-extrabold text-slate-50 border-r border-slate-800/40">
                            {regionFilter !== "All" || combinedCenterFilter !== "All" ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="px-1 py-0.5 rounded text-[8px] font-mono leading-none bg-slate-900 border border-slate-800 text-slate-400" title="National Rank">
                                  NAT #{item.rank}
                                </span>
                                <span className="px-1 py-0.5 rounded text-[9.5px] font-mono leading-none bg-yellow-500/20 text-yellow-405 font-bold border border-yellow-500/35" title="Local Rank inside active Filter">
                                  LOCAL #{item.localRank}
                                </span>
                              </div>
                            ) : (
                              <span className={`px-2 py-0.5 rounded ${
                                item.rank === 1 ? "bg-yellow-500/20 text-yellow-405" :
                                item.rank === 2 ? "bg-slate-350/25 text-slate-300" :
                                item.rank === 3 ? "bg-amber-700/25 text-amber-500" : "text-slate-400"
                              }`}>
                                #{item.rank}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-semibold text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <span className={isSelectedCenter ? "text-yellow-450 text-yellow-405 font-bold" : "text-slate-300"}>
                                {item.centerName}
                              </span>
                              {isSelectedCenter && <span className="bg-yellow-400 text-slate-950 font-mono font-bold text-[8px] px-1.5 py-0.2 rounded shrink-0 uppercase">Active</span>}
                            </div>
                          </td>
                          {leaderboardLevel !== "region" && (
                            <td className="p-3 text-left font-semibold text-emerald-400 font-mono">
                              {item.region || "General"}
                            </td>
                          )}
                          {leaderboardLevel === "center" && (
                            <td className="p-3 text-left font-semibold text-cyan-400">
                              {item.combined_center || "General Combined"}
                            </td>
                          )}
                          <td className="p-3 font-mono font-bold text-center bg-yellow-500/10 text-yellow-405 text-xs shadow-inner">
                            {item.consolidatedScore.toFixed(1)}
                          </td>
                          <td className="p-3 font-mono text-center text-slate-350">
                            {item.subjectiveTestScore.toFixed(1)}
                          </td>
                          <td className="p-3 font-mono text-center text-slate-350">
                            {item.ioqmScore.toFixed(1)}
                          </td>
                          <td className="p-3 font-mono text-center text-slate-350">
                            {item.rampUpScore.toFixed(1)}
                          </td>
                          <td className="p-2.5 font-mono text-center text-slate-350">
                            {item.testAttendanceScore.toFixed(1)}
                          </td>
                          <td className="p-2.5 font-mono text-center text-slate-350">
                            {item.studentRetentionScore.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </div>
        </section>

            {/* 2. LEFT PANEL: ALL CENTERS LEADERBOARD PROGRESS */}
            <section className="lg:col-span-4 space-y-4" id="leaderboard-section">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
              <div>
                <h2 className="font-display font-semibold text-slate-50 text-md flex items-center gap-2">
                  <Award className="text-yellow-500 w-5 h-5 flex-shrink-0" />
                  National Center Ranks
                </h2>
                <p className="text-[10px] text-slate-400 mt-1">
                  Select a metric tab to view live individual sorted leaderboard rankings.
                </p>
              </div>
              <span className="text-[9px] text-slate-450 text-slate-400 bg-slate-950 px-2 py-1 rounded font-mono uppercase font-bold text-center">
                Live Tables
              </span>
            </div>

            {/* DRILL DOWN & FILTER BY REGION/COMBINED CENTER */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                  🛠️ Filter & Drill Down Standing
                </span>
                {(regionFilter !== "All" || combinedCenterFilter !== "All" || sidebarSortAsc) && (
                  <button
                    onClick={() => {
                      setRegionFilter("All");
                      setCombinedCenterFilter("All");
                      setSidebarSortAsc(false);
                    }}
                    className="text-[9.5px] text-yellow-500 hover:text-yellow-400 font-mono font-bold underline transition cursor-pointer"
                  >
                    Reset filters
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-slate-400 block font-mono font-semibold mb-1">Region</label>
                  <select
                    value={regionFilter}
                    onChange={(e) => {
                      setRegionFilter(e.target.value);
                      setCombinedCenterFilter("All");
                    }}
                    className="w-full bg-slate-900 border border-slate-800 text-[11px] text-slate-200 rounded p-1.5 focus:outline-none focus:border-yellow-500/80 transition"
                  >
                    {allRegions.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg === "All" ? "🌍 All Regions" : reg}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 block font-mono font-semibold mb-1">Combined Center</label>
                  <select
                    value={combinedCenterFilter}
                    disabled={regionFilter === "All"}
                    onChange={(e) => setCombinedCenterFilter(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-[11px] text-slate-200 rounded p-1.5 focus:outline-none focus:border-yellow-500/80 transition disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
                  >
                    {allCombinedCenters.map((cc) => (
                      <option key={cc} value={cc}>
                        {cc === "All" ? "🏢 All Combined" : cc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sidebar sorting toggle control for the leaderboard */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-900 text-[10px]">
                <span className="text-slate-400 font-mono">
                  Matching: <strong className="text-slate-100 font-bold">{activeMetricList.length}</strong>
                </span>

                <button
                  onClick={() => setSidebarSortAsc(!sidebarSortAsc)}
                  id="toggle-sort-direction-btn"
                  className="flex items-center gap-1 bg-slate-900 border border-slate-800 text-[9.5px] font-mono font-bold text-slate-300 hover:text-yellow-400 transition hover:border-yellow-500/30 px-2 py-1 rounded cursor-pointer"
                  title="Toggle Sorting Direction to find low performance units quickly"
                >
                  <span>Sort Order:</span>
                  {sidebarSortAsc ? (
                    <span className="text-rose-400 flex items-center gap-1 font-bold">
                      Low to High <ArrowUpNarrowWide className="w-3" />
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1 font-bold">
                      High to Low <ArrowDownWideNarrow className="w-3" />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* MULTI-METRIC INDIVIDUAL TABLES TABS */}
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-850/80 grid grid-cols-3 gap-1 mb-4 text-[10px]" id="leaderboard-metric-tabs">
              <button
                onClick={() => setLeaderboardMetric("combined")}
                className={`py-1.5 px-0.5 rounded font-mono font-bold transition duration-150 text-center cursor-pointer ${
                  leaderboardMetric === "combined"
                    ? "bg-slate-800 text-yellow-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-850/30"
                }`}
              >
                Combined
              </button>
              <button
                onClick={() => setLeaderboardMetric("subjective")}
                className={`py-1.5 px-0.5 rounded font-mono font-bold transition duration-150 text-center cursor-pointer ${
                  leaderboardMetric === "subjective"
                    ? "bg-slate-800 text-yellow-500 shadow-sm"
                    : "text-slate-400 hover:text-slate-205 hover:bg-slate-850/30"
                }`}
              >
                Subjective
              </button>
              <button
                onClick={() => setLeaderboardMetric("ioqm")}
                className={`py-1.5 px-0.5 rounded font-mono font-bold transition duration-150 text-center cursor-pointer ${
                  leaderboardMetric === "ioqm"
                    ? "bg-slate-800 text-cyan-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-205 hover:bg-slate-850/30"
                }`}
              >
                IOQM
              </button>
              <button
                onClick={() => setLeaderboardMetric("ramp_up")}
                className={`py-1.5 px-0.5 rounded font-mono font-bold transition duration-150 text-center cursor-pointer ${
                  leaderboardMetric === "ramp_up"
                    ? "bg-slate-800 text-purple-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-205 hover:bg-slate-850/30"
                }`}
              >
                Ramp Up
              </button>
              <button
                onClick={() => setLeaderboardMetric("attendance")}
                className={`py-1.5 px-0.5 rounded font-mono font-bold transition duration-150 text-center cursor-pointer ${
                  leaderboardMetric === "attendance"
                    ? "bg-slate-800 text-emerald-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-205 hover:bg-slate-850/30"
                }`}
              >
                Attendance
              </button>
              <button
                onClick={() => setLeaderboardMetric("retention")}
                className={`py-1.5 px-0.5 rounded font-mono font-bold transition duration-150 text-center cursor-pointer ${
                  leaderboardMetric === "retention"
                    ? "bg-slate-800 text-orange-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-205 hover:bg-slate-850/30"
                }`}
              >
                Retention
              </button>
            </div>

            <div className="space-y-3">
              {/* National Combined / Global View Card */}
              {(() => {
                let nationalScoreVal = 0;
                let nationalScoreLabel = "Overall";
                let nationalScoreColorClass = "text-yellow-400";
                
                if (leaderboardMetric === "combined") {
                  nationalScoreVal = nationalCombinedMetrics.consolidatedScore;
                  nationalScoreLabel = "Overall";
                  nationalScoreColorClass = "text-yellow-400";
                } else if (leaderboardMetric === "subjective") {
                  nationalScoreVal = nationalCombinedMetrics.subjectiveTestScore;
                  nationalScoreLabel = "Subjective";
                  nationalScoreColorClass = "text-yellow-500";
                } else if (leaderboardMetric === "ioqm") {
                  nationalScoreVal = nationalCombinedMetrics.ioqmScore;
                  nationalScoreLabel = "IOQM";
                  nationalScoreColorClass = "text-cyan-400";
                } else if (leaderboardMetric === "ramp_up") {
                  nationalScoreVal = nationalCombinedMetrics.rampUpScore;
                  nationalScoreLabel = "Ramp Up";
                  nationalScoreColorClass = "text-purple-400";
                } else if (leaderboardMetric === "attendance") {
                  nationalScoreVal = nationalCombinedMetrics.testAttendanceScore;
                  nationalScoreLabel = "Attendance";
                  nationalScoreColorClass = "text-emerald-400";
                } else if (leaderboardMetric === "retention") {
                  nationalScoreVal = nationalCombinedMetrics.studentRetentionScore;
                  nationalScoreLabel = "Retention";
                  nationalScoreColorClass = "text-orange-400";
                }

                return (
                  <button
                    id="center-card-all-centers-combined"
                    onClick={() => setSelectedCenterName("All Centers Combined")}
                    className={`w-full text-left rounded-lg p-2.5 transition-all duration-200 border flex items-center justify-between group cursor-pointer ${
                      selectedCenterName === "All Centers Combined"
                        ? "bg-slate-850 border-cyan-500/80 shadow-md shadow-cyan-500/5 animate-pulse"
                        : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/30 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Global Icon Badge / Flag */}
                      <div className={`w-8 h-8 rounded shrink-0 flex flex-col items-center justify-center font-bold font-mono text-center ${
                        selectedCenterName === "All Centers Combined"
                          ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}>
                        <span className="text-[10px] font-extrabold uppercase font-mono tracking-tight">ALL</span>
                      </div>

                      <div className="min-w-0">
                        <h3 className={`text-xs font-bold tracking-tight transition-colors truncate uppercase flex items-center gap-1.5 ${
                          selectedCenterName === "All Centers Combined" ? "text-cyan-400" : "text-slate-100 group-hover:text-cyan-400"
                        }`}>
                          👑 All Centers Combined
                        </h3>
                        <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 mt-0.5 font-sans">
                          <span>Total Unique Registrations: {new Set(students.map(s => s.id)).size} students</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-mono text-xs font-bold ${nationalScoreColorClass}`}>
                        {nationalScoreVal.toFixed(1)}
                      </div>
                      <span className="text-[8px] text-slate-500 block font-mono">{nationalScoreLabel} Avg</span>
                    </div>
                  </button>
                );
              })()}

              {/* Dotted separator between combined and specific regional centers */}
              <div className="border-t border-dashed border-slate-800 my-1" />

              {activeMetricList.map((center) => {
                const isSelected = center.centerName === selectedCenterName;
                
                // Fetch the baseline overall rank to capture state shifts
                const baseline = baselineCenters.find((c) => c.centerName === center.centerName);
                const baselineOverallRank = baseline ? baseline.rank : center.rank;
                const overallRankShift = baselineOverallRank - center.rank;

                // Determine display score and label
                let scoreVal = 0;
                let scoreLabel = "Consolidated";
                let scoreColorClass = "text-slate-100";
                
                if (leaderboardMetric === "combined") {
                  scoreVal = center.consolidatedScore;
                  scoreLabel = "Overall";
                  scoreColorClass = "text-yellow-450 text-yellow-450 text-yellow-400";
                } else if (leaderboardMetric === "subjective") {
                  scoreVal = center.subjectiveTestScore;
                  scoreLabel = "Subjective";
                  scoreColorClass = "text-yellow-500";
                } else if (leaderboardMetric === "ioqm") {
                  scoreVal = center.ioqmScore;
                  scoreLabel = "IOQM";
                  scoreColorClass = "text-cyan-400";
                } else if (leaderboardMetric === "ramp_up") {
                  scoreVal = center.rampUpScore;
                  scoreLabel = "Ramp Up";
                  scoreColorClass = "text-purple-400";
                } else if (leaderboardMetric === "attendance") {
                  scoreVal = center.testAttendanceScore;
                  scoreLabel = "Attendance";
                  scoreColorClass = "text-emerald-400";
                } else if (leaderboardMetric === "retention") {
                  scoreVal = center.studentRetentionScore;
                  scoreLabel = "Retention";
                  scoreColorClass = "text-orange-400";
                }

                return (
                  <button
                    key={center.centerName}
                    id={`center-card-${center.centerName.replace(/\s+/g, "-")}`}
                    onClick={() => setSelectedCenterName(center.centerName)}
                    className={`w-full text-left rounded-lg p-2.5 transition-all duration-200 border flex items-center justify-between group cursor-pointer ${
                      isSelected
                        ? "bg-slate-800/80 border-yellow-500/80 shadow-md shadow-yellow-500/5"
                        : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/30 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Metric Rank Badge Indicator */}
                      <div className={`w-8 h-8 rounded shrink-0 flex flex-col items-center justify-center font-bold font-mono text-center ${
                        center.metricRank === 1 
                          ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                          : center.metricRank === 2
                          ? "bg-slate-300/15 text-slate-300 border border-slate-300/20"
                          : center.metricRank === 3
                          ? "bg-amber-700/15 text-amber-500 border border-amber-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}>
                        <span className="text-xs font-bold font-mono text-center">#{center.metricRank}</span>
                        {leaderboardMetric !== "combined" && (
                          <span className="text-[6.5px] uppercase font-bold text-slate-500 -mt-0.5">Rank</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className={`text-xs font-semibold tracking-tight transition-colors truncate ${
                          isSelected ? "text-yellow-400" : "text-slate-100 group-hover:text-yellow-400"
                        }`}>
                          {center.centerName}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 mt-0.5 font-sans">
                          <span className="truncate">Student Count: {center.activeStudents} active</span>
                          {/* Rank Shift Indicator */}
                          {overallRankShift > 0 && (
                            <span className="text-emerald-400 font-mono font-bold flex items-center text-[9px]">
                              ▲ +{overallRankShift}
                            </span>
                          )}
                          {overallRankShift < 0 && (
                            <span className="text-rose-400 font-mono font-bold flex items-center text-[9px]">
                              ▼ {overallRankShift}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-mono text-xs font-bold ${scoreColorClass}`}>
                        {scoreVal.toFixed(1)}
                      </div>
                      <span className="text-[8px] text-slate-500 block font-mono">{scoreLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Notice: Strict Filtering Rules Applied */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-xs text-slate-400 space-y-2">
            <span className="font-bold flex items-center gap-1.5 text-slate-300">
              <Info className="w-4 h-4 text-cyan-400" />
              Academic Rules Enforced:
            </span>
            <p>
              <strong className="text-cyan-400">Rule A (Double Absence):</strong> Students marked Absent on <span className="underline">both</span> tests are excluded from metrics entirely (removed from denominator).
            </p>
            <p>
              <strong className="text-cyan-400">Rule B (Single-Test):</strong> Absent in 1 test? Average score calculated strictly from the <span className="underline font-semibold text-slate-300">single attended test</span>. Double standards blocked!
            </p>
          </div>
        </section>

        {/* 3. RIGHT PANEL: CENTER DIAGNOSTIC EXPLORER & VIEWS */}
        <section className="lg:col-span-8 space-y-6" id="diagnostic-explorer">
          
          {/* CENTER PROFILE HERO CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden shadow-xl" id="profile-hero">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Sliders className="w-40 h-40 text-slate-100" />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-yellow-500 font-semibold">
                  Selected Center Center-Lead Diagnostic portal
                </span>
                <h2 className="text-2xl font-bold font-display tracking-tight text-slate-50 mt-1">
                  {selectedCenterScores.centerName}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Reviewing academic leaks and predicted What-If targets.
                </p>
              </div>

              {/* Dynamic Rankings Badges */}
              <div className="flex items-center gap-3">
                <div className="text-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-2xl font-bold font-mono text-yellow-500">
                    #{selectedCenterScores.rank}
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    National Rank
                  </span>
                </div>
                
                <div className="text-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-2xl font-bold font-mono text-cyan-400">
                    {selectedCenterScores.consolidatedScore.toFixed(1)}
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono">
                    Overall Score
                  </span>
                </div>
              </div>
            </div>

            {/* Predicted Shift Notification Banner */}
            {coachedStudentIds.length > 0 && (
              <div className="mt-4 bg-sky-500/10 border border-sky-400/30 text-sky-300 p-2.5 rounded-lg flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
                  What-If Prediction Active: Coaching <strong>{coachedStudentIds.length}</strong> student papers.
                </span>
                <button
                  onClick={handleResetSimulation}
                  className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 px-3 py-1 rounded transition-colors text-xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset Prediction
                </button>
              </div>
            )}
          </div>

          {/* TAB TRIGGERS */}
          <div className="bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/80 flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-none snap-x" id="tab-controls">
            {[
              { id: "combined", label: "Final Combined", icon: TrendingUp },
              { id: "subjective", label: "Subjective Tests (25%)", icon: BookOpen },
              { id: "ioqm", label: "IOQM Achievement (20%)", icon: Award },
              { id: "ramp_up", label: "Ramp Up Exams (15%)", icon: Sliders },
              { id: "attendance", label: "Test Attendance (10%)", icon: Users },
              { id: "retention", label: "Student Retention (30%)", icon: CheckCircle2 },
              { id: "pool", label: "Student Pool Ledger", icon: Users },
              { id: "admin_rules", label: "Admin Rules & Math", icon: HelpCircle }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedTab(tab.id);
                  if (tab.id !== "pool" && tab.id !== "admin_rules") {
                    setLeaderboardMetric(tab.id as any);
                  }
                }}
                className={`py-2 px-3.5 rounded-lg font-semibold text-xs transition-all duration-200 flex items-center gap-1.5 shrink-0 select-none cursor-pointer ${
                  selectedTab === tab.id
                    ? "bg-slate-800 text-yellow-550 text-yellow-400 shadow-sm font-bold border border-slate-700/50"
                    : "text-slate-400 hover:text-slate-205 hover:bg-slate-800/30 border border-transparent"
                }`}
                id={`tab-btn-${tab.id}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ==========================================
              TAB INTERACTION 1: COMBINED PERFORMANCE VIEW
              ========================================== */}
          {students.length === 0 ? (
            <div className="bg-slate-900 border border-dashed border-slate-700/65 rounded-xl p-8 text-center sm:p-12 space-y-6 shadow-2xl relative overflow-hidden animate-fade-in" id="empty-state-welcome">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-transparent pointer-events-none" />
              <div className="mx-auto w-14 h-14 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div className="max-w-xl mx-auto space-y-3">
                <h3 className="text-xl font-bold font-display tracking-tight text-white flex items-center justify-center gap-2">
                  <span>🎓 Onboarding Guide: Prepare & Upload Live Data</span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Congratulations! All sandbox preloaded records have been successfully cleaned. The dashboard has transitioned to Live Integration Mode and is ready for your actual student analytics.
                </p>
                <div className="pb-2" />
                <div className="p-5 bg-slate-900/90 text-left border border-slate-800 rounded-lg space-y-4 text-xs leading-relaxed">
                  <span className="text-cyan-400 font-bold block border-b border-slate-800 pb-1.5 uppercase tracking-wider text-[10px] font-mono">📋 Step-by-Step Instructions: Adding Live Data</span>
                  <div className="space-y-3 text-slate-300">
                    <div>
                      <strong className="text-slate-100 flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-500/15 text-cyan-400 font-mono text-[9px] font-bold">1</span>
                        Download Structured Templates
                      </strong>
                      <p className="text-[11px] mt-0.5 leading-relaxed text-slate-400">
                        Use the spreadsheet matrix uploader panel on the left to download pre-configured Excel <code>.xlsx</code> templates for columns, score bounds, and retention.
                      </p>
                    </div>
                    <div>
                      <strong className="text-slate-100 flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-500/15 text-cyan-400 font-mono text-[9px] font-bold">2</span>
                        Configure Headers & Coordinates
                      </strong>
                      <p className="text-[11px] mt-0.5 leading-relaxed text-slate-400">
                        Make sure your local spreadsheet has correct header columns matching: <code>id</code> (unique roll number), <code>name</code>, <code>center</code> (e.g. <code>Lucknow Combined</code>), and <code>grade</code> (e.g. <code>9</code>, <code>10</code>, <code>11</code>, <code>12</code>).
                      </p>
                    </div>
                    <div>
                      <strong className="text-slate-100 flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-cyan-500/15 text-cyan-400 font-mono text-[9px] font-bold">3</span>
                        Drag & Drop or Select Format
                      </strong>
                      <p className="text-[11px] mt-0.5 leading-relaxed text-slate-400">
                        Select corresponding matrix format from uploader format dropdown (Format 1-5 or Master Format) and drag your files. The system consolidates, evaluates rules, re-ranks regional centers and enables target remedial prediction instantly on your screen.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
          {selectedTab === "combined" && (
            <div className="space-y-6" id="view-final-rank">
              
              {/* DIAGNOSTIC MARKDOWN FORMATTED */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight" id="rank-view-title">
                  📊 Center Diagnostic: {selectedCenterScores.centerName} (Final Rank View)
                </h2>

                <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                  <h3 className="font-semibold text-rose-400 text-sm flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    ❌ Key Metrics to Optimize (Primary Performance Gaps)
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Our analysis indicates that <strong className="text-rose-300 underline underline-offset-4">{rankLeakInfo.name}</strong> is dragging down the overall center score the most, currently standing at <strong className="text-rose-400">{rankLeakInfo.score.toFixed(1)}/100 points</strong> (representing a weight proportion of {rankLeakInfo.weight}). 
                    {selectedCenterName === "Lucknow Chowk Centre" ? (
                      <span> Lucknow center teachers must focus heavily on coaching borderline students scoring in the 30-39% range to dramatically boost our Subjective Test indexes, which currently act as a core performance bottleneck.</span>
                    ) : (
                      <span> Targeted remediation is urgently required on this metric to match top-performing hubs like {overallTopper ? overallTopper.centerName : "the overall topper"}.</span>
                    )}
                  </p>
                </div>

                {/* OVERALL PERFORMANCE SCORECARD */}
                <div>
                  <h3 className="font-semibold text-slate-300 text-sm mb-3">
                    📉 Overall Matrix Performance Scorecard
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Component Items */}
                    <div className="space-y-3 p-4 bg-slate-950 rounded-lg border border-slate-800/60">
                      <div>
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span className="text-slate-400 font-semibold">Subjective Test (25%)</span>
                          <span className="text-yellow-400 font-bold">{selectedCenterScores.subjectiveTestScore.toFixed(1)}/100</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-yellow-500 h-full transition-all duration-500" 
                            style={{ width: `${selectedCenterScores.subjectiveTestScore}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span className="text-slate-400 font-semibold">IOQM Achievement (20%)</span>
                          <span className="text-cyan-400 font-bold">{selectedCenterScores.ioqmScore.toFixed(1)}/100</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-cyan-500 h-full transition-all duration-500" 
                            style={{ width: `${selectedCenterScores.ioqmScore}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span className="text-slate-400 font-semibold">Ramp Up Exams (15%)</span>
                          <span className="text-purple-400 font-bold">{selectedCenterScores.rampUpScore.toFixed(1)}/100</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-purple-500 h-full transition-all duration-500" 
                            style={{ width: `${selectedCenterScores.rampUpScore}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-4 bg-slate-950 rounded-lg border border-slate-800/60">
                      <div>
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span className="text-slate-400 font-semibold">Test Attendance (10%)</span>
                          <span className="text-emerald-400 font-bold">{selectedCenterScores.testAttendanceScore.toFixed(1)}/100</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full transition-all duration-500" 
                            style={{ width: `${selectedCenterScores.testAttendanceScore}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span className="text-slate-400 font-semibold">Student Retention (30%)</span>
                          <span className="text-orange-400 font-bold">{selectedCenterScores.studentRetentionScore.toFixed(1)}/100</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-orange-500 h-full transition-all duration-500" 
                            style={{ width: `${selectedCenterScores.studentRetentionScore}%` }}
                          />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 mt-2">
                        <div className="flex justify-between items-center bg-yellow-500/5 p-2 rounded border border-yellow-500/10">
                          <span className="text-xs font-semibold text-yellow-400">🏆 Consolidated Center Score</span>
                          <span className="font-mono font-bold text-slate-50 text-sm">
                            {selectedCenterScores.consolidatedScore.toFixed(1)} / 100
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* BAR CHART GRAPH COMPARING METRICS */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h3 className="font-display font-semibold text-slate-100 text-sm">
                    📊 Metrics Breakdown compared to <span className="text-yellow-400 font-extrabold">{benchmarkLabel}</span>
                  </h3>
                  
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setBenchmarkRefType("overall")}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold font-mono transition-colors cursor-pointer ${
                        benchmarkRefType === "overall"
                          ? "bg-yellow-500 text-slate-950"
                          : "text-slate-400 hover:text-slate-100"
                      }`}
                      title="Compare with the overall #1 ranked center at current drill-down level"
                    >
                      🥇 Overall Topper
                    </button>
                    <button
                      onClick={() => setBenchmarkRefType("metric_wise")}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold font-mono transition-colors cursor-pointer ${
                        benchmarkRefType === "metric_wise"
                          ? "bg-yellow-500 text-slate-950"
                          : "text-slate-400 hover:text-slate-100"
                      }`}
                      title="Compare with the maximum possible score achieved for each metric individually"
                    >
                      🎯 Metric Topper
                    </button>
                  </div>
                </div>
                
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="metric" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Current Center" fill="#eab308" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Benchmark (Ref)" name={benchmarkLabel} fill="#475569" radius={[4, 4, 0, 0]} opacity={0.6} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 🤖 GEMINI SERVER SIDE INTERACTION PORTAL */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                    <h3 className="font-display font-semibold text-slate-100 text-sm">
                      AI Diagnostic Expert Analysis
                    </h3>
                  </div>
                  <button
                    onClick={handleRequestAIDiagnostic}
                    disabled={isGenerating}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 shadow-md shadow-yellow-500/5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isGenerating ? "Consulting AI Advisor..." : "🤖 Ask Gemini Analyst"}
                  </button>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Generate an objective, customized evaluation report with professional academic insights analyzing exactly what gaps are holding back the selected center.
                </p>

                {aiReport && (
                  <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 text-slate-200 text-xs leading-relaxed space-y-4 max-h-[400px] overflow-y-auto font-sans">
                    {/* Parse manual formatting cleanly */}
                    <div className="prose prose-invert max-w-none">
                      {aiReport.split("\n\n").map((para, i) => {
                        if (para.startsWith("###")) {
                          return <h4 key={i} className="text-sm font-bold text-yellow-400 pt-3 border-t border-slate-800/80 first:border-0 first:pt-0">{para.replace("###", "")}</h4>;
                        }
                        return <p key={i} className="text-slate-300">{para}</p>;
                      })}
                    </div>
                  </div>
                )}

                {aiError && (
                  <div className="bg-rose-950/20 p-4 rounded-lg border border-rose-900/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==========================================
              TAB INTERACTION 2: SUBJECTIVE TEST VIEW CELL
             ========================================== */}
          {selectedTab === "subjective" && (
            <div className="space-y-6" id="view-subjective-test">
              
              {/* RAW BREAKDOWN CONTAINER */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-5">
                <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight" id="subjective-view-title">
                  📝 Academic Breakdown: {selectedCenterScores.centerName} (Subjective Test Focus)
                </h2>

                {renderSimulatorImpactPanel("subjective")}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Element A Toppers Card */}
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Element A: Topper Baseline (Weight: 60%)
                    </span>
                    <h4 className="text-sm font-semibold text-slate-200 mt-1.5 flex justify-between items-center">
                      <span>Unique Toppers Ratio (Avg &gt;= 90%):</span>
                      <strong className="text-yellow-400 text-lg">
                        {selectedCenterScores.elementA_percent.toFixed(1)}%
                      </strong>
                    </h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Awarded points: <strong className="text-slate-100">{selectedCenterScores.elementA_score.toFixed(1)}/100</strong>. 
                      {selectedCenterScores.elementB_score === 0 && selectedCenterScores.elementB_percent === 0 ? (
                        <span className="text-slate-500 block mt-1 font-medium font-mono text-[10px]">
                          ⚠ No subjective test records available.
                        </span>
                      ) : selectedCenterScores.elementA_percent >= 15 ? (
                        <span className="text-emerald-400 block mt-1 font-medium font-mono text-[10px]">
                          ✓ Maxed out! Achieved standard target (&gt;= 15%).
                        </span>
                      ) : (
                        <span className="text-yellow-500 block mt-1 font-medium font-mono text-[10px]">
                          ⚠ Needs scaling. Must reach 15% toppers ratio.
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Element B Failing Marks Prevention Card */}
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Element B: Failing Marks Prevention (Weight: 40%)
                    </span>
                    <h4 className="text-sm font-semibold text-slate-200 mt-1.5 flex justify-between items-center">
                      <span>Papers under 40% (Fail-rate):</span>
                      <strong className="text-rose-400 text-lg">
                        {selectedCenterScores.elementB_percent.toFixed(1)}%
                      </strong>
                    </h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Awarded points: <strong className="text-slate-100">{selectedCenterScores.elementB_score.toFixed(1)}/100</strong>.
                      {selectedCenterScores.elementB_score === 0 && selectedCenterScores.elementB_percent === 0 ? (
                        <span className="text-slate-500 block mt-1 font-medium font-mono text-[10px]">
                          ⚠ Blank/No scoring data (0 points considered).
                        </span>
                      ) : selectedCenterScores.elementB_percent <= 5 ? (
                        <span className="text-emerald-400 block mt-1 font-medium font-mono text-[10px]">
                          ✓ Safe bracket! Failing papers are below 5%.
                        </span>
                      ) : (
                        <span className="text-rose-400 block mt-1 font-medium font-mono text-[10px]">
                          ✗ High Alert! Failing papers are &gt; 5% (Drop penalty active).
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* WHAT IF ACTIVE PRESET MATRIX TRIGGERS */}
                <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-3.5" id="what-all-presets">
                  <h3 className="font-display font-semibold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    🔮 Interactive What-If Predictor Presets
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <button
                      onClick={handleApplyPresetTier1}
                      className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold p-4 rounded-lg text-xs leading-relaxed transition-all text-left group cursor-pointer"
                    >
                      <span className="text-cyan-400 uppercase tracking-widest text-[9px] block mb-1">
                        Preset Tier 1
                      </span>
                      <strong>⚡ Target Tier 1 (Coach 6 Borderline Pupils)</strong>
                      <span className="block text-slate-400 mt-1.5 font-normal text-[11px]">
                        Boost exactly 6 Lucknow borderline students from 30-39% up to 40% pass. Reduces Element B rates, jumping national ranks.
                      </span>
                    </button>

                    <button
                      onClick={handleApplyPresetTier2}
                      className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-semibold p-4 rounded-lg text-xs leading-relaxed transition-all text-left group cursor-pointer"
                    >
                      <span className="text-yellow-400 uppercase tracking-widest text-[9px] block mb-1">
                        Preset Tier 2
                      </span>
                      <strong>🌟 Target Tier 2 (Coach All Failing Papers)</strong>
                      <span className="block text-slate-400 mt-1.5 font-normal text-[11px]">
                        Supports all students who scored under 40% to pass their tests. Helps the center achieve 100/100 points!
                      </span>
                    </button>
                  </div>
                </div>

                {/* BOARDERLINE CHECKBOX CONTROLLERS SECTION */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400">
                      📋 Student Coaching Selection (Predicted Results Pool)
                    </h3>
                    <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
                      <span className="text-slate-500 font-mono px-1.5 font-bold">Sort Students:</span>
                      <button
                        onClick={() => setSubjectiveSortBy("percentage")}
                        className={`px-2 py-1 rounded cursor-pointer font-bold ${
                          subjectiveSortBy === "percentage"
                            ? "bg-slate-850 text-cyan-400"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Lowest Fail Score %
                      </button>
                      <button
                        onClick={() => setSubjectiveSortBy("name")}
                        className={`px-2 py-1 rounded cursor-pointer font-bold ${
                          subjectiveSortBy === "name"
                            ? "bg-slate-850 text-cyan-400"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Name A-Z
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Check the boxes below to predict school/student performance under active coaching. Daily score averages will update instantly!
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    {currentCenterBorderlineStudents.map((student) => {
                      const isCoached = coachedStudentIds.includes(student.id);
                      
                      // Identify which exact paper is failing for student in Lucknow
                      const failingPaper = getStudentPerformance(student).papers.find(p => (p.score || 0) < 40);
                      const currentScore = failingPaper ? failingPaper.score : 35;
                      const gap = failingPaper ? (40 - (failingPaper.score || 0)) : 5;

                      return (
                        <button
                          key={student.id}
                          onClick={() => handleToggleCoach(student.id)}
                          className={`flex items-start text-left p-3.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                            isCoached
                              ? "bg-slate-800/60 border-cyan-500/60 shadow-md"
                              : "bg-slate-950 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <div className="mr-3 mt-0.5 text-cyan-400">
                            {isCoached ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-600 hover:text-slate-500" />
                            )}
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-sm text-slate-100">{student.name}</span>
                              <div className="flex items-center gap-1.5">
                                {isCoached ? (
                                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">SUPPORT ACTIVE</span>
                                ) : (
                                  <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">NEEDS WORK</span>
                                )}
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                  {student.id}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px]">
                              <span className="text-slate-400">failing:</span>
                              <span className="text-rose-400 font-bold font-mono">
                                {failingPaper ? `${failingPaper.name} (${failingPaper.score}%)` : "35%"}
                              </span>
                              <span className="text-slate-600">|</span>
                              <span className="text-cyan-450 font-medium text-[10px] text-cyan-400">
                                Predicted Pass: 40% (Needs +{gap}%)
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>


              </div>

              {/* DYNAMIC WHAT-IF SIMULATOR PRESET EXPLAINER DIALOGUE CARD */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
                <h3 className="font-display font-semibold text-slate-100 text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                  What-If Recalculation Insight (National Position Shift)
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  By checking the borderline boxes above (Tier 1 preset), <strong className="text-yellow-400">{selectedCenterName}</strong>'s subjective failure footprint shrinks from <strong className="text-rose-400">{selectedCenterBaseline.elementB_percent?.toFixed(1) || "0.0"}%</strong> to <strong className="text-emerald-400">{selectedCenterScores.elementB_percent?.toFixed(1) || "0.0"}%</strong>. This causes the Element B (Fail Rate) index to jump to <strong className="text-yellow-400">{selectedCenterScores.elementB_score?.toFixed(1) || "0.0"}</strong> points, pushing the Consolidated Score up!
                </p>
                
                <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800 text-slate-300">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-semibold mb-1">Before Prediction Ranks</span>
                      <div className="space-y-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-mono">Overall Consolidated</span>
                          <strong className="text-sm font-mono text-rose-400 font-bold block">
                            {selectedCenterBaseline.rank > 0 ? `Rank #${selectedCenterBaseline.rank}` : "N/A"} ({selectedCenterBaseline.consolidatedScore.toFixed(1)} / 100)
                          </strong>
                        </div>
                        {leaderboardMetric !== "combined" && (
                          <div className="border-t border-slate-900 pt-1.5">
                            <span className="text-[10px] text-slate-400 block font-mono">{selectedMetricFriendlyName}</span>
                            <strong className="text-xs font-mono text-rose-300 font-medium block">
                              Rank #{selectedMetricRankBaseline > 0 ? selectedMetricRankBaseline : "N/A"} ({selectedMetricScoreBaseline.toFixed(1)} / 100)
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-semibold mb-1">Predicted Rank Potential</span>
                      <div className="space-y-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-mono">Overall Consolidated</span>
                          <strong className="text-sm font-mono text-emerald-400 font-bold block">
                            {selectedCenterScores.rank > 0 ? `Rank #${selectedCenterScores.rank}` : "N/A"} ({selectedCenterScores.consolidatedScore.toFixed(1)} / 100)
                          </strong>
                        </div>
                        {leaderboardMetric !== "combined" && (
                          <div className="border-t border-slate-900 pt-1.5">
                            <span className="text-[10px] text-slate-400 block font-mono">{selectedMetricFriendlyName}</span>
                            <strong className="text-xs font-mono text-emerald-300 font-medium block">
                              Rank #{selectedMetricRankSimulated > 0 ? selectedMetricRankSimulated : "N/A"} ({selectedMetricScoreSimulated.toFixed(1)} / 100)
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 italic">Recalculations comply with PW's Double Absence rule.</span>
                  <button
                    onClick={handleRequestAIDiagnostic}
                    disabled={isGenerating}
                    className="text-xs text-yellow-400 font-medium hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    AI Consultant Speech <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              TAB INTERACTION 3: IOQM OUTFLOW TARGETS
              ========================================== */}
          {selectedTab === "ioqm" && (
            <div className="space-y-6" id="view-ioqm-targets">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex justify-between items-center sm:items-start border-b border-slate-850/40 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight">
                      🧮 IOQM Olympiad Score Target List
                    </h2>
                    <p className="text-xs text-slate-400">Total Weight: 20% of final national leaderboard score.</p>
                  </div>
                  <span className="text-xs font-bold font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded">Score: {selectedCenterScores.ioqmScore.toFixed(1)}/100</span>
                </div>

                <p className="text-xs text-slate-300 leading-normal font-sans">
                  The IOQM metric scales linearly based on average scores of active, non-absent students. Giving concept-checksheets and custom practices to the following at-risk students boosts their predicted marks to <strong className="text-cyan-400 font-mono">90%</strong> (maximizing centers overall indices).
                </p>

                {renderSimulatorImpactPanel("ioqm")}

                {/* PAGINATION & SEARCH FOR IOQM */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-lg border border-slate-805 border-slate-800">
                  <div className="relative flex-1 max-w-sm">
                    <input
                      type="text"
                      placeholder="Search IOQM students by name or ID..."
                      value={ioqmSearch}
                      onChange={(e) => {
                        setIoqmSearch(e.target.value);
                        setIoqmPage(1);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 font-sans"
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Showing {paginatedIoqmItems.length} of {filteredIoqmItems.length} filtered items ({actionablePlan.ioqmItems.length} total)
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-cyan-400" />
                    Pupils Needing IOQM Remedial Support ({filteredIoqmItems.length} found):
                  </h3>

                  {filteredIoqmItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2">No students matching the search filter found.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="ioqm-checklist-elements">
                      {paginatedIoqmItems.map(({ student, currentScore }) => {
                        const isCoached = coachedStudentIds.includes(student.id);
                        return (
                          <button
                            key={student.id}
                            onClick={() => handleToggleCoach(student.id)}
                            className={`flex items-start text-left p-3.5 rounded-lg border transition-all duration-155 cursor-pointer ${
                              isCoached
                                ? "bg-slate-800/60 border-cyan-500/60 shadow-md"
                                : "bg-slate-950 border-slate-800 hover:border-slate-705 cursor-pointer"
                            }`}
                          >
                            <div className="mr-3 text-cyan-400 mt-0.5">
                              {isCoached ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-600 hover:text-slate-500" />}
                            </div>
                            <div className="flex-1">
                               <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-slate-100">{student.name}</span>
                                <div className="flex items-center gap-1.5">
                                  {isCoached ? (
                                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">SUPPORT ACTIVE</span>
                                  ) : (
                                    <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">NEEDS WORK</span>
                                  )}
                                  <span className="text-[10px] font-mono text-slate-500 font-bold">{student.id}</span>
                                </div>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                Current Score: <span className="text-rose-400 font-bold font-mono">{currentScore}%</span>
                                <br />Predicted Increase: <span className="text-emerald-400 font-bold font-mono">90% (+{90 - currentScore}%)</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* IOQM TARGETS DETAILED DATATABLE */}
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="font-semibold text-slate-300 text-sm mb-3">
                    📊 IOQM Diagnostic Remedial Action Row Sheet
                  </h3>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs bg-slate-950 font-sans">
                      <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Reference ID</th>
                          <th className="p-3">Actual IOQM Score</th>
                          <th className="p-3">Predicted Target Point Shift</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300 divide-slate-850">
                        {paginatedIoqmItems.map(({ student, currentScore }) => {
                          const isCoached = coachedStudentIds.includes(student.id);
                          return (
                            <tr key={student.id} className="hover:bg-slate-900/40">
                              <td className="p-3 font-semibold text-slate-200">{student.name}</td>
                              <td className="p-3 text-slate-400 font-mono">{student.id}</td>
                              <td className="p-3 text-rose-500 font-mono font-semibold">{currentScore}%</td>
                              <td className="p-3 text-emerald-400 font-medium">
                                {isCoached ? "Predicted: +30% boost active" : "Target coaching: boost to 90%"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* IOQM PAGINATION CONTROLS */}
                  {ioqmTotalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 font-sans">
                      <div className="text-[11px] font-mono text-slate-500">
                        Showing {Math.min(filteredIoqmItems.length, (ioqmPage - 1) * ioqmPageSize + 1)}–{Math.min(filteredIoqmItems.length, ioqmPage * ioqmPageSize)} of {filteredIoqmItems.length} students
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIoqmPage((p) => Math.max(1, p - 1))}
                          disabled={ioqmPage === 1}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                        >
                          ◀ Prev
                        </button>
                        <span className="font-mono text-slate-300">
                          Page {ioqmPage} of {ioqmTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIoqmPage((p) => Math.min(ioqmTotalPages, p + 1))}
                          disabled={ioqmPage === ioqmTotalPages}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                        >
                          Next ▶
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              TAB INTERACTION 4: RAMP UP EXAMS FOCUS
              ========================================== */}
          {selectedTab === "ramp_up" && (
            <div className="space-y-6" id="view-ramp-up-targets">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex justify-between items-center sm:items-start border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight">
                      📈 Ramp Up Exams Toppers Optimizations
                    </h2>
                    <p className="text-xs text-slate-400">Total Weight: 15% of final national leaderboard score.</p>
                  </div>
                  <span className="text-xs font-bold font-mono text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded">Score: {selectedCenterScores.rampUpScore.toFixed(1)}/100</span>
                </div>

                <p className="text-xs text-slate-300 leading-normal font-sans">
                  The Ramp Up topper index is calculated from the proportion of Class 9 & 10 pupils who secure <strong className="text-purple-405 text-purple-400 font-mono">&gt;= 80% marks</strong>. Giving active remedial reviews clears the 80% marks ceiling (boosted to 85% in prediction).
                </p>

                {renderSimulatorImpactPanel("ramp_up")}

                {/* PAGINATION & SEARCH FOR RAMP UP */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-lg border border-slate-805 border-slate-800">
                  <div className="relative flex-1 max-w-sm">
                    <input
                      type="text"
                      placeholder="Search Ramp Up students by name or ID..."
                      value={rampUpSearch}
                      onChange={(e) => {
                        setRampUpSearch(e.target.value);
                        setRampUpPage(1);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 font-sans"
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Showing {paginatedRampUpItems.length} of {filteredRampUpItems.length} filtered items ({actionablePlan.rampUpItems.length} total)
                  </div>
                </div>

                <div className="space-y-3 pt-2 font-sans">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-purple-405 text-purple-400" />
                    Class 9 & 10 Priority Students needing Ramp Up Boost ({filteredRampUpItems.length} found):
                  </h3>

                  {filteredRampUpItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2">No students matching the search filter found.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="rampup-checklist-elements">
                      {paginatedRampUpItems.map(({ student, currentScore }) => {
                        const isCoached = coachedStudentIds.includes(student.id);
                        return (
                          <button
                            key={student.id}
                            onClick={() => handleToggleCoach(student.id)}
                            className={`flex items-start text-left p-3.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                              isCoached
                                ? "bg-slate-800/60 border-cyan-500/60 shadow-md"
                                : "bg-slate-950 border-slate-800 hover:border-slate-705 cursor-pointer"
                            }`}
                          >
                            <div className="mr-3 text-cyan-400 mt-0.5">
                              {isCoached ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-600" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-slate-100">{student.name}</span>
                                <div className="flex items-center gap-1.5">
                                  {isCoached ? (
                                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">SUPPORT ACTIVE</span>
                                  ) : (
                                    <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">NEEDS WORK</span>
                                  )}
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1 py-0.5 rounded">Grade {student.grade} | {student.id}</span>
                                </div>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                Current Score: <span className="text-rose-455 text-rose-400 font-bold font-mono">{currentScore}%</span>
                                <br />Predicted Topper: <span className="text-purple-400 font-bold font-mono">85% (Cleared target!)</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* RAMP UP DATA MATRIX DETAIL */}
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="font-semibold text-slate-300 text-sm mb-3">
                    📝 Ramp Up Exam Grade-wise Evaluation Roster
                  </h3>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs bg-slate-950 font-sans">
                      <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Grade Class</th>
                          <th className="p-3">Current score</th>
                          <th className="p-3">Minimum target</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300 divide-slate-850">
                        {paginatedRampUpItems.map(({ student, currentScore }) => {
                          return (
                            <tr key={student.id} className="hover:bg-slate-900/40">
                              <td className="p-3 font-semibold text-slate-205">{student.name}</td>
                              <td className="p-3 font-mono text-slate-400">Class {student.grade}</td>
                              <td className="p-3 text-rose-400 font-mono font-semibold">{currentScore}%</td>
                              <td className="p-3 text-purple-400 font-semibold">&gt;= 80% marks</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* RAMP UP PAGINATION CONTROLS */}
                  {rampUpTotalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 font-sans">
                      <div className="text-[11px] font-mono text-slate-500">
                        Showing {Math.min(filteredRampUpItems.length, (rampUpPage - 1) * rampUpPageSize + 1)}–{Math.min(filteredRampUpItems.length, rampUpPage * rampUpPageSize)} of {filteredRampUpItems.length} students
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRampUpPage((p) => Math.max(1, p - 1))}
                          disabled={rampUpPage === 1}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                        >
                          ◀ Prev
                        </button>
                        <span className="font-mono text-slate-300">
                          Page {rampUpPage} of {rampUpTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRampUpPage((p) => Math.min(rampUpTotalPages, p + 1))}
                          disabled={rampUpPage === rampUpTotalPages}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                        >
                          Next ▶
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              TAB INTERACTION 5: TEST ATTENDANCE MAKEUPS
              ========================================== */}
          {selectedTab === "attendance" && (
            <div className="space-y-6" id="view-attendance-makeups">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex justify-between items-center sm:items-start border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight">
                      📅 Attendance Recovery & Academic Support Makeups
                    </h2>
                    <p className="text-xs text-slate-400">Total Weight: 10% of final national leaderboard score.</p>
                  </div>
                  <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded">Score: {selectedCenterScores.testAttendanceScore.toFixed(1)}/100</span>
                </div>

                <p className="text-xs text-slate-300 leading-normal font-sans">
                  The attendance rate is computed by active student attendance. Giving absent parents phone coaching or offline support schedules restores predicted papers (converts "Absent" to "Present" with dynamic pass average).
                </p>

                {renderSimulatorImpactPanel("attendance")}

                {/* PAGINATION & SEARCH FOR ATTENDANCE */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-lg border border-slate-805 border-slate-800">
                  <div className="relative flex-1 max-w-sm">
                    <input
                      type="text"
                      placeholder="Search absent students by name or ID..."
                      value={attendanceSearch}
                      onChange={(e) => {
                        setAttendanceSearch(e.target.value);
                        setAttendancePage(1);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 font-sans"
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Showing {paginatedAbsenteeItems.length} of {filteredAbsenteeItems.length} filtered items ({actionablePlan.absentees.length} total)
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Absent Student Logs for counseling outreach ({filteredAbsenteeItems.length} found):
                  </h3>

                  {filteredAbsenteeItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2">No students matching the search filter found.</p>
                  ) : (
                    <div>
                      {/* INTEGRATED ATTENDANCE PREDICTION ENGINE METRIC ACCENT */}
                      <div className="mb-4 bg-slate-950 p-4 border border-emerald-500/20 rounded-xl space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded">
                              ⚙️ Attendance Prediction Engine
                            </span>
                            <p className="text-[11px] text-slate-350 mt-1 leading-normal max-w-xl">
                              Students with missed tests are marked with <strong className="text-rose-400">Absent</strong> entries. Predicting parent counseling converts these absences into <strong className="text-emerald-400">Present (1)</strong> status (using subject-specific counts with max 4 subjects per test), boosting center performance.
                            </p>
                          </div>
                          <div className="shrink-0 text-right bg-slate-900 border border-slate-800 px-3 py-1 rounded">
                            <span className="text-[8px] text-slate-500 block font-mono font-bold uppercase">Impact</span>
                            <span className="text-xs font-mono font-bold text-emerald-400 font-bold">
                              Rank #{selectedCenterScores.rank} / Score: {selectedCenterScores.testAttendanceScore.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="attendance-checklist-elements">
                        {paginatedAbsenteeItems.map(({ student, type }) => {
                          const isCoached = coachedStudentIds.includes(student.id);
                          return (
                            <button
                              key={`${student.id}-${type}`}
                              onClick={() => handleToggleCoach(student.id)}
                              className={`flex items-start text-left p-3.5 rounded-lg border transition-all duration-155 cursor-pointer ${
                                isCoached
                                  ? "bg-slate-850 border-emerald-500/60 shadow-md shadow-emerald-500/5"
                                  : "bg-slate-950 border-slate-800 hover:border-slate-705"
                              }`}
                            >
                              <div className="mr-3 text-emerald-400 mt-0.5">
                                {isCoached ? (
                                  <span className="bg-emerald-500 text-slate-900 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-extrabold">✓</span>
                                ) : (
                                  <span className="border-2 border-slate-600 hover:border-emerald-500 rounded-full w-5 h-5 block" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between items-center text-xs">
                                  <span className={`font-semibold ${isCoached ? "text-emerald-400 font-bold" : "text-slate-100"}`}>{student.name}</span>
                                  <div className="flex items-center gap-1.5">
                                    {isCoached ? (
                                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">SUPPORT ACTIVE</span>
                                    ) : (
                                      <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">ABSENT - CONTACT</span>
                                    )}
                                    <span className="text-[10px] font-mono text-slate-500 font-bold">{student.id}</span>
                                  </div>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1 font-sans">
                                  Current Attendance Code: <span className="text-rose-400 font-bold">{type}</span>
                                  <br />{isCoached ? (
                                    <span className="text-emerald-400 font-bold">✓ Predicted Present (Counted as 1)</span>
                                  ) : (
                                    <>Remediation Action: <span className="text-emerald-450 font-bold text-emerald-400">Reschedule Makeup Test</span></>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ATTENDANCE EXTRA ROWS */}
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="font-semibold text-slate-300 text-sm mb-3">
                    📋 Absentees Evaluation Diagnostic List
                  </h3>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs bg-slate-950 font-sans">
                      <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Reference ID</th>
                          <th className="p-3">Absence Status Code</th>
                          <th className="p-3">Remedial Action plan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300">
                        {paginatedAbsenteeItems.map(({ student, type }) => {
                          const isCoached = coachedStudentIds.includes(student.id);
                          return (
                            <tr key={`${student.id}-${type}`} className="hover:bg-slate-900/40">
                              <td className="p-3 font-semibold text-slate-200">{student.name}</td>
                              <td className="p-3 text-slate-400 font-mono">{student.id}</td>
                              <td className="p-3 text-rose-400 font-mono font-bold">{type}</td>
                              <td className="p-3 text-emerald-400 font-medium">
                                {isCoached ? "Predicted makeup active: Restored to present" : "Schedule parent phone outreach"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ATTENDANCE PAGINATION CONTROLS */}
                  {attendanceTotalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 font-sans">
                      <div className="text-[11px] font-mono text-slate-500">
                        Showing {Math.min(filteredAbsenteeItems.length, (attendancePage - 1) * attendancePageSize + 1)}–{Math.min(filteredAbsenteeItems.length, attendancePage * attendancePageSize)} of {filteredAbsenteeItems.length} students
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAttendancePage((p) => Math.max(1, p - 1))}
                          disabled={attendancePage === 1}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                        >
                          ◀ Prev
                        </button>
                        <span className="font-mono text-slate-300">
                          Page {attendancePage} of {attendanceTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttendancePage((p) => Math.min(attendanceTotalPages, p + 1))}
                          disabled={attendancePage === attendanceTotalPages}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                        >
                          Next ▶
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              TAB INTERACTION 6: STUDENT RETENTION OUTREACH
              ========================================== */}
          {selectedTab === "retention" && (
            <div className="space-y-6" id="view-retention-outreach">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex justify-between items-center sm:items-start border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight">
                      👥 Student Retention Recovery Outreach
                    </h2>
                    <p className="text-xs text-slate-400">Total Weight: 30% of final national leaderboard score.</p>
                  </div>
                  <span className="text-xs font-bold font-mono text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded">Score: {selectedCenterScores.studentRetentionScore.toFixed(1)}/100</span>
                </div>

                <p className="text-xs text-slate-300 leading-normal font-sans">
                  Retention represents our core user-connection metric, constituting the largest category weight of <strong className="text-orange-400 font-mono">30%</strong> of the consolidated leaderboard. Solving individual fee queries or academic queries flips warning status directly to active (retains predicted value to present).
                </p>

                {renderSimulatorImpactPanel("retention")}

                {/* SEARCH FOR RETENTION */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="relative flex-1 max-w-sm">
                    <input
                      type="text"
                      placeholder="Search unretained students by name or ID..."
                      value={retentionSearch}
                      onChange={(e) => {
                        setRetentionSearch(e.target.value);
                        setRetentionPage(1);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 font-sans"
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Showing {filteredRetentionItems.length} of {actionablePlan.retentionItems.length} total at-risk items
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  {filteredRetentionItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2">No students matching the search filter found.</p>
                  ) : (
                    <div className="space-y-5">
                      {/* INTEGRATED RETENTION PREDICTION ENGINE METRIC ACCENT */}
                      <div className="bg-slate-950 p-4 border border-orange-500/20 rounded-xl space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] bg-orange-500/10 text-orange-400 font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded">
                              ⚙️ Retention Prediction Engine
                            </span>
                            <p className="text-[11px] text-slate-300 mt-1 leading-normal max-w-xl">
                              Students labeled as <strong className="text-rose-400">Inactive Students</strong> (academic/cancellation request alerts) or <strong className="text-amber-400">Fee Defaulters</strong> (2nd EMI payment alerts) can be predicted to paid/active. This boosts your center's consolidated rating index and overall national rank in real-time.
                            </p>
                          </div>
                          <div className="shrink-0 text-right bg-slate-900 border border-slate-800 px-3 py-1 rounded">
                            <span className="text-[8px] text-slate-500 block font-mono font-bold uppercase">Real-Time Impact</span>
                            <span className="text-xs font-mono font-bold text-orange-400">
                              Rank #{selectedCenterScores.rank} / Score: {selectedCenterScores.studentRetentionScore.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => {
                              const targetIds = filteredRetentionItems.map(item => item.student.id);
                              setCoachedStudentIds(Array.from(new Set([...coachedStudentIds, ...targetIds])));
                            }}
                            className="bg-orange-600 hover:bg-orange-500 text-slate-50 font-semibold py-1 px-2.5 rounded cursor-pointer transition active:scale-95"
                          >
                            Predict ALL Resolved (+ Rank Increase)
                          </button>
                          <button
                            onClick={() => {
                              const targetIds = filteredRetentionItems.map(item => item.student.id);
                              setCoachedStudentIds(coachedStudentIds.filter(id => !targetIds.includes(id)));
                            }}
                            className="bg-slate-850 hover:bg-slate-800 text-slate-350 border border-slate-750 font-semibold py-1 px-2.5 rounded cursor-pointer transition"
                          >
                            Reset Prediction Box
                          </button>
                        </div>
                      </div>

                      {/* GROUP 1: FEE DEFAULTERS */}
                      {groupedRetentionItems.feeDefaulters.length > 0 && (
                        <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/40 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  CATEGORY HEADER
                                </span>
                                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                                  💰 Fee Defaulter Students ({groupedRetentionItems.feeDefaulters.length})
                                </h4>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                <span className="font-semibold text-amber-400 font-mono">SUPPORT ACTION:</span> Fulfill fee collection: Contact parents to resolve late payment of 2nd EMI of fees.
                              </p>
                            </div>
                            <div className="text-[10px] text-emerald-400 font-medium bg-emerald-500/5 px-2.5 py-1 rounded border border-emerald-500/10 shrink-0 self-start md:self-center">
                              ⚡ High Scoring Opportunity
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                            {groupedRetentionItems.feeDefaulters.map(({ student, conversionProb }) => {
                              const isCoached = coachedStudentIds.includes(student.id);
                              return (
                                <button
                                  key={student.id}
                                  onClick={() => handleToggleCoach(student.id)}
                                  className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer ${
                                    isCoached
                                      ? "bg-slate-850 border-orange-500/70 shadow-sm"
                                      : "bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <div className="shrink-0 mt-0.5">
                                      {isCoached ? (
                                        <span className="bg-orange-500 text-slate-950 rounded-full w-4.5 h-4.5 flex items-center justify-center text-[10px] font-extrabold">✓</span>
                                      ) : (
                                        <span className="border border-slate-600 hover:border-orange-500 rounded-full w-4.5 h-4.5 block" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs font-semibold whitespace-normal break-words leading-snug ${isCoached ? "text-orange-400 font-bold" : "text-slate-100"}`}>
                                        {student.name}
                                      </div>
                                      <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                                        ID: {student.id}
                                      </div>
                                    </div>
                                  </div>
                                  {isCoached && (
                                    <div className="shrink-0 ml-2">
                                      <span className="text-[9px] font-semibold text-emerald-400 block bg-emerald-500/10 px-1.5 py-0.5 rounded">Paid</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* GROUP 2: INACTIVE STUDENTS */}
                      {groupedRetentionItems.inactiveStudents.length > 0 && (
                        <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/40 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  CATEGORY HEADER
                                </span>
                                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                                  ⚠️ Academically Inactive Students ({groupedRetentionItems.inactiveStudents.length})
                                </h4>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                <span className="font-semibold text-rose-400 font-mono">SUPPORT ACTION:</span> Fulfill academic contact: Schedule parent counseling to change Inactive status to Active.
                              </p>
                            </div>
                            <div className="text-[10px] text-cyan-400 font-medium bg-cyan-500/5 px-2.5 py-1 rounded border border-cyan-500/10 shrink-0 self-start md:self-center">
                              📘 Counselling Required
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                            {groupedRetentionItems.inactiveStudents.map(({ student, conversionProb }) => {
                              const isCoached = coachedStudentIds.includes(student.id);
                              return (
                                <button
                                  key={student.id}
                                  onClick={() => handleToggleCoach(student.id)}
                                  className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all duration-155 cursor-pointer ${
                                    isCoached
                                      ? "bg-slate-850 border-orange-500/70 shadow-sm"
                                      : "bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <div className="shrink-0 mt-0.5">
                                      {isCoached ? (
                                        <span className="bg-orange-500 text-slate-950 rounded-full w-4.5 h-4.5 flex items-center justify-center text-[10px] font-extrabold">✓</span>
                                      ) : (
                                        <span className="border border-slate-600 hover:border-orange-500 rounded-full w-4.5 h-4.5 block" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs font-semibold whitespace-normal break-words leading-snug ${isCoached ? "text-orange-400 font-bold" : "text-slate-100"}`}>
                                        {student.name}
                                      </div>
                                      <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                                        ID: {student.id}
                                      </div>
                                    </div>
                                  </div>
                                  {isCoached && (
                                    <div className="shrink-0 ml-2">
                                      <span className="text-[9px] font-semibold text-emerald-400 block bg-emerald-500/10 px-1.5 py-0.5 rounded">Active</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ==========================================
              TAB INTERACTION 7: POOL & ABSENCE AUDITING
             ========================================== */}
          {selectedTab === "pool" && (
            <div className="space-y-6" id="view-pool-evaluation">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 flex-wrap">
                  <div>
                    <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight" id="pool-view-title">
                      👥 Active Student Evaluation Database
                    </h2>
                    <p className="text-xs text-slate-400">Total list of student registrations and evaluations for {selectedCenterScores.centerName}. Click headers to sort.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-cyan-400 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                      Rules A & B Active
                    </span>
                    <button
                      onClick={handleExportStudentPoolCSV}
                      className="bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-98 shadow-md"
                      title="Export this current center student list directory to a CSV spreadsheet"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Hub (.csv)</span>
                    </button>
                  </div>
                </div>

                 {/* POOL EVALUATION SEARCH & COUNTER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-lg border border-slate-805 border-slate-800">
                  <div className="relative flex-1 max-w-sm">
                    <input
                      type="text"
                      placeholder="Search students by name or ID..."
                      value={poolSearch}
                      onChange={(e) => {
                        setPoolSearch(e.target.value);
                        setPoolPage(1);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 font-sans"
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Showing {paginatedPoolStudents.length} of {filteredAndSortedPoolStudents.length} filtered items ({sortedSelectedCenterStudents.length} center total)
                  </div>
                </div>

                {/* MAIN STUDENTS DIRECTORY */}
                <div className="border border-slate-800 rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs bg-slate-950 font-sans">
                    <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 uppercase text-[10px] select-none">
                      <tr>
                        <th 
                          onClick={() => {
                            if (studentSortField === "name") {
                              setStudentSortAsc(!studentSortAsc);
                            } else {
                              setStudentSortField("name");
                              setStudentSortAsc(true);
                            }
                          }}
                          className="p-3 cursor-pointer hover:bg-slate-850 hover:text-slate-100 transition"
                        >
                          Student {studentSortField === "name" ? (studentSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                        <th 
                          onClick={() => {
                            if (studentSortField === "grade") {
                              setStudentSortAsc(!studentSortAsc);
                            } else {
                              setStudentSortField("grade");
                              setStudentSortAsc(true);
                            }
                          }}
                          className="p-3 cursor-pointer hover:bg-slate-850 hover:text-slate-100 transition whitespace-nowrap"
                        >
                          Grade {studentSortField === "grade" ? (studentSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                        <th 
                          onClick={() => {
                            if (studentSortField === "t1_attendance") {
                              setStudentSortAsc(!studentSortAsc);
                            } else {
                              setStudentSortField("t1_attendance");
                              setStudentSortAsc(true);
                            }
                          }}
                          className="p-3 cursor-pointer hover:bg-slate-850 hover:text-slate-100 transition whitespace-nowrap"
                        >
                          T1 Attendance {studentSortField === "t1_attendance" ? (studentSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                        <th 
                          onClick={() => {
                            if (studentSortField === "t2_attendance") {
                              setStudentSortAsc(!studentSortAsc);
                            } else {
                              setStudentSortField("t2_attendance");
                              setStudentSortAsc(true);
                            }
                          }}
                          className="p-3 cursor-pointer hover:bg-slate-850 hover:text-slate-100 transition whitespace-nowrap"
                        >
                          T2 Attendance {studentSortField === "t2_attendance" ? (studentSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                        <th 
                          onClick={() => {
                            if (studentSortField === "averageScore") {
                              setStudentSortAsc(!studentSortAsc);
                            } else {
                              setStudentSortField("averageScore");
                              setStudentSortAsc(false);
                            }
                          }}
                          className="p-4 cursor-pointer hover:bg-slate-850 hover:text-slate-100 transition whitespace-nowrap text-cyan-400"
                        >
                          Evaluated Avg {studentSortField === "averageScore" ? (studentSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                        <th 
                          onClick={() => {
                            if (studentSortField === "retained") {
                              setStudentSortAsc(!studentSortAsc);
                            } else {
                              setStudentSortField("retained");
                              setStudentSortAsc(false);
                            }
                          }}
                          className="p-4 cursor-pointer hover:bg-slate-850 hover:text-slate-100 transition whitespace-nowrap"
                        >
                          Retention Status {studentSortField === "retained" ? (studentSortAsc ? "▲" : "▼") : "↕"}
                        </th>
                        <th className="p-4">Audit Status Badge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {paginatedPoolStudents.map((student) => {
                        const isCoached = coachedStudentIds.includes(student.id);
                        const isT1Present = checkT1Present(student);
                        const isT2Present = checkT2Present(student);
                        
                        // Grab evaluated average
                        let performance = getStudentPerformance(student);
                        
                        // Adjust average score dynamically if coached
                        let displayAvgStr = "--";
                        let isExcluded = false;
                        let isSingleTest = false;

                        if (!isT1Present && !isT2Present) {
                          isExcluded = true;
                        } else {
                          isSingleTest = !isT1Present || !isT2Present;
                          // If coached, simulated average changes
                          if (isCoached) {
                            const updatedT1 = { ...student.t1_scores };
                            const updatedT2 = { ...student.t2_scores };
                            if (updatedT1.physics !== undefined && updatedT1.physics < 40) updatedT1.physics = 40;
                            if (updatedT1.chemistry !== undefined && updatedT1.chemistry < 40) updatedT1.chemistry = 40;
                            if (updatedT1.maths !== undefined && updatedT1.maths < 40) updatedT1.maths = 40;
                            if (updatedT2.physics !== undefined && updatedT2.physics < 40) updatedT2.physics = 40;
                            if (updatedT2.chemistry !== undefined && updatedT2.chemistry < 40) updatedT2.chemistry = 40;
                            if (updatedT2.maths !== undefined && updatedT2.maths < 40) updatedT2.maths = 40;
                            
                            const papers: number[] = [];
                            if (isT1Present) {
                              if (updatedT1.physics !== undefined) papers.push(updatedT1.physics);
                              if (updatedT1.chemistry !== undefined) papers.push(updatedT1.chemistry);
                              if (updatedT1.maths !== undefined) papers.push(updatedT1.maths);
                            }
                            if (isT2Present) {
                              if (updatedT2.physics !== undefined) papers.push(updatedT2.physics);
                              if (updatedT2.chemistry !== undefined) papers.push(updatedT2.chemistry);
                              if (updatedT2.maths !== undefined) papers.push(updatedT2.maths);
                            }
                            const sum = papers.reduce((sVal, pVal) => sVal + pVal, 0);
                            displayAvgStr = papers.length > 0 ? (sum / papers.length).toFixed(1) + "%" : "0%";
                          } else {
                            displayAvgStr = performance.averagePercent !== null ? performance.averagePercent.toFixed(1) + "%" : "--";
                          }
                        }

                        return (
                          <tr key={student.id} className="hover:bg-slate-900/40">
                            <td className="p-3">
                              <div>
                                <div className="font-semibold text-slate-200">{student.name}</div>
                                <span className="text-[10px] font-mono text-slate-500 block">{student.id}</span>
                              </div>
                            </td>
                            <td className="p-3 text-slate-400 font-mono">Class {student.grade}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                isT1Present ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                              }`}>
                                {student.t1_attendance}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                isT2Present ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                              }`}>
                                {student.t2_attendance}
                              </span>
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-100">
                              {displayAvgStr}
                            </td>
                            <td className="p-4">
                              {student.retained ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                  Retained
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-500 border border-slate-700">
                                  Not Retained
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              {isExcluded ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20 flex w-fit items-center gap-1">
                                  <UserX className="w-3.5 h-3.5" />
                                  Rule A: Excluded
                                </span>
                              ) : isSingleTest ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex w-fit items-center gap-1">
                                  <Info className="w-3.5 h-3.5" />
                                  Rule B: Single Eval
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex w-fit items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Active Pool Evaluated
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* GENERAL POOL PAGINATION CONTROLS */}
                {poolTotalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 font-sans">
                    <div className="text-[11px] font-mono text-slate-500">
                      Showing {Math.min(filteredAndSortedPoolStudents.length, (poolPage - 1) * poolPageSize + 1)}–{Math.min(filteredAndSortedPoolStudents.length, poolPage * poolPageSize)} of {filteredAndSortedPoolStudents.length} students
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPoolPage((p) => Math.max(1, p - 1))}
                        disabled={poolPage === 1}
                        className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                      >
                        ◀ Prev
                        </button>
                        <span className="font-mono text-slate-300">
                          Page {poolPage} of {poolTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPoolPage((p) => Math.min(poolTotalPages, p + 1))}
                          disabled={poolPage === poolTotalPages}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300 hover:bg-slate-900 transition disabled:opacity-40 disabled:hover:bg-slate-950 font-mono font-bold cursor-pointer"
                        >
                          Next ▶
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* ==========================================
              TAB INTERACTION 8: ADMIN RULES & FORMULAS REFERENCE
              ========================================== */}
          {selectedTab === "admin_rules" && (
            <div className="space-y-6" id="view-admin-rules-math">
              
              {/* ADMIN INTRO HEADER */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-3">
                <span className="px-2.5 py-1 text-[9px] font-mono font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full tracking-wider w-fit block">
                  🔑 Restricted Workspace: Admin & Teacher Console
                </span>
                <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight" id="admin-rules-title">
                  📐 Evaluation Blueprint, Weightage & Live Formula Inspector
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  This dashboard transparently depicts the evaluation guidelines for the Physics Wallah (PW) Regional Center Leads dynamic rankings model. 
                  Below, check how scores for <strong className="text-yellow-400">{selectedCenterScores.centerName}</strong> are mathematically synthesized on-the-fly and deploy bulk target intervention campaigns.
                </p>
              </div>

              {/* SECTION A: THE 5 EVALUATION WEIGHTAGE PILLARS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="math-blueprint-columns">
                
                {/* 1. SUBJECTIVE TEST CARD */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                    <span className="text-xs uppercase font-extrabold font-mono text-cyan-400 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4" />
                      1. Subjective Tests (25% Weight)
                    </span>
                    <span className="text-xs font-mono font-bold bg-slate-950 px-2 py-0.5 rounded text-cyan-400 border border-slate-800">
                      Score: {selectedCenterScores.subjectiveTestScore.toFixed(1)}/100
                    </span>
                  </div>
                  
                  <div className="space-y-3.5 text-xs text-slate-300">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block animate-pulse">Element A (60% Weight): Topper Threshold</span>
                      <p className="leading-relaxed">
                        Ratio of active students with a cumulative average &ge; 90%. If &ge; 15% of the center pool achieves this, 100 points is awarded. Otherwise, scaled linearly: <code>(Element_A_Ratio / 15) * 100</code>.
                      </p>
                      <div className="text-[10px] font-mono text-cyan-400 font-bold bg-slate-900/60 px-2 py-1 rounded border border-slate-800 mt-1 flex justify-between">
                        <span>{selectedCenterScores.centerName} Active Toppers:</span>
                        <span>{selectedCenterScores.elementA_percent.toFixed(1)}% &rarr; {selectedCenterScores.elementA_score.toFixed(1)}/100 pts</span>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Element B (40% Weight): Failing Marks Prevention</span>
                      <p className="leading-relaxed">
                        Ratio of individual paper scores falling under 40% (Fail rate). If fail rate is &le; 5%, 100 points is awarded. If &ge; 15%, 0 points is awarded. In-between (5%-15%), scaled linearly dropping from 100 to 0.
                      </p>
                      <div className="text-[10px] font-mono text-cyan-400 font-bold bg-slate-900/60 px-2 py-1 rounded border border-slate-800 mt-1 flex justify-between">
                        <span>{selectedCenterScores.centerName} Fail-Rate:</span>
                        <span>{selectedCenterScores.elementB_percent.toFixed(1)}% &rarr; {selectedCenterScores.elementB_score.toFixed(1)}/100 pts</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Live Calculus Walkthrough:</span>
                      <p className="font-mono text-[10px] text-emerald-400 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-850 select-all leading-relaxed break-all">
                        ({selectedCenterScores.elementA_score.toFixed(1)} * 0.60) + ({selectedCenterScores.elementB_score.toFixed(1)} * 0.40) = <strong>{selectedCenterScores.subjectiveTestScore.toFixed(2)} pts</strong>
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. IOQM ACHIEVEMENT CARD */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                    <span className="text-xs uppercase font-extrabold font-mono text-yellow-405 text-yellow-400 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-yellow-400" />
                      2. IOQM Achievement (20% Weight)
                    </span>
                    <span className="text-xs font-mono font-bold bg-slate-950 px-2 py-0.5 rounded text-yellow-400 border border-slate-800">
                      Score: {selectedCenterScores.ioqmScore.toFixed(1)}/100
                    </span>
                  </div>

                  <div className="space-y-3 text-xs text-slate-300">
                    <p className="leading-relaxed">
                      Olympiad performance is computed from the cumulative average IOQM marks of all active non-absent students.
                    </p>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Linear Scaling Thresholds</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-400 font-sans">
                        <li>Average <strong className="text-slate-200">&lt; 40%</strong> &rarr; 0 Points</li>
                        <li>Average <strong className="text-slate-200">&ge; 90%</strong> &rarr; 100 Points</li>
                        <li>Average 40% &rarr; 90% &rarr; Linearly scaled: <code>((Avg - 40) / 50) * 100</code></li>
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Live Calculus Walkthrough:</span>
                      <div className="font-mono text-[10px] text-emerald-400 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-850 space-y-1 leading-normal">
                        <div>Center Active Average IOQM: <strong className="text-slate-100">{selectedCenterScores.ioqm_percent.toFixed(2)}%</strong></div>
                        <div className="pt-1 border-t border-slate-850/80 text-yellow-400 leading-relaxed">
                          Applied Eq: Math.max(0, Math.min(100, (({selectedCenterScores.ioqm_percent.toFixed(2)} - 40) / 50) * 100)) = <strong>{selectedCenterScores.ioqmScore.toFixed(2)} pts</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. RAMP UP EXAMS CARD */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                    <span className="text-xs uppercase font-extrabold font-mono text-purple-400 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-purple-400" />
                      3. Ramp Up Exams (15% Weight)
                    </span>
                    <span className="text-xs font-mono font-bold bg-slate-950 px-2 py-0.5 rounded text-purple-400 border border-slate-800">
                      Score: {selectedCenterScores.rampUpScore.toFixed(1)}/100
                    </span>
                  </div>

                  <div className="space-y-3 text-xs text-slate-300">
                    <p className="leading-relaxed">
                      Targeted strictly at 9th and 10th graders to verify rapid academic growth. Measures the ratio of students scoring &gt; 80% on their Ramp Up tests.
                    </p>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Linear Scaling Thresholds</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-400 font-sans">
                        <li>Toppers Ratio <strong className="text-slate-200">&lt; 1%</strong> &rarr; 0 Points</li>
                        <li>Toppers Ratio <strong className="text-slate-200">&ge; 5%</strong> &rarr; 100 Points</li>
                        <li>Ratio 1% &rarr; 5% &rarr; Linearly scaled: <code>((Ratio - 1) / 4) * 100</code></li>
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Live Calculus Walkthrough:</span>
                      <div className="font-mono text-[10px] text-emerald-400 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-850 space-y-1 leading-normal">
                        <div>Center 9th/10th Toppers Ratio: <strong className="text-slate-100">{selectedCenterScores.rampUp_percent.toFixed(2)}%</strong></div>
                        <div className="pt-1 border-t border-slate-850/80 text-purple-400 leading-relaxed">
                          Applied Eq: Math.max(0, Math.min(100, (({selectedCenterScores.rampUp_percent.toFixed(2)} - 1) / 4) * 100)) = <strong>{selectedCenterScores.rampUpScore.toFixed(2)} pts</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. TEST ATTENDANCE CARD */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                    <span className="text-xs uppercase font-extrabold font-mono text-emerald-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-400" />
                      4. Test Attendance (10% Weight)
                    </span>
                    <span className="text-xs font-mono font-bold bg-slate-950 px-2 py-0.5 rounded text-emerald-400 border border-slate-800">
                      Score: {selectedCenterScores.testAttendanceScore.toFixed(1)}/100
                    </span>
                  </div>

                  <div className="space-y-3 text-xs text-slate-300">
                    <p className="leading-relaxed">
                      Tracks active pool attendance across subjective tests. High attendance yields consistent batch motivation.
                    </p>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Linear Scaling Thresholds</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-400 font-sans">
                        <li>Attendance <strong className="text-slate-200">&lt; 50%</strong> &rarr; 0 Points</li>
                        <li>Attendance <strong className="text-slate-200">&gt; 75%</strong> &rarr; 100 Points</li>
                        <li>Attendance 50% &rarr; 75% &rarr; Linearly scaled: <code>((Attendance - 50) / 25) * 100</code></li>
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Live Calculus Walkthrough:</span>
                      <div className="font-mono text-[10px] text-emerald-400 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-850 space-y-1 leading-normal">
                        <div>Center Active Attendance Rate: <strong className="text-slate-100">{selectedCenterScores.attendance_percent.toFixed(2)}%</strong></div>
                        <div className="pt-1 border-t border-slate-850/80 text-emerald-400 leading-relaxed">
                          Applied Eq: Math.max(0, Math.min(100, (({selectedCenterScores.attendance_percent.toFixed(2)} - 50) / 25) * 100)) = <strong>{selectedCenterScores.testAttendanceScore.toFixed(2)} pts</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. STUDENT RETENTION CARD */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4 md:col-span-2">
                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                    <span className="text-xs uppercase font-extrabold font-mono text-orange-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-orange-400" />
                      5. Student Retention (30% Weight) - The Core Metric Lever
                    </span>
                    <span className="text-xs font-mono font-bold bg-slate-950 px-2 py-0.5 rounded text-orange-400 border border-slate-800">
                      Score: {selectedCenterScores.studentRetentionScore.toFixed(1)}/100
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                    <div className="space-y-2">
                      <p className="leading-relaxed">
                        Measures the ratio of student registrations retained in active status (no refunds, active in ledger). It contributes a heavy 30% towards the combined center performance.
                      </p>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Linear Scaling Thresholds</span>
                        <ul className="list-disc list-inside space-y-1 text-slate-400 font-sans">
                          <li>Retention <strong className="text-slate-200">&lt; 75%</strong> &rarr; 0 Points</li>
                          <li>Retention <strong className="text-slate-200">&ge; 95%</strong> &rarr; 100 Points</li>
                          <li>Retention 75% &rarr; 95% &rarr; Linear scale: <code>((Retention - 75) / 20) * 100</code></li>
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-3.5 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Formula Equation Formulation:</span>
                        <p className="text-[11px] leading-relaxed text-slate-400">
                          <code>Retention Rate = (Total - Defaulters) / Total</code>. This maps center stability and community satisfaction with teachers classes.
                        </p>
                      </div>

                      <div className="border-t border-slate-800/60 pt-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Live Calculus Walkthrough:</span>
                        <div className="font-mono text-[10px] text-emerald-400 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-850 space-y-1 leading-normal">
                          <div>Center Active Retention Rate: <strong className="text-slate-100">{selectedCenterScores.retention_percent.toFixed(2)}%</strong></div>
                          <div className="pt-1 border-t border-slate-850/80 text-orange-400 leading-relaxed">
                            Applied Eq: Math.max(0, Math.min(100, (({selectedCenterScores.retention_percent.toFixed(2)} - 75) / 20) * 100)) = <strong>{selectedCenterScores.studentRetentionScore.toFixed(2)} pts</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* THE CONSOLIDATED FINAL CARD */}
                <div className="bg-slate-900 border-2 border-yellow-500/20 rounded-xl p-6 md:col-span-2 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                      <h3 className="text-sm font-bold font-display text-slate-50 uppercase tracking-tight">
                        Synthesis: {selectedCenterScores.centerName} Consolidated Final Score
                      </h3>
                    </div>
                    <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-405 text-yellow-400 font-mono font-bold text-sm px-3 py-1 rounded">
                      Consolidated: {selectedCenterScores.consolidatedScore.toFixed(1)}/100
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    Five-pillar weights applied: <strong>25% Subjective Tests</strong>, <strong>20% IOQM</strong>, <strong>15% Ramp Up</strong>, <strong>10% Attendance</strong>, and <strong>30% Student Retention</strong>. Niche visual mapping below portrays exact weighted point contribution.
                  </p>

                  <div className="space-y-3.5">
                    {/* Visual Progress Composition bar */}
                    <div className="h-6 w-full rounded-lg overflow-hidden flex font-mono text-[9px] font-bold text-slate-950 select-none border border-slate-950">
                      <div 
                        title={`Subjective Contribution: ${(selectedCenterScores.subjectiveTestScore * 0.25).toFixed(1)} pts`}
                        style={{ width: `${(selectedCenterScores.subjectiveTestScore * 0.25)}%` }} 
                        className="bg-cyan-400 flex items-center justify-center transition-all duration-300 min-w-[5%]"
                      >
                        SUB
                      </div>
                      <div 
                        title={`IOQM Contribution: ${(selectedCenterScores.ioqmScore * 0.20).toFixed(1)} pts`}
                        style={{ width: `${(selectedCenterScores.ioqmScore * 0.20)}%` }} 
                        className="bg-yellow-400 flex items-center justify-center transition-all duration-300 min-w-[5%]"
                      >
                        IOQM
                      </div>
                      <div 
                        title={`Ramp Up Contribution: ${(selectedCenterScores.rampUpScore * 0.15).toFixed(1)} pts`}
                        style={{ width: `${(selectedCenterScores.rampUpScore * 0.15)}%` }} 
                        className="bg-purple-400 flex items-center justify-center transition-all duration-300 min-w-[5%]"
                      >
                        RAMP
                      </div>
                      <div 
                        title={`Attendance Contribution: ${(selectedCenterScores.testAttendanceScore * 0.10).toFixed(1)} pts`}
                        style={{ width: `${(selectedCenterScores.testAttendanceScore * 0.10)}%` }} 
                        className="bg-emerald-400 flex items-center justify-center transition-all duration-300 min-w-[5%]"
                      >
                        ATTN
                      </div>
                      <div 
                        title={`Retention Contribution: ${(selectedCenterScores.studentRetentionScore * 0.30).toFixed(1)} pts`}
                        style={{ width: `${(selectedCenterScores.studentRetentionScore * 0.30)}%` }} 
                        className="bg-orange-400 flex items-center justify-center transition-all duration-300 min-w-[5%]"
                      >
                        RETD
                      </div>
                    </div>

                    {/* Legendary Keys Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 text-[10px] font-mono text-slate-400">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-cyan-400 rounded-sm shrink-0" />
                        <span>Subjective (25%): <strong className="text-slate-200">{(selectedCenterScores.subjectiveTestScore * 0.25).toFixed(1)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-yellow-400 rounded-sm shrink-0" />
                        <span>IOQM (20%): <strong className="text-slate-200">{(selectedCenterScores.ioqmScore * 0.20).toFixed(1)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-purple-400 rounded-sm shrink-0" />
                        <span>Ramp Up (15%): <strong className="text-slate-200">{(selectedCenterScores.rampUpScore * 0.15).toFixed(1)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm shrink-0" />
                        <span>Attendance (10%): <strong className="text-slate-200">{(selectedCenterScores.testAttendanceScore * 0.10).toFixed(1)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-orange-400 rounded-sm shrink-0" />
                        <span>Retention (30%): <strong className="text-slate-200">{(selectedCenterScores.studentRetentionScore * 0.30).toFixed(1)}</strong></span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 italic text-center pt-1 border-t border-slate-800/60 font-mono">
                      Dynamic Consolidated Equation: Subjective*0.25 + IOQM*0.20 + RampUp*0.15 + Attendance*0.10 + Retention*0.30 = {(selectedCenterScores.consolidatedScore).toFixed(1)} points
                    </p>
                  </div>
                </div>

              </div>
            </div>
          )}


            </>
          )}

        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-500 font-mono mt-12">
        <p>© 2026 Physics Wallah (PW) Regional Center Leads Evaluation Portal. All diagnostic data audited and tracked recursively.</p>
      </footer>
        </>
      )}
    </div>
  );
}
