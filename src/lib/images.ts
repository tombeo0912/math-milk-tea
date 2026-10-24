import { MAX_FILE_BYTES } from "./domain";

export async function processSubmissionImage(
  file: File,
  rotation: number,
): Promise<File> {
  const source = await createImageBitmap(file);
  const normalized = ((rotation % 360) + 360) % 360;
  const swap = normalized === 90 || normalized === 270;
  const maxDimension = 2400;
  const scale = Math.min(
    1,
    maxDimension / Math.max(source.width, source.height),
  );
  const originalWidth = Math.round(source.width * scale);
  const originalHeight = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = swap ? originalHeight : originalWidth;
  canvas.height = swap ? originalWidth : originalHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Trình duyệt không thể xử lý ảnh này.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((normalized * Math.PI) / 180);
  context.drawImage(
    source,
    -originalWidth / 2,
    -originalHeight / 2,
    originalWidth,
    originalHeight,
  );
  source.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Không thể nén ảnh.")),
      "image/webp",
      0.9,
    ),
  );
  if (blob.size > MAX_FILE_BYTES)
    throw new Error(`Ảnh ${file.name} vẫn lớn hơn 5 MB sau khi xử lý.`);
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
    type: "image/webp",
  });
}
