import type { FastifyInstance } from 'fastify';
import { signDriverToken } from '../modules/driver/driver-token-verifier.js';
import type { PrismaDriverAuthRepository } from '../modules/driver/driver-auth.repository.js';

export type DriverAuthDependencies = {
  driverAuthRepository: PrismaDriverAuthRepository;
  jwtSecret: string;
};

export function registerDriverAuthRoutes(app: FastifyInstance, dependencies: DriverAuthDependencies): void {
  app.post<{ Body: { phone: string; inviteCode: string } }>('/driver/auth/verify-invite', async (request, reply) => {
    const { phone, inviteCode } = request.body;

    if (typeof phone !== 'string' || typeof inviteCode !== 'string') {
      return reply.code(400).send({ data: null, error: { code: 'BAD_REQUEST', message: 'phone and inviteCode are required' } });
    }

    try {
      const sessionInfo = await dependencies.driverAuthRepository.verifyInvite({ phone, inviteCode });
      
      const tokenResult = signDriverToken(
        {
          driverId: sessionInfo.driverId,
          expiresInSeconds: 15 * 60, // 15 minutes access token
          shopDomain: sessionInfo.shopDomain,
          subject: `driver:${sessionInfo.driverId}`
        },
        { secret: dependencies.jwtSecret }
      );

      return reply.code(200).send({
        data: {
          accessToken: tokenResult.token,
          expiresAt: tokenResult.expiresAt,
          refreshToken: sessionInfo.refreshToken,
          refreshTokenExpiresAt: sessionInfo.expiresAt.toISOString()
        },
        error: null
      });
    } catch (error) {
      return reply.code(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: (error as Error).message } });
    }
  });
}
