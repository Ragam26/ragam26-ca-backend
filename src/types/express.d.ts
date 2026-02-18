import { Role } from '../generated/prisma/enums.js';

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
  }
}

export {};