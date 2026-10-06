const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    setTokenCookie(res, createToken(user));
    return res.status(200).json({ message: "User logged in successfully", user: publicUser(user) });
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

module.exports = { registerUser, loginUser, getCurrentUser, logoutUser };
