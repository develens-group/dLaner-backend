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
}
