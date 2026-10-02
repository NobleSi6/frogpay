import { ValueObject } from '../../../../shared/domain/value-object.base';

export interface TaxIdProps {
  value: string;
}

/**
 * Value Object para identificación tributaria (NIT en Bolivia o CI empresarial).
 * Cumple con validaciones de formato alfanumérico limpio de 5 a 20 caracteres.
 */
export class TaxId extends ValueObject<TaxIdProps> {
  private constructor(props: TaxIdProps) {
    super({ value: props.value.trim().toUpperCase() });
  }

  get value(): string {
    return this.props.value;
  }

  public static create(taxId: string): TaxId {
    if (!taxId || taxId.trim().length === 0) {
      throw new Error('El NIT o documento tributario no puede estar vacío');
    }

    const cleanTaxId = taxId.trim().toUpperCase();
    const regex = /^[A-Z0-9-]{5,20}$/;

    if (!regex.test(cleanTaxId)) {
      throw new Error(
        `El NIT o documento tributario '${taxId}' tiene un formato inválido. Debe contener entre 5 y 20 caracteres alfanuméricos`,
      );
    }

    return new TaxId({ value: cleanTaxId });
  }
}
