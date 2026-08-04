import prisma from "../config/database.js";

// Atomic single-statement upsert: Postgres guarantees this increment is
// race-free even under concurrent callers, unlike a separate count()+1.
export async function nextSequence(key) {
  const counter = await prisma.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });

  return counter.value;
}
