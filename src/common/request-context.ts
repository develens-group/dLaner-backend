import { Request } from 'express';

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;
}

export function getClientContext(request: Request): ClientContext {
  const userAgent = request.get('user-agent')?.slice(0, 512);
  const forwarded = request.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    userAgent,
    ipAddress: (forwarded || request.ip)?.slice(0, 64),
    deviceName: userAgent?.slice(0, 100),
  };
}
