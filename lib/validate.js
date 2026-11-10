import { badRequest } from "./http";

const hasValue = (value) => value !== undefined && value !== null;

// id จาก URL หรือ query: ต้องเป็นจำนวนเต็มบวก
export function parseId(value, name = "id") {
  const text = String(value ?? "").trim();
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < 1) {
    throw badRequest(`${name} ต้องเป็นจำนวนเต็มบวก`);
  }
  return number;
}

// จำนวนเต็มมากกว่า 0 (รับทั้งตัวเลขและข้อความตัวเลข เช่น 10 หรือ "10")
export function positiveInt(value, name) {
  const number = typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
    throw badRequest(`${name} ต้องเป็นจำนวนเต็มมากกว่า 0`);
  }
  return number;
}

// ข้อความที่ห้ามว่าง (ตัดช่องว่างหัวท้าย)
export function requiredText(value, name, max = 191) {
  if (typeof value !== "string" || !value.trim()) throw badRequest(`${name} ห้ามว่าง`);
  const text = value.trim();
  if (text.length > max) throw badRequest(`${name} ยาวเกิน ${max} ตัวอักษร`);
  return text;
}

// ข้อความที่ว่างได้ แต่ต้องเป็น string
export function text(value, name, max = 191) {
  if (typeof value !== "string") throw badRequest(`${name} ต้องเป็นข้อความ`);
  const result = value.trim();
  if (result.length > max) throw badRequest(`${name} ยาวเกิน ${max} ตัวอักษร`);
  return result;
}

// วันเวลา รับรูปแบบ ISO 8601 เช่น 2026-12-01T09:00:00+07:00
export function parseDate(value, name) {
  if (!hasValue(value) || (typeof value !== "string" && typeof value !== "number") || value === "") {
    throw badRequest(`${name} ต้องเป็นวันเวลา (ISO 8601) เช่น 2026-12-01T09:00:00+07:00`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${name} ไม่ใช่วันเวลาที่ถูกต้อง`);
  return date;
}

export function requireFields(body, fields) {
  const missing = fields.filter((field) => !hasValue(body[field]));
  if (missing.length) throw badRequest(`ต้องส่งข้อมูล: ${missing.join(", ")}`);
}

// ช่วงเวลา from/to ใน query: ต้องส่งทั้งคู่หรือไม่ส่งเลย
export function optionalRange(params, required = false) {
  const from = params.get("from");
  const to = params.get("to");
  if (!from && !to) {
    if (required) throw badRequest("ต้องส่ง from และ to");
    return null;
  }
  if (!from || !to) throw badRequest("ต้องส่ง from และ to ทั้งคู่ หรือไม่ส่งเลย");
  const range = { from: parseDate(from, "from"), to: parseDate(to, "to") };
  if (range.from >= range.to) throw badRequest("from ต้องน้อยกว่า to");
  return range;
}

export { hasValue };
