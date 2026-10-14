export function normalizeColor(input: string) {
  const value = input.trim();
  if (/^#?[0-9a-f]{3}$/i.test(value))
    return (
      "#" +
      value
        .replace(/^#/, "")
        .split("")
        .map((ch) => ch + ch)
        .join("")
        .toUpperCase()
    );
  return /^#?[0-9a-f]{6}$/i.test(value)
    ? "#" + value.replace(/^#/, "").toUpperCase()
    : null;
}
export function contrastInk(background: string) {
  const rgb = background
    .slice(1)
    .match(/../g)!
    .map((ch) => parseInt(ch, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? "#242924"
    : "#F5F3ED";
}
