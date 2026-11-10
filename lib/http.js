import { Prisma } from "@prisma/client";
import { unstable_rethrow } from "next/navigation";

// ข้อผิดพลาดที่รู้สถานะ HTTP แล้ว เช่น 400 ข้อมูลผิด, 404 ไม่พบ, 409 ขัดแย้งกับข้อมูลเดิม
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, details);
export const notFound = (message) => new ApiError(404, message);
export const conflict = (message, details) => new ApiError(409, message, details);

export function json(data, status = 200) {
  return Response.json(data, { status });
}

// อ่าน JSON body ถ้าผิดรูปแบบหรือไม่ใช่ object ตอบ 400
export async function readJson(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw badRequest("รูปแบบ JSON ไม่ถูกต้อง");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("ข้อมูลต้องเป็น JSON object");
  }
  return body;
}

// ห่อ handler ทุกตัว: แปลงข้อผิดพลาดเป็นคำตอบ JSON ที่สถานะถูกต้อง
export function handle(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (error) {
      // สัญญาณภายในของ Next.js (เช่น หยุด prerender เมื่ออ่าน searchParams) ต้องโยนต่อ ไม่ใช่ข้อผิดพลาดจริง
      unstable_rethrow(error);
      if (error instanceof ApiError) {
        return json({ message: error.message, ...(error.details ? { details: error.details } : {}) }, error.status);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return json({ message: "ข้อมูลซ้ำกับที่มีอยู่แล้ว" }, 409);
        if (error.code === "P2025") return json({ message: "ไม่พบข้อมูล" }, 404);
        if (error.code === "P2003") return json({ message: "ข้อมูลยังถูกอ้างอิงอยู่" }, 409);
      }
      console.error(error);
      return json({ message: "เกิดข้อผิดพลาดในระบบ" }, 500);
    }
  };
}
