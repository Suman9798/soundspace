const { ImageKit } = require("@imagekit/nodejs")


const ImageKitClient = new ImageKit ( {
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
})

async function uploadFile(file, originalName = "audio") {
    if (!process.env.IMAGEKIT_PRIVATE_KEY) {
        throw new Error("IMAGEKIT_PRIVATE_KEY is not configured");
    }

    const safeBaseName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "audio";

    const result = await ImageKitClient.files.upload({
        file,
        fileName: `${Date.now()}-${safeBaseName}`,
        folder: "test_music/music",
    })
    

    return result;
}

module.exports = { uploadFile }
