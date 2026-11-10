import { prisma } from "@/lib/prisma";
import { badRequest, conflict, handle, json, readJson } from "@/lib/http";
import { findRoomOrThrow } from "@/lib/booking";
import { hasValue, parseId, positiveInt, requiredText } from "@/lib/validate";

// 3. GET /api/rooms/[id] — รายละเอียดห้อง
export const GET = handle(async (_request, { params }) => {
  const id = parseId((await params).id);
  const room = await findRoomOrThrow(prisma, id);
  return json(room);
});

// 4. PATCH /api/rooms/[id] — แก้ไขบางฟิลด์ (ฟิลด์ที่ไม่ส่งคงค่าเดิม)
export const PATCH = handle(async (request, { params }) => {
  const id = parseId((await params).id);
  const body = await readJson(request);

  const data = {};
  if (hasValue(body.roomCode)) data.roomCode = requiredText(body.roomCode, "roomCode", 50);
  if (hasValue(body.roomName)) data.roomName = requiredText(body.roomName, "roomName");
  if (hasValue(body.capacity)) data.capacity = positiveInt(body.capacity, "capacity");
  if (hasValue(body.location)) data.location = requiredText(body.location, "location");
  for (const key of ["roomCode", "roomName", "capacity", "location"]) {
    if (body[key] === null) throw badRequest(`${key} ห้ามเป็น null`);
  }
  if (!Object.keys(data).length) {
    throw badRequest("ต้องส่งอย่างน้อยหนึ่งฟิลด์: roomCode, roomName, capacity, location");
  }

  const room = await prisma.$transaction(async (tx) => {
    const current = await findRoomOrThrow(tx, id);

    if (data.roomCode && data.roomCode !== current.roomCode) {
      const duplicate = await tx.room.findUnique({ where: { roomCode: data.roomCode } });
      if (duplicate) throw conflict(`รหัสห้อง ${data.roomCode} มีอยู่แล้ว`);
    }

    // ห้ามลดความจุจนต่ำกว่าจำนวนผู้เข้าร่วมของการจองที่ยังไม่สิ้นสุด
    if (data.capacity !== undefined && data.capacity < current.capacity) {
      const largest = await tx.booking.findFirst({
        where: { roomId: id, endTime: { gt: new Date() }, attendeeCount: { gt: data.capacity } },
        orderBy: { attendeeCount: "desc" },
        select: { id: true, attendeeCount: true, startTime: true },
      });
      if (largest) {
        throw conflict(
          `ลดความจุเหลือ ${data.capacity} ไม่ได้ มีการจองที่ยังไม่สิ้นสุดซึ่งมีผู้เข้าร่วม ${largest.attendeeCount} คน`,
          { booking: largest },
        );
      }
    }

    return tx.room.update({ where: { id }, data });
  });

  return json(room);
});

// 5. DELETE /api/rooms/[id] — ลบได้เฉพาะห้องที่ไม่มีการจองเลย
export const DELETE = handle(async (_request, { params }) => {
  const id = parseId((await params).id);
  await findRoomOrThrow(prisma, id);

  const bookingCount = await prisma.booking.count({ where: { roomId: id } });
  if (bookingCount > 0) throw conflict(`ลบไม่ได้ ห้องนี้มีการจอง ${bookingCount} รายการ`);

  const room = await prisma.room.delete({ where: { id } });
  return json({ message: "ลบห้องแล้ว", room });
});
