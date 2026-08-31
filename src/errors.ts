export class UsageError extends Error {
  readonly exitCode = 2;
}

export class ApiRequestError extends Error {
  readonly exitCode = 1;

  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string
  ) {
    super(message);
  }
}

