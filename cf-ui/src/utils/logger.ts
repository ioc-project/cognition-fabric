import * as log from 'loglevel';
import config from '../config';

log.setDefaultLevel((config.LOG_LEVEL as log.LogLevelDesc) ?? 'info');

type customLogger = {
  info: (...msg: any[]) => void;
  debug: (...msg: any[]) => void;
  trace: (...msg: any[]) => void;
  warn: (...msg: any[]) => void;
  error: (...msg: any[]) => void;
};

const logger = log.noConflict() as customLogger;
export default logger;
