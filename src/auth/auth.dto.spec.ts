import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './auth.dto';

describe('RegisterDto', () => {
  it('normalizes email and accepts a strong password', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: ' User@Example.COM ',
      password: 'StrongPass123',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
  });
  it.each(['short', 'alllowercase123', 'ALLUPPERCASE123', 'NoNumbersHere'])(
    'rejects weak password %s',
    async (password) => {
      const dto = plainToInstance(RegisterDto, {
        email: 'u@example.com',
        password,
      });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
  it('rejects unknown fields when used by the global validation pipe', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'not-an-email',
      password: 'StrongPass123',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
