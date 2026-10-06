const express = require("express")
const authController = require("../controllers/auth.controller")
const { authenticate } = require("../middlewares/auth.middleware")

const router = express.Router();


router.post('/register',authController.registerUser)
router.post('/login',authController.loginUser)
router.get('/me',authenticate,authController.getCurrentUser)
router.post('/logout',authController.logoutUser)


module.exports = router;
