export interface SubjectScores {
  physics?: number;
  chemistry?: number;
  maths?: number;
}

export interface Student {
  id: string;
  name: string;
  grade: "9" | "10" | "11" | "12";
  center: string;
  
  // Custom retention and results original fields
  region?: string;
  batch?: string;
  defaulter_status?: string;
  admission_cancellation?: string;
  inactive?: string;
  test_date?: string;
  test_name?: string;
  attendance?: string;
  sst_pct?: number;
  urdu_pct?: number;
  maths_pct?: number;
  english_pct?: number;
  science_pct?: number;

  // Attendance for the latest 2 test windows
  t1_attendance: "Present" | "Absent";
  t2_attendance: "Present" | "Absent";
  
  // Test 1 subject percentage scores (0 to 100)
  t1_scores: SubjectScores;
  
  // Test 2 subject percentage scores (0 to 100)
  t2_scores: SubjectScores;
  
  // IOQM Achievement percentage score (0 to 100)
  ioqm_score: number;
  
  // Ramp Up Test percentage score for 9th/10th graders (0 to 100, undefined for 11th/12th)
  ramp_up_score?: number;
  
  // Retention status
  retained: boolean;

  // Active tests count (1 or 2)
  test_count?: number;
}

export interface CenterScores {
  centerName: string;
  rank: number;
  activeStudents: number;
  
  // Component scores (out of 100)
  subjectiveTestScore: number;
  elementA_percent: number;
  elementA_score: number;
  elementB_percent: number;
  elementB_score: number;
  
  testAttendanceScore: number;
  attendance_percent: number;
  
  ioqmScore: number;
  ioqm_percent: number;
  
  rampUpScore: number;
  rampUp_percent: number;
  
  studentRetentionScore: number;
  retention_percent: number;
  
  // Final composite (out of 100)
  consolidatedScore: number;
}
