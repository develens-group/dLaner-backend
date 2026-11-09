import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class ImageModelTierDto {
  @IsString() @MaxLength(150) value!: string;
  @IsString() @MaxLength(60) creditCost!: string;
  @IsObject() parameters!: Record<string, unknown>;
}

export class ImageModelSetupDto {
  @IsIn(['replicate', 'openai', 'google', 'xai']) provider!: string;
  @IsString() @MaxLength(255) model!: string;
  @Matches(/^(?:generate|edit)-[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug!: string;
  @IsString() @MaxLength(150) label!: string;
  @IsString() @MaxLength(1000) description!: string;
  @Matches(/^(?:[A-Za-z][A-Za-z0-9_]{0,63})?$/) selectorName!: string;
  @IsObject() defaults!: Record<string, unknown>;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ImageModelTierDto)
  tiers!: ImageModelTierDto[];
  @Matches(/^[A-Za-z][A-Za-z0-9_]{0,63}$/) imageField!: string;
  @Matches(/^[A-Za-z][A-Za-z0-9_]{0,63}$/) promptField!: string;
  @IsBoolean() imageArray!: boolean;
  @IsBoolean() modelEndpoint!: boolean;
  @IsBoolean() requiresPrompt!: boolean;
}
