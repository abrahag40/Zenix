import { Module } from '@nestjs/common'
import { InvitacionDeStaffService } from './invitacion/invitacion-de-staff.service'
import { InvitacionDeStaffController } from './invitacion/invitacion-de-staff.controller'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { NovaModule } from '../nova/nova.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'

@Module({
  imports: [
    NovaModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [InvitacionDeStaffController, AuthController],
  providers: [InvitacionDeStaffService, AuthService, JwtStrategy],
  exports: [InvitacionDeStaffService, JwtModule],
})
export class AuthModule {}
