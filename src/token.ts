import { randomBytes } from "node:crypto";

export function generateToken() {
  return `rb_${randomBytes(24).toString("hex")}`;
}
