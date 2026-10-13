import { screen } from "@testing-library/react";
import { generatedCss, render } from "test-utils/render";
import MemberHero from "components/analytics/MemberHero";
import StreakCard from "components/analytics/StreakCard";
import { system } from "styles/theme";

// Both cards print white text, so they are only readable on their gradient.
// v2's bgGradient="linear(...)" strings type-check under v3 but generate no
// background at all, which left the text white-on-page.
describe("analytics gradient cards", () => {
  it("MemberHero paints a gradient behind its white text", () => {
    render(<MemberHero name="Ada Obi" fields={{ part: "soprano" }} />);
    // The gradient sits on the card itself, which has no role or label.
    // eslint-disable-next-line testing-library/no-node-access
    const card = screen.getByText("Ada Obi").parentElement!.parentElement!;
    expect(generatedCss(card)).toMatch(/linear-gradient/);
  });

  it("StreakCard paints a gradient behind its white text", () => {
    render(<StreakCard currentStreak={3} longestStreak={5} attendanceRate={80} />);
    // eslint-disable-next-line testing-library/no-node-access
    const card = screen.getByText("current streak").parentElement!.parentElement!.parentElement!;
    expect(generatedCss(card)).toMatch(/linear-gradient/);
  });
});

// ---------------------------------------------------------------------------
// Text contrast as actually rendered: the text's own colour and opacity (and
// any ancestor's), over its real background, sampled along the gradient.
// Large text (24px+, or bold 18.66px+) needs 3:1, everything else 4.5:1.

type Rgba = [number, number, number, number];

/** "purple-600" -> colors.purple.600, "white-alpha-300" -> colors.whiteAlpha.300, "white" -> colors.white */
const kebabToToken = (name: string) => {
  const parts = name.split("-");
  const shade = /^\d+$/.test(parts[parts.length - 1]) ? parts.pop() : undefined;
  const palette = parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join("");
  return shade ? `colors.${palette}.${shade}` : `colors.${palette}`;
};

const toRgba = (value: string): Rgba => {
  if (value.startsWith("#")) {
    const h = value.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const n = value.match(/[\d.]+/g)!.map(Number);
  return [n[0], n[1], n[2], n[3] ?? 1];
};

const colourVar = (css: string, prop: string): Rgba | null => {
  const m = css.match(new RegExp(`(?:^|[{;\\s])${prop}: var\\(--chakra-colors-([a-z0-9-]+)\\)`));
  return m ? toRgba(system.token(kebabToToken(m[1])) as string) : null;
};

const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
};

const luminance = ([r, g, b]: Rgba) => {
  const f = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const remPx = (token: string) => parseFloat(system.token(token) as string) * 16;

/** Lowest contrast of an element's own text against what is behind it. */
const lowestContrast = (textEl: HTMLElement) => {
  let opacity = 1;
  let text: Rgba | null = null;
  let fontPx = 16;
  let bold = false;
  const overlays: Rgba[] = [];
  let backdrop: Rgba[] | null = null;
  // eslint-disable-next-line testing-library/no-node-access
  for (let el: HTMLElement | null = textEl; el && !backdrop; el = el.parentElement) {
    const css = generatedCss(el);
    const o = css.match(/(?:^|[{;\s])opacity: ([\d.]+)/);
    if (o) opacity *= Number(o[1]);
    text = text ?? colourVar(css, "color");
    const size = css.match(/font-size: (?:var\(--chakra-font-sizes-([a-z0-9]+)\)|([\d.]+)px)/);
    if (size && fontPx === 16 && el === textEl) fontPx = size[1] ? remPx(`fontSizes.${size[1]}`) : Number(size[2]);
    if (/font-weight: var\(--chakra-font-weights-(bold|extrabold)\)/.test(css)) bold = true;
    const from = colourVar(css, "--gradient-from");
    if (from) {
      const stops = [from, colourVar(css, "--gradient-via"), colourVar(css, "--gradient-to")].filter(Boolean) as Rgba[];
      backdrop = stops.slice(1).flatMap((to, i) =>
        Array.from({ length: 11 }, (_, s) => [0, 1, 2].map((c) => stops[i][c] * (1 - s / 10) + to[c] * (s / 10)).concat(1) as Rgba),
      );
      continue;
    }
    const bg = colourVar(css, "background") ?? colourVar(css, "background-color");
    if (bg && bg[3] < 1) overlays.push(bg);
    else if (bg) backdrop = [bg];
  }
  expect(text).not.toBeNull();
  expect(backdrop).not.toBeNull();
  const large = fontPx >= 24 || (bold && fontPx >= 18.66);
  const seen = backdrop!.map((base) => overlays.reduceRight((under, layer) => over(layer, under), base));
  const fg = (base: Rgba) => over([text![0], text![1], text![2], text![3] * opacity], base);
  return { ratio: Math.min(...seen.map((base) => contrast(fg(base), base))), large };
};

/** Fails naming the text and its measured ratio. */
const expectReadable = (el: HTMLElement) => {
  const { ratio, large } = lowestContrast(el);
  const minimum = large ? 3 : 4.5;
  expect({ text: el.textContent, ratio: Number(ratio.toFixed(2)), readable: ratio >= minimum }).toEqual({
    text: el.textContent,
    ratio: expect.any(Number),
    readable: true,
  });
};

describe("analytics card text contrast as rendered", () => {
  it("MemberHero: name, details line and initials", () => {
    render(<MemberHero name="Ada Obi" fields={{ part: "soprano", email: "ada.obi@example.com" }} />);
    expectReadable(screen.getByText("Ada Obi"));
    expectReadable(screen.getByText(/Soprano/));
    expectReadable(screen.getByText("AO"));
  });

  it("StreakCard: labels, cheer and the rate ring", () => {
    render(<StreakCard currentStreak={3} longestStreak={5} attendanceRate={80} />);
    for (const text of ["current streak", /Longest ever/, /more to beat your record/, "0", "rate", "80%"]) {
      expectReadable(screen.getByText(text));
    }
  });
});
