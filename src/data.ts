import type { SubjectScores, Student, CenterScores } from "./types";

export type { SubjectScores, Student, CenterScores };

// Pre-loaded realistic student test dataset
export const PRELOADED_STUDENTS: Student[] = [
  // ==========================================
  // LUCKNOW CHOWK CENTRE (RANK 5 - LOW PERFORMANCE & BORDERLINE TARGETS)
  // Total students: 15. Active pool after exclusions.
  // ==========================================
  {
    id: "PW-LKO-001",
    name: "Aarav Sharma",
    grade: "11",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 92, chemistry: 95, maths: 94 },
    t2_scores: { physics: 90, chemistry: 92, maths: 96 },
    ioqm_score: 82,
    retained: true
  },
  {
    id: "PW-LKO-002",
    name: "Rahul Gupta", // Borderline Target 1 (Chemistry T1)
    grade: "10",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 55, chemistry: 34, maths: 45 },
    t2_scores: { physics: 58, chemistry: 42, maths: 48 },
    ioqm_score: 35,
    ramp_up_score: 55,
    retained: true
  },
  {
    id: "PW-LKO-003",
    name: "Sunita Yadav",
    grade: "12",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 71, chemistry: 68, maths: 72 },
    t2_scores: { physics: 69, chemistry: 74, maths: 70 },
    ioqm_score: 52,
    retained: true
  },
  {
    id: "PW-LKO-004",
    name: "Vikram Malhotra",
    grade: "9",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Absent",
    t2_attendance: "Absent", // Double Absent -> Excluded entirely!
    t1_scores: {},
    t2_scores: {},
    ioqm_score: 20,
    ramp_up_score: 30,
    retained: false
  },
  {
    id: "PW-LKO-005",
    name: "Siddharth Verma", // Borderline Target 2 (Maths T2)
    grade: "9",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 48, chemistry: 50, maths: 42 },
    t2_scores: { physics: 45, chemistry: 52, maths: 31 }, // Borderline Maths T2
    ioqm_score: 42,
    ramp_up_score: 45,
    retained: true
  },
  {
    id: "PW-LKO-006",
    name: "Rohan Kapoor",
    grade: "11",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Absent", // Single attended test -> evaluated parsed from T1 only (Rule B)
    t1_scores: { physics: 82, chemistry: 78, maths: 81 },
    t2_scores: {},
    ioqm_score: 65,
    retained: true
  },
  {
    id: "PW-LKO-007",
    name: "Ananya Mishra", // Borderline Target 3 (Physics T1)
    grade: "10",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 38, chemistry: 48, maths: 41 }, // Borderline Physics T1
    t2_scores: { physics: 44, chemistry: 45, maths: 46 },
    ioqm_score: 38,
    ramp_up_score: 82, // Ramp Up topper!
    retained: true
  },
  {
    id: "PW-LKO-008",
    name: "Rishi Raj",
    grade: "12",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 62, chemistry: 60, maths: 58 },
    t2_scores: { physics: 65, chemistry: 61, maths: 63 },
    ioqm_score: 41,
    retained: true
  },
  {
    id: "PW-LKO-009",
    name: "Priya Sharma", // Borderline Target 4 (Chemistry T2)
    grade: "9",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 52, chemistry: 46, maths: 48 },
    t2_scores: { physics: 50, chemistry: 35, maths: 44 }, // Borderline Chemistry T2
    ioqm_score: 30,
    ramp_up_score: 50,
    retained: true
  },
  {
    id: "PW-LKO-010",
    name: "Devendra Yadav",
    grade: "11",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Absent",
    t2_attendance: "Present", // Single attended test -> T2 only (Rule B)
    t1_scores: {},
    t2_scores: { physics: 58, chemistry: 54, maths: 52 },
    ioqm_score: 48,
    retained: true
  },
  {
    id: "PW-LKO-011",
    name: "Aditi Srivastav",
    grade: "10",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 80, chemistry: 85, maths: 88 },
    t2_scores: { physics: 82, chemistry: 84, maths: 89 },
    ioqm_score: 74,
    ramp_up_score: 79,
    retained: true
  },
  {
    id: "PW-LKO-012",
    name: "Ayush Saxena", // Borderline Target 5 (Maths T1)
    grade: "10",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 45, chemistry: 42, maths: 32 }, // Borderline Maths T1
    t2_scores: { physics: 48, chemistry: 46, maths: 41 },
    ioqm_score: 45,
    ramp_up_score: 40,
    retained: false // dropped out later (affects retention)
  },
  {
    id: "PW-LKO-013",
    name: "Karan Johar",
    grade: "12",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 25, chemistry: 28, maths: 34 }, // Extreme low scores, not borderline
    t2_scores: { physics: 28, chemistry: 30, maths: 32 },
    ioqm_score: 25,
    retained: true
  },
  {
    id: "PW-LKO-014",
    name: "Sanya Goel",
    grade: "9",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 75, chemistry: 70, maths: 80 },
    t2_scores: { physics: 78, chemistry: 72, maths: 82 },
    ioqm_score: 60,
    ramp_up_score: 83, // Ramp Up > 80%!
    retained: true
  },
  {
    id: "PW-LKO-015",
    name: "Tanmay Bhat",
    grade: "11",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 44, chemistry: 48, maths: 51 },
    t2_scores: { physics: 46, chemistry: 50, maths: 53 },
    ioqm_score: 32,
    retained: true
  },
  {
    id: "PW-LKO-016",
    name: "Kirti Sen", // Borderline Target 6 (Physics T1)
    grade: "10",
    center: "Lucknow Chowk Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 39, chemistry: 45, maths: 42 }, // Borderline Physics T1
    t2_scores: { physics: 42, chemistry: 46, maths: 44 },
    ioqm_score: 40,
    ramp_up_score: 62,
    retained: true
  },

  // ==========================================
  // KOTA PRIME CENTRE (RANK 1 - SPECTACULAR TOP PERFORMER)
  // ==========================================
  {
    id: "PW-KOT-001",
    name: "Abhay Aggarwal",
    grade: "11",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 98, chemistry: 97, maths: 99 },
    t2_scores: { physics: 99, chemistry: 98, maths: 100 },
    ioqm_score: 95,
    retained: true
  },
  {
    id: "PW-KOT-002",
    name: "Chirag Singhal",
    grade: "12",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 95, chemistry: 92, maths: 96 },
    t2_scores: { physics: 94, chemistry: 95, maths: 98 },
    ioqm_score: 92,
    retained: true
  },
  {
    id: "PW-KOT-003",
    name: "Ishita Mittal",
    grade: "10",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 90, chemistry: 91, maths: 94 },
    t2_scores: { physics: 92, chemistry: 93, maths: 95 },
    ioqm_score: 91,
    ramp_up_score: 94,
    retained: true
  },
  {
    id: "PW-KOT-004",
    name: "Lakshay Jain",
    grade: "12",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 88, chemistry: 91, maths: 92 },
    t2_scores: { physics: 89, chemistry: 90, maths: 93 },
    ioqm_score: 88,
    retained: true
  },
  {
    id: "PW-KOT-005",
    name: "Meera Nair",
    grade: "10",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 85, chemistry: 88, maths: 92 },
    t2_scores: { physics: 86, chemistry: 89, maths: 91 },
    ioqm_score: 85,
    ramp_up_score: 92,
    retained: true
  },
  {
    id: "PW-KOT-006",
    name: "Pranav Shah",
    grade: "9",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 78, chemistry: 80, maths: 85 },
    t2_scores: { physics: 82, chemistry: 82, maths: 84 },
    ioqm_score: 80,
    ramp_up_score: 89,
    retained: true
  },
  {
    id: "PW-KOT-007",
    name: "Nidhi Verma",
    grade: "11",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 82, chemistry: 85, maths: 88 },
    t2_scores: { physics: 84, chemistry: 83, maths: 87 },
    ioqm_score: 83,
    retained: true
  },
  {
    id: "PW-KOT-008",
    name: "Sumit Pandey",
    grade: "11",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 90, chemistry: 92, maths: 95 },
    t2_scores: { physics: 92, chemistry: 94, maths: 96 },
    ioqm_score: 94,
    retained: true
  },
  {
    id: "PW-KOT-009",
    name: "Vijay Singla",
    grade: "9",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 88, chemistry: 90, maths: 92 },
    t2_scores: { physics: 91, chemistry: 92, maths: 94 },
    ioqm_score: 89,
    ramp_up_score: 91,
    retained: true
  },
  {
    id: "PW-KOT-010",
    name: "Zoya Khan",
    grade: "12",
    center: "Kota Prime Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 94, chemistry: 95, maths: 97 },
    t2_scores: { physics: 96, chemistry: 94, maths: 98 },
    ioqm_score: 90,
    retained: true
  },

  // ==========================================
  // PATNA KANKARBAGH CENTRE (RANK 2 - EXCELLENT METRICS)
  // ==========================================
  {
    id: "PW-PAT-001",
    name: "Aman Ranjan",
    grade: "11",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 90, chemistry: 92, maths: 93 },
    t2_scores: { physics: 92, chemistry: 91, maths: 94 },
    ioqm_score: 88,
    retained: true
  },
  {
    id: "PW-PAT-002",
    name: "Saurabh Kumar",
    grade: "12",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 88, chemistry: 85, maths: 91 },
    t2_scores: { physics: 86, chemistry: 88, maths: 90 },
    ioqm_score: 80,
    retained: true
  },
  {
    id: "PW-PAT-003",
    name: "Divya Kumari",
    grade: "10",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 85, chemistry: 89, maths: 88 },
    t2_scores: { physics: 87, chemistry: 90, maths: 89 },
    ioqm_score: 84,
    ramp_up_score: 88,
    retained: true
  },
  {
    id: "PW-PAT-004",
    name: "Rishi Kumar",
    grade: "9",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 80, chemistry: 82, maths: 86 },
    t2_scores: { physics: 78, chemistry: 83, maths: 85 },
    ioqm_score: 75,
    ramp_up_score: 84,
    retained: true
  },
  {
    id: "PW-PAT-005",
    name: "Neha Singh",
    grade: "11",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 84, chemistry: 81, maths: 86 },
    t2_scores: { physics: 85, chemistry: 84, maths: 88 },
    ioqm_score: 81,
    retained: true
  },
  {
    id: "PW-PAT-006",
    name: "Abhishek Pathak",
    grade: "12",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 76, chemistry: 78, maths: 80 },
    t2_scores: { physics: 75, chemistry: 80, maths: 82 },
    ioqm_score: 78,
    retained: true
  },
  {
    id: "PW-PAT-007",
    name: "Anjali Kumari",
    grade: "10",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 78, chemistry: 75, maths: 82 },
    t2_scores: { physics: 80, chemistry: 78, maths: 84 },
    ioqm_score: 72,
    ramp_up_score: 81,
    retained: true
  },
  {
    id: "PW-PAT-008",
    name: "Vikash Ojha",
    grade: "11",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 89, chemistry: 92, maths: 94 },
    t2_scores: { physics: 91, chemistry: 90, maths: 93 },
    ioqm_score: 89,
    retained: true
  },
  {
    id: "PW-PAT-009",
    name: "Komal Prasad",
    grade: "9",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 72, chemistry: 75, maths: 78 },
    t2_scores: { physics: 74, chemistry: 76, maths: 80 },
    ioqm_score: 68,
    ramp_up_score: 78,
    retained: true
  },
  {
    id: "PW-PAT-010",
    name: "Gopal Jha",
    grade: "12",
    center: "Patna Kankarbagh Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 91, chemistry: 90, maths: 92 },
    t2_scores: { physics: 90, chemistry: 93, maths: 94 },
    ioqm_score: 86,
    retained: true
  },

  // ==========================================
  // DELHI WEST CENTRE (RANK 3 - DECENT MIDDLE RANK)
  // ==========================================
  {
    id: "PW-DEL-001",
    name: "Siddharth Kaushik",
    grade: "11",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 82, chemistry: 85, maths: 88 },
    t2_scores: { physics: 84, chemistry: 86, maths: 90 },
    ioqm_score: 72,
    retained: true
  },
  {
    id: "PW-DEL-002",
    name: "Ria Malhotra",
    grade: "12",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 78, chemistry: 74, maths: 80 },
    t2_scores: { physics: 79, chemistry: 78, maths: 78 },
    ioqm_score: 66,
    retained: true
  },
  {
    id: "PW-DEL-003",
    name: "Arjun Thapar",
    grade: "10",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 85, chemistry: 88, maths: 84 },
    t2_scores: { physics: 82, chemistry: 85, maths: 86 },
    ioqm_score: 78,
    ramp_up_score: 85,
    retained: true
  },
  {
    id: "PW-DEL-004",
    name: "Kavita Seth",
    grade: "9",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 74, chemistry: 71, maths: 76 },
    t2_scores: { physics: 75, chemistry: 73, maths: 75 },
    ioqm_score: 55,
    ramp_up_score: 70,
    retained: true
  },
  {
    id: "PW-DEL-005",
    name: "Varun Dhawan",
    grade: "11",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 88, chemistry: 91, maths: 90 },
    t2_scores: { physics: 90, chemistry: 88, maths: 92 },
    ioqm_score: 84,
    retained: true
  },
  {
    id: "PW-DEL-006",
    name: "Ishaan Khattar",
    grade: "12",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 68, chemistry: 65, maths: 72 },
    t2_scores: { physics: 70, chemistry: 68, maths: 71 },
    ioqm_score: 60,
    retained: true
  },
  {
    id: "PW-DEL-007",
    name: "Aparna Sen",
    grade: "10",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 80, chemistry: 82, maths: 85 },
    t2_scores: { physics: 81, chemistry: 84, maths: 83 },
    ioqm_score: 79,
    ramp_up_score: 82,
    retained: true
  },
  {
    id: "PW-DEL-008",
    name: "Rajesh Kumar",
    grade: "11",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 75, chemistry: 78, maths: 81 },
    t2_scores: { physics: 76, chemistry: 75, maths: 82 },
    ioqm_score: 70,
    retained: true
  },
  {
    id: "PW-DEL-009",
    name: "Simran Kaur",
    grade: "9",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 65, chemistry: 68, maths: 72 },
    t2_scores: { physics: 67, chemistry: 70, maths: 74 },
    ioqm_score: 51,
    ramp_up_score: 65,
    retained: true
  },
  {
    id: "PW-DEL-010",
    name: "Manpreet Singh",
    grade: "12",
    center: "Delhi West Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 85, chemistry: 82, maths: 86 },
    t2_scores: { physics: 83, chemistry: 85, maths: 87 },
    ioqm_score: 82,
    retained: true
  },

  // ==========================================
  // BANGALORE SOUTH CENTRE (RANK 4 - MODERATE PERFORMANCE)
  // ==========================================
  {
    id: "PW-BLR-001",
    name: "Nikhil Kamath",
    grade: "11",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 76, chemistry: 82, maths: 80 },
    t2_scores: { physics: 78, chemistry: 80, maths: 82 },
    ioqm_score: 68,
    retained: true
  },
  {
    id: "PW-BLR-002",
    name: "Karthik Raja",
    grade: "12",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 71, chemistry: 75, maths: 74 },
    t2_scores: { physics: 72, chemistry: 76, maths: 75 },
    ioqm_score: 60,
    retained: true
  },
  {
    id: "PW-BLR-003",
    name: "Anusha Shettar",
    grade: "10",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 84, chemistry: 81, maths: 86 },
    t2_scores: { physics: 82, chemistry: 83, maths: 85 },
    ioqm_score: 72,
    ramp_up_score: 82,
    retained: true
  },
  {
    id: "PW-BLR-004",
    name: "Pranav Gowda",
    grade: "9",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 72, chemistry: 70, maths: 75 },
    t2_scores: { physics: 70, chemistry: 72, maths: 74 },
    ioqm_score: 58,
    ramp_up_score: 76,
    retained: true
  },
  {
    id: "PW-BLR-005",
    name: "Divya Teja",
    grade: "11",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 80, chemistry: 85, maths: 82 },
    t2_scores: { physics: 81, chemistry: 84, maths: 84 },
    ioqm_score: 76,
    retained: true
  },
  {
    id: "PW-BLR-006",
    name: "Sanjay Hegde",
    grade: "12",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 65, chemistry: 68, maths: 70 },
    t2_scores: { physics: 67, chemistry: 65, maths: 72 },
    ioqm_score: 55,
    retained: true
  },
  {
    id: "PW-BLR-007",
    name: "Sneha Ram",
    grade: "10",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 78, chemistry: 80, maths: 81 },
    t2_scores: { physics: 79, chemistry: 78, maths: 82 },
    ioqm_score: 70,
    ramp_up_score: 78,
    retained: true
  },
  {
    id: "PW-BLR-008",
    name: "Vijay Raghavan",
    grade: "11",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 73, chemistry: 71, maths: 76 },
    t2_scores: { physics: 72, chemistry: 73, maths: 74 },
    ioqm_score: 65,
    retained: true
  },
  {
    id: "PW-BLR-009",
    name: "Arun Kumar",
    grade: "9",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 64, chemistry: 62, maths: 68 },
    t2_scores: { physics: 65, chemistry: 64, maths: 66 },
    ioqm_score: 50,
    ramp_up_score: 68,
    retained: true
  },
  {
    id: "PW-BLR-010",
    name: "Meghana Bhat",
    grade: "12",
    center: "Bangalore South Centre",
    t1_attendance: "Present",
    t2_attendance: "Present",
    t1_scores: { physics: 81, chemistry: 80, maths: 84 },
    t2_scores: { physics: 82, chemistry: 81, maths: 83 },
    ioqm_score: 78,
    retained: true
  }
];

/**
 * Evaluates row-level data for a student and returns average score, active status and details.
 * Implements:
 *   - Rule A (Double Absence Exclusion): returns null if absent for both tests.
 *   - Rule B (Single Test Evaluation): uses strictly attended test for percentage.
 */
export function getStudentPerformance(student: Student): {
  isActive: boolean;
  averagePercent: number | null;
  subjectPapersCount: number;
  failingPapersCount: number; // papers < 40%
  papers: { name: string; score: number | undefined; test: 'T1'|'T2' }[];
} {
  const isT1Present = student.t1_attendance === "Present";
  const isT2Present = student.t2_attendance === "Present";
  
  // Rule A: Double Absence Exclusion
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

  // Rule B: Single-Test Evaluation or Combined Evaluation
  // Sum of obtained marks divided by count of valid papers
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

/**
 * Calculates complete center metrics for a given subset of students.
 * Crucial for dynamic "What-If" sliders where scores are modified on-the-fly.
 */
export function calculateCenterMetrics(
  centerName: string,
  students: Student[]
): Omit<CenterScores, "rank"> {
  const centerStudents = students.filter(s => s.center === centerName);
  
  // Filter out double absences (Rule A)
  const activeStudents = centerStudents.filter(s => {
    const isT1Present = s.t1_attendance === "Present";
    const isT2Present = s.t2_attendance === "Present";
    return isT1Present || isT2Present;
  });
  
  if (activeStudents.length === 0) {
    return {
      centerName,
      activeStudents: 0,
      subjectiveTestScore: 0,
      elementA_percent: 0,
      elementA_score: 0,
      elementB_percent: 0,
      elementB_score: 0,
      testAttendanceScore: 0,
      attendance_percent: 0,
      ioqmScore: 0,
      ioqm_percent: 0,
      rampUpScore: 0,
      rampUp_percent: 0,
      studentRetentionScore: 0,
      retention_percent: 0,
      consolidatedScore: 0
    };
  }

  // 1. SUBJECTIVE TEST COMPONENT (Weight: 25%)
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

  // 2. TEST ATTENDANCE (Weight: 10%)
  // Average attendance of active pool across 2 tests
  let totalAttendanceOpportunities = activeStudents.length * 2;
  let attendedCount = 0;
  activeStudents.forEach(s => {
    if (s.t1_attendance === "Present") attendedCount++;
    if (s.t2_attendance === "Present") attendedCount++;
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

  // 3. IOQM ACHIEVEMENT (Weight: 20%)
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

  // 4. RAMP UP TESTS (Weight: 15%)
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

  // 5. STUDENT RETENTION (Weight: 30%)
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

  // Calculate Consolidated Center Score
  const consolidatedScore = 
    (subjectiveTestScore * 0.25) +
    (ioqmScore * 0.20) +
    (rampUpScore * 0.15) +
    (testAttendanceScore * 0.10) +
    (studentRetentionScore * 0.30);

  return {
    centerName,
    activeStudents: activeStudents.length,
    subjectiveTestScore,
    elementA_percent,
    elementA_score,
    elementB_percent,
    elementB_score,
    testAttendanceScore,
    attendance_percent,
    ioqmScore,
    ioqm_percent,
    rampUpScore,
    rampUp_percent,
    studentRetentionScore,
    retention_percent,
    consolidatedScore
  };
}

/**
 * Computes all center metrics, ranks them based on consolidated scoring,
 * and sets the .rank property for each.
 */
export function getRankedCenters(students: Student[]): CenterScores[] {
  // Get all unique centers in current dataset
  const centers = Array.from(new Set(students.map(s => s.center)));
  
  // Calculate raw scores
  const results = centers.map(c => calculateCenterMetrics(c, students));
  
  // Sort descending by consolidated score to apply rankings
  results.sort((a, b) => b.consolidatedScore - a.consolidatedScore);
  
  return results.map((res, index) => ({
    ...res,
    rank: index + 1
  }));
}
