require('dotenv').config();

const app = require("./app")
const connectDB = require("./db/db")

const port = Number(process.env.PORT) || 3000;

async function startServer() {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
    }

    await connectDB();
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

startServer().catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exitCode = 1;
});
