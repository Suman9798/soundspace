const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({

    username: {
        type: String,
        required: true,
        unique:true,
        trim: true,

    },

    email: {
        type: String,
        required: true,
        unique:true,
        trim: true,
        lowercase: true,
    },

    googleId: { type: String, unique: true, sparse: true },

    password:{
        type: String,
        required: false,
    },

    role: {
        type:String,
        enum : ['user','artist'],
        default:'user'
    }
}, { timestamps: true });

const userModel = mongoose.model("user",userSchema)

module.exports = userModel;
