export const GROUP_LABEL_OPTIONS = [
  { value: "FRIENDS", label: "Bạn bè", color: "blue" },
  { value: "WORK", label: "Công việc", color: "violet" },
  { value: "STUDY", label: "Học tập", color: "amber" },
  { value: "FAMILY", label: "Gia đình", color: "rose" },
  { value: "PROJECT", label: "Dự án", color: "emerald" },
  { value: "OTHER", label: "Khác", color: "slate" },
];

export const GROUP_LABEL_BY_CODE = GROUP_LABEL_OPTIONS.reduce((result, item) => {
  result[item.value] = item;
  return result;
}, {});

export const resolveGroupLabelMeta = (groupLabel, fallbackDisplayName = "", fallbackColor = "") => {
  const normalizedCode = String(groupLabel || "").trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const knownOption = GROUP_LABEL_BY_CODE[normalizedCode];
  return {
    code: normalizedCode,
    label: fallbackDisplayName || knownOption?.label || normalizedCode,
    color: fallbackColor || knownOption?.color || "slate",
  };
};
