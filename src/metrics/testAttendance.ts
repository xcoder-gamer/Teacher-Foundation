import { Student } from "../types";
import { getActiveStudents } from "./shared";

/**
 * Checks if a student is present or took any subject test (max 4 subjects count as 1 presence)
 */
export function isStudentPresentForTest(s: Student, testNum: 1 | 2): boolean {
  if (testNum === 1) {
    if (s.t1_attendance === "Present") return true;
    
    // Check if student took any subject test (max 4 subjects per test)
    const hasT1Scores = s.t1_scores && (
      (s.t1_scores.physics !== undefined && s.t1_scores.physics > 0) ||
      (s.t1_scores.chemistry !== undefined && s.t1_scores.chemistry > 0) ||
      (s.t1_scores.maths !== undefined && s.t1_scores.maths > 0)
    );
    
    const hasPctScores = (s.maths_pct !== undefined && s.maths_pct > 0) ||
                         (s.science_pct !== undefined && s.science_pct > 0) ||
                         (s.english_pct !== undefined && s.english_pct > 0) ||
                         (s.sst_pct !== undefined && s.sst_pct > 0) ||
                         (s.urdu_pct !== undefined && s.urdu_pct > 0);
                         
    return !!(hasT1Scores || hasPctScores);
  } else {
    if (s.t2_attendance === "Present") return true;
    
    // Check if student took any subject test in T2
    const hasT2Scores = s.t2_scores && (
      (s.t2_scores.physics !== undefined && s.t2_scores.physics > 0) ||
      (s.t2_scores.chemistry !== undefined && s.t2_scores.chemistry > 0) ||
      (s.t2_scores.maths !== undefined && s.t2_scores.maths > 0)
    );
    
    return !!hasT2Scores;
  }
}

export function calculateTestAttendanceScore(centerStudents: Student[]) {
  const activeStudents = getActiveStudents(centerStudents);

  if (activeStudents.length === 0) {
    return {
      attendance_percent: 0,
      testAttendanceScore: 0
    };
  }

  // Average attendance of active pool (dynamic based on 1 vs 2 tests)
  let totalAttendanceOpportunities = 0;
  let attendedCount = 0;
  activeStudents.forEach(s => {
    const limit = s.test_count === 1 ? 1 : 2;
    totalAttendanceOpportunities += limit;
    if (isStudentPresentForTest(s, 1)) attendedCount++;
    if (limit === 2 && isStudentPresentForTest(s, 2)) attendedCount++;
  });
  const attendance_percent = totalAttendanceOpportunities > 0 
    ? (attendedCount / totalAttendanceOpportunities) * 100 
    : 0;
  
  // >75% = 100 marks; <50% = 0 marks; 50-75% linear scale
  let testAttendanceScore = 0;
  if (attendance_percent > 75) {
    testAttendanceScore = 100;
  } else if (attendance_percent < 50) {
    testAttendanceScore = 0;
  } else {
    testAttendanceScore = ((attendance_percent - 50) / 25) * 100;
  }

  return {
    attendance_percent,
    testAttendanceScore
  };
}
