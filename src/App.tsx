import React, { useState, useMemo, useEffect } from "react";
import {
  PRELOADED_STUDENTS,
  getStudentPerformance,
  getRankedCenters,
  calculateCenterMetrics,
  Student,
  CenterScores,
} from "./data";
import {
  initAuth,
  googleSignIn,
  logout,
  fetchSpreadsheetValues,
  parseGoogleSheetRows,
  generateCSVTemplateString,
  extractSpreadsheetId,
} from "./auth";
import { downloadStudentsXLSX, parseLocalSpreadsheetFile, fetchPublicSpreadsheet } from "./utils/excel";
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

export default function App() {
  // --- STATES ---
  const [students, setStudents] = useState<Student[]>(PRELOADED_STUDENTS);
  const [selectedCenterName, setSelectedCenterName] = useState<string>("Lucknow Chowk Centre");
  const [selectedTab, setSelectedTab] = useState<string>("combined");
  const [isAdmin, setIsAdmin] = useState<boolean>(true);
  const [leaderboardMetric, setLeaderboardMetric] = useState<"combined" | "subjective" | "ioqm" | "ramp_up" | "attendance" | "retention">("combined");
  
  // Track IDs of students whose borderline grades we are simulating coaching for
  const [coachedStudentIds, setCoachedStudentIds] = useState<string[]>([]);
  
  // Gemini AI Expert report states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [aiReport, setAiReport] = useState<string>("");
  const [aiError, setAiError] = useState<string>("");

  // --- GOOGLE SPREADSHEETS INTEGRATION ADDITIONAL STATES ---
  const [googleUser, setGoogleUser] = useState<any | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [spreadsheetInput, setSpreadsheetInput] = useState<string>("");
  const [sheetRangeInput, setSheetRangeInput] = useState<string>("Sheet1!A:Z");
  const [isFetchingSheet, setIsFetchingSheet] = useState<boolean>(false);
  const [fetchSheetError, setFetchSheetError] = useState<string>("");
  const [hasImportedData, setHasImportedData] = useState<boolean>(false);
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(true);
  const [copiedTemplate, setCopiedTemplate] = useState<boolean>(false);
  const [copiedCSVProgress, setCopiedCSVProgress] = useState<boolean>(false);

  // Initialize and check saved students from localStorage on start
  useEffect(() => {
    const saved = localStorage.getItem("pw_analytics_custom_students");
    const savedSheetId = localStorage.getItem("pw_analytics_sheet_id");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStudents(parsed);
          setHasImportedData(true);
          
          // Auto-select the first center from imported list if previous active is missing
          const centers = Array.from(new Set(parsed.map((s: Student) => s.center)));
          if (centers.length > 0 && !centers.includes("Lucknow Chowk Centre")) {
            setSelectedCenterName(centers[0]);
          }
        }
      } catch (e) {
        console.error("Local data parse error", e);
      }
    }
    if (savedSheetId) {
      setSpreadsheetInput(savedSheetId);
    }

    // Subscribe to Google Firebase OAuth
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setAuthToken(token);
      },
      () => {
        setGoogleUser(null);
        setAuthToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Clear simulated coaching whenever center changes to avoid state confusion
  useEffect(() => {
    setCoachedStudentIds([]);
    setAiReport("");
    setAiError("");
  }, [selectedCenterName]);

  // --- RECALCULATION PIPELINE ---
  // Apply "What-If" coaching simulations to student marks in real-time
  const simulatedStudents = useMemo(() => {
    return students.map((s) => {
      if (coachedStudentIds.includes(s.id)) {
        // Build simulated student with all failing papers boosted to 45% (pass line)
        const updatedT1 = { ...s.t1_scores };
        const updatedT2 = { ...s.t2_scores };

        if (updatedT1.physics !== undefined && updatedT1.physics < 40) updatedT1.physics = 45;
        if (updatedT1.chemistry !== undefined && updatedT1.chemistry < 40) updatedT1.chemistry = 45;
        if (updatedT1.maths !== undefined && updatedT1.maths < 40) updatedT1.maths = 45;

        if (updatedT2.physics !== undefined && updatedT2.physics < 40) updatedT2.physics = 45;
        if (updatedT2.chemistry !== undefined && updatedT2.chemistry < 40) updatedT2.chemistry = 45;
        if (updatedT2.maths !== undefined && updatedT2.maths < 40) updatedT2.maths = 45;

        // Boost Olympiad IOQM scores to 90%
        const simulatedIoqm = s.ioqm_score < 90 ? 90 : s.ioqm_score;

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
    return getRankedCenters(simulatedStudents);
  }, [simulatedStudents]);

  // Find the currently selected center's simulated and default scores
  const selectedCenterScores = useMemo(() => {
    return rankedCenters.find((c) => c.centerName === selectedCenterName) || rankedCenters[0];
  }, [rankedCenters, selectedCenterName]);

  // Get raw baseline scores (without simulation) to compare
  const baselineCenters = useMemo(() => {
    return getRankedCenters(students);
  }, [students]);

  const selectedCenterBaseline = useMemo(() => {
    return baselineCenters.find((c) => c.centerName === selectedCenterName) || baselineCenters[0];
  }, [baselineCenters, selectedCenterName]);

  // --- TARGET STUDENT LIST (Lucknow specific borderline students) ---
  const currentCenterBorderlineStudents = useMemo(() => {
    const centerStudents = students.filter((s) => s.center === selectedCenterName);
    
    // Filter out double absent students
    const active = centerStudents.filter(
      (s) => s.t1_attendance === "Present" || s.t2_attendance === "Present"
    );

    // Identify students with at least 1 failing paper in the 30% to 39% range
    return active.filter((s) => {
      const papers: number[] = [];
      if (s.t1_attendance === "Present") {
        if (s.t1_scores.physics !== undefined) papers.push(s.t1_scores.physics);
        if (s.t1_scores.chemistry !== undefined) papers.push(s.t1_scores.chemistry);
        if (s.t1_scores.maths !== undefined) papers.push(s.t1_scores.maths);
      }
      if (s.t2_attendance === "Present") {
        if (s.t2_scores.physics !== undefined) papers.push(s.t2_scores.physics);
        if (s.t2_scores.chemistry !== undefined) papers.push(s.t2_scores.chemistry);
        if (s.t2_scores.maths !== undefined) papers.push(s.t2_scores.maths);
      }
      return papers.some((score) => score >= 30 && score <= 39);
    }).slice(0, 6); // Limit to top borderline students for targeted action
  }, [students, selectedCenterName]);

  // --- LEAK ANALYSER ---
  // Identify the component that underperformed the most compared to perfection (or Kota Prime baseline)
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

  const activeMetricList = useMemo(() => {
    switch (leaderboardMetric) {
      case "subjective":
        return subjectiveRanked;
      case "ioqm":
        return ioqmRanked;
      case "ramp_up":
        return rampUpRanked;
      case "attendance":
        return attendanceRanked;
      case "retention":
        return retentionRanked;
      case "combined":
      default:
        return rankedCenters.map((item, index) => ({ ...item, metricRank: index + 1 }));
    }
  }, [rankedCenters, leaderboardMetric, subjectiveRanked, ioqmRanked, rampUpRanked, attendanceRanked, retentionRanked]);

  // Priority Action Items for the Selected Center and Metric Focus
  const actionablePlan = useMemo(() => {
    const centerStudents = students.filter((s) => s.center === selectedCenterName);
    const activeStudents = centerStudents.filter(
      (s) => s.t1_attendance === "Present" || s.t2_attendance === "Present"
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
            const simulated = isCoached(s.id) ? 45 : p.score;
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
        if (s.t1_attendance === "Absent") {
          items.push({ student: s, type: "Absent on Test 1", action: "Missed Test 1! Contact to ensure presence in next test cycle." });
        }
        if (s.t2_attendance === "Absent") {
          items.push({ student: s, type: "Absent on Test 2", action: "Missed Test 2! Follow up on weekend test attendance." });
        }
      });
      // Also grab double absents from raw center list
      centerStudents.forEach((s) => {
        if (s.t1_attendance === "Absent" && s.t2_attendance === "Absent") {
          items.push({ student: s, type: "Double Absent (Excluded)", action: "Highly At-Risk! Excluded from pool. Schedule critical direct consultation." });
        }
      });
      return items;
    };

    // Filter students with low IOQM scores
    const getIoqmItems = () => {
      return activeStudents
        .filter((s) => s.ioqm_score < 90)
        .map((s) => ({
          student: s,
          currentScore: s.ioqm_score,
          severity: s.ioqm_score < 40 ? ("critical" as const) : ("high" as const),
          action: s.ioqm_score < 40 
            ? "Scores <40% get 0 metrics weight! Focus on intermediate conceptual sheet practice immediately." 
            : "Scores 40-90% linearly scale. Pushing closer to 90% adds maximum rating points.",
        }));
    };

    // Filter 9th/10th graders with Ramp Up scores <80% (especially 60-80%)
    const getRampUpItems = () => {
      const activeRamp = activeStudents.filter((s) => s.grade === "9" || s.grade === "10");
      return activeRamp
        .filter((s) => s.ramp_up_score === undefined || s.ramp_up_score < 80)
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
      return centerStudents
        .filter((s) => !s.retained)
        .map((s) => ({
          student: s,
          action: "Dropped out/Not retained in ledger. Call parents, resolve active academic or fee query.",
        }));
    };

    return {
      subjectiveFailings: getSubjectiveFailings(),
      subjectiveTopperPotentials: getSubjectiveTopperPotentials(),
      absentees: getAbsentees(),
      ioqmItems: getIoqmItems(),
      rampUpItems: getRampUpItems(),
      retentionItems: getRetentionItems(),
    };
  }, [students, selectedCenterName, coachedStudentIds]);

  // --- MASS SIMULATION TRIGGERS ---
  const handleApplyPresetTier1 = () => {
    // Coach exactly 6 borderline students (all 6)
    const borderlineIds = currentCenterBorderlineStudents.map((s) => s.id);
    setCoachedStudentIds(borderlineIds);
    setAiReport("");
  };

  const handleApplyPresetTier2 = () => {
    // Coach ALL students with any failing papers in the center to 45%
    const centerStudents = students.filter((s) => s.center === selectedCenterName);
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

  // --- GOOGLE SPREADSHEET HANDLERS ---
  const handleGoogleLogin = async () => {
    try {
      setFetchSheetError("");
      setAuthError(null);
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setAuthToken(res.accessToken);
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error("Sign-in failed with error status:", err);
      if (errMsg.includes("unauthorized-domain") || errMsg.includes("auth/unauthorized-domain")) {
        setAuthError("unauthorized-domain");
      } else {
        setAuthError(errMsg);
      }
      setFetchSheetError(`Google authentication failed: ${errMsg}`);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await logout();
      setGoogleUser(null);
      setAuthToken(null);
    } catch (err: any) {
      console.error("Disconnect error", err);
    }
  };

  const handleFetchGoogleSheet = async () => {
    if (!spreadsheetInput) {
      setFetchSheetError("Please enter a Google Spreadsheet URL or Spreadsheet ID.");
      return;
    }

    setIsFetchingSheet(true);
    setFetchSheetError("");

    try {
      const sheetId = extractSpreadsheetId(spreadsheetInput);
      if (!sheetId) throw new Error("Could not extract a valid spreadsheet ID from your input.");

      let rows: any[][] | null = null;

      // Always attempt a direct public sheet fetch first, as it completely bypasses API limits,
      // OAuth steps, and console configuration - providing a seamless "zero login" user experience!
      try {
        console.log("Attempting direct public bypass fetch...");
        rows = await fetchPublicSpreadsheet(sheetId);
      } catch (publicErr: any) {
        console.warn("Direct public fetch failed, checking authenticated fallback...", publicErr);
        
        // If the sheet isn't public, and we have authorized, attempt standard Sheets API query
        if (authToken) {
          rows = await fetchSpreadsheetValues(sheetId, sheetRangeInput, authToken);
        } else {
          // No user session is connected, and public fetch failed. Give a highly informative error!
          throw new Error(
            `${publicErr.message || "Failed to read sheet."}\n\n` + 
            "💡 Pro-Tip: Google Sheets only allows view-only direct fetch when shared! " +
            "Please open your Google Sheet, click 'Share' in the top right, change the General access status to 'Anyone with the link can view' (Viewer mode), and click Sync again!\n\n" +
            "Alternatively, click 'Connect Google Session' under Option A to authorize accessing a private spreadsheet."
          );
        }
      }

      if (!rows || rows.length < 2) {
        throw new Error("No data returned, or empty sheet. Make sure Sheet name and rows exist.");
      }

      const parsedStudents = parseGoogleSheetRows(rows);
      if (parsedStudents.length === 0) {
        throw new Error("No student records could be parsed. Check column headers.");
      }

      // Save to React State
      setStudents(parsedStudents);
      setHasImportedData(true);
      setCoachedStudentIds([]);
      setAiReport("");
      setAiError("");

      // Save to localStorage
      localStorage.setItem("pw_analytics_custom_students", JSON.stringify(parsedStudents));
      localStorage.setItem("pw_analytics_sheet_id", spreadsheetInput);

      // Auto-set selected center if previous center not found in current list
      const centers = Array.from(new Set(parsedStudents.map(s => s.center)));
      if (centers.length > 0 && !centers.includes(selectedCenterName)) {
        setSelectedCenterName(centers[0]);
      }
    } catch (err: any) {
      console.error("Fetch Google Sheet error:", err);
      setFetchSheetError(err.message || "Failed to fetch spreadsheet. Confirm spreadsheet link or permissions.");
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleResetToDefaultDemo = () => {
    const confirmReset = window.confirm("Are you sure you want to restore the default pre-loaded Physics Wallah centers demo dataset?");
    if (!confirmReset) return;

    setStudents(PRELOADED_STUDENTS);
    setHasImportedData(false);
    setCoachedStudentIds([]);
    setAiReport("");
    setAiError("");
    setSelectedCenterName("Lucknow Chowk Centre");

    localStorage.removeItem("pw_analytics_custom_students");
    localStorage.removeItem("pw_analytics_sheet_id");
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

  const handleDownloadActiveCSV = () => {
    try {
      const csv = generateCSVTemplateString(simulatedStudents);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `pw_active_students_ledger_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Active CSV export failed:", e);
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
      setFetchSheetError("");
      setIsFetchingSheet(true);
      const rows = await parseLocalSpreadsheetFile(file);
      
      if (!rows || rows.length < 2) {
        throw new Error("The selected file is empty or missing headers.");
      }

      const parsedStudents = parseGoogleSheetRows(rows);
      if (parsedStudents.length === 0) {
        throw new Error("Could not extract any valid student records. Check column header spellings.");
      }

      setStudents(parsedStudents);
      setHasImportedData(true);
      setCoachedStudentIds([]);
      setAiReport("");
      setAiError("");

      localStorage.setItem("pw_analytics_custom_students", JSON.stringify(parsedStudents));

      const centers = Array.from(new Set(parsedStudents.map(s => s.center)));
      if (centers.length > 0 && !centers.includes(selectedCenterName)) {
        setSelectedCenterName(centers[0]);
      }
    } catch (err: any) {
      console.error("Local spreadsheet import failed:", err);
      setFetchSheetError(`Spreadsheet failure: ${err.message || err}`);
    } finally {
      setIsFetchingSheet(false);
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
  const chartData = useMemo(() => {
    return [
      {
        metric: "Subjective T. (25%)",
        "Current Center": Math.round(selectedCenterScores.subjectiveTestScore),
        "Kota Prime (Ref)": 100,
      },
      {
        metric: "IOQM (20%)",
        "Current Center": Math.round(selectedCenterScores.ioqmScore),
        "Kota Prime (Ref)": 97,
      },
      {
        metric: "Ramp Up (15%)",
        "Current Center": Math.round(selectedCenterScores.rampUpScore),
        "Kota Prime (Ref)": 100,
      },
      {
        metric: "Attendance (10%)",
        "Current Center": Math.round(selectedCenterScores.testAttendanceScore),
        "Kota Prime (Ref)": 100,
      },
      {
        metric: "Retention (30%)",
        "Current Center": Math.round(selectedCenterScores.studentRetentionScore),
        "Kota Prime (Ref)": 100,
      },
    ];
  }, [selectedCenterScores]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans" id="teacher-analytics-app">
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
        <section className={`lg:col-span-12 bg-slate-900 border rounded-xl p-5 shadow-2xl relative overflow-hidden transition-all duration-300 ${
          hasImportedData ? "border-emerald-500/40 bg-slate-900/90" : "border-slate-800"
        }`} id="google-sheets-widget">
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

              {/* Data Type Descriptions in simple Hinglish */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="hinglish-data-type-guide">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm">
                  <div className="text-[12px] font-bold text-yellow-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 block" />
                    1. Classes & Centers (बेसिक जानकारी)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>Student ID:</strong> Yeh unique roll number ya registration code ha.
                    <br /><strong>Grade:</strong> Sheet me strictly <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">9</code>, <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">10</code>, <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">11</code>, ya <code className="text-yellow-400 bg-slate-950 px-1 py-0.5 rounded font-mono">12</code> hi daalein.
                    <br /><strong>Center Name:</strong> Branch name likhein (eg: Lucknow Chowk Centre).
                  </p>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-emerald-500/10">
                  <div className="text-[12px] font-bold text-emerald-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 block" />
                    2. Attendance (हाजिरी का टाइप)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>Test 1 & Test 2 Attendance:</strong> Columns me strictly <code className="text-emerald-400 font-mono bg-slate-950 px-1 rounded">Present</code> ya <code className="text-rose-400 font-mono bg-slate-950 px-1 rounded">Absent</code> hi likhein.
                    <br /><em className="text-slate-400 text-[10px]">Note: Dono tests me Absent hone par metric denominator se exclude ho jata hai.</em>
                  </p>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-cyan-500/10">
                  <div className="text-[12px] font-bold text-cyan-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 block" />
                    3. Marks / Percentage (अंकों का टाइप)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>Physics, Chem, Maths marks:</strong> Scores me <code className="text-cyan-400 font-mono bg-slate-950 px-1 rounded">0 se 100</code> ke bich numbers daalein.
                    <br /><strong>Khali (Blank) kab chhodna hai?</strong> Agar kisi test me attendance <code className="text-rose-400">Absent</code> hai, tab us test ke scores ko blank (empty) chhod dein!
                  </p>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-sm border-purple-500/10">
                  <div className="text-[12px] font-bold text-purple-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-400 block" />
                    4. Other Marks & Retention (बाकी नियम)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    <strong>IOQM Score / Ramp Up:</strong> <code className="text-purple-400 font-mono bg-slate-950 px-1 rounded">0-100</code> percent marks.
                    <br /><strong>Ramp Up:</strong> 9th/10th ke liye optional marks, 11th/12th ke liye isko blank rakhein.
                    <br /><strong>Retained Status:</strong> Strictly <code className="text-purple-400 bg-slate-950 px-1 rounded font-mono">Yes</code> ya <code className="text-purple-400 bg-slate-950 px-1 rounded font-mono">No</code> bharein.
                  </p>
                </div>
              </div>

              {/* Step instructions */}
              <div className="text-[11px] bg-slate-950 border border-slate-800 rounded-lg p-4 text-slate-400 font-mono space-y-2">
                <div className="text-slate-200 font-bold flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="flex items-center gap-1.5">⚡ Google Sheets Main Data Import Karne Ka Tarika:</span>
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
                  <li>Niche diye gye **"Download Mock Data Table"** button par click karke actual files save karein.</li>
                  <li>Google Drive par ek naya Spreadsheet kholin aur pehle cell (**A1**) par click karein.</li>
                  <li>Sheet me **File &rarr; Import** par click karein aur download ki gayi CSV file ko upload karein.</li>
                  <li>Apne Google Sheet ke top-right **Share** button par click karein aur share status change karke **"Anyone with the link can view" (Koi bhi link se dekh sake)** select karein taaki dashboard use access kar sake!</li>
                  <li>Spreadsheet ka public link copy karein aur upar dashboard connection input me paste karke **"Fetch & Sync Student Ledger"** click karein!</li>
                </ol>
              </div>
            </div>
          )}
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
                          <span className="truncate">Pool: {center.activeStudents} active</span>
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
                  Reviewing academic leaks and simulated What-If targets.
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

            {/* Simulated Shift Notification Banner */}
            {coachedStudentIds.length > 0 && (
              <div className="mt-4 bg-sky-500/10 border border-sky-400/30 text-sky-300 p-2.5 rounded-lg flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
                  What-If Simulation Active: Coaching <strong>{coachedStudentIds.length}</strong> student papers.
                </span>
                <button
                  onClick={handleResetSimulation}
                  className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 px-3 py-1 rounded transition-colors text-xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset Simulation
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
                    ❌ Kahan Maar Kha Gaye? (The Main Rank Leaks)
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Our analysis indicates that <strong className="text-rose-300 underline underline-offset-4">{rankLeakInfo.name}</strong> is dragging down the overall center score the most, currently standing at <strong className="text-rose-400">{rankLeakInfo.score.toFixed(1)}/100 points</strong> (representing a weight proportion of {rankLeakInfo.weight}). 
                    {selectedCenterName === "Lucknow Chowk Centre" ? (
                      <span> Lucknow center teachers must focus heavily on coaching borderline students scoring in the 30-39% range to dramatically boost our Subjective Test indexes, which currently act as a core performance bottleneck.</span>
                    ) : (
                      <span> Targeted remediation is urgently required on this metric to match top-performing hubs like Kota Prime.</span>
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
                <h3 className="font-display font-semibold text-slate-100 text-sm mb-4">
                  📊 Metrics Breakdown compared to Kota Prime Center (Rank #1 Benchmark)
                </h3>
                
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
                      <Bar dataKey="Kota Prime (Ref)" fill="#475569" radius={[4, 4, 0, 0]} opacity={0.6} />
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
                  Generate a frank, customized evaluation report with a passionate PW voice in Hinglish analyzing exactly what gaps holding back the selected center.
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
                      {selectedCenterScores.elementA_percent >= 15 ? (
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

                  {/* Element B Remediation Footprint Card */}
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Element B: Remediation Footprint (Weight: 40%)
                    </span>
                    <h4 className="text-sm font-semibold text-slate-200 mt-1.5 flex justify-between items-center">
                      <span>Papers under 40% (Fail-rate):</span>
                      <strong className="text-rose-400 text-lg">
                        {selectedCenterScores.elementB_percent.toFixed(1)}%
                      </strong>
                    </h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      Awarded points: <strong className="text-slate-100">{selectedCenterScores.elementB_score.toFixed(1)}/100</strong>.
                      {selectedCenterScores.elementB_percent <= 5 ? (
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
                    🔮 Interactive What-If Simulator Presets
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
                        Boost exactly 6 Lucknow borderline students from 30-39% up to 45% pass. Reduces Element B rates, jumping national ranks.
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
                        Eradicates all papers scoring under 40% across center's active student database. Footprint drops &lt; 5%, unlocking 100/100 points!
                      </span>
                    </button>
                  </div>
                </div>

                {/* BOARDERLINE CHECKBOX CONTROLLERS SECTION */}
                <div className="space-y-3">
                  <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400">
                    📋 Teacher Priority Intervention Selection
                  </h3>
                  
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Check the boxes next to individual borderline students below to simulate coaching them. Watch the National Ranks and Subjective Score recalculate instantly!
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
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                {student.id}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px]">
                              <span className="text-slate-400">failing:</span>
                              <span className="text-rose-400 font-bold font-mono">
                                {failingPaper ? `${failingPaper.name} (${failingPaper.score}%)` : "35%"}
                              </span>
                              <span className="text-slate-600">|</span>
                              <span className="text-cyan-450 font-medium text-[10px] text-cyan-400">
                                Simulated Pass: 45% (Needs +{gap}%)
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PASSING MATRIX GAP DATA TABLE */}
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="font-semibold text-slate-300 text-sm mb-3">
                    📋 Teacher Priority Intervention Table (Next Time Action Plan)
                  </h3>

                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs bg-slate-950 font-sans">
                      <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Registration Number</th>
                          <th className="p-3">Current Fail Score</th>
                          <th className="p-3">Gap to Pass Matrix Line</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {currentCenterBorderlineStudents.map((s, idx) => {
                          const failingPaper = getStudentPerformance(s).papers.find(p => (p.score || 0) < 40);
                          const currentScoreStr = failingPaper ? `${failingPaper.name}: ${failingPaper.score}%` : "Maths: 35%";
                          const scoreGap = failingPaper ? (40 - (failingPaper.score || 0)) : 5;

                          return (
                            <tr key={s.id} className="hover:bg-slate-900/40">
                              <td className="p-3 font-semibold text-slate-200">{s.name}</td>
                              <td className="p-3 text-slate-400 font-mono">{s.id}</td>
                              <td className="p-3 text-rose-400 font-mono font-bold">{currentScoreStr}</td>
                              <td className="p-3 text-cyan-400 font-medium">
                                Needs just <strong className="font-mono text-cyan-300">+{scoreGap}%</strong> to clear pass matrix line
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
                  By checking the borderline boxes above (Tier 1 preset), Lucknow's subjective failure footprint shrinks from <strong className="text-rose-400">13.3%</strong> to <strong className="text-emerald-400">6.7%</strong>. This causes our Element B index to jump from <strong className="text-slate-400">16.7</strong> points to <strong className="text-yellow-400">83.3</strong> points, pushing Lucknow's Consolidated Score up!
                </p>
                
                <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800 text-slate-300">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Before Simulation Rank</span>
                    <strong className="text-sm font-mono text-rose-400 font-bold block">Rank #5 (61.2 / 100)</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Simulated Rank Potential</span>
                    <strong className="text-sm font-mono text-emerald-400 font-bold block">
                      Rank #{selectedCenterScores.rank} ({selectedCenterScores.consolidatedScore.toFixed(1)} / 100)
                    </strong>
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
                  The IOQM metric scales linearly based on average scores of active, non-absent students. Giving concept-checksheets and custom practices to the following at-risk students boosts their simulated marks to <strong className="text-cyan-400 font-mono">90%</strong> (maximizing centers overall indices).
                </p>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-cyan-400" />
                    Pupils Needing IOQM Remedial Support ({actionablePlan.ioqmItems.length} found):
                  </h3>

                  {actionablePlan.ioqmItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2">Congratulations! Your entire pool scored &gt;= 90% in IOQM.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="ioqm-checklist-elements">
                      {actionablePlan.ioqmItems.map(({ student, currentScore }) => {
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
                                <span className="text-[10px] font-mono text-slate-500 font-bold">{student.id}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                Current Score: <span className="text-rose-400 font-bold font-mono">{currentScore}%</span>
                                <br />Simulated Increase: <span className="text-emerald-400 font-bold font-mono">90% (+{90 - currentScore}%)</span>
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
                          <th className="p-3">Simulated Target Point Shift</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300 divide-slate-850">
                        {actionablePlan.ioqmItems.map(({ student, currentScore }) => {
                          const isCoached = coachedStudentIds.includes(student.id);
                          return (
                            <tr key={student.id} className="hover:bg-slate-900/40">
                              <td className="p-3 font-semibold text-slate-200">{student.name}</td>
                              <td className="p-3 text-slate-400 font-mono">{student.id}</td>
                              <td className="p-3 text-rose-500 font-mono font-semibold">{currentScore}%</td>
                              <td className="p-3 text-emerald-400 font-medium">
                                {isCoached ? "Simulated: +30% boost active" : "Target coaching: boost to 90%"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                  The Ramp Up topper index is calculated from the proportion of Class 9 & 10 pupils who secure <strong className="text-purple-400 font-mono">&gt;= 80% marks</strong>. Giving active remedial reviews clears the 80% ceiling (boosted to 85% in simulation).
                </p>

                <div className="space-y-3 pt-2 font-sans">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-purple-405 text-purple-400" />
                    Class 9 & 10 Priority Students needing Ramp Up Boost ({actionablePlan.rampUpItems.length} found):
                  </h3>

                  {actionablePlan.rampUpItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2">Congratulations! All active 9th & 10th graders have secured &gt;= 80% marks in Ramp Up.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="rampup-checklist-elements">
                      {actionablePlan.rampUpItems.map(({ student, currentScore }) => {
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
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1 py-0.5 rounded">Grade {student.grade} | {student.id}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                Current Score: <span className="text-rose-450 text-rose-400 font-bold font-mono">{currentScore}%</span>
                                <br />Simulated Topper: <span className="text-purple-400 font-bold font-mono">85% (Cleared target!)</span>
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
                        {actionablePlan.rampUpItems.map(({ student, currentScore }) => {
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
                  The attendance rate is computed by active student attendance. Giving absent parents phone coaching or offline support schedules restores simulated papers (converts "Absent" to "Present" with dynamic pass average).
                </p>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Absent Student Logs for counseling outreach ({actionablePlan.absentees.length} found):
                  </h3>

                  {actionablePlan.absentees.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2 animate-pulse">✓ Perfect 100% full attendance recorded across both evaluative periods in this center!</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="attendance-checklist-elements">
                      {actionablePlan.absentees.map(({ student, type }) => {
                        const isCoached = coachedStudentIds.includes(student.id);
                        return (
                          <button
                            key={`${student.id}-${type}`}
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
                                <span className="text-[10px] font-mono text-slate-500 font-bold">{student.id}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 font-sans">
                                Attendance Code: <span className="text-rose-400 font-bold">{type}</span>
                                <br />Remediation Action: <span className="text-emerald-400 font-bold">Reschedule Makeup Test</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
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
                        {actionablePlan.absentees.map(({ student, type }) => {
                          const isCoached = coachedStudentIds.includes(student.id);
                          return (
                            <tr key={`${student.id}-${type}`} className="hover:bg-slate-900/40">
                              <td className="p-3 font-semibold text-slate-200">{student.name}</td>
                              <td className="p-3 text-slate-400 font-mono">{student.id}</td>
                              <td className="p-3 text-rose-400 font-mono font-bold">{type}</td>
                              <td className="p-3 text-emerald-400 font-medium">
                                {isCoached ? "Simulated makeup active: Restored to present" : "Schedule parent phone outreach"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                  Retention represents our core user-connection metric, constituting the largest category weight of <strong className="text-orange-400 font-mono">30%</strong> of the consolidated leaderboard. Solving individual fee queries or academic queries flips warning status directly to active (retains simulated value to present).
                </p>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                    At-Risk Dropped-out Pupils requiring counseling feedback ({actionablePlan.retentionItems.length} found):
                  </h3>

                  {actionablePlan.retentionItems.length === 0 ? (
                    <p className="text-xs text-slate-500 italic pb-2">🎉 Congratulations! 100% full retention achieved across all cohorts.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="retention-checklist-elements">
                      {actionablePlan.retentionItems.map(({ student, action }) => {
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
                                <span className="text-[10px] font-mono text-slate-400 font-semibold">{student.id}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 leading-normal font-sans">
                                Current Ledger Status: <span className="text-rose-400 font-bold font-mono">Dropped Out</span>
                                <br />Support Action: <span className="text-emerald-400 font-bold">{action}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* RETENTION ROSTER SHEET */}
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="font-semibold text-slate-300 text-sm mb-3">
                    📊 Retention Outflow Recovery Tracker
                  </h3>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs bg-slate-950 font-sans">
                      <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Reference ID</th>
                          <th className="p-3">Outflow Status</th>
                          <th className="p-3">Simulated Retention Rate Shift</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300">
                        {actionablePlan.retentionItems.map(({ student, action }) => {
                          const isCoached = coachedStudentIds.includes(student.id);
                          return (
                            <tr key={student.id} className="hover:bg-slate-900/40">
                              <td className="p-3 font-semibold text-slate-200">{student.name}</td>
                              <td className="p-3 text-slate-400 font-mono">{student.id}</td>
                              <td className="p-3 text-rose-400 font-mono font-bold">Unretained</td>
                              <td className="p-3 text-emerald-400 font-medium font-sans">
                                {isCoached ? "Simulated: Retained" : "Outreach counseling needed"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold font-display text-slate-50 tracking-tight" id="pool-view-title">
                    👥 Active Student Evaluation Database
                  </h2>
                  <span className="text-xs text-cyan-400 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                    Rules A & B Active
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  This auditing sheet details all row-level student registrations and evaluations for {selectedCenterScores.centerName}. Verify how absences are computed to guarantee scoring transparency.
                </p>

                {/* MAIN STUDENTS DIRECTORY */}
                <div className="border border-slate-800 rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs bg-slate-950 font-sans">
                    <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                      <tr>
                        <th className="p-3">Student</th>
                        <th className="p-3">Grade</th>
                        <th className="p-3">T1 Attendance</th>
                        <th className="p-3">T2 Attendance</th>
                        <th className="p-4">Evaluated Avg</th>
                        <th className="p-4">Retention Status</th>
                        <th className="p-4">Audit Status Badge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {students.filter(s => s.center === selectedCenterName).map((student) => {
                        const isCoached = coachedStudentIds.includes(student.id);
                        const isT1Present = student.t1_attendance === "Present";
                        const isT2Present = student.t2_attendance === "Present";
                        
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
                            if (updatedT1.physics !== undefined && updatedT1.physics < 40) updatedT1.physics = 45;
                            if (updatedT1.chemistry !== undefined && updatedT1.chemistry < 40) updatedT1.chemistry = 45;
                            if (updatedT1.maths !== undefined && updatedT1.maths < 40) updatedT1.maths = 45;
                            if (updatedT2.physics !== undefined && updatedT2.physics < 40) updatedT2.physics = 45;
                            if (updatedT2.chemistry !== undefined && updatedT2.chemistry < 40) updatedT2.chemistry = 45;
                            if (updatedT2.maths !== undefined && updatedT2.maths < 40) updatedT2.maths = 45;
                            
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
                  Yeh dashboard Physics Wallah (PW) Regional Center Leads dynamic rankings model ke rulebook ko transparently depict karta hai. 
                  Below, check how scores for <strong className="text-yellow-400">{selectedCenterScores.centerName}</strong> are mathematically synthesized on-the-fly and deploy bulk target intervention campaigns.
                </p>
              </div>

              {/* RESTRICTED ADMIN EXPORT AREA */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4" id="admin-export-wrapper">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded">
                        🔒 ADMIN ONLY
                      </span>
                      <h3 className="text-md font-bold font-display text-slate-50 flex items-center gap-2">
                        🔑 Admin Administrative Export Control
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">Securely download current/simulated student records as CSV.</p>
                  </div>
                  
                  {/* Role switch simulation widget */}
                  <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-850">
                    <span className="text-[10px] font-mono font-bold text-slate-400 px-1.5 label-role">Active Role:</span>
                    <button
                      onClick={() => setIsAdmin(true)}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono font-extrabold transition-all duration-150 cursor-pointer ${
                        isAdmin 
                          ? "bg-rose-500/25 text-rose-400 border border-rose-500/30" 
                          : "text-slate-500 hover:text-slate-350"
                      }`}
                      id="admin-role-btn-admin"
                    >
                      Admin
                    </button>
                    <button
                      onClick={() => setIsAdmin(false)}
                      className={`px-2.5 py-1 rounded text-[10px] font-mono font-extrabold transition-all duration-150 cursor-pointer ${
                        !isAdmin 
                          ? "bg-slate-800 text-slate-300 border border-slate-700" 
                          : "text-slate-500 hover:text-slate-350"
                      }`}
                      id="admin-role-btn-viewer"
                    >
                      Viewer
                    </button>
                  </div>
                </div>

                {isAdmin ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-950/45 border border-slate-850 p-4 rounded-lg">
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-205 flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        Download Student Ledger
                      </span>
                      <p className="text-[10px] text-slate-450 leading-relaxed font-sans max-w-xl">
                        Aapka active system access authorized hai. Yeh tool instant high-fidelity student records database transform kar ke standard tabbed CSV compile aur trigger karega.
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadActiveCSV}
                      className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer shadow-md shadow-emerald-500/5 whitespace-nowrap"
                      id="export-active-csv-btn"
                    >
                      <Download className="w-4 h-4" />
                      Export Data to CSV
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/80 border border-slate-850/80 rounded-lg flex items-center gap-3 text-xs text-slate-400 border-dashed">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    <span>Access Denied. Yeh data ledger functions strictly restricted hain. Only authorized **PW Admins** can access or trigger CSV compilation.</span>
                  </div>
                )}
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
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Element B (40% Weight): Remediation Footprint</span>
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

              {/* SECTION B: CORE NATIONAL COMPREHENSIVE RANK CHECKS COMPARATOR TABLE */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-lg font-bold font-display text-slate-50 flex items-center gap-2">
                      <Award className="w-5 h-5 text-yellow-500 shrink-0" />
                      🥇 Comprehensive National Center Leaderboard Check (All Ranks Side-by-Side)
                    </h3>
                    <p className="text-xs text-slate-400">Review other center standing criteria scores in a unified admin spreadsheet index grid.</p>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs bg-slate-950 font-sans">
                    <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Rank</th>
                        <th className="p-3 text-left">Center Hub</th>
                        <th className="p-3 text-center text-yellow-405 text-yellow-405 text-yellow-400 font-bold bg-yellow-500/5">Overall Score</th>
                        <th className="p-3 text-center text-cyan-400">Subjective (25%)</th>
                        <th className="p-3 text-center text-yellow-500 font-medium">IOQM (20%)</th>
                        <th className="p-3 text-center text-purple-400">Ramp Up (15%)</th>
                        <th className="p-2.5 text-center text-emerald-400">Attn (10%)</th>
                        <th className="p-2.5 text-center text-orange-400">Retn (30%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {rankedCenters.map((item) => {
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
                              <span className={`px-2 py-0.5 rounded ${
                                item.rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                                item.rank === 2 ? "bg-slate-350/25 text-slate-300" :
                                item.rank === 3 ? "bg-amber-700/25 text-amber-500" : "text-slate-400"
                              }`}>
                                #{item.rank}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className={isSelectedCenter ? "text-yellow-450 text-yellow-400 font-bold" : "text-slate-300"}>
                                  {item.centerName}
                                </span>
                                {isSelectedCenter && <span className="bg-yellow-400 text-slate-950 font-mono font-bold text-[8px] px-1.5 py-0.2 rounded shrink-0 uppercase">Active</span>}
                              </div>
                            </td>
                            <td className="p-3 font-mono font-bold text-center bg-yellow-500/10 text-yellow-400 text-xs shadow-inner">
                              {item.consolidatedScore.toFixed(1)}
                            </td>
                            <td className="p-3 font-mono text-center text-slate-300">
                              {item.subjectiveTestScore.toFixed(1)}
                            </td>
                            <td className="p-3 font-mono text-center text-slate-300">
                              {item.ioqmScore.toFixed(1)}
                            </td>
                            <td className="p-3 font-mono text-center text-slate-300">
                              {item.rampUpScore.toFixed(1)}
                            </td>
                            <td className="p-2.5 font-mono text-center text-slate-300">
                              {item.testAttendanceScore.toFixed(1)}
                            </td>
                            <td className="p-2.5 font-mono text-center text-slate-300">
                              {item.studentRetentionScore.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION C: BULK DIRECT INTERVENTIONS - PERFORMANCE IMPROVEMENT SCOPE */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
                  <div>
                    <h3 className="text-lg font-bold font-display text-slate-50 flex items-center gap-2">
                      <Sparkles className="text-cyan-400 w-5 h-5 shrink-0" />
                      🛠️ Teacher-Lead Improvement Scope Bulk Intervention Triggers
                    </h3>
                    <p className="text-xs text-slate-400">Apply simulated bulk remedial actions directly to active pupil groups in {selectedCenterScores.centerName} and check the instant recalculation results.</p>
                  </div>
                  {coachedStudentIds.length > 0 && (
                    <button
                      onClick={handleResetSimulation}
                      className="bg-rose-500/10 hover:bg-rose-500/25 text-rose-455 text-rose-400 border border-rose-500/25 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 active:scale-98 transition shadow cursor-pointer whitespace-nowrap"
                    >
                      🗑️ Clean Simulation
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Lever 1: Failures Doubt Remediation */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-855 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono tracking-wider font-extrabold text-cyan-405 text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded uppercase">LEVER 1: SUBJECTIVE FAIL REMEDIATION</span>
                        <span className="text-[10px] text-slate-500 font-mono">{actionablePlan.subjectiveFailings.length} papers failing</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Weekly remedial class runs targeted to fail-risk students. Boosts all subject entrance slips under 40% to 45% (eliminates failures and maxes out your Subjective Element B footprint!).
                      </p>
                    </div>
                    <button
                      onClick={handleBulkToggleFailing}
                      disabled={actionablePlan.subjectiveFailings.length === 0}
                      className="w-full text-center bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-205 py-1.5 rounded font-mono font-bold text-[10px] transition border border-cyan-800/40 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      ⚡ Run Doubt-Class Sheet Simulation
                    </button>
                  </div>

                  {/* Lever 2: Propel Near Toppers */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-855 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono tracking-wider font-extrabold text-yellow-450 text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded uppercase">LEVER 2: PROPEL NEAR-TOPPERS BRACKETS</span>
                        <span className="text-[10px] text-slate-500 font-mono">{actionablePlan.subjectiveTopperPotentials.length} candidates found</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Deploy elite question sets for borderline students (80-89% averages). Propels them to the 90%+ scholar grade, heavily scaling up subjective Element A points!
                      </p>
                    </div>
                    <button
                      onClick={handleBulkToggleNearToppers}
                      disabled={actionablePlan.subjectiveTopperPotentials.length === 0}
                      className="w-full text-center bg-yellow-950/30 hover:bg-yellow-905/40 text-yellow-405 text-yellow-400 py-1.5 rounded font-mono font-bold text-[10px] transition border border-yellow-800/40 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      ⭐ Boost Borderline Scholar Ratio
                    </button>
                  </div>

                  {/* Lever 3: IOQM Prep Campaigns */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-855 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono tracking-wider font-extrabold text-cyan-405 text-cyan-450 text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded uppercase">LEVER 3: OLYMPIAD CAMPAIGN FOCUS</span>
                        <span className="text-[10px] text-slate-500 font-mono">{actionablePlan.ioqmItems.length} at-risk</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Deliver custom math-puzzle checksheets to non-scholar pupils. Simulates raising their IOQM achievements to 90% in average bounds.
                      </p>
                    </div>
                    <button
                      onClick={handleBulkToggleIoqm}
                      disabled={actionablePlan.ioqmItems.length === 0}
                      className="w-full text-center bg-slate-900 hover:bg-slate-855 text-cyan-400 py-1.5 rounded font-mono font-bold text-[10px] transition border border-slate-800 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      🏆 Apply IOQM Olympiad Prep Simulator
                    </button>
                  </div>

                  {/* Lever 4: Convert Absenteeism */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-855 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono tracking-wider font-extrabold text-emerald-450 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded uppercase">LEVER 4: ATTENDANCE ENTRANCE RECOVERY</span>
                        <span className="text-[10px] text-slate-500 font-mono">{actionablePlan.absentees.length} absent entries</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Perform routine teacher calls to single-evaluation absent student homes. Simulates bringing their test appearance to 100% attendance rate.
                      </p>
                    </div>
                    <button
                      onClick={handleBulkToggleAbsentees}
                      disabled={actionablePlan.absentees.length === 0}
                      className="w-full text-center bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 py-1.5 rounded font-mono font-bold text-[10px] transition border border-emerald-800/40 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      📅 Convert Absentee Slips to Present
                    </button>
                  </div>

                  {/* Lever 5: 100% Retention */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-855 flex flex-col justify-between space-y-3 md:col-span-2">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono tracking-wider font-extrabold text-orange-455 text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded uppercase">LEVER 5: 100% REGIONAL STUDENT RETENTION</span>
                        <span className="text-[10px] text-slate-500 font-mono">{actionablePlan.retentionItems.length} dropout/defaulter risks</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Counseling calls to resolve parent disputes, fee queries, and course drops. Resolves and marks all inactive status pupils in center's pool as fully retained.
                      </p>
                    </div>
                    <button
                      onClick={handleBulkToggleRetention}
                      disabled={actionablePlan.retentionItems.length === 0}
                      className="w-full text-center bg-orange-950/30 hover:bg-orange-900/40 text-orange-450 text-orange-400 py-1.5 rounded font-mono font-bold text-[10px] transition border border-orange-850/50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      🔄 Run Comprehensive 100% Retention Recovery
                    </button>
                  </div>

                </div>

                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs font-sans text-slate-400 gap-3">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Active simulated interventions: <strong className="font-mono text-yellow-455 text-yellow-400">{coachedStudentIds.length} pupils coached</strong>. Recalculations are processed on-the-fly.</span>
                  </div>
                  {coachedStudentIds.length > 0 && (
                    <button
                      onClick={handleResetSimulation}
                      className="bg-slate-900 text-slate-200 border border-slate-850 hover:text-slate-50 hover:bg-slate-800 font-bold px-3 py-1 rounded transition text-[10px] cursor-pointer"
                    >
                      Restore Raw Stats
                    </button>
                  )}
                </div>

              </div>

            </div>
          )}

        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-500 font-mono mt-12">
        <p>© 2026 Physics Wallah (PW) Regional Center Leads Evaluation Portal. All diagnostic data audited and tracked recursively.</p>
      </footer>
    </div>
  );
}
