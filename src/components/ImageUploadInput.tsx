"use client";

import { useRef, useState } from "react";

async function resizePhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

export function ImageUploadInput({ id, name = "images", multiple = true }: { id: string; name?: string; multiple?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);

  async function prepareFiles() {
    const input = inputRef.current;
    if (!input?.files?.length) return;
    setSelectedCount(input.files.length);
    setProcessing(true);
    input.setCustomValidity("Photos are being optimized. Please wait a moment.");
    try {
      const resized = await Promise.all(Array.from(input.files, resizePhoto));
      const transfer = new DataTransfer();
      resized.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      input.setCustomValidity("");
    } catch {
      input.setCustomValidity("These photos could not be prepared. Please choose them again.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <span className="image-upload-control">
      <input ref={inputRef} id={id} name={name} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={multiple} onChange={() => void prepareFiles()} />
      <small aria-live="polite">{processing ? `Optimizing ${selectedCount} ${selectedCount === 1 ? "photo" : "photos"}…` : `${selectedCount ? `${selectedCount} ${selectedCount === 1 ? "photo" : "photos"} selected. ` : multiple ? "Select multiple photos at once. " : "Select a photo. "}Photos are resized on your device for faster loading.`}</small>
    </span>
  );
}
