import { Student } from "../types";
import { getActiveStudents } from "./shared";

export function calculateStudentRetentionScore(centerStudents: Student[]) {
  const activeStudents = getActiveStudents(centerStudents);

  if (activeStudents.length === 0) {
    return {
      retention_percent: 100,
      studentRetentionScore: 100
    };
  }

  // % of retained pupils across active pool
  const retainedCount = activeStudents.filter(s => s.retained).length;
  const retention_percent = activeStudents.length > 0 
    ? (retainedCount / activeStudents.length) * 100 
    : 100;

  // <75% = 0; >=95% = 100; 75-95% linear scale
  let studentRetentionScore = 0;
  if (retention_percent >= 95) {
    studentRetentionScore = 100;
  } else if (retention_percent < 75) {
    studentRetentionScore = 0;
  } else {
    studentRetentionScore = ((retention_percent - 75) / 20) * 100;
  }

  return {
    retention_percent,
    studentRetentionScore
  };
}
