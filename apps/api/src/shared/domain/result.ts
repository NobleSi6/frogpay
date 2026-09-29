export class Result<T> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  public readonly error: string | null;
  private readonly _value?: T;

  private constructor(isSuccess: boolean, error?: string | null, value?: T) {
    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this.error = error ?? null;
    this._value = value;
  }

  public getValue(): T {
    if (!this.isSuccess) {
      throw new Error(`No se puede obtener el valor de un resultado fallido: ${this.error}`);
    }
    return this._value as T;
  }

  public static ok<U>(value?: U): Result<U> {
    return new Result<U>(true, null, value);
  }

  public static fail<U>(error: string): Result<U> {
    return new Result<U>(false, error);
  }
}
