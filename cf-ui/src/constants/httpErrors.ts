import {HttpStatusCode} from 'axios';

export const httpErrors = {
  UNAUTHORIZED: HttpStatusCode.Unauthorized,
  FORBIDDEN: HttpStatusCode.Forbidden,
  BAD_REQUEST: HttpStatusCode.BadRequest,
  NOT_FOUND: HttpStatusCode.NotFound
};

export const httpErrorsAuth = [HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden];
