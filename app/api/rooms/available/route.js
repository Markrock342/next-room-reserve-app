import { prisma } from "@/lib/prisma";
import { badRequest, handle, json } from "@/lib/http";
import { overlapWhere } from "@/lib/booking";
import { parseDate, positiveInt } from "@/lib/validate";

// 7. GET /api/rooms/available?startTime=&endTime=&attendeeCount= — ค้นหาห้องว่าง
export const GET = handle(async (request) => {
  const params = request.nextUrl.searchParams;
  if (!params.get("startTime") || !params.get("endTime")) throw badRequest("ต้องส่ง startTime และ endTime");

  const startTime = parseDate(params.get("startTime"), "startTime");
  const endTime = parseDate(params.get("endTime"), "endTime");
  if (startTime >= endTime) throw badRequest("startTime ต้องน้อยกว่า endTime");

  const attendeeText = params.get("attendeeCount");
  const attendeeCount = attendeeText ? positiveInt(attendeeText, "attendeeCount") : null;

  const rooms = await prisma.room.findMany({
    where: {
      ...(attendeeCount ? { capacity: { gte: attendeeCount } } : {}),
      bookings: { none: overlapWhere(startTime, endTime) },
    },
    orderBy: [{ capacity: "asc" }, { id: "asc" }],
  });
  return json(rooms);
});
