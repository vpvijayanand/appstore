import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AdminJwtPayload {
  adminId: string;
  email: string;
  role: string;
}

export interface TerminalPayload {
  terminalId: string;
  customerId: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminJwtPayload;
      terminal?: TerminalPayload & { dbId: string; terminalMasterId: string | null };
    }
  }
}

// ── Admin JWT auth ────────────────────────────────────────────────────────────
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing admin token' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AdminJwtPayload;
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

// ── Terminal API key auth ─────────────────────────────────────────────────────
export async function requireTerminal(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-terminal-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing terminal API key' });
  }

  const terminal = await prisma.terminal.findUnique({
    where: { apiKey },
    select: { id: true, terminalId: true, customerId: true, status: true, terminalMasterId: true },
  });

  if (!terminal) {
    return res.status(401).json({ error: 'Invalid terminal API key' });
  }

  if (terminal.status !== 'ACTIVE') {
    return res.status(403).json({ error: `Terminal is ${terminal.status.toLowerCase()}` });
  }

  // Update last seen
  await prisma.terminal.update({
    where: { id: terminal.id },
    data: { lastSeenAt: new Date() },
  });

  req.terminal = {
    dbId: terminal.id,
    terminalId: terminal.terminalId,
    customerId: terminal.customerId,
    terminalMasterId: terminal.terminalMasterId,
  };

  next();
}

// ── Super admin only ──────────────────────────────────────────────────────────
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.admin?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}
