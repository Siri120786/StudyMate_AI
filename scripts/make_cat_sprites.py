"""Draw the StudyMate cat as 32x32 pixel art and write frontend/src/lib/catSprites.js plus a preview sheet.

    python scripts/make_cat_sprites.py

Each pose is drawn from simple shapes, then outlined automatically so every frame shares one look.
Edit the shapes below and rerun to change the cat; scripts/cat_preview.png shows the result.
"""
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W = H = 32

# one character per colour; "." is transparent. Same drawings, two colour sets.
ORANGE = {
    "K": "#3b2a3a",  # outline
    "O": "#f4a03e",  # orange fur
    "D": "#d8751c",  # darker stripes
    "L": "#ffe5b8",  # cream: belly, muzzle, paws
    "P": "#f59aa6",  # pink: inner ears, nose, cheeks
    "E": "#2c1f2e",  # eyes
    "W": "#ffffff",  # eye glint
    "B": "#3f4f99",  # collar
    "Y": "#f7cc45",  # bell
    "Z": "#c98a1d",  # bell shadow
}
GRAY = {
    **ORANGE,
    "K": "#2f3140",
    "O": "#a9b1c1",  # gray fur
    "D": "#7e8799",  # darker stripes
    "L": "#f1f4f9",  # white: belly, muzzle, paws
    "B": "#e0566d",  # a red collar stands out on gray
    "E": "#24202c",
}
PALETTES = {"orange": ORANGE, "gray": GRAY}
PALETTE = ORANGE


class Canvas:
    def __init__(self):
        self.g = [["."] * W for _ in range(H)]

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.g[y][x] = c

    def get(self, x, y):
        return self.g[y][x] if 0 <= x < W and 0 <= y < H else "."

    def ellipse(self, cx, cy, rx, ry, c, only=None):
        for y in range(H):
            for x in range(W):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 and (only is None or self.g[y][x] in only):
                    self.g[y][x] = c

    def rect(self, x0, y0, x1, y1, c, only=None):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < W and 0 <= y < H and (only is None or self.g[y][x] in only):
                    self.g[y][x] = c

    def poly(self, pts, c):
        for y in range(H):
            for x in range(W):
                px, py, inside = x + 0.5, y + 0.5, False
                for i in range(len(pts)):
                    (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
                    if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
                        inside = not inside
                if inside:
                    self.g[y][x] = c

    def stroke(self, pts, r, c):
        """A thick line through points: circles of radius r along each segment."""
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            steps = max(abs(x2 - x1), abs(y2 - y1)) * 3 or 1
            for i in range(int(steps) + 1):
                t = i / steps
                self.ellipse(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, r, c)

    def outline(self):
        out = []
        for y in range(H):
            for x in range(W):
                if self.g[y][x] == "." and any(self.get(x + dx, y + dy) not in (".", "K") for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out.append((x, y))
        for x, y in out:
            self.g[y][x] = "K"

    def rows(self):
        return ["".join(r) for r in self.g]


def eyes(c, left, right, y, kind):
    """Two eyes. kind: open, closed (arc), happy (^ ^), sleep (flat)."""
    for ex in (left, right):
        if kind == "open":
            c.rect(ex, y + 1, ex + 2, y + 2, "E")
            c.put(ex + 1, y, "E")
            c.put(ex + 1, y + 3, "E")
            c.put(ex + 2, y + 1, "W")
        elif kind == "happy":
            c.put(ex, y + 2, "E"); c.put(ex + 1, y + 1, "E"); c.put(ex + 2, y + 2, "E")
        elif kind == "sleep":
            c.rect(ex, y + 2, ex + 2, y + 2, "E")
        else:  # closed arc
            c.put(ex, y + 1, "E"); c.put(ex + 1, y + 2, "E"); c.put(ex + 2, y + 1, "E")


def collar(c, x0, x1, y, bell_x):
    c.rect(x0, y, x1, y, "B")
    c.rect(x0 + 1, y + 1, x1 - 1, y + 1, "B")
    c.rect(bell_x, y + 2, bell_x + 1, y + 3, "Y")
    c.put(bell_x + 1, y + 3, "Z")
    c.put(bell_x, y + 4, "Z")
    c.put(bell_x + 1, y + 4, "Z")


def stripes(c, spots):
    for x, y in spots:
        if c.get(x, y) == "O":
            c.put(x, y, "D")


# ------------------------------------------------------------------ front-facing, sitting


def sit(eyes_kind="open", paw="rest", mouth="smile", scratch=0):
    c = Canvas()
    # tail curling out to the left
    c.stroke([(10, 28), (6, 28), (4, 25), (4, 21)], 1.9, "O")
    # body and legs
    c.ellipse(16, 24.5, 7.5, 7, "O")
    c.ellipse(11, 29.5, 2.8, 1.8, "L")
    c.ellipse(21, 29.5, 2.8, 1.8, "L")
    # left front leg (viewer's left) always down
    c.rect(12, 24, 14, 29, "O")
    c.rect(12, 28, 14, 30, "L")
    if paw == "rest":
        c.rect(18, 24, 20, 29, "O")
        c.rect(18, 28, 20, 30, "L")
    elif paw == "wave_a":
        c.stroke([(20, 24), (25, 18), (27, 13)], 1.7, "O")
        c.ellipse(27, 12, 2.4, 2.4, "L")
    else:  # wave_b: paw swung outward
        c.stroke([(20, 24), (26, 20), (29, 16)], 1.7, "O")
        c.ellipse(29.2, 15, 2.4, 2.4, "L")
    if scratch:  # hind leg raised to the cheek
        c.stroke([(11, 27), (8, 22), (8 + scratch - 1, 17)], 1.7, "O")
        c.ellipse(8 + scratch - 1, 16, 2.4, 2.2, "L")
    # head and ears
    c.poly([(8, 8), (8, 1), (14, 5)], "O")
    c.poly([(24, 8), (24, 1), (18, 5)], "O")
    c.ellipse(16, 11.5, 9.6, 7.4, "O")
    c.ellipse(16, 14, 4.6, 2.8, "L")
    c.outline()
    # inside the outline: ears, face, belly, details
    c.poly([(9, 7), (9, 3), (12, 5)], "P")
    c.poly([(23, 7), (23, 3), (20, 5)], "P")
    c.ellipse(16, 25.5, 4.2, 5, "L", only="O")
    stripes(c, [(16, 5), (16, 6), (13, 5), (19, 5), (11, 20), (10, 22), (22, 22), (21, 20)])
    stripes(c, [(4, 22), (5, 24), (6, 27), (4, 26)])
    eyes(c, 11, 19, 9, eyes_kind)
    c.rect(9, 13, 10, 14, "P")
    c.rect(22, 13, 23, 14, "P")
    c.rect(15, 12, 16, 12, "P")  # nose
    c.put(15, 14, "E"); c.put(16, 14, "E") if False else None
    if mouth == "open":
        c.rect(15, 14, 16, 15, "E")
        c.put(15, 15, "P")
    else:
        c.put(14, 14, "E"); c.put(15, 15, "E"); c.put(16, 15, "E"); c.put(17, 14, "E")  # smile
    collar(c, 11, 21, 18, 15)
    return c


# ------------------------------------------------------------------ side view, walking right


def walk(frame):
    c = Canvas()
    # (front-far, front-near, back-far, back-near) leg x offset and lift for each of the four frames
    swing = [(-3, 3, 3, -3), (0, 0, 0, 0), (3, -3, -3, 3), (0, 0, 0, 0)][frame]
    lift = [(0, 2, 2, 0), (2, 0, 0, 2), (2, 0, 0, 2), (0, 2, 2, 0)][frame]
    # tail rising behind
    bob = 1 if frame in (1, 3) else 0
    c.stroke([(5, 17 + bob), (2, 14 + bob), (2, 9 + bob), (4, 5 + bob)], 1.8, "O")
    # legs first, so the body overlaps their tops
    legs = [(9, swing[2], lift[2]), (12, swing[3], lift[3]), (19, swing[0], lift[0]), (22, swing[1], lift[1])]
    for base, dx, up in legs:
        x = base + dx
        c.rect(x, 21 + bob, x + 2, 28 - up, "O")
        c.rect(x, 27 - up, x + 2, 29 - up, "L")
    c.ellipse(14, 18 + bob, 10, 6, "O")
    # head, ears
    c.poly([(22, 10 + bob), (22, 3 + bob), (27, 8 + bob)], "O")
    c.poly([(26, 8 + bob), (29, 3 + bob), (31, 10 + bob)], "O")
    c.ellipse(26, 14 + bob, 6.4, 6, "O")
    c.ellipse(29, 16 + bob, 2.8, 2.2, "L")
    c.outline()
    c.poly([(23, 9 + bob), (23, 5 + bob), (26, 8 + bob)], "P")
    c.ellipse(14, 20 + bob, 7, 3, "L", only="O")
    stripes(c, [(8, 12 + bob), (8, 14 + bob), (12, 12 + bob), (12, 13 + bob), (16, 12 + bob), (16, 13 + bob), (20, 13 + bob), (3, 12 + bob), (2, 10 + bob)])
    c.rect(27, 12 + bob, 28, 15 + bob, "E")
    c.put(28, 12 + bob, "W")
    c.put(31, 15 + bob, "P")
    c.put(24, 17 + bob, "P"); c.put(25, 17 + bob, "P")  # cheek
    c.rect(21, 17 + bob, 22, 17 + bob, "B")
    c.rect(21, 18 + bob, 23, 18 + bob, "B")
    c.rect(22, 19 + bob, 23, 20 + bob, "Y")
    c.put(23, 20 + bob, "Z")
    return c


# ------------------------------------------------------------------ clinging to the right edge, climbing up


def climb(frame):
    c = Canvas()
    up = frame % 2
    c.stroke([(10, 24), (8, 28), (10, 31)], 1.7, "O")  # tail hanging down
    # back legs pushing against the edge
    c.stroke([(17, 25), (23, 26 - up), (28, 28 - up)], 1.7, "O")
    c.ellipse(28.5, 28 - up, 2, 2, "L")
    c.ellipse(15, 18, 6.5, 9.5, "O")
    # front arms reaching up the edge, alternating
    c.stroke([(19, 12), (25, 7 - up), (29, 3 - up)], 1.7, "O")
    c.ellipse(29.5, 3 - up, 2.2, 2.2, "L")
    c.stroke([(19, 15), (25, 12 + up), (29, 9 + up)], 1.7, "O")
    c.ellipse(29.5, 9 + up, 2.2, 2.2, "L")
    # head tipped up toward the edge
    c.poly([(13, 7), (13, 0), (19, 4)], "O")
    c.poly([(21, 5), (25, 0), (26, 7)], "O")
    c.ellipse(20, 9, 6.4, 5.8, "O")
    c.ellipse(23, 10.5, 2.8, 2.2, "L")
    c.outline()
    c.poly([(14, 6), (14, 2), (17, 4)], "P")
    c.ellipse(14.5, 21, 3.5, 6, "L", only="O")
    stripes(c, [(11, 14), (10, 17), (11, 20), (12, 23), (9, 26)])
    c.rect(22, 7, 23, 10, "E")
    c.put(23, 7, "W")
    c.put(25, 10, "P")
    c.rect(17, 14, 19, 14, "B")
    c.rect(18, 15, 19, 15, "B")
    c.rect(17, 16, 18, 17, "Y")
    return c


# ------------------------------------------------------------------ curled up asleep


def sleep(frame=0):
    c = Canvas()
    c.ellipse(16, 24, 13, 6.6, "O")
    c.stroke([(26, 27), (20, 29), (10, 29), (5, 27)], 1.6, "O")  # tail wraps the front
    c.ellipse(9.5, 21, 5.4, 5, "O")
    c.poly([(5, 18), (5, 13), (9, 16)], "O")
    c.poly([(11, 16), (14, 12), (14, 19)], "O")
    c.outline()
    c.poly([(6, 17), (6, 14), (8, 16)], "P")
    stripes(c, [(15, 19), (15, 21), (19, 19), (19, 20), (23, 20), (22, 22), (12, 27), (16, 28), (8, 28)])
    c.rect(6, 21, 8, 21, "E")
    c.rect(11, 22, 12, 22, "E")
    c.put(5, 23, "P"); c.put(6, 23, "P")
    c.put(8, 23, "E")
    c.rect(10, 25, 12, 25, "B")
    z = [(24, 12), (27, 8)] if frame == 0 else [(26, 10), (28, 5)]
    for x, y in z:
        c.rect(x, y, x + 2, y, "W")
        c.put(x + 2, y + 1, "W"); c.put(x + 1, y + 2, "W")
        c.rect(x, y + 3, x + 2, y + 3, "W")
    return c


FRAMES = {
    "sit_rest": sit("open", "rest"),
    "sit_blink": sit("closed", "rest"),
    "sit_wave_a": sit("open", "wave_a"),
    "sit_wave_b": sit("open", "wave_b"),
    "happy_a": sit("happy", "wave_a"),
    "happy_b": sit("happy", "wave_b"),
    "scratch_a": sit("happy", "rest", scratch=1),
    "scratch_b": sit("happy", "rest", scratch=3),
    "meow": sit("open", "wave_a", mouth="open"),
    "walk_0": walk(0), "walk_1": walk(1), "walk_2": walk(2), "walk_3": walk(3),
    "climb_0": climb(0), "climb_1": climb(1),
    "sleep_a": sleep(0), "sleep_b": sleep(1),
}

# ------------------------------------------------------------------ outputs


def png(rows_list, scale=6, cols=8, palette=ORANGE):
    cell = W * scale + 8
    n = len(rows_list)
    nrows = (n + cols - 1) // cols
    width, height = cols * cell, nrows * cell
    img = [[(236, 232, 240)] * width for _ in range(height)]
    for i, rows in enumerate(rows_list):
        ox, oy = (i % cols) * cell + 4, (i // cols) * cell + 4
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch == ".":
                    continue
                h = palette[ch].lstrip("#")
                col = tuple(int(h[k:k + 2], 16) for k in (0, 2, 4))
                for sy in range(scale):
                    for sx in range(scale):
                        img[oy + y * scale + sy][ox + x * scale + sx] = col
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in img)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    frames = {name: c.rows() for name, c in FRAMES.items()}
    (ROOT / "scripts" / "cat_preview.png").write_bytes(png(list(frames.values())))
    (ROOT / "scripts" / "cat_preview_gray.png").write_bytes(png(list(frames.values()), palette=GRAY))
    js = (
        "// Generated by scripts/make_cat_sprites.py. 32x32 pixel art; one letter per colour, '.' is transparent.\n"
        f"export const PALETTES = {json.dumps(PALETTES, indent=2)};\n"
        f"export const SIZE = {W};\n"
        f"export const FRAMES = {json.dumps(frames, indent=1)};\n"
    )
    (ROOT / "frontend" / "src" / "lib" / "catSprites.js").write_text(js, encoding="utf8")
    print(f"wrote {len(frames)} frames")
