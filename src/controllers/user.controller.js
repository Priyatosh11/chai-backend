import { asyncHandler } from "../utils/asynchandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"


const generateAccessAndRefereshToken = async (userId) => {
    try{
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        //saving refreshToken in database
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        //return accessandrefershToken to user
        return {accessToken, refreshToken}
    } catch(error){
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}

const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res
    const { fullName, email, username , password } = req.body
    console.log("email: ", email)

    if(
        [fullName, email, username , password].some((field) => 
        field?.trim() === "")
    ){
        throw new ApiError("All fields are required", 400)
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError("User already exists", 409)
    }

    //console.log(req.files)

    // upload images to cloudinary

    const avatarLocalPath = req.files?.avatar[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError("Avatar is required", 400)
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }
    //user created
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    //removing password and refreshtoken from response
    const createUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createUser){
        throw new ApiError("User not found", 500)
    }
    
    return res.status(201).json(
        new ApiResponse(200, createUser, "User registered successfully")
    )
})


const loginUser = asyncHandler( async (req, res) => {
    // req body -> data
    // username or email
    // find user
    // password check
    // access and refresh token
    // send cookie
    const { email, username, password } = req.body

    if(!username && !email){
        throw new ApiError("Username or email is required", 400)
    }
    //find user
    const user = await User.findOne({
        $or: [{ username }, { email }]
        })

        if(!user){
            throw new ApiError("User not found", 404)
        }
        //password check
        const isPasswordValid = await user.isPasswordCorrect(password)
        if(!isPasswordValid){
            throw new ApiError("Invalid user credentials", 401)
            }
            //access and refresh token
          const {accessToken, refreshToken} = await generateAccessAndRefereshToken(user._id)
          const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

           //modifyble on server
          const options = {
            httpOnly: true, 
            secure: true
          }

          return res.status(200)
          .cookie("accessToken", accessToken, options)
          .cookie("refreshToken", refreshToken, options)
          .json(new ApiResponse(200, {
            user: loggedInUser, accessToken, refreshToken
          }, "User logged in successfully"))

})

const logoutUser = asyncHandler(async (req, res) => {
   await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { refreshToken: undefined }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true, 
        secure: true
      }
    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))        
})

const refreshAccessToken = asyncHandler(async (req, res) => {
   const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

   if(!incomingRefreshToken){
    throw new ApiError("unauthorized request", 401)
   }

   try {
    const decodedToken = jwt.verify(
     incomingRefreshToken,
     process.env.REFRESH_TOKEN_SECRET,
    )
    const user = await User.findById(decodedToken?._id)
    if(!user){
     throw new ApiError("Invalid refresh token", 401)
    }
    if(incomingRefreshToken !== user?.refreshToken){
     throw new ApiError("Refresh token used", 401)
    }
 
    const options = {
     httpOnly: true,
     secure: true
    }
 
    const {accessToken, newrefreshToken} = await generateAccessAndRefereshToken(user._id)
    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newrefreshToken, options)
    .json(new ApiResponse(200, {accessToken, refreshToken: newrefreshToken}, "Access Token refreshed"))
   } catch (error) {
      throw new ApiError(401, error?.message || "Invalid refresh token")
   }
})
export {registerUser, loginUser, logoutUser, refreshAccessToken}