import { Controller, Get, Header } from '@nestjs/common';
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
}
