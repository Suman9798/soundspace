const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const userModel = require("../models/user.model");

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let googleKeysCache;
let googleKeysExpiresAt = 0;

async function getGoogleSigningKeys() {
    if (googleKeysCache && Date.now() < googleKeysExpiresAt) return googleKeysCache;
    const response = await fetch("https://www.googleapis.com/oauth2/v1/certs");
    if (!response.ok) throw new Error("Could not retrieve Google signing keys");
    googleKeysCache = await response.json();
    const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 300);
    googleKeysExpiresAt = Date.now() + maxAge * 1000;
    return googleKeysCache;
}

async function verifyGoogleCredential(token) {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid Google credential");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid Google credential");
    const keys = await getGoogleSigningKeys();
    if (!keys[header.kid]) {
        googleKeysExpiresAt = 0;
        const refreshedKeys = await getGoogleSigningKeys();
        if (!refreshedKeys[header.kid]) throw new Error("Invalid Google credential signature");
    }
    const signingKey = googleKeysCache[header.kid];
    const validSignature = crypto.verify(
        "RSA-SHA256",
        Buffer.from(`${parts[0]}.${parts[1]}`),
        signingKey,
        Buffer.from(parts[2], "base64url")
    );
    const now = Math.floor(Date.now() / 1000);
    if (!validSignature || claims.aud !== process.env.GOOGLE_CLIENT_ID ||
        !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) ||
        !claims.sub || !claims.email || claims.email_verified !== true ||
        !claims.exp || claims.exp <= now || claims.iat > now + 60) {
        throw new Error("Invalid or expired Google credential");
    }
    return { googleId: claims.sub, email: claims.email.trim().toLowerCase(), name: claims.name || "" };
}

function createToken(user) {
    return jwt.sign(
        { id: user._id.toString(), role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );
}

function setTokenCookie(res, token) {
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: TOKEN_MAX_AGE_MS,
    });
}

function publicUser(user) {
    return {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
    };
}

async function registerUser(req, res) {
    const { username, email, password, role = "user" } = req.body || {};
    if (typeof username !== "string" || !username.trim() ||
        typeof email !== "string" || !email.trim() ||
        typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Username, email, and a password of at least 8 characters are required" });
    }
    if (! ["user", "artist"].includes(role)) {
        return res.status(400).json({ message: "Role must be user or artist" });
    }

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const exists = await userModel.findOne({
        $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    });
    if (exists) {
        return res.status(409).json({ message: "Username or email is already registered" });
    }

    const user = await userModel.create({
        username: normalizedUsername,
        email: normalizedEmail,
        password: await bcrypt.hash(password, 12),
        role,
    });
    setTokenCookie(res, createToken(user));
    return res.status(201).json({ message: "User registered successfully", user: publicUser(user) });
}

async function loginUser(req, res) {
    const { username, email, password } = req.body || {};
    const identity = typeof email === "string" ? email.trim().toLowerCase() :
        (typeof username === "string" ? username.trim() : null);
    if (!identity || typeof password !== "string") {
        return res.status(400).json({ message: "Email or username and password are required" });
    }

    const user = await userModel.findOne({
        $or: [{ username: identity }, { email: identity }],
    });
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    setTokenCookie(res, createToken(user));
    return res.status(200).json({ message: "User logged in successfully", user: publicUser(user) });
}

async function googleLogin(req, res) {
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(503).json({ message: "Google sign in is not configured" });
    }
    const credential = req.body?.credential;
    if (typeof credential !== "string" || credential.length > 10000) {
        return res.status(400).json({ message: "A valid Google credential is required" });
    }

    let identity;
    try {
        identity = await verifyGoogleCredential(credential);
    } catch (error) {
        if (error.message.includes("Google signing keys")) {
            console.error(error.message);
            return res.status(503).json({ message: "Google sign in is temporarily unavailable" });
        }
        return res.status(401).json({ message: "Google sign in could not be verified" });
    }

    let user = await userModel.findOne({ googleId: identity.googleId });
    if (!user) {
        user = await userModel.findOne({ email: identity.email });
        if (user) {
            if (user.googleId && user.googleId !== identity.googleId) {
                return res.status(409).json({ message: "This email is already linked to another Google account" });
            }
            user.googleId = identity.googleId;
            await user.save();
        } else {
            const base = (identity.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 24) || "listener");
            let username = base;
            for (let suffix = 1; await userModel.exists({ username }); suffix += 1) {
                username = `${base}_${suffix}`;
            }
            user = await userModel.create({
                username,
                email: identity.email,
                googleId: identity.googleId,
                role: "user",
            });
        }
    }

    setTokenCookie(res, createToken(user));
    return res.status(200).json({ message: "Signed in with Google", user: publicUser(user) });
}

async function getCurrentUser(req, res) {
    const user = await userModel.findById(req.user.id);
    if (!user) {
        return res.status(401).json({ message: "Session user no longer exists" });
    }
    return res.status(200).json({ user: publicUser(user) });
}

function logoutUser(req, res) {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
    });
    return res.status(200).json({ message: "Logged out successfully" });
}

module.exports = { registerUser, loginUser, googleLogin, getCurrentUser, logoutUser };
