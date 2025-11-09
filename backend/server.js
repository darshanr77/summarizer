import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import axios from "axios";
import * as cheerio from "cheerio";
import { createRequire } from "module";
import OpenAI from "openai";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse"); // ✅ Fixed pdf-parse import

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ 1️⃣ FILE UPLOAD (PDF, DOCX, TXT)
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

    fs.unlinkSync(file.path); // delete temp file
    res.json({ text });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to extract text" });
  }
});

// ✅ 2️⃣ LINK FETCH (Fetch text content from a URL)
app.post("/fetch-link", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // Extract readable text from the page
    const text = $("p")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");

    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: "Not enough readable content on this page" });
    }

    res.json({ text });
  } catch (error) {
    console.error("Fetch-link error:", error);
    res.status(500).json({ error: "Failed to fetch link content" });
  }
});

// ✅ 3️⃣ SUMMARIZE TEXT (Common endpoint for all)
app.post("/summarize", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant that summarizes long text into short, easy-to-read bullet points.",
        },
        { role: "user", content: `Summarize this:\n\n${text}` },
      ],
    });

    const summary = completion.choices[0].message.content;
    res.json({ summary });
  } catch (error) {
    console.error("Summarization error:", error);
    res.status(500).json({ error: "Failed to summarize text" });
  }
});

app.listen(5000, () => console.log("✅ Backend running on port 5000"));
