import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import authenticator from "../middlewares/auth.middleware.js";
import '../config/passport.config.js';
import * as z from 'zod';

const adminRouter = Router();
const prisma = new PrismaClient();

const getCASchema = z.object({
    verified: z.boolean().optional().default(false),
})

type getCAQuery = z.infer<typeof getCASchema>;

adminRouter.get(
    "/get-ca",
    authenticator,
    async (req: Request, res: Response) => {

        if(req.user.role !== "admin") {
            return res.status(403).send('Forbidden');
        }

        const queryParsed: getCAQuery = getCASchema.parse(req.query);

        try {
            const cas = await prisma.user.findMany({
                where: {
                    role: "CA",
                    isProfileComplete: queryParsed.verified
                },
                select: {
                    createdAt: false,
                    updatedAt: false
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