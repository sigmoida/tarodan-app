import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SuratGonderiPayload } from './surat-cargo.types';

export interface SuratSoapCallOptions {
  timeoutMs: number;
}

/**
 * Abstraction over GonderiyiKargoyaGonderYeni — returns raw string from carrier.
 */
export abstract class SuratSoapClient {
  abstract callGonderiyiKargoyaGonderYeni(
    payload: SuratGonderiPayload,
    options: SuratSoapCallOptions,
  ): Promise<string>;
}

/**
 * Config-driven stub for dev/test. SURAT_STUB_RESPONSE defaults to Tamam.
 * SURAT_STUB_THROW=TIMEOUT|NETWORK|HTTP_5XX|PARSE_ERROR|EMPTY|UNKNOWN simulates technical failures.
 */
@Injectable()
export class StubSuratSoapClient extends SuratSoapClient {
  private readonly logger = new Logger(StubSuratSoapClient.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async callGonderiyiKargoyaGonderYeni(
    payload: SuratGonderiPayload,
    _options: SuratSoapCallOptions,
  ): Promise<string> {
    const sim = this.configService.get<string>('SURAT_STUB_THROW', '')?.trim().toUpperCase();
    this.logger.debug(
      `Stub Surat call ref=${payload.externalReference} sim=${sim || 'none'}`,
    );

    if (sim === 'TIMEOUT') {
      const err = new Error('ETIMEDOUT');
      (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      throw err;
    }
    if (sim === 'NETWORK') {
      const err = new Error('ECONNRESET');
      (err as NodeJS.ErrnoException).code = 'ECONNRESET';
      throw err;
    }
    if (sim === 'HTTP_5XX') {
      const err = new Error('HTTP 500');
      (err as any).statusCode = 500;
      throw err;
    }
    if (sim === 'SOAP_FAULT') {
      throw new Error('SOAP Fault: server');
    }
    if (sim === 'PARSE_ERROR') {
      throw new Error('Unexpected XML');
    }
    if (sim === 'EMPTY') {
      return '';
    }
    if (sim === 'UNKNOWN') {
      throw new Error('unknown stub error');
    }

    return this.configService.get<string>('SURAT_STUB_RESPONSE', 'Tamam');
  }
}

/**
 * Placeholder for real SOAP — enable with SURAT_SOAP_MODE=live when implemented.
 */
@Injectable()
export class LiveSuratSoapClient extends SuratSoapClient {
  private readonly logger = new Logger(LiveSuratSoapClient.name);

  async callGonderiyiKargoyaGonderYeni(
    payload: SuratGonderiPayload,
    _options: SuratSoapCallOptions,
  ): Promise<string> {
    this.logger.warn(
      `Live Surat SOAP not implemented; ref=${payload.externalReference}`,
    );
    throw new Error('SURAT_SOAP_LIVE_NOT_IMPLEMENTED');
  }
}
