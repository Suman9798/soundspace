const mongoose = require("mongoose");

const emailVerificationSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    codeHash: { type: String, default: null },
    verificationTokenHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date, default: null },
    sentAt: { type: Date, required: true },
    sendHistory: { type: [Date], default: [] },
    attempts: { type: Number, default: 0 },
}, { timestamps: true });

emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("email_verification", emailVerificationSchema);
