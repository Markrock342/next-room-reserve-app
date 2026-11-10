import { prisma } from "@/lib/prisma";
import { badRequest, handle, json } from "@/lib/http";
import { withRoom } from "@/lib/booking";
import { parseId } from "@/lib/validate";

const DAY_MS = 24 * 60 * 60 * 1000;

// 13. GET /api/bookings/upcoming?days=&roomId= — การจองที่เริ่มตั้งแต่ตอนนี้ถึงอีก days วัน
//     days ค่าเริ่มต้น 7 รับจำนวนเต็ม 1–30 · เรียงรายการที่เริ่มก่อนขึ้นก่อน
export const GET = handle(async (request) => {
  const params = request.nextUrl.searchParams;

  let days = 7;
  const daysText = params.get("days");
  if (daysText !== null && daysText !== "") {
    if (!/^\d+$/.test(daysText.trim())) throw badRequest("days ต้องเป็นจำนวนเต็ม 1–30");
    days = Number(daysText);
    if (days < 1 || days > 30) throw badRequest("days ต้องเป็นจำนวนเต็ม 1–30");
  }

  const roomId = params.get("roomId") ? parseId(params.get("roomId"), "roomId") : null;
  const now = new Date();
  const until = new Date(now.getTime() + days * DAY_MS);

  const bookings = await prisma.booking.findMany({
    where: { startTime: { gte: now, lte: until }, ...(roomId ? { roomId } : {}) },
    include: withRoom,
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });

  return json({ days, from: now, to: until, count: bookings.length, data: bookings });
});
