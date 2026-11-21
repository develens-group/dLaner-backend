import {
  Body,
  Controller,
  Get,
  Post,
  ForbiddenException,
} from '@nestjs/common';
import { IsString, MaxLength, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Roles, CurrentUser } from '../common/decorators';
import type { AccessPrincipal } from '../common/auth.types';
import { response } from '../common/api-response';
import { McpService } from './mcp.service';
export class UploadMcpPromptDto {
  @IsString() @MaxLength(200) @Matches(/\.txt$/i) fileName!: string;
  @IsString() @MaxLength(131072) content!: string;
}
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/mcp-prompts')
export class McpPromptController {
  constructor(private readonly mcp: McpService) {}
  private web(user: AccessPrincipal) {
    if (user.client !== 'web')
      throw new ForbiddenException(
        'Manage MCP guides from the web admin panel.',
      );
  }
  @Get() async versions(@CurrentUser() user: AccessPrincipal) {
    this.web(user);
    return response(await this.mcp.promptVersions());
  }
  @Post() async upload(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: UploadMcpPromptDto,
  ) {
    this.web(user);
    return response(
      await this.mcp.uploadPrompt(user.userId, dto.fileName, dto.content),
    );
  }
}
