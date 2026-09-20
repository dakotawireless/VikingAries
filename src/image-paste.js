const MAX_IMAGE_DIMENSION = 768;
const JPEG_QUALITY = 0.72;
const MAX_DATA_URL_LENGTH = 120000;

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
  const separatorBefore = before && !/[\\s]$/.test(before) ? " " : "";
  const separatorAfter = after && !/^[\\s]/.test(after) ? " " : "";
  const nextValue = `${before}${separatorBefore}${value}${separatorAfter}${after}`;
  textarea.value = nextValue;
  textarea.selectionStart = textarea.selectionEnd = before.length + separatorBefore.length + value.length + separatorAfter.length;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setComposerStatus(message) {
  const workspace = document.querySelector(".workspace");
  if (!workspace) return;
  const status = workspace.querySelector(".chat-connection-status");
  if (!status) return;
  const previous = status.textContent;
  status.textContent = message;
  window.setTimeout(() => {
    if (status.isConnected && status.textContent === message) status.textContent = previous || "Ready";
  }, 2400);
}

function enablePastedImages() {
  document.addEventListener("paste", async (event) => {
    const textarea = event.target?.closest?.(".composer textarea");
    if (!textarea) return;
    const image = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
    if (!image) return;

    event.preventDefault();
    setComposerStatus("Preparing pasted image…");
    try {
      const dataUrl = await resizeImage(image.getAsFile());
      insertAtCursor(textarea, `![Pasted image](${dataUrl})`);
      setComposerStatus("Image attached");
    } catch (error) {
      setComposerStatus(error.message || "Could not attach image");
    }
  });
}

// This runs before React mounts so pasted images work with the existing controlled composer.
enablePastedImages();
