import { environmentValidationSchema } from './environment.schema';

const validEnvironment = {
  NODE_ENV: 'development',
  PORT: 8080,
  CORS_ORIGIN: 'http://localhost:5173',
  DB_HOST: '127.0.0.1',
  DB_PORT: 3306,
  DB_NAME: 'fieldflow',
  DB_USER: 'fieldflow',
  DB_PASSWORD: 'fieldflow',
};

describe('environmentValidationSchema', () => {
  it('標準portと必須DB設定を受け入れる', () => {
    const result = environmentValidationSchema.validate(validEnvironment, {
      abortEarly: false,
    });

    expect(result.error).toBeUndefined();
  });

  it('必須値が不足している場合は起動前に検出する', () => {
    const result = environmentValidationSchema.validate(
      {
        ...validEnvironment,
        DB_PASSWORD: undefined,
      },
      {
        abortEarly: false,
      },
    );

    expect(result.error?.message).toContain('DB_PASSWORD');
  });

  it('規定外portへ逃げる設定を拒否する', () => {
    const result = environmentValidationSchema.validate({
      ...validEnvironment,
      PORT: 8081,
    });

    expect(result.error?.message).toContain('PORT');
  });
});
