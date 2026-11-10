import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { findRoomOrThrow, overlapWhere } from "@/lib/booking";
import { optionalRange, parseId } from "@/lib/validate";

// 6. GET /api/rooms/[id]/bookings?from=&to= — การจองของห้อง
//    ส่ง from/to เพื่อหารายการที่เวลาใช้งานทับซ้อนกับช่วงนั้น (ต้องส่งทั้งคู่หรือไม่ส่งเลย)
export const GET = handle(async (request, { params }) => {
  const id = parseId((await params).id);
  const range = optionalRange(request.nextUrl.searchParams);
  await findRoomOrThrow(prisma, id);

  const bookings = await prisma.booking.findMany({
    where: { roomId: id, ...(range ? overlapWhere(range.from, range.to) : {}) },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });
  return json(bookings);
});
