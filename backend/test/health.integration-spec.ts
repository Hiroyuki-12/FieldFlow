import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('Health API (integration)', () => {
  let app: INestApplication;
  const query = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: DataSource,
          // この段階ではHTTP経路の結合を検証し、実MySQLはDB基盤IssueのTestcontainersで検証する。
          useValue: { query },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([{ 1: 1 }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/healthがDB疎通を確認して200を返す', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });
});
