import { Student } from "../types";
import { getStudentPerformance, getActiveStudents } from "./shared";

export function calculateSubjectiveTestScore(centerStudents: Student[]) {
  const activeStudents = getActiveStudents(centerStudents);

  if (activeStudents.length === 0) {
    return {
      elementA_percent: 0,
      elementA_score: 0,
      elementB_percent: 0,
      elementB_score: 0,
      subjectiveTestScore: 0
    };
  }

  // Element A: % of active students with test average >= 90%.
  let elementA_count = 0;
  let totalPapers = 0;
  let failingPapers = 0;

  activeStudents.forEach(s => {
    const perf = getStudentPerformance(s);
    if (perf.averagePercent !== null && perf.averagePercent >= 90) {
      elementA_count++;
    }
    totalPapers += perf.subjectPapersCount;
    failingPapers += perf.failingPapersCount;
  });

  const elementA_percent = (elementA_count / activeStudents.length) * 100;
  // If >= 15% of students hit this, award 100 marks. If 0-15%, scale linearly.
  const elementA_score = elementA_percent >= 15 ? 100 : (elementA_percent / 15) * 100;

  // Element B: % of individual subject percentage entries < 40%.
  const elementB_percent = totalPapers > 0 ? (failingPapers / totalPapers) * 100 : 0;
  // If <= 5%, award 100 marks. If >= 15%, award 0 marks. If 5%-15%, drop linearly.
  let elementB_score = 0;
  if (elementB_percent <= 5) {
    elementB_score = 100;
  } else if (elementB_percent >= 15) {
    elementB_score = 0;
  } else {
    elementB_score = 100 - (((elementB_percent - 5) / 10) * 100);
  }

  const subjectiveTestScore = (elementA_score * 0.6) + (elementB_score * 0.4);

  return {
    elementA_percent,
    elementA_score,
    elementB_percent,
    elementB_score,
    subjectiveTestScore
  };
}
