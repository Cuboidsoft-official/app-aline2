export interface AttachmentItem {
  uri: string;
  kind?: string;
  type?: string;
  [key: string]: any;
}

export interface AttachmentPreviewResult {
  total: number;
  visible: AttachmentItem[];
  extraCount: number;
}

export function getAttachmentPreviewThumbs(
  attachments: AttachmentItem[] = [],
  maxVisible: number = 4
): AttachmentPreviewResult {
  const images = attachments.filter(
    (item) => item && (item.kind === "image" || item.type === "image")
  );
  const total = images.length > 0 ? images.length : attachments.length;
  const list = images.length > 0 ? images : attachments;
  const visible = list.slice(0, maxVisible);
  const extraCount = Math.max(0, total - visible.length);

  return {
    total,
    visible,
    extraCount,
  };
}

export function getAttachmentPreviewCountLabel(
  attachments: AttachmentItem[] = []
): string {
  const count = attachments.filter(
    (item) => item && (item.kind === "image" || item.type === "image")
  ).length || attachments.length;
  return `${count} photos`;
}

export function shouldShowAttachmentPreviewCountBadge(
  attachments: AttachmentItem[] = []
): boolean {
  const count = attachments.filter(
    (item) => item && (item.kind === "image" || item.type === "image")
  ).length;
  return count > 1;
}
