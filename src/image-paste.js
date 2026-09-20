const MAX_IMAGE_DIMENSION = 256;
const JPEG_QUALITY = 0.55;
const MAX_DATA_URL_LENGTH = 9000;

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Your browser could not prepare the pasted image."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      if (dataUrl.length > MAX_DATA_URL_LENGTH) {
        reject(new Error("That image is still too large after resizing. Try a smaller image."));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The pasted image could not be read."));
    };
    image.src = objectUrl;
  });
}

function insertAtCursor(textarea, value) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const separatorBefore = before && !/[\s]$/.test(before) ? " " : "";
  const separatorAfter = after && !/^[\s]/.test(after) ? " " : "";
  textarea.value = `${before}${separatorBefore}${value}${separatorAfter}${after}`;
  textarea.selectionStart = textarea.selectionEnd = before.length + separatorBefore.length + value.length + separatorAfter.length;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setComposerStatus(message) {
  const workspace = document.querySelector(".workspace");
  const status = workspace?.querySelector(".chat-connection-status");
  if (!status) return;
  const previous = status.textContent;
  status.textContent = message;
  window.setTimeout(() => {
    if (status.isConnected && status.textContent === message) status.textContent = previous || "Ready";
  }, 2400);
}

function removeThumbnail(textarea) {
  const composer = textarea.closest(".composer");
  const preview = composer?.querySelector(".pasted-image-preview");
  preview?.remove();
  composer?.classList.remove("has-pasted-image");
}

function showThumbnail(textarea, dataUrl) {
  const composer = textarea.closest(".composer");
  if (!composer) return;

  removeThumbnail(textarea);
  composer.classList.add("has-pasted-image");

  const preview = document.createElement("div");
  preview.className = "pasted-image-preview";
  preview.setAttribute("role", "status");
  preview.setAttribute("aria-label", "Pasted image attached");

  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = "Pasted image thumbnail";

  const label = document.createElement("span");
  label.textContent = "Image attached";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "pasted-image-remove";
  remove.setAttribute("aria-label", "Remove pasted image");
  remove.title = "Remove pasted image";
  remove.textContent = "×";
  remove.addEventListener("click", () => {
    const marker = /!\\[Pasted image\\]\\([^)]*\\)/g;
    textarea.value = textarea.value.replace(marker, "").replace(/\\s{2,}/g, " ").trim();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    removeThumbnail(textarea);
    textarea.focus();
  });

  preview.append(image, label, remove);
  composer.appendChild(preview);
}

function enablePastedImages() {
  document.addEventListener("paste", async (event) => {
    const textarea = event.target?.closest?.(".composer textarea");
    if (!textarea) return;
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    event.preventDefault();
    setComposerStatus("Preparing pasted image…");
    try {
      const dataUrl = await resizeImage(imageItem.getAsFile());
      insertAtCursor(textarea, `![Pasted image](${dataUrl})`);
      showThumbnail(textarea, dataUrl);
      setComposerStatus("Image attached");
    } catch (error) {
      setComposerStatus(error.message || "Could not attach image");
    }
  });

  document.addEventListener("input", (event) => {
    const textarea = event.target?.closest?.(".composer textarea");
    if (textarea && !/!\[Pasted image\]\(/.test(textarea.value)) removeThumbnail(textarea);
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.matches?.(".composer")) {
      window.setTimeout(() => {
        const textarea = event.target.querySelector("textarea");
        if (textarea && !textarea.value) removeThumbnail(textarea);
      }, 0);
    }
  }, true);
}

enablePastedImages();
