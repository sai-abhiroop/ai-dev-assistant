require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { marked } = require("marked");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const otpStore = {};
const PORT = process.env.PORT || 5000;
const app = express();
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.GEMINI_API_KEY;

// Google Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ---------------- MongoDB ---------------- */

const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let snippetsCollection;
let usersCollection;

async function startServer() {
  try {
    await client.connect();

    console.log("✅ MongoDB connected");

    const db = client.db("aidevassistant");

    snippetsCollection = db.collection("snippets");
    usersCollection = db.collection("users");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`);
    });

  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

startServer();

console.log("Gemini key loaded:", API_KEY ? "YES" : "NO");

/* ---------------- Middleware ---------------- */

function auth(req, res, next) {

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.user = null;
    return next();
  }

  // 🔥 Extract token correctly
  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    console.log("JWT ERROR:", err.message);
    req.user = null;
  }

  next();
}

/* ---------------- Root ---------------- */

app.get("/", (req, res) => {
  res.send("🚀 AI Backend Running");
});

/* ---------------- Gemini ---------------- */

async function callGemini(prompt) {

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
    {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }
  );

  return (
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No response"
  );
}

/* ---------------- AI ---------------- */

app.post("/api/explain", auth, async (req, res) => {

  const { code, type } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Code required" });
  }

  let prompt;

  if (type === "debug") {
    prompt = `Find bugs and fix:\n\n${code}`;
  } else if (type === "optimize") {
    prompt = `Optimize this code:\n\n${code}`;
  } else if (type === "complexity") {
    prompt = `Explain time & space complexity:\n\n${code}`;
  } else {
    prompt = `
Explain code with headings:

## Overview
## Steps
## Concepts
## Output

${code}
`;
  }

  try {

    const result = await callGemini(prompt);
    const html = marked(result);

    // ✅ Save ONLY if logged in
    if (req.user) {
      await snippetsCollection.insertOne({
        userId: req.user.id,
        code,
        response: result,
        type,
        createdAt: new Date(),
      });
    }
    // console.log("Saving snippet for:", req.user);
    // console.log("REQ USER ID:", req.user.id);

    res.json({ result, html });

  } catch (error) {

    console.error(error.response?.data || error.message);

    res.status(500).json({
      error: "AI failed",
    });

  }

});

/* ---------------- HISTORY ---------------- */

app.get("/api/history", auth, async (req, res) => {

  if (!req.user) {
    console.log("No user");
    return res.json([]); // 👈 guest = no history
  }

  const snippets = await snippetsCollection
    .find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  res.json(snippets);

});

/* ---------------- DELETE ---------------- */

app.delete("/api/history/:id", auth, async (req, res) => {

  if (!req.user) {
    return res.status(401).json({ error: "Login required" });
  }

  await snippetsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
    userId: req.user.id
  });

  res.json({ message: "Deleted" });

});

/* ---------------- SIGNUP ---------------- */

app.post("/api/signup", async (req, res) => {

  const { name, email, password } = req.body;

  const existing = await usersCollection.findOne({ email });

  if (existing) {
    return res.status(400).json({ error: "User exists" });
  }

  const hashed = await bcrypt.hash(password, 10);

  await usersCollection.insertOne({
    name,
    email,
    password: hashed
  });

  res.json({ message: "User created" });

});

/* ---------------- LOGIN ---------------- */

app.post("/api/login", async (req, res) => {

  const { email, password } = req.body;

  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(400).json({ error: "User not found" });
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(400).json({ error: "Wrong password" });
  }

  const token = jwt.sign(
    { id: user._id ,email:user.email},
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });

});

/* ---------------- GOOGLE LOGIN ---------------- */

app.post("/api/google-login", async (req, res) => {
  try {

    const { credential } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    const email = payload.email;
    const name = payload.name;

    let user = await usersCollection.findOne({ email });

    if (!user) {
      const result = await usersCollection.insertOne({
        name,
        email,
        createdAt: new Date()
      });

      user = { _id: result.insertedId }; // 🔥 FIX
    }

    const token = jwt.sign(
      { id: user._id.toString(),email:user.email }, // 🔥 FIX
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (err) {
    console.error("🔥 GOOGLE ERROR:", err);
    res.status(500).json({
      error: "Google login failed",
      details: err.message
    });
  }
});
/* ---------------- SEND OTP ---------------- */
app.post("/api/send-otp", async (req, res) => {

  const { email } = req.body;

  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[email] = otp;

  try {

    const response = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Your OTP Code",
      html: `<h2>Your OTP is ${otp}</h2>`
    });

    console.log("✅ RESEND RESPONSE:", response);
    console.log("📩 EMAIL SENT TO:", email);
    console.log("🔑 OTP:", otp);

    return res.json({ message: "OTP sent" });

  } catch (err) {
    console.error("❌ FULL ERROR:", err);
    return res.status(500).json({ error: err.message });
  }

});
/* ---------------- VERIFY OTP ---------------- */
app.post("/api/verify-otp", (req, res) => {

  const { email, otp } = req.body;

  if (otpStore[email] == otp) {

    delete otpStore[email];

    return res.json({ success: true });

  }

  res.status(400).json({ error: "Invalid OTP" });
});