const mongoose = require("mongoose");

let connectionPromise;

// Reuse the connection while a serverless function instance stays warm.
mongoose.connection.on("disconnected", () => {
    connectionPromise = undefined;
});

async function connectDB() {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not configured");
    }

    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.MONGO_URI)
            .then((connection) => {
                console.log("Database connected successfully");
                return connection;
            })
            .catch((error) => {
                connectionPromise = undefined;
                throw error;
            });
    }

    return connectionPromise;
}

module.exports = connectDB;
