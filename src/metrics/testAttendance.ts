import { Student } from "../types";

/**
 * Computes the continuous attendance weight (0 to 1) for a student's test window.
 * Supports "Present", "Absent", percentages ("100%", "50%"), ratios ("2/4", "4/4"), and empty values.
 */
export function getStudentAttendanceWeight(s: Student, testNum: 1 | 2): number {
  const att = testNum === 1 ? s.t1_attendance : s.t2_attendance;
  if (att === undefined || att === null) {
    // Check fallback based on subject scores
    const hasScores = testNum === 1
      ? !!(s.t1_scores && (
          (s.t1_scores.physics !== undefined && s.t1_scores.physics > 0) ||
          (s.t1_scores.chemistry !== undefined && s.t1_scores.chemistry > 0) ||
          (s.t1_scores.maths !== undefined && s.t1_scores.maths > 0)
        ))
      : !!(s.t2_scores && (
          (s.t2_scores.physics !== undefined && s.t2_scores.physics > 0) ||
          (s.t2_scores.chemistry !== undefined && s.t2_scores.chemistry > 0) ||
          (s.t2_scores.maths !== undefined && s.t2_scores.maths > 0)
        ));
    return hasScores ? 1 : 0;
  }

  const str = String(att).trim().toLowerCase();
  
  if (str === "present" || str === "p" || str === "yes" || str === "1") return 1;
  if (str === "absent" || str === "a" || str === "no" || str === "0") return 0;
  
  // Percentage with % sign, e.g., "50%", "100%"
  if (str.includes("%")) {
    const num = parseFloat(str.replace(/[^0-9.-]/g, ""));
    if (!isNaN(num)) {
      return Math.max(0, Math.min(100, num)) / 100;
    }
  }

  // Ratio-based attendance, e.g., "2/4" or "4/4"
  if (str.includes("/")) {
    const parts = str.split("/");
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (!isNaN(num) && !isNaN(den) && den > 0) {
      return Math.max(0, Math.min(1, num / den));
    }
  }

  // Simple numeric value (e.g. 0.5 or 50)
  const valNum = parseFloat(str);
  if (!isNaN(valNum)) {
    if (valNum > 1) {
      return Math.max(0, Math.min(100, valNum)) / 100;
    }
    return Math.max(0, Math.min(1, valNum));
  }

  return 0;
}

/**
 * Checks if a student has any positive presence / attended at least some of the test.
 */
export function isStudentPresentForTest(s: Student, testNum: 1 | 2): boolean {
  return getStudentAttendanceWeight(s, testNum) > 0;
}

export function calculateTestAttendanceScore(centerStudents: Student[]) {
  // Use all center students (including double absentees) to reflect the real attendance rate
  const studentsWithAttendance = centerStudents.filter(s => s.t1_attendance !== undefined || s.t2_attendance !== undefined);

  if (studentsWithAttendance.length === 0) {
    return {
      attendance_percent: 0,
      testAttendanceScore: 0
    };
  }

  // Check if there is ANY student in the cohort that has test_count of 2 or explicit Test 2 data
  const hasMultipleTests = centerStudents.some(s => s.test_count === 2 || (s.t2_attendance !== undefined && s.t2_attendance !== "Absent") || (s.t2_scores !== undefined && Object.keys(s.t2_scores).length > 0));

  // Average attendance of active pool (dynamic based on 1 vs 2 tests using continuous weight sum)
  let totalAttendanceOpportunities = 0;
  let attendedWeightSum = 0;
  studentsWithAttendance.forEach(s => {
    const limit = (s.test_count === 1 || !hasMultipleTests) ? 1 : 2;
    totalAttendanceOpportunities += limit;
    
    attendedWeightSum += getStudentAttendanceWeight(s, 1);
    if (limit === 2) {
      attendedWeightSum += getStudentAttendanceWeight(s, 2);
    }
  });
  
  const attendance_percent = totalAttendanceOpportunities > 0 
    ? (attendedWeightSum / totalAttendanceOpportunities) * 100 
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
