import { IsString, Matches } from 'class-validator';

export class SocialStartDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  codeChallenge!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  clientState!: string;
}

export class SocialExchangeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  code!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._~-]{43,128}$/)
  codeVerifier!: string;
}
