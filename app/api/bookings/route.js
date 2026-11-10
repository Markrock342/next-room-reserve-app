import { prisma } from "@/lib/prisma";
import { badRequest, handle, json, readJson } from "@/lib/http";
import {
  assertBookingRules,
  assertNoOverlap,
  findRoomOrThrow,
  bookingTx,
  lockRoom,
  parseBookingFields,
  withRoom,
} from "@/lib/booking";
import { parseDate, parseId, requireFields } from "@/lib/validate";

// 8. POST /api/bookings — เพิ่มการจอง
export const POST = handle(async (request) => {
  const body = await readJson(request);
  requireFields(body, ["roomId", "bookerName", "purpose", "startTime", "endTime", "attendeeCount"]);
  const data = parseBookingFields(body);

  const booking = await prisma.$transaction(async (tx) => {
    await lockRoom(tx, data.roomId); // ล็อกก่อนอ่าน: คำขอที่มาพร้อมกันต้องรอคิว
    const room = await findRoomOrThrow(tx, data.roomId);
    assertBookingRules(data, room);
    await assertNoOverlap(tx, data);
    return tx.booking.create({ data, include: withRoom });
  }, bookingTx);

  return json(booking, 201);
});

const STATUSES = ["upcoming", "ongoing", "finished"];
const MAX_LIMIT = 100;

function pageNumber(value, name, fallback) {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value.trim()) || Number(value) < 1) throw badRequest(`${name} ต้องเป็นจำนวนเต็มบวก`);
  return Number(value);
}

// 9. GET /api/bookings — รายการจองพร้อมข้อมูลห้อง ค้นหา กรอง และแบ่งหน้า
//    search  ค้นในชื่อผู้จอง วัตถุประสงค์ ชื่อห้อง หรือรหัสห้อง
//    roomId  เฉพาะห้องนั้น
//    from,to เวลาเริ่มอยู่ในช่วง [from, to) ส่งอย่างใดอย่างหนึ่งได้
//    status  upcoming (ยังไม่เริ่ม) | ongoing (กำลังใช้) | finished (สิ้นสุดแล้ว)
//    page    หน้าที่ (เริ่ม 1) · limit จำนวนต่อหน้า (ค่าเริ่มต้น 10 สูงสุด 100)
export const GET = handle(async (request) => {
  const params = request.nextUrl.searchParams;
  const now = new Date();
  const and = [];

  const search = params.get("search")?.trim();
  if (search) {
    and.push({
      OR: [
        { bookerName: { contains: search } },
        { purpose: { contains: search } },
        { room: { roomName: { contains: search } } },
        { room: { roomCode: { contains: search } } },
      ],
    });
  }

  if (params.get("roomId")) and.push({ roomId: parseId(params.get("roomId"), "roomId") });

  const from = params.get("from") ? parseDate(params.get("from"), "from") : null;
  const to = params.get("to") ? parseDate(params.get("to"), "to") : null;
  if (from && to && from >= to) throw badRequest("from ต้องน้อยกว่า to");
  if (from || to) and.push({ startTime: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });

  const status = params.get("status");
  if (status) {
    if (!STATUSES.includes(status)) throw badRequest(`status ต้องเป็น ${STATUSES.join(", ")}`);
    if (status === "upcoming") and.push({ startTime: { gt: now } });
    if (status === "ongoing") and.push({ startTime: { lte: now }, endTime: { gt: now } });
    if (status === "finished") and.push({ endTime: { lte: now } });
  }

  const page = pageNumber(params.get("page"), "page", 1);
  const limit = pageNumber(params.get("limit"), "limit", 10);
  if (limit > MAX_LIMIT) throw badRequest(`limit ต้องไม่เกิน ${MAX_LIMIT}`);

  const where = and.length ? { AND: and } : {};
  const [total, data] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: withRoom,
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
