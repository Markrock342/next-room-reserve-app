# Assignment08 : next-room-reserve-app

ระบบห้องประชุมและการจอง — API 15 ตัว ด้วย **Next.js 16 (App Router) + Prisma 6 + MySQL**

## ติดตั้งและรัน

ต้องมี Node.js 20+ และ MySQL/MariaDB (เช่น XAMPP)

1. เปิด XAMPP → **Manage Servers** → **MySQL Database** → **Start**
2. ติดตั้งและสร้างฐานข้อมูล

```bash
npm install
cp .env.example .env          # ค่าเริ่มต้นของ XAMPP: root ไม่มีรหัสผ่าน พอร์ต 3306
npx prisma migrate dev        # สร้างฐานข้อมูล room_reserve_db + ตาราง Room, Booking + ใส่ข้อมูลตัวอย่าง
npm run dev                   # http://localhost:3000
```

ถ้าฐานข้อมูลมีรหัสผ่าน แก้ใน `.env`: `DATABASE_URL="mysql://root:รหัสผ่าน@localhost:3306/room_reserve_db"`

ใส่ข้อมูลตัวอย่างใหม่ (ห้อง 4 ห้อง การจอง 8 รายการ ทั้งอดีตและอนาคต): `npm run db:seed`

## ทดสอบ

```bash
npm run dev     # เปิดเซิร์ฟเวอร์ไว้ก่อน
npm test        # เทส 16 ชุด ครอบคลุม API ทั้ง 15 ตัว ผ่าน HTTP จริง
```

เทสสร้างข้อมูลของตัวเอง (รหัสห้องขึ้นต้นด้วย `T…`) แล้วลบทิ้งตอนจบ ข้อมูลเดิมในฐานข้อมูลไม่ถูกแตะ
มีเทสจองพร้อมกัน 5 คำขอในช่วงเวลาเดียวกันด้วย ต้องสำเร็จได้แค่ 1 รายการ

ลองเรียกเองได้จากไฟล์ `requests.http` (ส่วนขยาย REST Client ใน VS Code) หรือ Postman

## ฐานข้อมูล

```prisma
model Room {
  id        Int       @id @default(autoincrement())
  roomCode  String    @unique   // ห้ามว่าง ห้ามซ้ำ
  roomName  String              // ห้ามว่าง
  capacity  Int                 // จำนวนเต็ม > 0
  location  String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  bookings  Booking[]           // ห้องหนึ่งมีการจองได้หลายรายการ
}

model Booking {
  id            Int      @id @default(autoincrement())
  bookerName    String   // ห้ามว่าง
  purpose       String
  startTime     DateTime
  endTime       DateTime
  attendeeCount Int      // จำนวนเต็ม > 0
  roomId        Int      // FK → Room (การจองหนึ่งรายการระบุห้องเดียว)
  room          Room     @relation(fields: [roomId], references: [id])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## API

เวลาทั้งหมดรับเป็น ISO 8601 เช่น `2026-12-20T09:00:00+07:00` (ใน query string ให้เขียน `+` เป็น `%2B`) และตอบกลับเป็น UTC
ข้อผิดพลาดตอบเป็น `{ "message": "..." }` · **400** ข้อมูลไม่ถูกต้อง · **404** ไม่พบ · **409** ขัดแย้งกับข้อมูลที่มีอยู่

“ทับซ้อน” หมายถึง `startTime < สิ้นสุดของอีกช่วง` และ `endTime > เริ่มของอีกช่วง` — ช่วงที่ชนขอบพอดี (จบ 10:00 / เริ่ม 10:00) ไม่นับว่าทับ

### ห้องประชุม

| # | Method · Path | ทำอะไร | สถานะ |
|---|---|---|---|
| 1 | `POST /api/rooms` | เพิ่มห้อง ต้องส่ง `roomCode, roomName, capacity, location` | 201 · 400 ข้อความว่าง/ความจุไม่ใช่จำนวนเต็ม > 0 · 409 รหัสซ้ำ |
| 2 | `GET /api/rooms?search=&minCapacity=` | รายการห้อง `search` ค้นในชื่อห้องหรือสถานที่ `minCapacity` ความจุขั้นต่ำ ไม่ส่งแสดงทั้งหมด | 200 · 400 |
| 3 | `GET /api/rooms/[id]` | รายละเอียดห้อง | 200 · 404 |
| 4 | `PATCH /api/rooms/[id]` | แก้บางฟิลด์ ที่ไม่ส่งคงเดิม | 200 · 400 · 404 · 409 รหัสซ้ำ / ความจุต่ำกว่าผู้เข้าร่วมของการจองที่ยังไม่สิ้นสุด |
| 5 | `DELETE /api/rooms/[id]` | ลบห้องที่ไม่มีการจองเลย | 200 · 404 · 409 มีการจอง |
| 6 | `GET /api/rooms/[id]/bookings?from=&to=` | การจองของห้อง เรียงเวลาเริ่มน้อย→มาก ส่ง `from,to` (ทั้งคู่) เพื่อหารายการที่ทับซ้อนช่วงนั้น | 200 · 400 · 404 |
| 7 | `GET /api/rooms/available?startTime=&endTime=&attendeeCount=` | ห้องที่ไม่มีการจองทับซ้อนและจุพอ (`attendeeCount` ไม่บังคับ) | 200 · 400 |

### การจอง

| # | Method · Path | ทำอะไร | สถานะ |
|---|---|---|---|
| 8 | `POST /api/bookings` | เพิ่มการจอง ต้องส่ง `roomId, bookerName, purpose, startTime, endTime, attendeeCount` ตรวจ: ห้องมีจริง, เริ่มในอนาคต, เริ่ม < สิ้นสุด, คนไม่เกินความจุ, ไม่ทับซ้อน | 201 · 400 · 404 ไม่มีห้อง · 409 ทับซ้อน |
| 9 | `GET /api/bookings` | รายการจองพร้อมข้อมูลห้อง (ดูตัวกรองด้านล่าง) | 200 · 400 |
| 10 | `GET /api/bookings/[id]` | รายละเอียดการจองพร้อมข้อมูลห้อง | 200 · 404 |
| 11 | `PATCH /api/bookings/[id]` | แก้บางฟิลด์ ย้ายห้อง/เปลี่ยนเวลาได้ เฉพาะที่ยังไม่เริ่ม ตรวจกติกาเดียวกับข้อ 8 **หลังรวมค่าใหม่กับค่าเดิม** และเช็กทับซ้อนโดยไม่นับตัวเอง | 200 · 400 · 404 · 409 เริ่มแล้ว/ทับซ้อน |
| 12 | `DELETE /api/bookings/[id]` | ยกเลิก (ลบ) เฉพาะที่ยังไม่เริ่ม | 200 · 404 · 409 เริ่มแล้ว |
| 13 | `GET /api/bookings/upcoming?days=&roomId=` | การจองที่เริ่มตั้งแต่ตอนนี้ถึงอีก `days` วัน (ค่าเริ่มต้น 7 รับ 1–30) เรียงที่เริ่มก่อนขึ้นก่อน | 200 · 400 |
| 14 | `GET /api/bookings/stats?from=&to=&roomId=` | สรุปการจองที่เวลาเริ่มอยู่ใน `[from, to)` แยกตามห้อง: จำนวนการจอง และชั่วโมงรวม (นับเต็มระยะเวลาของแต่ละรายการ) | 200 · 400 |
| 15 | `DELETE /api/bookings/expired?roomId=&before=` | ลบการจองของห้องนั้นที่ `endTime < before` โดย `before` ต้องไม่เกินปัจจุบัน คืน `deletedCount` (ส่งเป็น JSON body ก็ได้) | 200 · 400 · 404 |

**ตัวกรองของข้อ 9 `GET /api/bookings`**

| พารามิเตอร์ | ความหมาย |
|---|---|
| `search` | ค้นในชื่อผู้จอง วัตถุประสงค์ ชื่อห้อง หรือรหัสห้อง |
| `roomId` | เฉพาะห้องนั้น |
| `from`, `to` | เวลาเริ่มอยู่ในช่วง `[from, to)` ส่งอย่างใดอย่างหนึ่งได้ |
| `status` | `upcoming` ยังไม่เริ่ม · `ongoing` กำลังใช้ · `finished` สิ้นสุดแล้ว |
| `page`, `limit` | หน้าที่ (เริ่ม 1) และจำนวนต่อหน้า (ค่าเริ่มต้น 10 สูงสุด 100) |

ตอบกลับ `{ data: [...], pagination: { page, limit, total, totalPages } }` เรียงตามเวลาเริ่ม

### กันจองซ้อนเมื่อมีคำขอพร้อมกัน

การเพิ่ม/แก้ไขการจองทำใน transaction ระดับ **READ COMMITTED** และล็อกแถวของห้องด้วย `SELECT … FOR UPDATE` ก่อนตรวจการทับซ้อน
คำขอที่มาพร้อมกันจึงต้องรอคิวทีละรายการ — ถ้าใช้ค่าเริ่มต้นของ MySQL (REPEATABLE READ) คำขอที่รอล็อกจะยังมองไม่เห็นการจองที่อีกคำขอเพิ่งบันทึก และจองซ้อนกันได้

## โครงสร้าง

```
app/api/rooms/route.js                 1, 2
app/api/rooms/[id]/route.js            3, 4, 5
app/api/rooms/[id]/bookings/route.js   6
app/api/rooms/available/route.js       7
app/api/bookings/route.js              8, 9
app/api/bookings/[id]/route.js         10, 11, 12
app/api/bookings/upcoming/route.js     13
app/api/bookings/stats/route.js        14
app/api/bookings/expired/route.js      15
lib/prisma.js      PrismaClient ตัวเดียวทั้งแอป
lib/http.js        ข้อผิดพลาด 400/404/409 และตัวห่อ handler
lib/validate.js    ตรวจ id, จำนวนเต็มบวก, ข้อความห้ามว่าง, วันเวลา
lib/booking.js     กติกาการจอง การทับซ้อน และการล็อกห้อง
prisma/schema.prisma, prisma/migrations/, prisma/seed.js
tests/api.test.mjs  เทส API
requests.http       ตัวอย่างเรียก API
```
