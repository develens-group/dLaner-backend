import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserPlan } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ChangeUserPlanDto {
  @ApiProperty({ enum: UserPlan, example: UserPlan.PRO })
  @IsEnum(UserPlan)
  plan!: UserPlan;
}

export class UserQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ example: 'user@example.com', type: String })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  search?: string;
}

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: [7, 30, 90], default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  days = 30;
}
