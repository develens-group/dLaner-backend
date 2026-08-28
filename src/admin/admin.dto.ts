import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserPlan, UserRole, UserStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PASSWORD_PATTERN } from '../auth/auth.dto';

export class AdminCreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    example: 'StrongPass123',
    minLength: 10,
    maxLength: 128,
  })
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain uppercase, lowercase, and numeric characters',
  })
  password!: string;

  @ApiPropertyOptional({ example: 'Name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ enum: UserPlan, default: UserPlan.FREE })
  @IsOptional()
  @IsEnum(UserPlan)
  plan?: UserPlan;
}

export class AdminResetPasswordDto {
  @ApiProperty({
    example: 'StrongPass123',
    minLength: 10,
    maxLength: 128,
  })
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain uppercase, lowercase, and numeric characters',
  })
  newPassword!: string;
}

export class ChangeUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

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

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: UserPlan })
  @IsOptional()
  @IsEnum(UserPlan)
  plan?: UserPlan;
}

export const ACTIVITY_TYPES = [
  'audit',
  'credit',
  'api_request',
  'ai_request',
  'session',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export class UserActivityQueryDto {
  @ApiPropertyOptional({ example: 30, default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @ApiPropertyOptional({ description: 'Opaque cursor from previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: ACTIVITY_TYPES,
    description: 'Repeatable ?types=audit&types=credit or comma-separated',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return value;
  })
  @IsArray()
  @IsIn(ACTIVITY_TYPES, { each: true })
  types?: ActivityType[];
}

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: [7, 30, 90], default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  days = 30;
}
