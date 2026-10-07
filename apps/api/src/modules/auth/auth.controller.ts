import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from './access-token.guard';
import { AuthService } from './auth.service';
import { AuthenticatedRequest, RequestMetadata } from './auth.types';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';
import { AuthThrottleGuard } from './auth-throttle.guard';

type PublicRequest = { ip?: string; headers: Record<string, string | string[] | undefined> };

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('guest')
  @HttpCode(200)
  @ApiOperation({ summary: 'Continue as a read-only guest' })
  guest() {
    return this.auth.guest();
  }

  @Post('register')
  @UseGuards(AuthThrottleGuard)
  @ApiOperation({ summary: 'Register a customer account' })
  register(@Body() input: RegisterDto, @Req() request: PublicRequest) {
    return this.auth.register(input, this.metadata(request));
  }

  @Post('login')
  @UseGuards(AuthThrottleGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Login using phone and password' })
  login(@Body() input: LoginDto, @Req() request: PublicRequest) {
    return this.auth.login(input, this.metadata(request));
  }

  @Post('refresh')
  @UseGuards(AuthThrottleGuard)
  @HttpCode(200)
  refresh(@Body() input: RefreshTokenDto, @Req() request: PublicRequest) {
    return this.auth.refresh(input.refreshToken, this.metadata(request));
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() input: LogoutDto) {
    return this.auth.logout(input.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  private metadata(request: PublicRequest): RequestMetadata {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
