import { Request, Response, NextFunction } from "express";
import passport from "passport";
import '../config/passport.config.js';

const authenticator = (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('jwt', { session: false }, (err: any, user: any, info: any) => {
        if (err) {
            console.error('Auth middleware error:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.user = user;
        next();
    })(req, res, next);
};

export default authenticator;