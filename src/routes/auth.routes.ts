import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import { PrismaClient } from "../generated/prisma/client.js";
import authenticator from "../middlewares/auth.middleware.js";
import '../config/passport.config.js';

const authRouter = Router();
const prisma = new PrismaClient();

authRouter.post(
  "/login",
  passport.authenticate('google', { scope: ["profile", "email"] })
);

authRouter.get(
    "/google/callback",
    (req: Request, res: Response, next: NextFunction) => {
        passport.authenticate('google', { session: false }, async (err, user: Express.User) => {
            if (err || !user) {
                console.log(err)
                return res.redirect(`${process.env.FRONTEND_URL}/api/auth/login-failure`);
            }

            const payload:Express.User = user;

            console.log('Authenticated user payload:', payload);

            const authtoken = jwt.sign(
                {
                    name: payload.name,
                    email: payload.email,
                    role: payload.role,
                    isProfileComplete: payload.isProfileComplete,
                },
                process.env.JWT_SECRET!,
                { expiresIn: '1h' }
            );

            const refreshToken = jwt.sign(
                { userId: payload.userId },
                process.env.REFRESH_TOKEN_SECRET!,
                { expiresIn: '14d' }
            )

            try{
                const createRefreshToken = await prisma.session.create({
                    data: {
                        userId: payload.userId,
                        refreshToken: refreshToken,
                        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
                    }
                })
            } catch (error) {
                console.error('Error creating refresh token session:', error);
                return res.status(500).send('Internal Server Error');
            }

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
            });

            return res.redirect(`${process.env.FRONTEND_URL}/api/auth/login-success?token=${authtoken}`);
        })(req, res, next);
    }
)

authRouter.get("/login-success", (req: Request, res: Response) => {
    // Test only route
    res.json({
        message: "Login Successful",
        token: req.query.token
    });
});

authRouter.get("/login-failure", (req, res) => {
    // Test only route
    res.send("Login Failed");
});

authRouter.post("/refresh", (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).send("Refresh Token Not Found");
    }

    jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET!,
        async (err: any, decoded: any) => {
            if (err) {
                return res.status(403).send("Invalid Refresh Token");
            }

            const session = await prisma.session.findFirst({
                where: {
                    userId: decoded.userId,
                    refreshToken: refreshToken
                },
                include: {
                    user: {
                        select: {
                            userId: true,
                            email: true,
                            name: true,
                            collegeName: true,
                            phoneNo: true,
                            role: true,
                            isProfileComplete: true,
                        }
                    }
                }
            });

            if (!session) {
                return res.status(403).send("Session Not Found");
            }

            const newAuthToken = jwt.sign(
                {
                    name: session.user.name,
                    email: session.user.email,
                    role: session.user.role,
                    isProfileComplete: session.user.isProfileComplete,
                },
                process.env.JWT_SECRET!,
                { expiresIn: '1h' }
            );

            res.json({
                token: newAuthToken
            });

            console.debug('Refreshed auth token for user:', session.user.name);
        }
    );

    return res.status(200);
});

authRouter.post("/logout", async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(400).send("Refresh Token Not Found");
    }

    try {
        await prisma.session.deleteMany({
            where: {
                refreshToken: refreshToken
            }
        });

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });

        console.debug('User logged out, refresh token invalidated');

        return res.send("Logged Out Successfully");
    } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).send("Internal Server Error");
    }
});

authRouter.post("/verify", authenticator, (req: Request, res: Response) => {
    res.json({
        message: "Verification Successful",
        user: {
            name: req.user?.name,
            email: req.user?.email,
            role: req.user?.role,
            isProfileComplete: req.user?.isProfileComplete,
        }
    });
});

export default authRouter;