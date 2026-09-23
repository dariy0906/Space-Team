import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  create(data: Prisma.UserCreateInput): Promise<User> { return this.prisma.user.create({ data }); }
  findByEmail(email: string): Promise<User | null> { return this.prisma.user.findUnique({ where: { email } }); }
  findById(id: string): Promise<User | null> { return this.prisma.user.findUnique({ where: { id } }); }
  updateRefreshToken(userId: string, refreshTokenHash: string | null): Promise<User> { return this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash } }); }
}
