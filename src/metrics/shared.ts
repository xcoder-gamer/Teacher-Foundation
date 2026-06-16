import { Student } from "../types";

export function getStudentPerformance(student: Student): {
  isActive: boolean;
  averagePercent: number | null;
  subjectPapersCount: number;
  failingPapersCount: number; // papers < 40%
  papers: { name: string; score: number | undefined; test: 'T1'|'T2' }[];
} {
  const isSingleTest = student.test_count === 1;
  const isT1Present = student.t1_attendance === "Present";
  const isT2Present = !isSingleTest && student.t2_attendance === "Present";
  
  // Rule A: Absence Exclusion (If single test, missing T1 means absent)
  if (!isT1Present && !isT2Present) {
    return {
      isActive: false,
      averagePercent: null,
      subjectPapersCount: 0,
      failingPapersCount: 0,
      papers: []
    };
  }

  const papers: { name: string; score: number | undefined; test: 'T1'|'T2' }[] = [];
  
  // Collect actual subject papers based on attendance parameters
  if (isT1Present) {
    if (student.t1_scores.physics !== undefined) papers.push({ name: "Physics", score: student.t1_scores.physics, test: 'T1' });
    if (student.t1_scores.chemistry !== undefined) papers.push({ name: "Chemistry", score: student.t1_scores.chemistry, test: 'T1' });
    if (student.t1_scores.maths !== undefined) papers.push({ name: "Maths", score: student.t1_scores.maths, test: 'T1' });
  }
  
  if (isT2Present) {
    if (student.t2_scores.physics !== undefined) papers.push({ name: "Physics", score: student.t2_scores.physics, test: 'T2' });
    if (student.t2_scores.chemistry !== undefined) papers.push({ name: "Chemistry", score: student.t2_scores.chemistry, test: 'T2' });
    if (student.t2_scores.maths !== undefined) papers.push({ name: "Maths", score: student.t2_scores.maths, test: 'T2' });
  }

  if (papers.length === 0) {
    return {
      isActive: true,
      averagePercent: 0,
      subjectPapersCount: 0,
      failingPapersCount: 0,
      papers: []
    };
  }

  const sumScores = papers.reduce((sum, p) => sum + (p.score || 0), 0);
  const averagePercent = sumScores / papers.length;
  
  const failingPapersCount = papers.filter(p => (p.score || 0) < 40).length;

  return {
    isActive: true,
    averagePercent,
    subjectPapersCount: papers.length,
    failingPapersCount,
    papers
  };
}

export function getActiveStudents(centerStudents: Student[]): Student[] {
  return centerStudents.filter(s => {
    const isSingleTest = s.test_count === 1;
    return s.t1_attendance === "Present" || (!isSingleTest && s.t2_attendance === "Present");
  });
}
