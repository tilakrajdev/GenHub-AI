import OpenAI from "openai";
import sql from "../config/db.js";
import { clerkClient } from "@clerk/express";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const articleLengthSettings = {
  short: {
    wordCount: "500-800 words",
    target: "about 700 words",
    maxTokens: 1800,
  },
  medium: {
    wordCount: "800-1200 words",
    target: "about 1000 words",
    maxTokens: 2800,
  },
  long: {
    wordCount: "at least 1200 words",
    target: "about 1500 words",
    maxTokens: 4000,
  },
};

// Fixed CommonJS import compatibility in ESM
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const AI = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const removeUploadedFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT")
      console.error("Uploaded file cleanup failed:", error.message);
  }
};

export const generateArticle = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt: topic, length = "short" } = req.body;
    const plan = req.plan;
    const free_usage = req.free_usage;

    const lengthSettings = articleLengthSettings[length];
    if (!topic?.trim() || !lengthSettings) {
      return res.status(400).json({
        success: false,
        message: "Provide an article topic and a valid article length.",
      });
    }

    const prompt = `Write a complete, well-structured article about ${topic}. The article must be ${lengthSettings.wordCount} (aim for ${lengthSettings.target}, excluding the title). Include a clear title, an introduction, several detailed sections with useful examples, and a conclusion. Finish the entire article without stopping mid-sentence.`;

    if (plan !== "premium" && free_usage >= 10) {
      return res.json({
        success: false,
        message: "Limit reached. Upgrade to continue.",
      });
    }

    const response = await AI.chat.completions.create({
      model: "gemini-3.8-flash",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: lengthSettings.maxTokens,
    });

    const content = response.choices[0].message.content;

    await sql` INSERT INTO creations(user_id, prompt, content, type)VALUES (${userId}, ${prompt}, ${content}, 'article')`;

    if (plan !== "premium") {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: {
          free_usage: free_usage + 1,
        },
      });
    }
    res.json({ success: true, content });
  } catch (err) {
    console.log(err.message);
    res.json({ success: false, message: err.message });
  }
};

export const generateBlogTitle = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, length = 100 } = req.body;
    const plan = req.plan;
    const free_usage = req.free_usage;

    if (plan !== "premium" && free_usage >= 10) {
      return res.json({
        success: false,
        message: "Limit reached. Upgrade to continue.",
      });
    }

    const response = await AI.chat.completions.create({
      model: "gemini-3.8-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: length, // Now defined!
    });

    const content = response.choices[0].message.content;

    await sql`INSERT INTO creations(user_id, prompt, content, type) VALUES (${userId}, ${prompt}, ${content}, 'blog-title')`;

    if (plan !== "premium") {
      // 2. Fix: Ensure clerkClient is properly awaited/imported based on your SDK version
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: {
          free_usage: free_usage + 1,
        },
      });
    }
    res.json({ success: true, content });
  } catch (err) {
    console.log(err.message);
    res.json({ success: false, message: err.message });
  }
};

export const generateImage = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, publish } = req.body;
    const plan = req.plan;

    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!prompt?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Describe the image you want to generate.",
      });
    }
    if (!process.env.POLLINATIONS_API_KEY) {
      return res.status(503).json({
        success: false,
        message:
          "Image generation is not configured. Add POLLINATIONS_API_KEY to the server environment.",
      });
    }

    const baseImage = new URL(
      `https://gen.pollinations.ai/image/${encodeURIComponent(prompt.trim())}`,
    );
    baseImage.search = new URLSearchParams({
      width: "512",
      height: "512",
      model: "lykon/dreamshaper-8-lcm",
    }).toString();

    const { data, headers } = await axios.get(baseImage.toString(), {
      headers: { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` },
      responseType: "arraybuffer",
    });
    const contentType = headers["content-type"]?.split(";")[0];
    if (!contentType?.startsWith("image/") || !data?.byteLength) {
      return res.status(502).json({
        success: false,
        message: "The image provider returned an invalid image response.",
      });
    }

    const base64Image = `data:${contentType};base64,${Buffer.from(data).toString("base64")}`;

    const { secure_url } = await cloudinary.uploader.upload(base64Image);

    await sql` INSERT INTO creations(user_id, prompt, content, type, publish)VALUES (${userId}, ${prompt}, ${secure_url}, 'image', ${publish ?? false})`;

    res.json({ success: true, content: secure_url });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(502).json({
        success: false,
        message:
          "Pollinations rejected the server API key. Check POLLINATIONS_API_KEY.",
      });
    }
    if (err.response?.status === 402) {
      return res.status(502).json({
        success: false,
        message:
          "Pollinations has insufficient Pollen balance for image generation.",
      });
    }
    const message =
      err?.message ||
      err?.error?.message ||
      "Image generation failed. Check the server logs.";
    console.error("Image generation failed:", message);
    res.status(500).json({ success: false, message });
  }
};

export const removeImageBackground = async (req, res) => {
  const image = req.file;
  try {
    const { userId } = req.auth();
    const plan = req.plan;

    if (plan !== "premium") {
      return res.status(403).json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }
    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Upload an image to remove its background.",
      });
    }

    // ClipDrop for text to image

    // Cloudinary for saving the images on cloud
    const { secure_url } = await cloudinary.uploader.upload(image.path, {
      transformation: [
        {
          effect: "background_removal",
          background_removal: "remove_the_background",
        },
      ],
    });

    await sql` INSERT INTO creations(user_id, prompt, content, type) VALUES (${userId}, 'Remove background from image', ${secure_url}, 'image')`;

    res.json({ success: true, content: secure_url });
  } catch (err) {
    const message =
      err?.message ||
      err?.error?.message ||
      "Image generation failed. Check the server logs.";
    console.error("Image generation failed:", message);
    res.status(500).json({ success: false, message });
  } finally {
    await removeUploadedFile(image?.path);
  }
};

export const removeImageObject = async (req, res) => {
  const image = req.file;
  try {
    const { userId } = req.auth();
    const plan = req.plan;
    const { object } = req.body;

    if (plan !== "premium") {
      return res.status(403).json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }
    if (!image || !object?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Upload an image and enter the object to remove.",
      });
    }

    // Cloudinary for saving the images on cloud
    const { public_id } = await cloudinary.uploader.upload(image.path);

    const imageUrl = cloudinary.url(public_id, {
      transformation: [{ effect: `gen_remove:${object.trim()}` }],
      resource_type: "image",
    });

    await sql` INSERT INTO creations(user_id, prompt, content, type) VALUES (${userId}, ${`Remove ${object} from image`}, ${imageUrl}, 'image')`;

    res.json({ success: true, content: imageUrl });
  } catch (err) {
    const message =
      err?.message ||
      err?.error?.message ||
      "Image generation failed. Check the server logs.";
    console.error("Image generation failed:", message);
    res.status(500).json({ success: false, message });
  } finally {
    await removeUploadedFile(image?.path);
  }
};

export const resumeReview = async (req, res) => {
  const resume = req.file;
  try {
    const { userId } = req.auth();
    const plan = req.plan;

    if (plan !== "premium") {
      return res.status(403).json({
        success: false,
        message: "This feature is only available for premium subscriptions",
      });
    }

    if (!resume) {
      return res
        .status(400)
        .json({ success: false, message: "Upload a PDF resume to review." });
    }

    if (resume.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Resume file size exceeds allowed size (5MB)",
      });
    }

    const dataBuffer = fs.readFileSync(resume.path);
    const parser = new PDFParse({ data: dataBuffer });
    let pdfData;
    try {
      pdfData = await parser.getText();
    } finally {
      await parser.destroy();
    }

    if (!pdfData.text?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "No readable text was found in this PDF. Upload a text-based resume.",
      });
    }

    const prompt = `Review the following resume and provide constructive feedback on its strengths, weakness, and areas for improvement. Resume Content: \n\n${pdfData.text}`;

    const response = await AI.chat.completions.create({
      model: "gemini-3.8-flash",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content;

    await sql` INSERT INTO creations(user_id, prompt, content, type) VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')`;

    res.json({ success: true, content });
  } catch (err) {
    const message =
      err?.message ||
      err?.error?.message ||
      "Image generation failed. Check the server logs.";
    console.error("Image generation failed:", message);
    res.status(500).json({ success: false, message });
  } finally {
    await removeUploadedFile(resume?.path);
  }
};
