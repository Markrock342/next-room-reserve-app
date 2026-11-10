import Link from "next/link";

const ROOM_APIS = [
  ["POST", "/api/rooms", "เพิ่มห้อง"],
  ["GET", "/api/rooms?search=&minCapacity=", "รายการห้อง ค้นหาชื่อ/สถานที่ กรองความจุขั้นต่ำ"],
  ["GET", "/api/rooms/[id]", "รายละเอียดห้อง"],
  ["PATCH", "/api/rooms/[id]", "แก้ไขบางฟิลด์"],
  ["DELETE", "/api/rooms/[id]", "ลบห้องที่ไม่มีการจอง"],
  ["GET", "/api/rooms/[id]/bookings?from=&to=", "การจองของห้อง"],
  ["GET", "/api/rooms/available?startTime=&endTime=&attendeeCount=", "ค้นหาห้องว่าง"],
];

const BOOKING_APIS = [
  ["POST", "/api/bookings", "เพิ่มการจอง"],
  ["GET", "/api/bookings?search=&roomId=&from=&to=&status=&page=&limit=", "รายการจอง ค้นหา กรอง แบ่งหน้า"],
  ["GET", "/api/bookings/[id]", "รายละเอียดการจอง"],
  ["PATCH", "/api/bookings/[id]", "แก้ไข ย้ายห้อง เปลี่ยนเวลา"],
  ["DELETE", "/api/bookings/[id]", "ยกเลิกการจองที่ยังไม่เริ่ม"],
  ["GET", "/api/bookings/upcoming?days=&roomId=", "การจองที่จะถึงใน days วัน"],
  ["GET", "/api/bookings/stats?from=&to=&roomId=", "สรุปจำนวนการจองและชั่วโมงแยกตามห้อง"],
  ["DELETE", "/api/bookings/expired?roomId=&before=", "ลบประวัติการจองที่สิ้นสุดก่อน before"],
];

function ApiTable({ rows, start }) {
  return (
    <table>
      <tbody>
        {rows.map(([method, path, note], i) => (
          <tr key={path + method}>
            <td>{start + i}.</td>
            <td>
              <span className={`method ${method}`}>{method}</span> <code>{path}</code>
              <br />
              {note}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Home() {
  return (
    <main>
      <h1>next-room-reserve-app</h1>
      <p className="sub">ระบบห้องประชุมและการจอง · Next.js + Prisma + MySQL · 15 API</p>
      <section>
        <h2>API ห้องประชุม</h2>
        <ApiTable rows={ROOM_APIS} start={1} />
      </section>
      <section>
        <h2>API การจอง</h2>
        <ApiTable rows={BOOKING_APIS} start={8} />
      </section>
      <p className="sub">
        ลองเรียกได้เลย เช่น <Link href="/api/rooms" prefetch={false}>/api/rooms</Link> หรือใช้ไฟล์ <code>requests.http</code> ในโปรเจกต์
      </p>
    </main>
  );
}
