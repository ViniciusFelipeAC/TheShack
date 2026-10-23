/** Erro com status HTTP e código estável. A API converte para { error: { code, message, details } }. */
export class HttpError extends Error {
  readonly status: 400 | 401 | 404 | 409 | 429 | 500;
  readonly code: string;
  readonly details: unknown;

  constructor(status: HttpError['status'], code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'invalid_request', message, details);
export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} não encontrado.`);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
