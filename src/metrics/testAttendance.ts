import { Student } from "../types";
import { getActiveStudents } from "./shared";

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
    if (s.t1_attendance === "Present") attendedCount++;
    if (limit === 2 && s.t2_attendance === "Present") attendedCount++;
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
