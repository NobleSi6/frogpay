import { ValueObject } from '../../../../shared/domain/value-object.base';

export interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super({ value: props.value.toLowerCase().trim() });
  }

  get value(): string {
    return this.props.value;
  }

  public static create(email: string): Email {
    if (!email || email.trim().length === 0) {
      throw new Error('El correo electrónico no puede estar vacío');
    }

    // Regex básico para validar correos
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email.trim())) {
      throw new Error(`El formato del correo electrónico es inválido: ${email}`);
    }

    return new Email({ value: email });
  }
}
