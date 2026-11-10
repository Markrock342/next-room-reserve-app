import { PrismaClient } from "@prisma/client";

// ใช้ PrismaClient ตัวเดียวทั้งแอป (ตอน dev ไฟล์ถูกโหลดซ้ำบ่อย จะได้ไม่เปิด connection เพิ่มเรื่อย ๆ)
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
