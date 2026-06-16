import { Student } from "../types";
import { getActiveStudents } from "./shared";

export function calculateIoqmScore(centerStudents: Student[]) {
  const activeStudents = getActiveStudents(centerStudents);

  if (activeStudents.length === 0) {
    return {
      ioqm_percent: 0,
      ioqmScore: 0
    };
  }

  // Average IOQM score for active students
  const totalIoqm = activeStudents.reduce((sum, s) => sum + s.ioqm_score, 0);
  const ioqm_percent = activeStudents.length > 0 ? totalIoqm / activeStudents.length : 0;
  // <40% = 0; >90% = 100; 40-90% linear scale
  let ioqmScore = 0;
  if (ioqm_percent > 90) {
    ioqmScore = 100;
  } else if (ioqm_percent < 40) {
    ioqmScore = 0;
  } else {
    ioqmScore = ((ioqm_percent - 40) / 50) * 100;
  }

  return {
    ioqm_percent,
    ioqmScore
  };
}
