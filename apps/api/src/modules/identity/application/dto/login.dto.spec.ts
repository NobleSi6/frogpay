import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('accepts a non-empty password without applying activation length rules', async () => {
    const dto = new LoginDto();
    dto.email = 'owner@example.test';
    dto.password = 'wrong';

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('keeps required and email format validation', async () => {
    const dto = new LoginDto();
    dto.email = 'invalid';
    dto.password = '';

    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['email', 'password']));
  });
});
