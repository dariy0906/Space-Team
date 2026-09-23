import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt.strategy';

export interface TokenPair { accessToken: string; refreshToken: string; }
export interface PublicUser { id: string; email: string; username: string; createdAt: Date; updatedAt: Date; }
@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService, private readonly jwt: JwtService, private readonly config: ConfigService) {}
  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    if (await this.users.findByEmail(dto.email.toLowerCase())) throw new ConflictException('Email is already in use');
    const user = await this.users.create({ email: dto.email.toLowerCase(), username: dto.username, passwordHash: await bcrypt.hash(dto.password, 12) });
    const tokens = await this.issueTokens(user); await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { user: this.publicUser(user), tokens };
  }
  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.users.findByEmail(dto.email.toLowerCase());
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    const tokens = await this.issueTokens(user); await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { user: this.publicUser(user), tokens };
  }
  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') });
      const user = await this.users.findById(payload.sub);
      if (!user?.refreshTokenHash || !(await bcrypt.compare(refreshToken, user.refreshTokenHash))) throw new UnauthorizedException('Invalid refresh token');
      const tokens = await this.issueTokens(user); await this.saveRefreshToken(user.id, tokens.refreshToken); return tokens;
    } catch { throw new UnauthorizedException('Invalid refresh token'); }
  }
  async me(userId: string): Promise<PublicUser> { const user = await this.users.findById(userId); if (!user) throw new UnauthorizedException(); return this.publicUser(user); }
  private async issueTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessOptions: JwtSignOptions = { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN') as JwtSignOptions['expiresIn'] };
    const refreshOptions: JwtSignOptions = { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as JwtSignOptions['expiresIn'] };
    const [accessToken, refreshToken] = await Promise.all([this.jwt.signAsync(payload, accessOptions), this.jwt.signAsync(payload, refreshOptions)]); return { accessToken, refreshToken };
  }
  private async saveRefreshToken(userId: string, token: string): Promise<void> { await this.users.updateRefreshToken(userId, await bcrypt.hash(token, 12)); }
  private publicUser(user: User): PublicUser { const { id, email, username, createdAt, updatedAt } = user; return { id, email, username, createdAt, updatedAt }; }
}
