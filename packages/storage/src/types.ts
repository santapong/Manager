export interface PutSignedUrlArgs {
  key: string;
  contentType: string;
  contentLengthMax?: number;
  expiresInSeconds?: number;
}

export interface GetSignedUrlArgs {
  key: string;
  expiresInSeconds?: number;
}

export interface BlobMetadata {
  key: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
}

export interface BlobService {
  /** Returns a one-time signed URL for direct upload. The vendor URL never leaves the adapter. */
  putSignedUrl(args: PutSignedUrlArgs): Promise<{ url: string; method: "PUT" | "POST" }>;
  /** Returns a signed download URL. */
  getSignedUrl(args: GetSignedUrlArgs): Promise<{ url: string; expiresAt: Date }>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<BlobMetadata | null>;
}
