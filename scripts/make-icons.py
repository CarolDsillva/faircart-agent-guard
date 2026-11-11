"""Render FairCart toolbar icons (receipt + check on a dark rounded square) with the stdlib only."""
import math, struct, sys, zlib, os

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def render(size):
    ss = 4
    rows = []
    bg = (18, 26, 25)
    ink = (255, 255, 255)
    teal = (94, 200, 183)
    # Receipt outline polyline in a 20x20 design grid (matches the Mark SVG).
    receipt = [(5, 3.5), (15, 3.5), (15, 16.5), (13.3, 15.4), (11.7, 16.5), (10, 15.4), (8.3, 16.5), (6.7, 15.4), (5, 16.5), (5, 3.5)]
    check = [(7.6, 9.6), (9.3, 11.3), (12.5, 7.9)]
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    u = (x + (sx + 0.5) / ss) / size
                    v = (y + (sy + 0.5) / ss) / size
                    # Rounded square, radius 22%.
                    r = 0.22
                    qx, qy = abs(u - 0.5) - (0.5 - r), abs(v - 0.5) - (0.5 - r)
                    outside = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
                    if outside > 0:
                        continue
                    gx, gy = u * 20, v * 20
                    w = 0.85 if size >= 32 else 1.1
                    d_r = min(seg_dist(gx, gy, *receipt[i], *receipt[i + 1]) for i in range(len(receipt) - 1))
                    d_c = min(seg_dist(gx, gy, *check[i], *check[i + 1]) for i in range(len(check) - 1))
                    col = teal if d_c < w else ink if d_r < w else bg
                    acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += 255
            n = ss * ss
            a = acc[3] / n
            if a == 0:
                row += bytes([0, 0, 0, 0])
            else:
                k = acc[3] / 255
                row += bytes([int(acc[0] / k), int(acc[1] / k), int(acc[2] / k), int(a)])
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for s in (16, 32, 48, 128):
    with open(os.path.join(out, f'{s}.png'), 'wb') as f:
        f.write(render(s))
print('icons written to', out)
