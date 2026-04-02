export class LinkExpiredError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Share link has expired: ${url}`);
    this.name = 'LinkExpiredError';
    this.url = url;
  }
}

export class LinkBlockedError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Share link has been blocked: ${url}`);
    this.name = 'LinkBlockedError';
    this.url = url;
  }
}

export class LinkCancelledError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Share link has been cancelled: ${url}`);
    this.name = 'LinkCancelledError';
    this.url = url;
  }
}

export class UploadQuotaError extends Error {
  constructor() {
    super('YouTube API daily upload quota exceeded. Try again tomorrow.');
    this.name = 'UploadQuotaError';
  }
}
