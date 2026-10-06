const express = require("express");
const multer = require("multer");
const musicController = require("../controllers/music.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, callback) => {
        if (!file.mimetype || !file.mimetype.startsWith("audio/")) {
            return callback(new Error("Only audio files are allowed"));
        }
        return callback(null, true);
    },
});

const router = express.Router();

router.post("/upload", ...authMiddleware.authArtist, upload.single("music"), musicController.createMusic);
// Keep the original misspelled path available for any client already using it.
router.post("/uplaod", ...authMiddleware.authArtist, upload.single("music"), musicController.createMusic);
router.post("/album", authMiddleware.authenticate, musicController.createAlbum);
// Artists and listeners can both browse and play the shared catalog.
router.get("/", authMiddleware.authenticate, musicController.getAllMusics);
router.get("/albums", authMiddleware.authenticate, musicController.getAllAlbums);
router.get("/albums/:albumId", authMiddleware.authenticate, musicController.getAlbumById);

module.exports = router;
