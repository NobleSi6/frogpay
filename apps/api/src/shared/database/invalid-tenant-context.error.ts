export class InvalidTenantContextError extends Error {
  constructor() {
    super('El identificador del tenant debe ser un UUID válido.');
    this.name = InvalidTenantContextError.name;
  }
}