import { prisma } from "@/lib/prisma";
import { badRequest, handle, json } from "@/lib/http";
import { findRoomOrThrow } from "@/lib/booking";
import { parseDate, parseId } from "@/lib/validate";

// อ่านค่าจาก query ก่อน ถ้าไม่มีลองอ่านจาก JSON body (DELETE บางเครื่องมือส่ง body)
async function readInput(request) {
  const params = request.nextUrl.searchParams;
  let body = {};
  if (!params.get("roomId") || !params.get("before")) {
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch {
      throw badRequest("รูปแบบ JSON ไม่ถูกต้อง");
    }
  }
  return {
    roomId: params.get("roomId") ?? body?.roomId,
    before: params.get("before") ?? body?.before,
  };
}

// 15. DELETE /api/bookings/expired?roomId=&before= — ลบประวัติการจองหลายรายการ
//     เฉพาะรายการในห้องนั้นที่ endTime < before และ before ต้องไม่เกินเวลาปัจจุบัน
export const DELETE = handle(async (request) => {
  const input = await readInput(request);
  if (input.roomId === undefined || input.roomId === null || input.roomId === "" || !input.before) {
    throw badRequest("ต้องส่ง roomId และ before");
  }
  const roomId = parseId(input.roomId, "roomId");
  const before = parseDate(input.before, "before");
  if (before > new Date()) throw badRequest("before ต้องไม่เกินเวลาปัจจุบัน");

  await findRoomOrThrow(prisma, roomId);
  const result = await prisma.booking.deleteMany({ where: { roomId, endTime: { lt: before } } });

  return json({ roomId, before, deletedCount: result.count });
});
