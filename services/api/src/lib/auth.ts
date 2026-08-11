import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AccessTokenPayload {
  sub: string;
  accountStatus: string;
  ageVerified: boolean;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "15m") as SignOptions["expiresIn"];

  return jwt.sign(payload, secret, {
    expiresIn,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  return jwt.verify(token, secret) as AccessTokenPayload;
}
