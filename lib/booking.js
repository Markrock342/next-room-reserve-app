import { Prisma } from "@prisma/client";
import { badRequest, conflict, notFound } from "./http";
import { hasValue, parseDate, parseId, positiveInt, requiredText, text } from "./validate";

// ข้อมูลห้องที่แนบไปกับการจอง
export const roomSummary = {
  select: { id: true, roomCode: true, roomName: true, capacity: true, location: true },
};

export const withRoom = { room: roomSummary };

// ช่วงเวลาทับซ้อน: เริ่มก่อนอีกช่วงจบ และจบหลังอีกช่วงเริ่ม (ชนขอบพอดีไม่นับว่าทับ)
export function overlapWhere(start, end) {
  return { startTime: { lt: end }, endTime: { gt: start } };
}

export async function findRoomOrThrow(db, id) {
  const room = await db.room.findUnique({ where: { id } });
  if (!room) throw notFound(`ไม่พบห้อง id ${id}`);
  return room;
}

export async function findBookingOrThrow(db, id, include) {
  const booking = await db.booking.findUnique({ where: { id }, include });
  if (!booking) throw notFound(`ไม่พบการจอง id ${id}`);
  return booking;
}

// ใช้ READ COMMITTED เพื่อให้การเช็กทับซ้อนเห็นการจองที่ transaction อื่นเพิ่ง commit
// (ค่าเริ่มต้นของ MySQL คือ REPEATABLE READ ซึ่งจะอ่านจาก snapshot เก่า)
export const bookingTx = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

// ล็อกแถวของห้องไว้จนจบ transaction กันสองคำขอจองช่วงเวลาเดียวกันพร้อมกัน
export async function lockRoom(tx, roomId) {
  await tx.$queryRaw`SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE`;
}

export async function assertNoOverlap(db, { roomId, startTime, endTime, excludeId }) {
  const clash = await db.booking.findFirst({
    where: { roomId, ...overlapWhere(startTime, endTime), ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { startTime: "asc" },
    select: { id: true, bookerName: true, startTime: true, endTime: true },
  });
  if (clash) throw conflict("ช่วงเวลานี้ห้องถูกจองแล้ว", { conflictWith: clash });
}

// กติกาของการจอง ใช้ทั้งตอนสร้างและตอนแก้ไข (หลังรวมค่าใหม่กับค่าเดิม)
export function assertBookingRules({ startTime, endTime, attendeeCount }, room, now = new Date()) {
  if (startTime <= now) throw badRequest("เวลาเริ่มต้องเป็นเวลาในอนาคต");
  if (startTime >= endTime) throw badRequest("เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด");
  if (attendeeCount > room.capacity) {
    throw badRequest(`จำนวนผู้เข้าร่วม (${attendeeCount}) เกินความจุของห้อง (${room.capacity})`);
  }
}

// แปลงข้อมูลการจองจาก body เฉพาะฟิลด์ที่ส่งมา
export function parseBookingFields(body) {
  const data = {};
  if (hasValue(body.roomId)) data.roomId = parseId(body.roomId, "roomId");
  if (hasValue(body.bookerName)) data.bookerName = requiredText(body.bookerName, "bookerName");
  if (hasValue(body.purpose)) data.purpose = text(body.purpose, "purpose", 500);
  if (hasValue(body.startTime)) data.startTime = parseDate(body.startTime, "startTime");
  if (hasValue(body.endTime)) data.endTime = parseDate(body.endTime, "endTime");
  if (hasValue(body.attendeeCount)) data.attendeeCount = positiveInt(body.attendeeCount, "attendeeCount");
  // ส่ง null มาเพื่อล้างค่าไม่ได้ เพราะทุกฟิลด์จำเป็น
  for (const key of ["roomId", "bookerName", "purpose", "startTime", "endTime", "attendeeCount"]) {
    if (body[key] === null) throw badRequest(`${key} ห้ามเป็น null`);
  }
  return data;
}

export function hours(booking) {
  return (new Date(booking.endTime) - new Date(booking.startTime)) / 3_600_000;
}
