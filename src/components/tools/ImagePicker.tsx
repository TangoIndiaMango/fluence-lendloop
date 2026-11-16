"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { IMAGE_TYPES, type Category } from "@convex/lib/constants";
import { useImageUpload } from "@/hooks/useImageUpload";
import { ToolImage } from "./CategoryArt";

/** `undefined` = keep the current photo, `null` = remove it, id = new photo. */
export type ImageChoice = Id<"_storage"> | null | undefined;

export function ImagePicker({
  currentUrl,
  category,
  name,
  onChange,
}: {
  currentUrl: string | null;
  category: Category;
  name: string;
  onChange: (choice: ImageChoice) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error } = useImageUpload();
  const [preview, setPreview] = useState<string | null>(currentUrl);

  // Free the local preview URL when it's replaced or the form closes.
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const id = await upload(file);
    if (id) {
      setPreview(URL.createObjectURL(file));
      onChange(id);
    }
  };

  return (
    <div>
      <span className="label">
        Photo <span className="font-normal text-muted">(optional)</span>
      </span>
      <div className="flex items-center gap-3">
        <ToolImage src={preview} category={category} name={name || "your tool"} className="h-20 w-28 shrink-0 rounded-lg border border-border" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading…" : preview ? "Change photo" : "Add photo"}
          </button>
          {preview && !uploading && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setPreview(null);
                onChange(null);
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a photo"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <p className={`mt-1 text-xs ${error ? "text-red-700" : "text-muted"}`} role={error ? "alert" : undefined}>
        {error ?? "JPEG, PNG or WebP, up to 5 MB. Only signed-in neighbours see it."}
      </p>
    </div>
  );
}
