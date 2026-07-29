import { Controller, Get } from '@nestjs/common';
import { response } from './common/api-response';
import { Public } from './common/decorators';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @Public()
  live() {
    return response({ status: 'ok' });
  }

  @Get('ready')
  @Public()
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return response({ status: 'ok', database: 'connected' });
  }
}
