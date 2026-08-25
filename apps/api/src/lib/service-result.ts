export type ServiceFailure<TStatus extends number = number, TCode extends string = string> = {
  ok: false;
  status: TStatus;
  error: {
    code: TCode;
    message: string;
  };
};

export type ServiceSuccess<
  TStatus extends number = number,
  TBody extends object = Record<string, never>,
> = {
  ok: true;
  status: TStatus;
} & TBody;

export function failure<const TStatus extends number, const TCode extends string>(
  status: TStatus,
  code: TCode,
  message: string,
): ServiceFailure<TStatus, TCode> {
  return {
    ok: false,
    status,
    error: {
      code,
      message,
    },
  };
}

export function success<const TStatus extends number>(status: TStatus): ServiceSuccess<TStatus>;
export function success<const TStatus extends number, const TBody extends object>(
  status: TStatus,
  body: TBody,
): ServiceSuccess<TStatus, TBody>;
export function success(status: number, body: object = {}) {
  return {
    ok: true,
    status,
    ...body,
  };
}
