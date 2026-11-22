import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AccessPrincipal } from '../common/auth.types';
import { response } from '../common/api-response';
import { LandImagesService } from './land-images.service';
@Controller('api/v1/lands')
export class LandImagesController {
  constructor(private readonly images: LandImagesService) {}
  @Get(':landId/images/:assetId/download')
  @Header('Cache-Control', 'no-store')
  async download(
    @CurrentUser() user: AccessPrincipal,
    @Param('landId', ParseUUIDPipe) landId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return response(await this.images.download(user.userId, landId, assetId));
  }
}
