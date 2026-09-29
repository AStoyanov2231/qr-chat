export async function prepareAvatar(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a photo smaller than 20 MB.");
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); }
  catch { throw new Error("This photo could not be opened. Choose another photo."); }
  try {
    const size = Math.min(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the photo. Try another browser.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 512, 512);
    context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 512, 512);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare this photo.")), "image/jpeg", 0.85));
  } finally { image.close(); }
}
