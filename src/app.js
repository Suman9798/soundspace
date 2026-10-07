const express = require('express')
const cookieParser = require('cookie-parser')
const path = require('path')
const connectDB = require("./db/db")

const authRoutes = require("./routes/auth.routes")
const musicRoutes = require("./routes/music.routes")

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// If Vercel routes the bare root to Express, send the browser to the static
// homepage that Vercel serves from public/.
app.get("/", (req, res) => res.redirect(302, "/index.html"));

// Vercel starts the Express app without running src/server.js, so connect when
// an API request arrives. The cached connection is reused across warm requests.
app.use("/api", async (req, res, next) => {
    try {
        await connectDB();
        return next();
    } catch (error) {
        console.error("Database connection failed:", error.message);
        return res.status(503).json({ message: "The database is temporarily unavailable" });
    }
});

app.use("/api/auth",authRoutes);

app.use("/api/music",musicRoutes);

// Vercel serves files from public/ through its CDN. Keep Express static serving
// for local development only.
if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, "../public")));
}

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.name === "MulterError") {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        return res.status(status).json({ message: error.message });
    }
    if (error.name === "ValidationError") {
        return res.status(400).json({ message: error.message });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "Request body is too large" });
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Request body must contain valid JSON" });
    }
    if (error.code === 11000) {
        return res.status(409).json({ message: "Username or email is already registered" });
    }
    if (error.message === "Only audio files are allowed") {
        return res.status(400).json({ message: error.message });
    }

    console.error("Request failed:", error);
    return res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
