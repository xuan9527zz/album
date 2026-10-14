import smiley from "./fonts/smiley.woff2";
import huiwen from "./fonts/huiwen.woff2";
import hanSerif from "./fonts/han-serif.woff2";
import hanSans from "./fonts/han-sans.woff2";
import inter400 from "./fonts/inter-400.woff2";
import inter500 from "./fonts/inter-500.woff2";
import inter600 from "./fonts/inter-600.woff2";
import garamond400 from "./fonts/garamond-400.woff2";
import garamond500 from "./fonts/garamond-500.woff2";
import garamondItalic from "./fonts/garamond-italic.woff2";
import bodoni400 from "./fonts/bodoni-400.woff2";
import bodoniItalic from "./fonts/bodoni-italic.woff2";
const faces = [
  ["ZineSmiley", smiley, 400, "normal"],
  ["ZineHuiwen", huiwen, 400, "normal"],
  ["ZineHanSerif", hanSerif, 400, "normal"],
  ["ZineHanSans", hanSans, 400, "normal"],
  ["ZineInter", inter400, 400, "normal"],
  ["ZineInter", inter500, 500, "normal"],
  ["ZineInter", inter600, 600, "normal"],
  ["ZineGaramond", garamond400, 400, "normal"],
  ["ZineGaramond", garamond500, 500, "normal"],
  ["ZineGaramond", garamondItalic, 400, "italic"],
  ["ZineBodoni", bodoni400, 400, "normal"],
  ["ZineBodoni", bodoniItalic, 400, "italic"],
] as const;
export const zineFontFamilies: Record<string, string> = {
  Smiley: "ZineSmiley",
  Huiwen: "ZineHuiwen",
  HanSerif: "ZineHanSerif",
  HanSans: "ZineHanSans",
  Inter: "ZineInter",
  "EB Garamond": "ZineGaramond",
  "Libre Bodoni": "ZineBodoni",
};
export function ZineFonts() {
  return (
    <style>
      {faces
        .map(
          ([family, url, weight, style]) =>
            `@font-face{font-family:'${family}';src:url('${url}') format('woff2');font-weight:${weight};font-style:${style};font-display:swap}`,
        )
        .join("\n")}
    </style>
  );
}
