// Browser-only: re-encode an image as a JPEG that fits the robot's 320×240 screen and a byte budget.
// Returns plain base64 (no data: prefix).
export async function fitJpeg(source: Blob | string, maxBase64: number): Promise<string> {
  const url = typeof source === "string" ? `data:image/jpeg;base64,${source}` : URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Webbläsaren kan inte bearbeta bilder.");
    for (const scale of [1, 0.75, 0.5, 0.35]) {
      const fit = Math.min(320 / img.naturalWidth, 240 / img.naturalHeight, 1) * scale;
      canvas.width = Math.max(1, Math.round(img.naturalWidth * fit));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * fit));
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.65, 0.5, 0.35, 0.2]) {
        const b64 = canvas.toDataURL("image/jpeg", q).split(",")[1] ?? "";
        if (b64.length <= maxBase64) return b64;
      }
    }
    throw new Error("Bilden blev för stor även efter förminskning.");
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}
