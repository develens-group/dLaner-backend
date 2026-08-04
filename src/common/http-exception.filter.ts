import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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
