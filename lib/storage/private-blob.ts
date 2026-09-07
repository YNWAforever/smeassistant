import "server-only";
import { issueSignedToken, presignUrl, put, list, del } from "@vercel/blob";

export type PrivateNamespace = "workspace-assets" | "report-evidence";
export function privateObjectPath(namespace: PrivateNamespace, path: string): string {
  if (!path || path.length > 1024 || path.startsWith("/") || /[%\\?#*\x00-\x1f]/.test(path)
    || path.split("/").some(segment => !segment || segment === "." || segment === "..") || path.includes(":")) {
    throw new Error("private_blob_path_invalid");
  }
  return `${namespace}/${path}`;
}
export function createPrivateBlobStorage(config = {
  token: process.env.BLOB_READ_WRITE_TOKEN ?? "",
  storeId: process.env.BLOB_STORE_ID ?? "",
}) {
  if (!config.token || !/^store_[A-Za-z0-9]+$/.test(config.storeId)) throw new Error("private_blob_not_configured");
  if (!config.token.startsWith("vercel_blob_rw_") || config.token.split("_")[3] !== config.storeId.slice(6)) throw new Error("private_blob_store_mismatch");
  const origin = `https://${config.storeId.slice(6).toLowerCase()}.private.blob.vercel-storage.com`;
  return {
    async upload(namespace: PrivateNamespace, path: string, bytes: Uint8Array | ArrayBuffer | Blob, options: { contentType: string; overwrite: boolean }): Promise<void> {
      const pathname = privateObjectPath(namespace, path);
      const size = bytes instanceof Blob ? bytes.size : bytes.byteLength;
      const allowed = namespace === "report-evidence" ? ["image/jpeg", "image/png", "image/webp"] : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!size || size > 5 * 1024 * 1024 || !allowed.includes(options.contentType)) throw new Error("private_blob_upload_invalid");
      const result = await put(pathname, bytes instanceof Uint8Array ? Buffer.from(bytes) : bytes, { ...config, access: "private", addRandomSuffix: false, allowOverwrite: options.overwrite, contentType: options.contentType, cacheControlMaxAge: 60 });
      if (result.pathname !== pathname || new URL(result.url).origin !== origin || decodeURIComponent(new URL(result.url).pathname) !== `/${pathname}`) throw new Error("private_blob_upload_path_invalid");
    },
    async remove(namespace: PrivateNamespace, paths: string[]): Promise<void> {
      if (paths.length > 100) throw new Error("private_blob_remove_too_large");
      if (paths.length) await del(paths.map(path => privateObjectPath(namespace, path)), config);
    },
    async list(namespace: PrivateNamespace, prefix: string, options: { limit: number; cursor?: string }) {
      const ownedPrefix = privateObjectPath(namespace, prefix) + "/";
      if (options.limit < 1 || options.limit > 100) throw new Error("private_blob_list_limit_invalid");
      const result = await list({ ...config, prefix: ownedPrefix, ...options, mode: "expanded" });
      const paths = result.blobs.map(blob => {
        if (!blob.pathname.startsWith(ownedPrefix)) throw new Error("private_blob_list_path_invalid");
        const relative = blob.pathname.slice(namespace.length + 1);
        privateObjectPath(namespace, relative);
        return relative;
      });
      if (result.hasMore && (!result.cursor || result.cursor === options.cursor)) throw new Error("private_blob_cursor_invalid");
      return { paths, hasMore: result.hasMore, cursor: result.cursor };
    },
    async sign(namespace: PrivateNamespace, path: string, seconds: 60 | 300): Promise<string> {
      const pathname = privateObjectPath(namespace, path);
      if (seconds !== 60 && seconds !== 300) throw new Error("private_blob_expiry_invalid");
      const validUntil = Date.now() + seconds * 1000;
      const material = await issueSignedToken({ ...config, pathname, operations: ["get"], validUntil });
      // SDK token format is base64url JSON plus store signature. Check the issued
      // scope before returning the delegation embedded in the native URL.
      try {
        const scope = JSON.parse(Buffer.from(material.delegationToken.split(".")[0], "base64url").toString("utf8"));
        if (scope.storeId !== config.storeId || scope.pathname !== pathname || scope.validUntil !== validUntil
          || !Array.isArray(scope.operations) || scope.operations.length !== 1 || scope.operations[0] !== "get") throw new Error();
      } catch { throw new Error("private_blob_delegation_invalid"); }
      if (material.validUntil !== validUntil) throw new Error("private_blob_expiry_invalid");
      const { presignedUrl } = await presignUrl(material, { access: "private", operation: "get", pathname, validUntil });
      const url = new URL(presignedUrl);
      if (url.origin !== origin || decodeURIComponent(url.pathname) !== `/${pathname}` || url.username || url.password || url.hash
        || [...url.searchParams.keys()].some(key => !["vercel-blob-delegation", "vercel-blob-signature"].includes(key))
        || url.searchParams.getAll("vercel-blob-delegation").length !== 1 || !url.searchParams.get("vercel-blob-delegation")
        || url.searchParams.getAll("vercel-blob-signature").length !== 1 || !url.searchParams.get("vercel-blob-signature")) {
        throw new Error("private_blob_signed_url_invalid");
      }
      return url.href;
    },
  };
}


