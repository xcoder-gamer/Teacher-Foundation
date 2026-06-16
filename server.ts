import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy initialiser for Gemini SDK client
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is missing from workspace environment secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// ----------------------------------------
// 1. API ROUTES
// ----------------------------------------

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Interactive Diagnostic expert generation route
app.post("/api/diagnostic", async (req, res) => {
  try {
    const { centerName, selectedTab, scores, borderlineCount, simulatedMetrics } = req.body;
    
    if (!centerName || !scores) {
      res.status(400).json({ error: "Missing centerName or scores in payload." });
      return;
    }

    const ai = getAIClient();
    
    // Construct a rich, clear prompt based on the selected view
    let promptSubject = "";
    if (selectedTab === "subjective") {
      promptSubject = `
Selected View: Subjective Test View
Subjective test score details:
- Element A (Toppers >= 90%): Current is ${scores.elementA_percent.toFixed(1)}% of students, yielding ${scores.elementA_score.toFixed(1)}/100 points.
- Element B (Remediation footprint < 40% Papers): Current is ${scores.elementB_percent.toFixed(1)}% of subject papers are failing, yielding ${scores.elementB_score.toFixed(1)}/100 points.
- Total Subjective Weighted Score: ${scores.subjectiveTestScore.toFixed(1)}/100.
Borderline students in 30-39% range: ${borderlineCount || 5}.
Simulated improve trajectory if borderline students are coached:
- Element B percentage drops.
- National Rank improves from Rank ${scores.rank} to higher.

Your Task:
Write a highly targeted academic break-down in professional, clean English addressing the center team.
Use these headers:
### 🔍 Areas of Improvement & Subject Remediation Footprint
- Critically analyse why the Remediation Footprint is dragging the points down and what specific papers need attention.
- Comment on the Borderline Students and why they are our primary target.

### 🔮 What-If Simulator Insight
- Explain to the team in professional English the absolute power of pushing borderline students above 40%. Explain that helping these students is the highest-leverage task.
` ;
    } else {
      promptSubject = `
Selected View: Final Rank View (Overall operational scorecard)
Center Performance Details:
- National Rank: ${scores.rank} out of 5 centers.
- Consolidated center overall score: ${scores.consolidatedScore.toFixed(1)}/100
Weighted components:
- Subjective Test (25% weight): ${scores.subjectiveTestScore.toFixed(1)}/100
- Test Attendance (10% weight): ${scores.testAttendanceScore.toFixed(1)}/100
- IOQM Achievement (20% weight): ${scores.ioqmScore.toFixed(1)}/100
- Ramp Up Tests (15% weight): ${scores.rampUpScore.toFixed(1)}/100
- Student Retention (30% weight): ${scores.studentRetentionScore.toFixed(1)}/100

Your Task:
Write an overall operational diagnostic in clean, professional, and objective English.
Use these headers:
### ❌ Performance Gaps & Key Optimization Areas
- Identify which metric out of the 5 has the biggest score gap compared to perfection (or Kota Prime Centre which scores ~94) and explain how this rank leak happened.
- Speak directly, constructively, and logically on why the rank is low and how to improve. Keep it professional.
`;
    }

    const systemInstruction = `
You are the intelligent analytical backend diagnostic engine for PW's Read-Only Teacher Analytics Dashboard.
Your role is to act as an expert academic advisor helping school center leads and teachers optimize their national ranking.
You speak frankly but supportively in clean and professional English, explaining why performance was weak and how to improve.
Always format your response using professional markdown with headers (###) and clean bullet points.
Never mention backend execution code, raw formula strings, json, or technical parameters.
Keep the tone direct, analytical, objective, yet encouraging.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Center Name: ${centerName}
${promptSubject}
Current Local Time context: ${new Date().toLocaleDateString()}`,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    res.json({
      success: true,
      diagnostic: response.text
    });
    
  } catch (error: any) {
    console.error("Error generating diagnostic feedback from server:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to generate diagnostic report. Please check if your GEMINI_API_KEY is configured." 
    });
  }
});

// ----------------------------------------
// 2. VITE MIDDLEWARE CONFIGURATION
// ----------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development server mode with HMR integration
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production statics hosting
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FULLSTACK ENGINE] Server listening on http://localhost:${PORT}`);
  });
}

startServer();
