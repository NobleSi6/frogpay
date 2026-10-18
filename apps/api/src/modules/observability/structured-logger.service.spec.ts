import { StructuredLoggerService } from './structured-logger.service';

describe('StructuredLoggerService', () => {
  let logger: StructuredLoggerService;
  let output: jest.SpyInstance;

  beforeEach(() => {
    logger = new StructuredLoggerService();
    output = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe generar logs JSON', () => {
    logger.log({
      event: 'payment.created',
      requestId: 'req-123',
      tenantId: 'tenant-456',
    });

    const line = output.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);

    expect(parsed.level).toBe('log');
    expect(parsed.message.requestId).toBe('req-123');
    expect(parsed.message.tenantId).toBe('tenant-456');
  });

  it('debe ocultar credenciales y PAN', () => {
    logger.log({
      password: 'super-secreto',
      apiKey: 'clave-privada',
      cardNumber: '4111111111111111',
      authorization: 'Bearer token-secreto',
    });

    const line = output.mock.calls[0][0] as string;

    expect(line).not.toContain('super-secreto');
    expect(line).not.toContain('clave-privada');
    expect(line).not.toContain('4111111111111111');
    expect(line).not.toContain('token-secreto');
    expect(line).toContain('[REDACTED]');
  });
});
