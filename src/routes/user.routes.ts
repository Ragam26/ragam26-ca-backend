import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import { PrismaClient } from "../generated/prisma/client.js";
import authenticator from "../middlewares/auth.middleware.js";
import '../config/passport.config.js';
import * as z from "zod";

const userRouter = Router();
const prisma = new PrismaClient();

userRouter.get(
    "/profile",
    authenticator,
    async (req: Request, res: Response) => {
        const user = req.user;

        return res.json(user);
    }
)

const ProfileUpdateSchema = z.object({
    name: z.string().optional(),
    phoneNo: z.string().regex(/^\d{10}$/, "Phone number must be 10 digits").optional(),
    collegeName: z.string().optional(),
    yearOfStudy: z.number().int().min(1).max(6).optional(),
    district: z.string().optional()
})

type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

userRouter.post(
    "/profile",
    authenticator,
    async (req: Request, res: Response) => {
        try{
            const bodyParsed: ProfileUpdateInput = ProfileUpdateSchema.parse(req.body);
            
            let updatedUser = await prisma.user.update({
                where: { email: req.user.email },
                data: {
                    name: bodyParsed.name ?? req.user.name,
                    phoneNo: bodyParsed.phoneNo,
                    collegeName: bodyParsed.collegeName,
                    yearOfStudy: bodyParsed.yearOfStudy,
                    district: bodyParsed.district,
                }
            })
            console.debug('User profile updated:', updatedUser.name);

            if(updatedUser.name && updatedUser.phoneNo && updatedUser.collegeName && updatedUser.yearOfStudy && updatedUser.district) {
                updatedUser = await prisma.user.update({
                    where: { email: req.user.email },
                    data: {
                        isProfileComplete: true,
                    }
                })
                console.debug('Profile marked as complete for user:', updatedUser.name);
            };

            return res.status(200).json(updatedUser);
        } catch(error) {
            if (error instanceof z.ZodError) {
                console.error('Validation error:', error);
                return res.status(400).json({ message: "Validation Error", errors: error });
            }
            console.error('Error updating profile:', error);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    }
)

export default userRouter;