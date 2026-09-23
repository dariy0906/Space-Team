import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AuthService, PublicUser, TokenPair } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from './jwt.strategy';
type AuthenticatedRequest = ExpressRequest & { user: JwtPayload };
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') register(@Body() dto: RegisterDto): Promise<{ user: PublicUser; tokens: TokenPair }> { return this.auth.register(dto); }
  @Post('login') login(@Body() dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> { return this.auth.login(dto); }
  @Post('refresh') refresh(@Body() dto: RefreshDto): Promise<TokenPair> { return this.auth.refresh(dto.refreshToken); }
  @UseGuards(JwtAuthGuard) @Get('me') me(@Request() request: AuthenticatedRequest): Promise<PublicUser> { return this.auth.me(request.user.sub); }
}
