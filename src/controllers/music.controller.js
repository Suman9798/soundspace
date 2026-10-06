const mongoose = require("mongoose");
const musicModel = require("../models/music.model");
const albumModel = require("../models/album.model");
const { uploadFile } = require("../services/storage.service");

async function createMusic(req, res) {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
        return res.status(400).json({ message: "A music title is required" });
    }
    if (!req.file) {
        return res.status(400).json({ message: "An audio file is required" });
    }

    let result;
    try {
        result = await uploadFile(req.file.buffer.toString("base64"), req.file.originalname);
    } catch (error) {
        console.error("ImageKit audio upload failed:", error);
        return res.status(502).json({
            message: "The audio storage service rejected the upload. Check the server terminal for the ImageKit error.",
        });
    }
    if (!result?.url) {
        throw new Error("The audio file could not be uploaded");
    }
    const music = await musicModel.create({ uri: result.url, title, artist: req.user.id });
    return res.status(201).json({
        message: "Music created successfully",
        music: { id: music._id, uri: music.uri, title: music.title, artist: music.artist },
    });
}

async function createAlbum(req, res) {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const musics = req.body?.musics ?? [];
    if (!title) {
        return res.status(400).json({ message: "An album title is required" });
    }
    if (!Array.isArray(musics) || musics.some((id) => !mongoose.isValidObjectId(id))) {
        return res.status(400).json({ message: "Musics must be an array of valid music IDs" });
    }

    const uniqueMusicIds = [...new Set(musics.map(String))];
    const trackFilter = { _id: { $in: uniqueMusicIds } };
    if (req.user.role === "artist") {
        trackFilter.artist = req.user.id;
    }
    const selectedTracks = await musicModel.find(trackFilter).select("_id");
    if (selectedTracks.length !== uniqueMusicIds.length) {
        return res.status(400).json({
            message: req.user.role === "artist"
                ? "All album tracks must exist and belong to you"
                : "One or more selected tracks could not be found",
        });
    }

    const album = await albumModel.create({ title, artist: req.user.id, musics: uniqueMusicIds });
    return res.status(201).json({
        message: "Album created successfully",
        album: { id: album._id, title: album.title, artist: album.artist, musics: album.musics },
    });
}

async function getAllMusics(req, res) {
    const filter = req.user.role === "artist" ? { artist: req.user.id } : {};
    const musics = await musicModel.find(filter).sort({ createdAt: -1 }).populate("artist", "username");
    return res.status(200).json({ message: "Music fetched successfully", musics });
}

async function getAllAlbums(req, res) {
    const filter = { artist: req.user.id };
    const albums = await albumModel.find(filter).sort({ createdAt: -1 })
        .populate("artist", "username")
        .populate("musics", "title uri artist");
    return res.status(200).json({ message: "Albums fetched successfully", albums });
}

async function getAlbumById(req, res) {
    const { albumId } = req.params;
    if (!mongoose.isValidObjectId(albumId)) {
        return res.status(400).json({ message: "Invalid album ID" });
    }
    const album = await albumModel.findOne({ _id: albumId, artist: req.user.id })
        .populate("artist", "username")
        .populate("musics", "title uri artist");
    if (!album) {
        return res.status(404).json({ message: "Album not found" });
    }
    return res.status(200).json({ message: "Album fetched successfully", album });
}

module.exports = { createMusic, createAlbum, getAllMusics, getAllAlbums, getAlbumById };
