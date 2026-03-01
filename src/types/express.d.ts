import { Role } from '../generated/prisma/enums.ts';

declare global {
  namespace Express {
    interface User {
      userId: number;
      email: string;
      name: string | null;
      collegeName: string | null;
      phoneNo: string | null;
      yearOfStudy: number | null;
      district: string | null;
      role: Role;
      isProfileComplete: boolean;
    }
    interface Referral {
      referralId: number;
      referralCode: string;
      ragamId: string | null;
      eventName: string;
      isPaid: boolean;
      user: User | null;
    }
  }
}

export { };