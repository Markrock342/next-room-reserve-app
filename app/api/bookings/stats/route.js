import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { hours } from "@/lib/booking";
import { optionalRange, parseId } from "@/lib/validate";

const round2 = (n) => Math.round(n * 100) / 100;

// 14. GET /api/bookings/stats?from=&to=&roomId= — สรุปการจองแยกตามห้อง
//     นับการจองที่เวลาเริ่มอยู่ในช่วง [from, to) ต้องส่งทั้งคู่ · ชั่วโมงรวมนับเต็มระยะเวลาของแต่ละรายการ
export const GET = handle(async (request) => {
  const params = request.nextUrl.searchParams;
  const { from, to } = optionalRange(params, true);
  const roomId = params.get("roomId") ? parseId(params.get("roomId"), "roomId") : null;

  const bookings = await prisma.booking.findMany({
    where: { startTime: { gte: from, lt: to }, ...(roomId ? { roomId } : {}) },
    select: {
      startTime: true,
      endTime: true,
      room: { select: { id: true, roomCode: true, roomName: true } },
    },
  });

  const byRoom = new Map();
  for (const booking of bookings) {
    const key = booking.room.id;
    const row = byRoom.get(key) ?? {
      roomId: booking.room.id,
      roomCode: booking.room.roomCode,
      roomName: booking.room.roomName,
      bookingCount: 0,
      totalHours: 0,
    };
    row.bookingCount += 1;
    row.totalHours += hours(booking);
    byRoom.set(key, row);
  }

  const rooms = [...byRoom.values()]
    .map((row) => ({ ...row, totalHours: round2(row.totalHours) }))
    .sort((a, b) => a.roomId - b.roomId);

  return json({
    from,
    to,
    roomId,
    totalBookings: bookings.length,
    totalHours: round2(bookings.reduce((sum, b) => sum + hours(b), 0)),
    rooms,
  });
});
