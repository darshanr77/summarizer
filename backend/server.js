import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import axios from "axios";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import * as pdfParseModule from "pdf-parse";  // ⚡ Correct import for all versions
const pdfParse = pdfParseModule.default || pdfParseModule; // ⚡ Ensure function is used

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 📌 1️⃣ FILE UPLOAD (PDF / DOCX / TXT)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(file.originalname).toLowerCase();
    let text = "";

    if (ext === ".txt") {
      text = fs.readFileSync(file.path, "utf8");
    } else if (ext === ".pdf") {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdfParse(dataBuffer);
      text = data.text;
    } else if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: file.path });
      text = result.value;
    } else {
      return res.status(400).json({ error: "Unsupported file format" });
    }

    fs.unlinkSync(file.path); // delete uploaded file
    res.json({ text });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to extract text" });
  }
});

// 📌 2️⃣ FETCH TEXT FROM URL
app.post("/fetch-link", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const text = $("p")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");

    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: "Not enough readable content" });
    }

    res.json({ text });
  } catch (error) {
    console.error("Fetch-link error:", error);
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

// 📌 3️⃣ SUMMARIZATION API
app.post("/summarize", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Summarize text into clear bullet points.",
        },
        { role: "user", content: `Summarize this:\n\n${text}` },
      ],
    });

    const summary = completion.choices[0].message.content;
    res.json({ summary });
  } catch (error) {
    console.error("Summarization error:", error);
    res.status(500).json({ error: "Failed to summarize" });
  }
});

app.listen(5000, () => console.log("🚀 Backend running on port 5000"));
