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

    password:{
        type: String,
        required: true,
    },

    role: {
        type:String,
        enum : ['user','artist'],
        default:'user'
    }
}, { timestamps: true });

const userModel = mongoose.model("user",userSchema)

module.exports = userModel;
