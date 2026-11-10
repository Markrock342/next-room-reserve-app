import { prisma } from "@/lib/prisma";
import { badRequest, conflict, handle, json, readJson } from "@/lib/http";
import { positiveInt, requireFields, requiredText } from "@/lib/validate";

// 1. POST /api/rooms — เพิ่มห้อง
export const POST = handle(async (request) => {
  const body = await readJson(request);
  requireFields(body, ["roomCode", "roomName", "capacity", "location"]);

  const data = {
    roomCode: requiredText(body.roomCode, "roomCode", 50),
    roomName: requiredText(body.roomName, "roomName"),
    capacity: positiveInt(body.capacity, "capacity"),
    location: requiredText(body.location, "location"),
  };

  const duplicate = await prisma.room.findUnique({ where: { roomCode: data.roomCode } });
  if (duplicate) throw conflict(`รหัสห้อง ${data.roomCode} มีอยู่แล้ว`);

  const room = await prisma.room.create({ data });
  return json(room, 201);
});

// 2. GET /api/rooms?search=&minCapacity= — รายการห้อง
export const GET = handle(async (request) => {
  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim();
  const minCapacityText = params.get("minCapacity");

  const where = {};
  if (search) {
    where.OR = [{ roomName: { contains: search } }, { location: { contains: search } }];
  }
  if (minCapacityText !== null && minCapacityText !== "") {
    if (!/^\d+$/.test(minCapacityText.trim())) throw badRequest("minCapacity ต้องเป็นจำนวนเต็มบวก");
    where.capacity = { gte: positiveInt(minCapacityText, "minCapacity") };
  }

  const rooms = await prisma.room.findMany({ where, orderBy: { id: "asc" } });
  return json(rooms);
});
