import { Student } from "../types";
import { getActiveStudents } from "./shared";

export function calculateRampUpScore(centerStudents: Student[]) {
  const activeStudents = getActiveStudents(centerStudents);

  if (activeStudents.length === 0) {
    return {
      rampUp_percent: 0,
      rampUpScore: 0
    };
  }

  // % of 9th/10th graders in active student pool with ramp_up_score > 80%
  const activeRampStudents = activeStudents.filter(s => s.grade === "9" || s.grade === "10");
  const rampToppers = activeRampStudents.filter(s => s.ramp_up_score !== undefined && s.ramp_up_score > 80);
  const rampUp_percent = activeRampStudents.length > 0 
    ? (rampToppers.length / activeRampStudents.length) * 100 
    : 0;

  // <1% = 0; >5% = 100; 1-5% linear scale
  let rampUpScore = 0;
  if (rampUp_percent > 5) {
    rampUpScore = 100;
  } else if (rampUp_percent < 1) {
    rampUpScore = 0;
  } else {
    rampUpScore = ((rampUp_percent - 1) / 4) * 100;
  }

  return {
    rampUp_percent,
    rampUpScore
  };
}
