// เทส API ทั้ง 15 ตัวผ่าน HTTP จริง
// ต้องเปิดเซิร์ฟเวอร์ก่อน (npm run dev หรือ npm start) แล้วรัน: npm test
// เทสสร้างห้องที่รหัสขึ้นต้นด้วย prefix ของตัวเอง และลบทิ้งตอนจบ ข้อมูลเดิมในฐานข้อมูลไม่ถูกแตะ
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();
const P = `T${Date.now().toString(36).toUpperCase()}`; // prefix รหัสห้องของรอบเทสนี้

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// เวลาในอนาคตแบบกำหนดได้: วันนี้ 00:00 UTC + days วัน + hour ชั่วโมง
function at(days, hour, minute = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + days * DAY + hour * HOUR + minute * 60_000);
}
const iso = (d) => d.toISOString();

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function createRoom(code, extra = {}) {
  const res = await api("POST", "/api/rooms", {
    roomCode: `${P}-${code}`,
    roomName: `ห้อง ${code} ${P}`,
    capacity: 10,
    location: `อาคารทดสอบ ${P}`,
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

async function book(roomId, start, end, extra = {}) {
  return api("POST", "/api/bookings", {
    roomId,
    bookerName: "ผู้ทดสอบ",
    purpose: "ทดสอบระบบ",
    startTime: iso(start),
    endTime: iso(end),
    attendeeCount: 5,
    ...extra,
  });
}

// ใส่การจองในอดีต/ที่เริ่มไปแล้ว ตรงลงฐานข้อมูล (API ไม่ยอมให้จองย้อนหลัง)
function insertBooking(roomId, start, end, attendeeCount = 3) {
  return prisma.booking.create({
    data: { roomId, bookerName: "ข้อมูลย้อนหลัง", purpose: "เทส", startTime: start, endTime: end, attendeeCount },
  });
}

before(async () => {
  const res = await fetch(BASE + "/api/rooms").catch(() => null);
  if (!res) throw new Error(`เปิดเซิร์ฟเวอร์ก่อน: ${BASE}`);
});

after(async () => {
  await prisma.booking.deleteMany({ where: { room: { roomCode: { startsWith: P } } } });
  await prisma.room.deleteMany({ where: { roomCode: { startsWith: P } } });
  await prisma.$disconnect();
});

describe("API ห้องประชุม", () => {
  test("1. POST /api/rooms เพิ่มห้องและตรวจข้อมูล", async () => {
    const room = await createRoom("A", { capacity: 8, roomName: "  ห้องเอ  " });
    assert.equal(room.roomName, "ห้องเอ");
    assert.ok(room.id && room.createdAt && room.updatedAt);

    const cases = [
      [{ roomName: "x", capacity: 5, location: "y" }, 400], // ไม่มี roomCode
      [{ roomCode: `${P}-B`, roomName: "   ", capacity: 5, location: "y" }, 400],
      [{ roomCode: `${P}-B`, roomName: "x", capacity: 0, location: "y" }, 400],
      [{ roomCode: `${P}-B`, roomName: "x", capacity: -3, location: "y" }, 400],
      [{ roomCode: `${P}-B`, roomName: "x", capacity: 2.5, location: "y" }, 400],
      [{ roomCode: `${P}-B`, roomName: "x", capacity: "abc", location: "y" }, 400],
      [{ roomCode: `${P}-A`, roomName: "ซ้ำ", capacity: 5, location: "y" }, 409],
    ];
    for (const [body, status] of cases) {
      assert.equal((await api("POST", "/api/rooms", body)).status, status, JSON.stringify(body));
    }
    assert.equal((await api("POST", "/api/rooms", "{bad json")).status, 400);
  });

  test("2. GET /api/rooms ค้นหาชื่อ/สถานที่ และ minCapacity", async () => {
    await createRoom("S1", { roomName: `ห้องสีฟ้า ${P}`, capacity: 4 });
    await createRoom("S2", { roomName: `ห้องอื่น ${P}`, location: `ตึกฟ้าใส ${P}`, capacity: 20 });

    const all = await api("GET", "/api/rooms");
    assert.equal(all.status, 200);
    assert.ok(Array.isArray(all.data));

    const byName = await api("GET", `/api/rooms?search=${encodeURIComponent("ห้องสีฟ้า " + P)}`);
    assert.deepEqual(byName.data.map((r) => r.roomCode), [`${P}-S1`]);

    const byLocation = await api("GET", `/api/rooms?search=${encodeURIComponent("ตึกฟ้าใส " + P)}`);
    assert.deepEqual(byLocation.data.map((r) => r.roomCode), [`${P}-S2`]);

    const big = await api("GET", `/api/rooms?search=${P}&minCapacity=15`);
    assert.ok(big.data.every((r) => r.capacity >= 15));
    assert.ok(big.data.some((r) => r.roomCode === `${P}-S2`));
    assert.ok(!big.data.some((r) => r.roomCode === `${P}-S1`));

    for (const bad of ["0", "-1", "abc"]) {
      assert.equal((await api("GET", `/api/rooms?minCapacity=${bad}`)).status, 400, bad);
    }
  });

  test("3. GET /api/rooms/[id] พบ / ไม่พบ 404 / id ผิด 400", async () => {
    const room = await createRoom("G");
    const found = await api("GET", `/api/rooms/${room.id}`);
    assert.equal(found.status, 200);
    assert.equal(found.data.roomCode, `${P}-G`);
    assert.equal((await api("GET", "/api/rooms/999999999")).status, 404);
    assert.equal((await api("GET", "/api/rooms/abc")).status, 400);
  });

  test("4. PATCH /api/rooms/[id] แก้บางฟิลด์ รหัสห้ามซ้ำ ห้ามลดความจุต่ำกว่าการจองที่ยังไม่จบ", async () => {
    const room = await createRoom("P", { capacity: 10, location: "เดิม" });
    await createRoom("P2");

    const renamed = await api("PATCH", `/api/rooms/${room.id}`, { roomName: "ชื่อใหม่" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.roomName, "ชื่อใหม่");
    assert.equal(renamed.data.location, "เดิม", "ฟิลด์ที่ไม่ส่งต้องคงเดิม");
    assert.equal(renamed.data.capacity, 10);

    assert.equal((await api("PATCH", `/api/rooms/${room.id}`, { roomCode: `${P}-P2` })).status, 409);
    assert.equal((await api("PATCH", `/api/rooms/${room.id}`, { roomCode: `${P}-P` })).status, 200, "รหัสเดิมของตัวเองใช้ได้");
    assert.equal((await api("PATCH", `/api/rooms/${room.id}`, { capacity: 0 })).status, 400);
    assert.equal((await api("PATCH", `/api/rooms/${room.id}`, { roomName: "" })).status, 400);
    assert.equal((await api("PATCH", `/api/rooms/${room.id}`, {})).status, 400);
    assert.equal((await api("PATCH", "/api/rooms/999999999", { roomName: "x" })).status, 404);

    // การจองที่ยังไม่สิ้นสุด 8 คน → ลดเหลือ 7 ไม่ได้, 8 ได้
    assert.equal((await book(room.id, at(3, 9), at(3, 10), { attendeeCount: 8 })).status, 201);
    // การจองที่จบไปแล้วไม่นับ
    await insertBooking(room.id, new Date(Date.now() - 3 * HOUR), new Date(Date.now() - 2 * HOUR), 10);
    const tooSmall = await api("PATCH", `/api/rooms/${room.id}`, { capacity: 7 });
    assert.equal(tooSmall.status, 409);
    assert.equal((await api("PATCH", `/api/rooms/${room.id}`, { capacity: 8 })).status, 200);
  });

  test("5. DELETE /api/rooms/[id] ลบได้เฉพาะห้องที่ไม่มีการจอง", async () => {
    const empty = await createRoom("D1");
    const busy = await createRoom("D2");
    await insertBooking(busy.id, new Date(Date.now() - 5 * DAY), new Date(Date.now() - 5 * DAY + HOUR));

    assert.equal((await api("DELETE", `/api/rooms/${busy.id}`)).status, 409);
    assert.equal((await api("DELETE", `/api/rooms/${empty.id}`)).status, 200);
    assert.equal((await api("GET", `/api/rooms/${empty.id}`)).status, 404);
    assert.equal((await api("DELETE", `/api/rooms/${empty.id}`)).status, 404);
  });

  test("6. GET /api/rooms/[id]/bookings เรียงตามเวลาเริ่ม และกรองช่วงที่ทับซ้อน", async () => {
    const room = await createRoom("RB");
    await book(room.id, at(4, 13), at(4, 14));
    await book(room.id, at(4, 9), at(4, 10));
    await book(room.id, at(5, 9), at(5, 10));

    const all = await api("GET", `/api/rooms/${room.id}/bookings`);
    assert.equal(all.status, 200);
    assert.deepEqual(all.data.map((b) => b.startTime), [at(4, 9), at(4, 13), at(5, 9)].map(iso));

    // ช่วง 09:30–13:00 ทับรายการ 09:00–10:00 เท่านั้น (13:00–14:00 แค่ชนขอบ ไม่นับ)
    const ranged = await api("GET", `/api/rooms/${room.id}/bookings?from=${iso(at(4, 9, 30))}&to=${iso(at(4, 13))}`);
    assert.deepEqual(ranged.data.map((b) => b.startTime), [iso(at(4, 9))]);

    assert.equal((await api("GET", `/api/rooms/${room.id}/bookings?from=${iso(at(4, 9))}`)).status, 400);
    assert.equal((await api("GET", `/api/rooms/${room.id}/bookings?from=${iso(at(4, 10))}&to=${iso(at(4, 9))}`)).status, 400);
    assert.equal((await api("GET", "/api/rooms/999999999/bookings")).status, 404);
  });

  test("7. GET /api/rooms/available ห้องที่ว่างและจุพอ", async () => {
    const small = await createRoom("AV1", { capacity: 4 });
    const large = await createRoom("AV2", { capacity: 30 });
    const busy = await createRoom("AV3", { capacity: 30 });
    await book(busy.id, at(6, 10), at(6, 12));

    const q = (extra = "") => api("GET", `/api/rooms/available?startTime=${iso(at(6, 11))}&endTime=${iso(at(6, 13))}${extra}`);
    const codes = (await q()).data.map((r) => r.roomCode);
    assert.ok(codes.includes(small.roomCode) && codes.includes(large.roomCode));
    assert.ok(!codes.includes(busy.roomCode), "ห้องที่มีการจองทับซ้อนต้องไม่แสดง");

    const big = (await q("&attendeeCount=10")).data.map((r) => r.roomCode);
    assert.ok(big.includes(large.roomCode) && !big.includes(small.roomCode));

    assert.equal((await api("GET", "/api/rooms/available")).status, 400);
    assert.equal((await api("GET", `/api/rooms/available?startTime=${iso(at(6, 13))}&endTime=${iso(at(6, 11))}`)).status, 400);
    assert.equal((await q("&attendeeCount=0")).status, 400);
  });
});

describe("API การจอง", () => {
  test("8. POST /api/bookings ตรวจห้อง เวลา ความจุ และการทับซ้อน", async () => {
    const room = await createRoom("B8", { capacity: 6 });
    const ok = await book(room.id, at(7, 9), at(7, 10));
    assert.equal(ok.status, 201);
    assert.equal(ok.data.room.roomCode, room.roomCode);

    assert.equal((await book(999999999, at(7, 9), at(7, 10))).status, 404);
    assert.equal((await book(room.id, new Date(Date.now() - HOUR), at(7, 10))).status, 400, "เวลาเริ่มต้องเป็นอนาคต");
    assert.equal((await book(room.id, at(7, 12), at(7, 11))).status, 400, "เริ่มต้องน้อยกว่าสิ้นสุด");
    assert.equal((await book(room.id, at(7, 12), at(7, 12))).status, 400);
    assert.equal((await book(room.id, at(7, 12), at(7, 13), { attendeeCount: 7 })).status, 400, "เกินความจุ");
    assert.equal((await book(room.id, at(7, 12), at(7, 13), { attendeeCount: 0 })).status, 400);
    assert.equal((await book(room.id, at(7, 12), at(7, 13), { bookerName: " " })).status, 400);
    assert.equal((await api("POST", "/api/bookings", { roomId: room.id })).status, 400, "ข้อมูลไม่ครบ");

    const overlap = await book(room.id, at(7, 9, 30), at(7, 11));
    assert.equal(overlap.status, 409);
    assert.equal(overlap.data.details.conflictWith.id, ok.data.id);
    assert.equal((await book(room.id, at(7, 10), at(7, 11))).status, 201, "ต่อท้ายพอดีไม่ถือว่าทับ");
  });

  test("8b. จองพร้อมกันช่วงเดียวกัน สำเร็จได้แค่รายการเดียว", async () => {
    const room = await createRoom("RACE");
    const results = await Promise.all(Array.from({ length: 5 }, () => book(room.id, at(8, 9), at(8, 10))));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 4);
  });

  test("9. GET /api/bookings ค้นหา กรอง และแบ่งหน้า", async () => {
    const room = await createRoom("L9");
    for (let i = 0; i < 5; i++) {
      await book(room.id, at(9, 8 + i), at(9, 9 + i), { bookerName: `คนที่${i} ${P}`, purpose: i === 2 ? `สัมมนาพิเศษ ${P}` : "ประชุม" });
    }

    const page1 = await api("GET", `/api/bookings?roomId=${room.id}&limit=2&page=1`);
    assert.equal(page1.status, 200);
    assert.equal(page1.data.data.length, 2);
    assert.deepEqual(page1.data.pagination, { page: 1, limit: 2, total: 5, totalPages: 3 });
    assert.ok(page1.data.data[0].room, "ต้องมีข้อมูลห้อง");
    assert.ok(page1.data.data[0].startTime < page1.data.data[1].startTime);

    const page3 = await api("GET", `/api/bookings?roomId=${room.id}&limit=2&page=3`);
    assert.equal(page3.data.data.length, 1);

    const searched = await api("GET", `/api/bookings?search=${encodeURIComponent("สัมมนาพิเศษ " + P)}`);
    assert.equal(searched.data.pagination.total, 1);

    const byName = await api("GET", `/api/bookings?search=${encodeURIComponent(room.roomCode)}`);
    assert.equal(byName.data.pagination.total, 5, "ค้นด้วยรหัสห้องได้");

    const ranged = await api("GET", `/api/bookings?roomId=${room.id}&from=${iso(at(9, 10))}&to=${iso(at(9, 12))}`);
    assert.equal(ranged.data.pagination.total, 2);

    const upcoming = await api("GET", `/api/bookings?roomId=${room.id}&status=upcoming`);
    assert.equal(upcoming.data.pagination.total, 5);

    for (const bad of ["limit=0", "limit=101", "page=0", "page=abc", "status=xyz", "roomId=abc"]) {
      assert.equal((await api("GET", `/api/bookings?${bad}`)).status, 400, bad);
    }
  });

  test("10. GET /api/bookings/[id] พร้อมข้อมูลห้อง", async () => {
    const room = await createRoom("G10");
    const created = await book(room.id, at(10, 9), at(10, 10));
    const found = await api("GET", `/api/bookings/${created.data.id}`);
    assert.equal(found.status, 200);
    assert.equal(found.data.room.roomCode, room.roomCode);
    assert.equal((await api("GET", "/api/bookings/999999999")).status, 404);
    assert.equal((await api("GET", "/api/bookings/x1")).status, 400);
  });

  test("11. PATCH /api/bookings/[id] เปลี่ยนเวลา ย้ายห้อง ตรวจหลังรวมค่า และไม่นับตัวเองตอนเช็กทับซ้อน", async () => {
    const a = await createRoom("E1", { capacity: 10 });
    const b = await createRoom("E2", { capacity: 3 });
    const first = (await book(a.id, at(11, 9), at(11, 11), { attendeeCount: 5 })).data;
    await book(a.id, at(11, 13), at(11, 14));

    // ขยับเวลาซ้อนช่วงเดิมของตัวเองได้
    const shifted = await api("PATCH", `/api/bookings/${first.id}`, { endTime: iso(at(11, 12)) });
    assert.equal(shifted.status, 200);
    assert.equal(shifted.data.endTime, iso(at(11, 12)));
    assert.equal(shifted.data.bookerName, "ผู้ทดสอบ", "ฟิลด์ที่ไม่ส่งต้องคงเดิม");

    assert.equal((await api("PATCH", `/api/bookings/${first.id}`, { endTime: iso(at(11, 13, 30)) })).status, 409, "ทับรายการอื่น");
    assert.equal((await api("PATCH", `/api/bookings/${first.id}`, { startTime: iso(at(11, 12, 30)) })).status, 400, "เริ่มหลังสิ้นสุด (หลังรวมค่าเดิม)");
    assert.equal((await api("PATCH", `/api/bookings/${first.id}`, { roomId: b.id })).status, 400, "5 คนเกินความจุห้องใหม่ 3");

    const moved = await api("PATCH", `/api/bookings/${first.id}`, { roomId: b.id, attendeeCount: 3 });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.room.roomCode, b.roomCode);

    assert.equal((await api("PATCH", `/api/bookings/${first.id}`, { roomId: 999999999 })).status, 404);
    assert.equal((await api("PATCH", `/api/bookings/${first.id}`, {})).status, 400);

    const started = await insertBooking(a.id, new Date(Date.now() - HOUR), new Date(Date.now() + HOUR));
    assert.equal((await api("PATCH", `/api/bookings/${started.id}`, { purpose: "แก้" })).status, 409, "เริ่มแล้วแก้ไม่ได้");
  });

  test("12. DELETE /api/bookings/[id] ยกเลิกได้เฉพาะที่ยังไม่เริ่ม", async () => {
    const room = await createRoom("X12");
    const future = (await book(room.id, at(12, 9), at(12, 10))).data;
    const started = await insertBooking(room.id, new Date(Date.now() - HOUR), new Date(Date.now() + HOUR));

    assert.equal((await api("DELETE", `/api/bookings/${started.id}`)).status, 409);
    assert.equal((await api("DELETE", `/api/bookings/${future.id}`)).status, 200);
    assert.equal((await api("DELETE", `/api/bookings/${future.id}`)).status, 404);
  });

  test("13. GET /api/bookings/upcoming days ค่าเริ่มต้น 7 รับ 1–30 กรอง roomId", async () => {
    const room = await createRoom("U13");
    await book(room.id, new Date(Date.now() + 5 * DAY), new Date(Date.now() + 5 * DAY + HOUR));
    await book(room.id, new Date(Date.now() + DAY + HOUR), new Date(Date.now() + DAY + 2 * HOUR));
    await book(room.id, new Date(Date.now() + 20 * DAY), new Date(Date.now() + 20 * DAY + HOUR));
    await insertBooking(room.id, new Date(Date.now() - DAY), new Date(Date.now() - DAY + HOUR));

    const def = await api("GET", `/api/bookings/upcoming?roomId=${room.id}`);
    assert.equal(def.status, 200);
    assert.equal(def.data.days, 7);
    assert.equal(def.data.data.length, 2);
    assert.ok(def.data.data[0].startTime < def.data.data[1].startTime, "เริ่มก่อนขึ้นก่อน");
    assert.ok(def.data.data[0].room);

    assert.equal((await api("GET", `/api/bookings/upcoming?roomId=${room.id}&days=30`)).data.data.length, 3);
    assert.equal((await api("GET", `/api/bookings/upcoming?roomId=${room.id}&days=1`)).data.data.length, 0, "อีก 1 วัน 1 ชั่วโมง เกิน days=1");
    assert.equal((await api("GET", `/api/bookings/upcoming?roomId=${room.id}&days=2`)).data.data.length, 1);
    for (const bad of ["0", "31", "abc", "2.5"]) {
      assert.equal((await api("GET", `/api/bookings/upcoming?days=${bad}`)).status, 400, bad);
    }
  });

  test("14. GET /api/bookings/stats นับจำนวนและชั่วโมงเต็มของแต่ละรายการ แยกห้อง", async () => {
    const r1 = await createRoom("S14A");
    const r2 = await createRoom("S14B");
    const from = new Date(Date.now() - 10 * DAY);
    const to = new Date(Date.now() - 5 * DAY);
    await insertBooking(r1.id, new Date(from.getTime() + DAY), new Date(from.getTime() + DAY + 2 * HOUR));
    // เริ่มในช่วงแต่จบหลัง to: นับเต็ม 3 ชั่วโมง
    await insertBooking(r1.id, new Date(to.getTime() - HOUR), new Date(to.getTime() + 2 * HOUR));
    await insertBooking(r2.id, new Date(from.getTime() + 2 * DAY), new Date(from.getTime() + 2 * DAY + 30 * 60_000));
    // เริ่มที่ to พอดี: ไม่นับ (ช่วงเป็น [from, to))
    await insertBooking(r2.id, to, new Date(to.getTime() + HOUR));

    const stats = await api("GET", `/api/bookings/stats?from=${iso(from)}&to=${iso(to)}`);
    assert.equal(stats.status, 200);
    const mine = stats.data.rooms.filter((r) => r.roomCode.startsWith(P + "-S14"));
    assert.deepEqual(
      mine.map(({ roomCode, bookingCount, totalHours }) => ({ roomCode, bookingCount, totalHours })),
      [
        { roomCode: r1.roomCode, bookingCount: 2, totalHours: 5 },
        { roomCode: r2.roomCode, bookingCount: 1, totalHours: 0.5 },
      ],
    );

    const one = await api("GET", `/api/bookings/stats?from=${iso(from)}&to=${iso(to)}&roomId=${r2.id}`);
    assert.equal(one.data.rooms.length, 1);
    assert.equal(one.data.totalBookings, 1);

    assert.equal((await api("GET", `/api/bookings/stats?from=${iso(from)}`)).status, 400);
    assert.equal((await api("GET", "/api/bookings/stats")).status, 400);
  });

  test("15. DELETE /api/bookings/expired ลบเฉพาะห้องนั้นที่ endTime < before", async () => {
    const room = await createRoom("X15");
    const other = await createRoom("X15B");
    const cut = new Date(Date.now() - 2 * DAY);
    await insertBooking(room.id, new Date(cut.getTime() - 3 * DAY), new Date(cut.getTime() - 3 * DAY + HOUR));
    await insertBooking(room.id, new Date(cut.getTime() - 2 * HOUR), new Date(cut.getTime() - HOUR));
    await insertBooking(room.id, new Date(cut.getTime() - HOUR), new Date(cut.getTime() + HOUR)); // จบหลัง before
    await insertBooking(other.id, new Date(cut.getTime() - 3 * DAY), new Date(cut.getTime() - 3 * DAY + HOUR));

    const res = await api("DELETE", `/api/bookings/expired?roomId=${room.id}&before=${iso(cut)}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.deletedCount, 2);
    assert.equal(await prisma.booking.count({ where: { roomId: room.id } }), 1);
    assert.equal(await prisma.booking.count({ where: { roomId: other.id } }), 1, "ห้องอื่นต้องไม่ถูกลบ");

    const body = await api("DELETE", "/api/bookings/expired", { roomId: other.id, before: iso(cut) });
    assert.equal(body.data.deletedCount, 1, "ส่งเป็น JSON body ได้เช่นกัน");

    assert.equal((await api("DELETE", `/api/bookings/expired?roomId=${room.id}`)).status, 400);
    assert.equal((await api("DELETE", `/api/bookings/expired?roomId=${room.id}&before=${iso(new Date(Date.now() + DAY))}`)).status, 400, "before ห้ามเกินปัจจุบัน");
    assert.equal((await api("DELETE", `/api/bookings/expired?roomId=999999999&before=${iso(cut)}`)).status, 404);
  });
});
