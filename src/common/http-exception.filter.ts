import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload === 'object' && 'message' in payload
          ? (payload as { message: string | string[] }).message
          : 'Internal server error';
    res.locals.errorCode =
      exception instanceof HttpException
        ? exception.name.replace(/Exception$/, '').toUpperCase()
        : 'INTERNAL_SERVER_ERROR';
    res.locals.errorMessage = Array.isArray(message) ? message[0] : message;
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    const details =
      payload && typeof payload === 'object'
        ? Object.fromEntries(
            Object.entries(payload).filter(
              ([key]) => !['statusCode', 'message', 'error'].includes(key),
            ),
          )
        : {};
    res
      .status(status)
      .json({ error: { statusCode: status, message, ...details }, meta: null });
  }
}
