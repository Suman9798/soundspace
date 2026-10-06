const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ message: "Authentication required" });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired session" });
    }
}

function requireRole(role) {
    return [authenticate, (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ message: "You do not have permission to access this resource" });
        }
        return next();
    }];
}

module.exports = {
    authenticate,
    authArtist: requireRole("artist"),
    authUser: requireRole("user"),
};
