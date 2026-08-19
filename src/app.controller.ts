import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from './common/decorators';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  landingPage(): string {
    return this.appService.getLandingPage();
  }

  @Get('dlander-api.css')
  @Public()
  @Header('Content-Type', 'text/css; charset=utf-8')
  stylesheet(): string {
    return this.appService.getStylesheet();
  }

  @Get('api/docs')
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  swaggerPage(): string {
    return this.appService.getSwaggerPage();
  }

  @Get('api/docs/dlander-swagger-init.js')
  @Public()
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  swaggerInitializer(): string {
    return this.appService.getSwaggerInitializer();
  }

  @Get('docs/Dlander-React-Authentication-FA.pdf')
  @Public()
  reactAuthenticationGuide(@Res() res: Response) {
    return this.sendPdf(res, 'Dlander-React-Authentication-FA.pdf');
  }

  @Get('docs/Dlander-WordPress-Authentication-FA.pdf')
  @Public()
  wordpressAuthenticationGuide(@Res() res: Response) {
    return this.sendPdf(res, 'Dlander-WordPress-Authentication-FA.pdf');
  }

  private sendPdf(res: Response, filename: string) {
    const path = this.resolvePdfPath(filename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=300',
    });
    return res.sendFile(path);
  }

  private resolvePdfPath(filename: string) {
    const candidates = [
      // nest build: controller in dist/src, assets in dist/assets/docs
      join(__dirname, '..', 'assets', 'docs', filename),
      // controller and assets side-by-side
      join(__dirname, 'assets', 'docs', filename),
      // nest start:dev / cwd fallbacks
      join(process.cwd(), 'dist', 'assets', 'docs', filename),
      join(process.cwd(), 'src', 'assets', 'docs', filename),
      join(process.cwd(), 'docs', filename),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    throw new NotFoundException(`PDF guide not found: ${filename}`);
  }
}
