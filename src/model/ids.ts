export function newId(): string {
  return crypto.randomUUID();
}

/** Ids we accept from files: short, printable, no surprises when used as keys. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const RESERVED = new Set(['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf']);

export function isValidId(v: unknown): v is string {
  return typeof v === 'string' && ID_PATTERN.test(v) && !RESERVED.has(v);
}
