import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/client.js";
import authenticator from "../middlewares/auth.middleware.js";
import '../config/passport.config.js';
import * as z from 'zod';
import path from "path";

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

//CA-OVERVIEW
adminRouter.post(
    "/get-ca",
    authenticator,
    async (req: Request, res: Response) => {

        if (req.user.role !== "admin") {
            return res.status(403).send('Forbidden');
        }


        try {
            const queryParsed: getCAQuery = getCASchema.parse(req.query);
            const cas = await prisma.user.findMany({
                where: {
                    role: "CA",
                    ...(queryParsed.verified ? { isProfileComplete: true } : {}),
                }
            })
            res.json(cas);
        } catch (error) {
            console.error('Error fetching CAs:', error);
            res.status(500).send('Internal Server Error');
        }
    }
);
//------

//EVENT-REFERRALS
adminRouter.get("/get-referrals", authenticator, async (req: Request, res: Response) => {
    if (req.user.role !== "admin") {
        return res.status(403).send('Forbidden');
    }

    try {
        const usersWithReferrals = await prisma.user.findMany({
            where: {
                referrals: {
                    some: {
                        isPaid: false
                    }
                }
            }
        });
        res.json(usersWithReferrals);
    } catch (error) {
        console.error('Error fetching referrals:', error);
        res.status(500).send('Internal Server Error');
    }
});

adminRouter.get("/get-referrals/:phoneNo", authenticator, async (req: Request, res: Response) => {
    if (req.user.role !== "admin") {
        return res.status(403).send('Forbidden');
    }

    try {
        const referrals = await prisma.referral.findMany({
            where: {
                isPaid: false,
                referralCode: req.params.phoneNo as string,
            },
            include: {
                user: true,
            }
        });
        res.json(referrals);
    } catch (error) {
        console.error('Error fetching referrals:', error);
        res.status(500).send('Internal Server Error');
    }
});

adminRouter.post("/update-referral", authenticator, async (req: Request, res: Response) => {
    if (req.user.role !== "admin") {
        return res.status(403).send('Forbidden');
    }

    try {
        const { referral_id } = req.body;
        const referral = await prisma.referral.update({
            where: {
                referralId: referral_id,
            },
            data: {
                isPaid: true,
            }
        });
        res.json(referral);
    } catch (error) {
        console.error('Error updating referral:', error);
        res.status(500).send('Internal Server Error');
    }
});

//------

//CSV-PROCESSING
adminRouter.post("/process-csvs", authenticator, async (req: Request, res: Response) => {
    if (req.user.role !== "admin") {
        return res.status(403).send('Forbidden');
    }
    try {
        const { processReferralCSVs } = await import("../services/referral.service.js");
        const csvDir = path.join(process.cwd(), 'data', 'csv');
        await processReferralCSVs(csvDir);
        res.json({ message: "CSV processing completed successfully" });
    } catch (error) {
        console.error('Error processing CSVs:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' });
    }
});

//------



export default adminRouter;