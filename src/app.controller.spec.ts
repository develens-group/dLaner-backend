import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns the branded API landing page', () => {
      expect(appController.landingPage()).toContain('Dlander API');
      expect(appController.landingPage()).toContain('/api/docs');
    });

    it('returns the landing page stylesheet', () => {
      expect(appController.stylesheet()).toContain('.card');
    });

    it('returns a CDN-backed Swagger page and local initializer', () => {
      expect(appController.swaggerPage()).toContain('swagger-ui-dist@5.32.8');
      expect(appController.swaggerInitializer()).toContain('/api/docs-json');
    });
  });
});
