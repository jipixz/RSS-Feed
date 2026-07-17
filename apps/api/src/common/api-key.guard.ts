import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * RS-2: si API_KEY está configurada, los writes (POST/PATCH/DELETE) exigen
 * header X-API-Key. Los GET de lectura quedan abiertos (red privada).
 * Sin API_KEY configurada, todo pasa (uso local single-user).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const apiKey = this.config.get<string>('API_KEY');
    if (!apiKey) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;

    if (req.header('x-api-key') !== apiKey) {
      throw new UnauthorizedException('X-API-Key inválida o ausente');
    }
    return true;
  }
}
