"""產生 favicon、PWA 圖示與社群分享 OG 預覽圖。

用法（Windows，需要 Pillow 與微軟正黑體）：
    python scripts/generate_brand_assets.py

輸出到 public/，Vite build 時會原封不動複製到 dist 根目錄。
中文字直接用本機字型檔繪製成 PNG，社群平台抓圖時不會出現方框。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
LOGO = ROOT / "static" / "images" / "logo.png"
FONT_BOLD = "C:/Windows/Fonts/msjhbd.ttc"
FONT_REG = "C:/Windows/Fonts/msjh.ttc"

# 與網站背景漸層相同的配色
C_ORANGE = (238, 119, 82)
C_PINK = (231, 60, 126)
C_BLUE = (35, 166, 213)
C_GREEN = (35, 213, 171)
C_NAVY = (34, 31, 102)
C_GOLD = (255, 214, 92)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, stops):
    """左上到右下的多段線性漸層。"""
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    n = len(stops) - 1
    for y in range(h):
        for x in range(w):
            t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2
            seg = min(int(t * n), n - 1)
            px[x, y] = lerp(stops[seg], stops[seg + 1], t * n - seg)
    return img


def star(draw, cx, cy, r, fill):
    """四角閃光星星。"""
    k = r * 0.28
    pts = [(cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k),
           (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k)]
    draw.polygon(pts, fill=fill)


def draw_book(draw, s, ox=0, oy=0):
    """在 s×s 的畫布座標畫一本打開的書（白色書頁＋中線）。"""
    def P(x, y):
        return (ox + x * s, oy + y * s)

    # 書本陰影底
    left = [P(0.16, 0.36), P(0.50, 0.44), P(0.50, 0.82), P(0.16, 0.74)]
    right = [P(0.84, 0.36), P(0.50, 0.44), P(0.50, 0.82), P(0.84, 0.74)]
    draw.polygon(left, fill=(255, 255, 255))
    draw.polygon(right, fill=(244, 247, 255))
    # 書頁上的文字線
    lw = max(1, round(s * 0.028))
    for i in range(3):
        y0 = 0.49 + i * 0.085
        draw.line([P(0.22, y0 - 0.02), P(0.44, y0 + 0.025)], fill=C_PINK, width=lw)
        draw.line([P(0.56, y0 + 0.025), P(0.78, y0 - 0.02)], fill=C_BLUE, width=lw)
    # 書脊
    draw.line([P(0.50, 0.44), P(0.50, 0.82)], fill=C_NAVY, width=max(1, round(s * 0.02)))


def make_icon(size, maskable=False):
    """主圖示：漸層圓角方塊＋打開的書＋金色閃光（AI 靈感）。"""
    scale = 4  # 超取樣讓邊緣平滑
    S = size * scale
    bg = gradient((S, S), [C_ORANGE, C_PINK, C_BLUE])
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if maskable:
        md.rectangle([0, 0, S, S], fill=255)  # maskable 由系統裁形狀，需滿版
    else:
        md.rounded_rectangle([0, 0, S - 1, S - 1], radius=round(S * 0.22), fill=255)
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(icon)
    # maskable 的安全區約 80%，內容縮小置中
    inner = S * (0.78 if maskable else 1.0)
    off = (S - inner) / 2
    draw_book(d, inner, off, off + inner * 0.02)
    star(d, off + inner * 0.70, off + inner * 0.20, inner * 0.13, C_GOLD)
    star(d, off + inner * 0.30, off + inner * 0.22, inner * 0.065, (255, 255, 255))
    return icon.resize((size, size), Image.LANCZOS)


def make_og():
    W, H = 1200, 630
    img = gradient((W, H), [C_ORANGE, C_PINK, C_BLUE, C_GREEN]).convert("RGBA")

    # 柔和的光暈泡泡
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-160, -200, 420, 380], fill=(255, 255, 255, 60))
    gd.ellipse([880, 360, 1380, 860], fill=(255, 255, 255, 50))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(40)))

    # 白色玻璃卡片
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([56, 56, W - 56, H - 56], radius=40, fill=(255, 255, 255, 236))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([64, 74, W - 48, H - 38], radius=40, fill=(40, 20, 80, 90))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18)))
    img = Image.alpha_composite(img, card)

    d = ImageDraw.Draw(img)
    f_school = ImageFont.truetype(FONT_BOLD, 34)
    f_title = ImageFont.truetype(FONT_BOLD, 82)
    f_sub = ImageFont.truetype(FONT_REG, 30)
    f_chip = ImageFont.truetype(FONT_BOLD, 28)
    f_foot = ImageFont.truetype(FONT_REG, 26)

    # 左側：學校 logo
    logo = Image.open(LOGO).convert("RGBA").resize((300, 300), Image.LANCZOS)
    img.alpha_composite(logo, (110, 150))
    d.text((260, 482), "石門國小", font=f_school, fill=C_NAVY, anchor="mt")

    # 右側文字
    x = 460
    d.text((x, 118), "桃園市龍潭區石門國民小學", font=f_school, fill=C_PINK)
    d.text((x, 168), "教師數位", font=f_title, fill=C_NAVY)
    d.text((x, 262), "備課小幫手", font=f_title, fill=C_NAVY)
    star(d, x + 470, 210, 30, C_GOLD)
    star(d, x + 520, 160, 14, C_BLUE)
    d.text((x, 372), "輸入領域、年級與單元，AI 協助激發教案靈感", font=f_sub, fill=(70, 70, 90))

    chips = [("AI 教案生成", C_PINK), ("一鍵下載 Word", C_BLUE), ("免費使用", (20, 160, 130))]
    cx = x
    for text, color in chips:
        tw = d.textlength(text, font=f_chip)
        d.rounded_rectangle([cx, 440, cx + tw + 44, 492], radius=26, fill=color)
        d.text((cx + 22, 466), text, font=f_chip, fill=(255, 255, 255), anchor="lm")
        cx += tw + 60

    d.text((x, 520), "cagoooo.github.io/prepare", font=f_foot, fill=(120, 120, 140))
    return img.convert("RGB")


def main():
    PUBLIC.mkdir(exist_ok=True)
    base = make_icon(512)
    base.save(PUBLIC / "icon-512.png", optimize=True)
    make_icon(192).save(PUBLIC / "icon-192.png", optimize=True)
    make_icon(512, maskable=True).save(PUBLIC / "icon-maskable-512.png", optimize=True)
    # iOS 主畫面圖示不吃透明，用滿版版本
    make_icon(180, maskable=True).save(PUBLIC / "apple-touch-icon.png", optimize=True)
    make_icon(32).save(PUBLIC / "favicon-32.png", optimize=True)
    make_icon(256).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    make_og().save(PUBLIC / "og-image.png", optimize=True)
    print("已輸出到", PUBLIC)


if __name__ == "__main__":
    main()
