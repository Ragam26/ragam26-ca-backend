import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import authenticator from "../middlewares/auth.middleware.js";
import '../config/passport.config.js';
import * as z from 'zod';
import fileUpload, { FileArray, UploadedFile } from "express-fileupload";
import { processReferralCSVs } from "../services/referral.service.js";

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

    if(req.user.role != "admin" && req.user.phoneNo != req.params.phoneNo ) {
        return res.status(403).send('Forbidden');
    }

    try {
        const referrals = await prisma.referral.findMany({
            where: {
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
adminRouter.post("/upload-csv", fileUpload(), authenticator, async (req: Request, res: Response) => {
    if (req.user.role !== "admin") {
        return res.status(403).send('Forbidden');
    }

    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded');
    }

    const files = req.files as FileArray;
    let fileList: UploadedFile[] = [];

    for (const key in files) {
        const item = files[key];
        if (Array.isArray(item)) {
            fileList.push(...item);
        } else {
            fileList.push(item);
        }
    }

    try {
        await processReferralCSVs(fileList);
    } catch (error) {
        console.error('Error processing CSVs:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' });
    }

    res.json({
        message: fileList.length > 1 ? "Files uploaded successfully" : "File uploaded successfully",
        filenames: fileList.map((file) => file.name)
    });
});

//------



export default adminRouter;