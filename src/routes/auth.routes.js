const express = require("express")
const authController = require("../controllers/auth.controller")
const { authenticate } = require("../middlewares/auth.middleware")

const router = express.Router();


router.post('/register',authController.registerUser)
router.post('/login',authController.loginUser)
router.get('/google/config',(req,res)=>res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null }))
router.post('/google',authController.googleLogin)
router.get('/me',authenticate,authController.getCurrentUser)
router.post('/logout',authController.logoutUser)


module.exports = router;
