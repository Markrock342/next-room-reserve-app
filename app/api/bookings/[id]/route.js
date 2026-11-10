import { prisma } from "@/lib/prisma";
import { badRequest, conflict, handle, json, readJson } from "@/lib/http";
import {
  assertBookingRules,
  assertNoOverlap,
  findBookingOrThrow,
  findRoomOrThrow,
  bookingTx,
  lockRoom,
  parseBookingFields,
  withRoom,
} from "@/lib/booking";
import { parseId } from "@/lib/validate";

function assertNotStarted(booking, action) {
  if (new Date(booking.startTime) <= new Date()) {
    throw conflict(`${action}ไม่ได้ การจองนี้เริ่มใช้งานไปแล้ว`);
  }
}

// 10. GET /api/bookings/[id] — รายละเอียดการจองพร้อมข้อมูลห้อง
export const GET = handle(async (_request, { params }) => {
  const id = parseId((await params).id);
  const booking = await findBookingOrThrow(prisma, id, withRoom);
  return json(booking);
});

// 11. PATCH /api/bookings/[id] — แก้ไขบางฟิลด์ รวมถึงย้ายห้องหรือเปลี่ยนเวลา
//     เฉพาะรายการที่ยังไม่เริ่ม · ตรวจข้อมูลหลังรวมค่าใหม่กับค่าเดิม · ตรวจทับซ้อนโดยไม่นับตัวเอง
export const PATCH = handle(async (request, { params }) => {
  const id = parseId((await params).id);
  const body = await readJson(request);
  const changes = parseBookingFields(body);
  if (!Object.keys(changes).length) {
    throw badRequest("ต้องส่งอย่างน้อยหนึ่งฟิลด์: roomId, bookerName, purpose, startTime, endTime, attendeeCount");
  }

  const booking = await prisma.$transaction(async (tx) => {
    const current = await findBookingOrThrow(tx, id);
    assertNotStarted(current, "แก้ไข");

    const merged = {
      roomId: changes.roomId ?? current.roomId,
      startTime: changes.startTime ?? current.startTime,
      endTime: changes.endTime ?? current.endTime,
      attendeeCount: changes.attendeeCount ?? current.attendeeCount,
    };
    await lockRoom(tx, merged.roomId);
    const room = await findRoomOrThrow(tx, merged.roomId);
    assertBookingRules(merged, room);
    await assertNoOverlap(tx, { ...merged, excludeId: id });

    return tx.booking.update({ where: { id }, data: changes, include: withRoom });
  }, bookingTx);

  return json(booking);
});

// 12. DELETE /api/bookings/[id] — ยกเลิกการจอง เฉพาะรายการที่ยังไม่เริ่ม
export const DELETE = handle(async (_request, { params }) => {
  const id = parseId((await params).id);
  const booking = await findBookingOrThrow(prisma, id);
  assertNotStarted(booking, "ยกเลิก");
  await prisma.booking.delete({ where: { id } });
  return json({ message: "ยกเลิกการจองแล้ว", booking });
});
