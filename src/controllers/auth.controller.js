const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const userModel = require("../models/user.model");
const emailVerificationModel = require("../models/email-verification.model");

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OTP_LIFETIME_MS = 10 * 60 * 1000;
const VERIFIED_EMAIL_LIFETIME_MS = 15 * 60 * 1000;
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

function normalizeEmail(email) {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function hashVerificationValue(value) {
    return crypto.createHmac("sha256", process.env.JWT_SECRET).update(value).digest("hex");
}

function safeHashCompare(left, right) {
    const a = Buffer.from(left || "", "hex");
    const b = Buffer.from(right || "", "hex");
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function getMailer() {
    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) {
        throw new Error("Email delivery is not configured");
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
    });
}

function verificationEmailHtml(code) {
    return `<!doctype html><html><body style="margin:0;background:#10110f;font-family:Arial,sans-serif;color:#f4f5ef"><div style="max-width:560px;margin:32px auto;padding:12px"><div style="background:#171916;border:1px solid #30342b;border-radius:18px;overflow:hidden"><div style="padding:30px 34px 22px;background:linear-gradient(135deg,#293321,#171916)"><div style="font-size:13px;font-weight:bold;letter-spacing:3px;color:#c6f36b">♫ &nbsp; SOUNDSPACE</div><h1 style="margin:27px 0 8px;font-size:27px;line-height:1.2;color:#f4f5ef">One quick check, then you’re in.</h1><p style="margin:0;color:#c5c9bd;font-size:15px;line-height:1.6">Use this code to verify your email and finish creating your account.</p></div><div style="padding:28px 34px 32px"><div style="padding:20px;background:#10120f;border:1px solid #34392e;border-radius:12px;text-align:center"><div style="font-size:11px;letter-spacing:2px;color:#9da394">YOUR VERIFICATION CODE</div><div style="margin-top:10px;font-size:36px;letter-spacing:10px;font-weight:bold;color:#c6f36b">${code}</div></div><p style="margin:22px 0 0;color:#a5aa9e;font-size:13px;line-height:1.65">This code expires in <strong style="color:#f4f5ef">10 minutes</strong>. If you didn’t request it, you can ignore this email.</p></div></div><p style="margin:15px 0;text-align:center;color:#71776c;font-size:11px">Made for listening · Soundspace</p></div></body></html>`;
}

async function sendEmailOtp(req, res) {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid email address" });
    if (!process.env.JWT_SECRET) return res.status(503).json({ message: "Email verification is temporarily unavailable" });
    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) {
        return res.status(503).json({ message: "Email delivery is not configured" });
    }
    if (await userModel.exists({ email })) return res.status(409).json({ message: "This email is already registered" });

    const now = new Date();
    let challenge = await emailVerificationModel.findOne({ email });
    if (challenge && now - challenge.sentAt < 60_000) {
        return res.status(429).json({ message: "Please wait a minute before requesting another code" });
    }
    const recentSends = (challenge?.sendHistory || []).filter((date) => now - date < 60 * 60 * 1000);
    if (recentSends.length >= 5) return res.status(429).json({ message: "Too many codes requested. Try again in an hour" });

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    if (!challenge) challenge = new emailVerificationModel({ email, sentAt: now, expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS) });
    challenge.codeHash = hashVerificationValue(`${email}:${code}`);
    challenge.verificationTokenHash = null;
    challenge.verifiedAt = null;
    challenge.expiresAt = new Date(now.getTime() + OTP_LIFETIME_MS);
    challenge.sentAt = now;
    challenge.sendHistory = [...recentSends, now];
    challenge.attempts = 0;
    await challenge.save();

    try {
        await getMailer().sendMail({
            from: process.env.SMTP_FROM || `Soundspace <${process.env.SMTP_USER}>`,
            to: email,
            subject: `${code} is your Soundspace verification code`,
            text: `Your Soundspace verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
            html: verificationEmailHtml(code),
        });
    } catch (error) {
        console.error("Verification email could not be sent:", error.message);
        return res.status(503).json({ message: "We could not send your verification email. Check the email address and try again later" });
    }
    return res.status(200).json({ message: "Verification code sent. Check your inbox" });
}

async function verifyEmailOtp(req, res) {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ message: "Enter the email address and 6-digit code" });
    }
    const challenge = await emailVerificationModel.findOne({ email });
    if (!challenge || !challenge.codeHash || challenge.expiresAt <= new Date()) {
        return res.status(400).json({ message: "That code has expired. Request a new one" });
    }
    if (challenge.attempts >= 5) return res.status(429).json({ message: "Too many incorrect attempts. Request a new code" });
    challenge.attempts += 1;
    if (!safeHashCompare(challenge.codeHash, hashVerificationValue(`${email}:${code}`))) {
        await challenge.save();
        return res.status(400).json({ message: "Incorrect code. Check it and try again" });
    }
    const verificationToken = crypto.randomBytes(32).toString("hex");
    challenge.codeHash = null;
    challenge.verificationTokenHash = hashVerificationValue(verificationToken);
    challenge.verifiedAt = new Date();
    challenge.expiresAt = new Date(Date.now() + VERIFIED_EMAIL_LIFETIME_MS);
    await challenge.save();
    return res.status(200).json({ message: "Email verified", verificationToken });
}

async function registerUser(req, res) {
    const { username, password, role = "user", emailVerificationToken } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (typeof username !== "string" || !username.trim() ||
        !validEmail(email) || typeof emailVerificationToken !== "string" ||
        typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Verify your email, choose a username, and enter a password of at least 8 characters" });
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

    const verifiedChallenge = await emailVerificationModel.findOneAndDelete({
        email,
        verificationTokenHash: hashVerificationValue(emailVerificationToken),
        verifiedAt: { $gte: new Date(Date.now() - VERIFIED_EMAIL_LIFETIME_MS) },
        expiresAt: { $gt: new Date() },
    });
    if (!verifiedChallenge) return res.status(403).json({ message: "Verify your email before creating an account" });

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

module.exports = { registerUser, loginUser, googleLogin, sendEmailOtp, verifyEmailOtp, getCurrentUser, logoutUser };
