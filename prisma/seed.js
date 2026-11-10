// ข้อมูลตัวอย่างสำหรับทดลอง API: npx prisma db seed
// เวลาของการจองคำนวณจากวันนี้ เพื่อให้มีทั้งรายการที่ผ่านไปแล้วและรายการในอนาคตเสมอ
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// วันที่ + offset วัน เวลา hour:minute ตามเวลาไทย (UTC+7)
function at(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setUTCHours(hour - 7, minute, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d;
}

async function main() {
  await prisma.booking.deleteMany();
  await prisma.room.deleteMany();
  // ให้ id เริ่มที่ 1 ใหม่ทุกครั้ง ตัวอย่างใน requests.http จะได้ใช้ id 1, 2, 3, ... ได้เลย
  await prisma.$executeRawUnsafe("ALTER TABLE Booking AUTO_INCREMENT = 1");
  await prisma.$executeRawUnsafe("ALTER TABLE Room AUTO_INCREMENT = 1");

  const rooms = {};
  for (const room of [
    { roomCode: "R101", roomName: "ห้องประชุมเล็ก 101", capacity: 6, location: "อาคาร A ชั้น 1" },
    { roomCode: "R201", roomName: "ห้องประชุมกลาง 201", capacity: 12, location: "อาคาร A ชั้น 2" },
    { roomCode: "R301", roomName: "ห้องประชุมใหญ่ 301", capacity: 40, location: "อาคาร B ชั้น 3" },
    { roomCode: "LAB1", roomName: "ห้องอบรมคอมพิวเตอร์", capacity: 25, location: "อาคาร C ชั้น 1" },
  ]) {
    rooms[room.roomCode] = await prisma.room.create({ data: room });
  }

  const bookings = [
    // ผ่านไปแล้ว (ใช้ทดลอง stats และ expired)
    ["R101", "สมชาย ใจดี", "ประชุมทีมประจำสัปดาห์", at(-7, 9), at(-7, 10), 5],
    ["R201", "มานี ศรีสุข", "สัมภาษณ์งาน", at(-3, 13), at(-3, 15), 4],
    ["R301", "วิชัย บุญมา", "อบรมพนักงานใหม่", at(-2, 9), at(-2, 16), 30],
    // อนาคต
    ["R101", "ประภา ทองคำ", "คุยงานลูกค้า", at(1, 10), at(1, 11, 30), 4],
    ["R201", "สมชาย ใจดี", "วางแผนโครงการ Q1", at(2, 9), at(2, 12), 10],
    ["R201", "กานต์ วัฒนา", "รีวิวงานออกแบบ", at(2, 13), at(2, 14), 6],
    ["R301", "มานี ศรีสุข", "ประชุมใหญ่ประจำเดือน", at(5, 13), at(5, 16), 35],
    ["LAB1", "วิชัย บุญมา", "อบรม Excel", at(10, 9), at(10, 16), 20],
  ];
  for (const [code, bookerName, purpose, startTime, endTime, attendeeCount] of bookings) {
    await prisma.booking.create({
      data: { roomId: rooms[code].id, bookerName, purpose, startTime, endTime, attendeeCount },
    });
  }

  console.log(`seed เรียบร้อย: ห้อง ${Object.keys(rooms).length} ห้อง การจอง ${bookings.length} รายการ`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
