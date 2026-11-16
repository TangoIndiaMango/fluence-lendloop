"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { IMAGE_TYPES, LIMITS } from "@convex/lib/constants";

/**
 * Upload a photo straight to Convex storage: ask for a one-time URL, POST
 * the file, get a storage id back. The checks here are for quick feedback
 * only; the server re-checks type and size from storage metadata.
 */
export function useImageUpload() {
  const generateUploadUrl = useMutation(api.tools.generateUploadUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<Id<"_storage"> | null> => {
      setError(null);
      if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
        setError("Choose a JPEG, PNG or WebP photo.");
        return null;
      }
      if (file.size > LIMITS.imageMaxBytes) {
        setError("That photo is over 5 MB. Try a smaller one.");
        return null;
      }
      setUploading(true);
      try {
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!res.ok) throw new Error(`upload failed: ${res.status}`);
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        return storageId;
      } catch {
        setError("Upload failed. Check your connection and try again.");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [generateUploadUrl],
  );

  return { upload, uploading, error };
}
