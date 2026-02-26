import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import authenticator from "../middlewares/auth.middleware.js";
import '../config/passport.config.js';
import * as z from 'zod';

const adminRouter = Router();
const prisma = new PrismaClient();

const getCASchema = z.object({
    verified: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .default(false),
});

type getCAQuery = z.infer<typeof getCASchema>;

adminRouter.post(
    "/get-ca",
    authenticator,
    async (req: Request, res: Response) => {

        if(req.user.role !== "admin") {
            return res.status(403).send('Forbidden');
        }

        
        try {
            const queryParsed: getCAQuery = getCASchema.parse(req.query);
            const cas = await prisma.user.findMany({
                where: {
                    role: "CA",
                    ...(queryParsed.verified ? { verified: true } : {}),
                },
                select: {
                    userId: true,
                    name: true,
                    email: true,
                    phoneNo: true,
                    collegeName: true,
                    yearOfStudy: true,
                    district: true,
                    isProfileComplete: true,
                    gPayNumber: true,
                    createdAt: true,
                }
            })
            res.json(cas);
        } catch (error) {
            console.error('Error fetching CAs:', error);
            res.status(500).send('Internal Server Error');
        }
    }
);

export default adminRouter;