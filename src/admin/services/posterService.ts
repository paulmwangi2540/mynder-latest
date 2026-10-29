import { resolveImageUrl } from "./imageService";
import type { UniversityRecord } from "./universitiesService";

export const POSTER_WIDTH = 768;
export const POSTER_HEIGHT = 1024;
export const DEFAULT_POSTER_COLOR = "#FF5A12";

export interface PosterColor {
  color: string;
  usedFallback: boolean;
}

export type PosterProgress = "loading-photo" | "drawing-poster";

export function getPosterColor(university: UniversityRecord): PosterColor {
  const configured = university.customColor?.trim() ?? "";
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(configured)) {
    return { color: configured, usedFallback: false };
  }
  return { color: DEFAULT_POSTER_COLOR, usedFallback: true };
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("The selected photo could not be decoded as an image."));
    };
    image.src = sourceUrl;
  });
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
): void {
  const scale = Math.max(
    POSTER_WIDTH / image.naturalWidth,
    POSTER_HEIGHT / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (POSTER_WIDTH - drawWidth) / 2,
    (POSTER_HEIGHT - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawInstagramIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  context.save();
  const instagramGradient = context.createLinearGradient(x, y + 28, x + 28, y);
  instagramGradient.addColorStop(0, "#FCAF45");
  instagramGradient.addColorStop(0.35, "#F77737");
  instagramGradient.addColorStop(0.62, "#E1306C");
  instagramGradient.addColorStop(0.82, "#C13584");
  instagramGradient.addColorStop(1, "#833AB4");
  context.strokeStyle = instagramGradient;
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(x, y, 28, 28, 7);
  context.stroke();
  context.beginPath();
  context.arc(x + 14, y + 14, 6.5, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(x + 21, y + 7, 1.5, 0, Math.PI * 2);
  context.fillStyle = instagramGradient;
  context.fill();
  context.restore();
}

function drawTextPlate(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 10;
  context.beginPath();
  context.moveTo(x + 12, y);
  context.lineTo(x + width - 20, y);
  context.lineTo(x + width, y + height / 2);
  context.lineTo(x + width - 20, y + height);
  context.lineTo(x + 12, y + height);
  context.lineTo(x, y + height / 2);
  context.closePath();

  context.fillStyle = color;
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255, 255, 255, 0.8)";
  context.lineWidth = 1.25;
  context.stroke();

  context.beginPath();
  context.moveTo(x + 16, y + 4);
  context.lineTo(x + width - 22, y + 4);
  context.lineTo(x + width - 4, y + height / 2);
  context.lineTo(x + width - 22, y + height - 4);
  context.strokeStyle = "rgba(255, 255, 255, 0.38)";
  context.lineWidth = 0.75;
  context.stroke();
  context.restore();
}

function drawPoster(
  photo: HTMLImageElement,
  color: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the poster canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  drawCoverImage(context, photo);

  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  context.beginPath();
  context.roundRect(21, 15, POSTER_WIDTH - 42, POSTER_HEIGHT - 30, 22);
  context.stroke();
  context.restore();

  drawTextPlate(context, POSTER_WIDTH - 196, 39, 154, 32, color);
  context.save();
  context.fillStyle = "#FFFFFF";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "500 13px Arial, sans-serif";
  context.fillText("mylnder.com", POSTER_WIDTH - 119, 55);

  const instagramPlateY = POSTER_HEIGHT - 133;
  const instagramLabel = "@mylnderofficial";
  const iconX = 56;
  const textX = 100;
  const maximumTextWidth = POSTER_WIDTH - 84 - (textX - 42) - 28;
  context.font = "500 18px Arial, sans-serif";
  let textFontSize = 18;
  while (
    context.measureText(instagramLabel).width > maximumTextWidth &&
    textFontSize > 12
  ) {
    textFontSize -= 1;
    context.font = `500 ${textFontSize}px Arial, sans-serif`;
  }
  let visibleInstagramLabel = instagramLabel;
  if (context.measureText(visibleInstagramLabel).width > maximumTextWidth) {
    while (
      visibleInstagramLabel.length > 1 &&
      context.measureText(`${visibleInstagramLabel}…`).width > maximumTextWidth
    ) {
      visibleInstagramLabel = visibleInstagramLabel.slice(0, -1);
    }
    visibleInstagramLabel = `${visibleInstagramLabel}…`;
  }
  const textWidth = Math.min(
    context.measureText(visibleInstagramLabel).width,
    maximumTextWidth,
  );
  const plateWidth = Math.min(
    POSTER_WIDTH - 84,
    (textX - 42) + textWidth + 28,
  );
  drawTextPlate(context, 42, instagramPlateY, plateWidth, 50, color);
  drawInstagramIcon(context, iconX, instagramPlateY + 11);
  context.textAlign = "left";
  context.fillStyle = "#FFFFFF";
  context.font = `500 ${textFontSize}px Arial, sans-serif`;
  context.fillText(visibleInstagramLabel, textX, instagramPlateY + 25);
  context.restore();

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The poster could not be exported as a PNG."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function fetchSelectedPhoto(photoUrl: string): Promise<Blob> {
  let resolvedUrl = await resolveImageUrl(photoUrl, { refresh: true });
  let response: Response;

  try {
    response = await fetch(resolvedUrl, { cache: "no-store" });
  } catch {
    throw new Error(
      "The photo could not be reached. Check your connection and the image server's CORS settings.",
    );
  }

  if (
    !response.ok &&
    [401, 403, 404].includes(response.status) &&
    new URL(photoUrl, window.location.origin).pathname.startsWith("/api/images/")
  ) {
    resolvedUrl = await resolveImageUrl(photoUrl, { refresh: true });
    try {
      response = await fetch(resolvedUrl, { cache: "no-store" });
    } catch {
      throw new Error(
        "The refreshed photo URL could not be reached. Check image access and storage CORS settings.",
      );
    }
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("You are not authorized to access this photo. Sign in again or check admin permissions.");
    }
    throw new Error(`The selected photo could not be loaded (HTTP ${response.status}).`);
  }

  const photoBlob = await response.blob();
  if (!photoBlob.type.startsWith("image/")) {
    throw new Error("The selected photo did not return a valid image.");
  }
  return photoBlob;
}

export async function generateAdminUserPoster(
  university: UniversityRecord,
  photoUrl: string,
  onProgress?: (progress: PosterProgress) => void,
): Promise<Blob> {
  const selectedPhoto = photoUrl.trim();
  if (!selectedPhoto) {
    throw new Error("Select a user photo before generating a poster.");
  }
  if (!university.id || !university.name.trim()) {
    throw new Error("The user's university could not be resolved.");
  }

  const photoBlob = await fetchSelectedPhoto(selectedPhoto);
  return generatePosterFromImage(photoBlob, getPosterColor(university).color, onProgress);
}

export async function generatePosterFromImage(
  imageBlob: Blob,
  color = DEFAULT_POSTER_COLOR,
  onProgress?: (progress: PosterProgress) => void,
): Promise<Blob> {
  if (!imageBlob.type.startsWith("image/")) {
    throw new Error("Choose a valid image file to create a frame.");
  }
  onProgress?.("loading-photo");
  const photo = await loadImage(imageBlob);

  onProgress?.("drawing-poster");
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) {
    throw new Error("Choose a valid frame color.");
  }
  return canvasToBlob(drawPoster(photo, color));
}
