import { IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const libyanPhonePattern = /^(?:0|\+218)9[1-6]\d{7}$/;

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @IsString()
  @Matches(libyanPhonePattern, { message: 'phone must be a valid Libyan mobile number' })
  phone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class LoginDto {
  @IsString()
  @Matches(libyanPhonePattern, { message: 'phone must be a valid Libyan mobile number' })
  phone!: string;

  @IsString()
  @Length(1, 72)
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(32)
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
