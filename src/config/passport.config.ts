import passport, { Profile } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { PrismaClient } from "../generated/client.js";
import 'dotenv/config';

const prisma = new PrismaClient();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    },
    async (accessToken: String, refreshToken: String, profile: Profile, done) => {
      try {
        const email = profile.emails?.[0].value;
        if (!email) {
          return done(new Error('No email found'), undefined);
        }

        let user: Express.User = await prisma.user.findUnique({
          where: { email },
          select: {
            userId: true,
            email: true,
            name: true,
            collegeName: true,
            phoneNo: true,
            yearOfStudy: true,
            district: true,
            role: true,
            isProfileComplete: true,
          }
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              name: profile.displayName,
            },
            select: {
              userId: true,
              email: true,
              name: true,
              collegeName: true,
              phoneNo: true,
              yearOfStudy: true,
              district: true,
              role: true,
              isProfileComplete: true,
            }
          })
        }

        console.debug('Authenticated user:', user);
        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
    },
    async (jwtPayload, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email: jwtPayload.email },
          select: {
            userId: true,
            email: true,
            name: true,
            collegeName: true,
            phoneNo: true,
            yearOfStudy: true,
            district: true,
            role: true,
            isProfileComplete: true,
          }
        });

        if (!user) {
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);