import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
export class RegisterDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(10) @MaxLength(128) password: string;
  @IsString() @MinLength(1) @MaxLength(80) firstName: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName: string;
}
export class LoginDto { @IsEmail() email: string; @IsString() @MaxLength(128) password: string }
